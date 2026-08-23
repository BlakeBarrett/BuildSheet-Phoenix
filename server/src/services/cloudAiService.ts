/**
 * Server-side CloudAIService — lifted from the client-side version.
 * Runs in Node.js with direct API key access. No browser dependencies.
 */
import { GoogleGenAI, GenerateContentResponse, Type, Modality, GroundingSupport } from "@google/genai";
import { parseArchitectResponse } from './parseUtils.js';
import { VerifiedFactService } from './verifiedFactService.js';
import type {
  ServerAIService, AiConfig, AskArchitectResult, ArchitectResponse,
  ShoppingOption, LocalSupplier, InspectionProtocol, AssemblyPlan, AssemblyStep,
  EnclosureSpec, ComponentIdentification, AuditAction, AdvancedValidationOption
} from './types.js';
import { validateShoppingOptions } from './urlValidator.js';

// --- Sourcing quality filters ---
const NOISY_DOMAINS = ['reddit.com', 'ebay.com', 'forums.'];
const NOISY_URL_PATTERNS = [
  /\.pdf(\?|$)/i, /newspaper/i, /archive\.org/i, /patents\.google/i,
  /scholar\.google/i, /\.gov\//i, /\.edu\//i, /\.mil\//i,
  /wiki(pedia|media)\.org/i, /youtube\.com|youtu\.be/i,
  /facebook\.com|instagram\.com/i, /pinterest\./i,
  /blogspot\.|wordpress\.com/i, /news\.|nytimes|washingtonpost|cnn\.com/i,
  /stackoverflow\.com|stackexchange\.com/i, /github\.com|gitlab\.com/i,
  /quora\.com/i, /medium\.com/i,
];

function buildChunkConfidenceMap(supports: GroundingSupport[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const support of supports) {
    const indices = support.groundingChunkIndices ?? [];
    const scores = support.confidenceScores ?? [];
    indices.forEach((idx, i) => {
      const score = scores[i] ?? 1.0;
      map.set(idx, Math.max(map.get(idx) ?? 0, score));
    });
  }
  return map;
}

const SYSTEM_INSTRUCTION = `
ROLE: You are BuildSheet AI, the Senior Hardware Architect and Robotics Engineer (Robotics-ER 1.5) at BuildSheet.
CORE DIRECTIVE: You are a FUNCTIONAL AGENT. Your primary job is to manipulate the drafting board using tool calls written inline in your response.
DO NOT describe the build without also calling the tools. You MUST call initializeDraft and addPart to actually create the BOM.

TOOL CALL SYNTAX — write these EXACTLY as shown, inline in your response:
  initializeDraft("Project Name", "Full requirements description");
  addPart("kebab-case-id", "Full Part Name", "Category", quantity);
  removePart("instanceId");

EXAMPLE (follow this format exactly):
  initializeDraft("LED Blinker", "Simple Arduino-based LED blinker with current limiting.");
  addPart("arduino-uno-r3", "Arduino Uno R3", "Microcontroller", 1);
  addPart("resistor-220-ohm", "220Ω 1/4W Through-Hole Resistor", "Component", 2);
  addPart("led-red-5mm", "5mm Red LED T1-3/4", "Component", 2);

RULES:
- Always call initializeDraft FIRST, then addPart for every part.
- Use kebab-case for part IDs.
- Do NOT use JSON objects or arrays for tool calls — use only the function-call syntax above.
- After the tool calls, write your reasoning/explanation.
`;

const AUDIT_SYSTEM_INSTRUCTION = `You are a senior hardware engineering auditor at BuildSheet.
PRIMARY OBJECTIVE: Verify that a given Bill of Materials (BOM) will produce a functional, buildable system.
CRITICAL — COMPATIBILITY CROSS-CHECK: Every single part in the BOM MUST be verified against the DESIGN CONTEXT.
OUTPUT FORMAT: After your audit text, append ===ACTIONS_JSON=== followed by this EXACT JSON structure (field names are mandatory):
{"actions":[{"type":"addPart","partId":"kebab-case-id","name":"Full Part Name","category":"Category","quantity":1,"reason":"why needed"},{"type":"removePart","instanceId":"EXACT_INSTANCE_ID_FROM_BOM","reason":"why removed"}],"summary":"one-line summary"}
USE EXACTLY: type (not action), reason (not description), partId for new parts, instanceId for removals.`;

export class ServerCloudAIService implements ServerAIService {
  public name: string;
  public isOffline = false;
  private config: AiConfig;
  private factService?: VerifiedFactService;

  constructor(config: AiConfig, factService?: VerifiedFactService) {
    this.config = config;
    this.name = config.displayName;
    this.isOffline = !config.apiKey;
    this.factService = factService;
  }

  private async injectVerifiedFacts(prompt: string): Promise<string> {
    if (!this.factService) return '';
    try {
      const keywords = prompt.split(' ').filter(w => w.length > 3);
      const facts = await this.factService.searchFacts({
        searchTerm: keywords.join(' '),
        minConfidence: 0.8,
        limit: 10
      });
      if (facts.length === 0) return '';
      const factContext = facts.map(f => `- VERIFIED: ${f.statement} (source: ${f.source}, confidence: ${f.confidence})`).join('\n');
      return `\n\n=== VERIFIED FACTS ===\n${factContext}\n=========================\n`;
    } catch (err: any) {
      // Verified facts are an enrichment, never a hard dependency. If Firestore
      // is unavailable (missing/misconfigured credentials, outage), continue
      // without them so chat always works.
      console.warn('[cloudAi] Verified facts unavailable, continuing without them:', err?.message || err);
      return '';
    }
  }

  private getClient(): GoogleGenAI {
    if (!this.config.apiKey) throw new Error("No API key configured");
    return new GoogleGenAI({ apiKey: this.config.apiKey });
  }

  private getSearchClient(): GoogleGenAI {
    const key = this.config.searchApiKey || this.config.apiKey;
    if (!key) throw new Error("No search API key configured");
    return new GoogleGenAI({ apiKey: key });
  }

  private cleanBase64(dataUrl: string): { mimeType: string; data: string } | null {
    const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return null;
    return { mimeType: matches[1], data: matches[2] };
  }

  // --- OpenAI-compatible chat (on-prem mode) ---
  private async openAiChat(options: {
    model: string; system?: string; history?: any[];
    userContent: string | Array<{ type: string;[k: string]: any }>;
    temperature?: number; maxTokens?: number; jsonMode?: boolean;
  }): Promise<string> {
    const messages: any[] = [];
    if (options.system) messages.push({ role: 'system', content: options.system });
    if (options.history) {
      for (const h of options.history) {
        const role = h.role === 'model' ? 'assistant' : h.role;
        const content = Array.isArray(h.parts) ? h.parts.map((p: any) => p.text || '').join('') : (h.content ?? '');
        messages.push({ role, content });
      }
    }
    const body: any = { model: options.model, messages, temperature: options.temperature ?? 0.7 };

    // For JSON-mode calls, disable thinking to prevent thinking tokens from corrupting
    // the JSON output, and force response_format for strict JSON compliance.
    if (options.jsonMode) {
      body.response_format = { type: 'json_object' };
      body.enable_thinking = false;
      body.max_tokens = options.maxTokens ?? 4096;
    } else {
      // Free-form calls keep thinking enabled (better reasoning).
      // Thinking consumes from the token budget, so bump max_tokens to leave room.
      // The budget is split roughly: 30-50% for thinking, rest for actual output.
      const contentLen = Array.isArray(options.userContent) ? options.userContent.reduce((s: number, p: any) => s + (p.text?.length || 0), 0) : (options.userContent as string)?.length || 0;
      body.max_tokens = options.maxTokens ?? (contentLen > 2000 ? 12288 : 8192);
    }

    messages.push({ role: 'user', content: options.userContent });
    const resp = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.config.apiKey}` },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`OpenAI API ${resp.status}: ${(await resp.text()).substring(0, 300)}`);
    const data: any = await resp.json();
    let content = data.choices?.[0]?.message?.content ?? '';
    // Strip <think>...</think> blocks — Qwen3 thinking tokens can leak into content
    // for free-form (non-JSON-mode) calls depending on the API version.
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    return content;
  }

  // Robust JSON extraction: strips markdown fences and falls back to regex.
  private extractJson<T>(text: string): T | null {
    if (!text) return null;
    let cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    try { return JSON.parse(cleaned); } catch { /* continue */ }
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch { /* give up */ } }
    return null;
  }

  // --- Core methods ---

  async askArchitect(prompt: string, history: any[], image?: string): Promise<AskArchitectResult> {
    const factContext = await this.injectVerifiedFacts(prompt);
    const enhancedSystemInstruction = SYSTEM_INSTRUCTION + factContext;
    
    if (this.config.provider === 'openai-compat') {
      let userContent: any = prompt;
      if (image) {
        userContent = [{ type: 'text', text: prompt }];
        const imageData = this.cleanBase64(image);
        if (imageData) userContent.unshift({ type: 'image_url', image_url: { url: image } });
      }
      const text = await this.openAiChat({ model: this.config.models.fast, system: enhancedSystemInstruction, history, userContent, temperature: 0.7, maxTokens: 4096 });
      return { text: text || 'AI service provided no output.', metadata: { model: this.config.models.fast } };
    }
    const ai = this.getClient();
    const userParts: any[] = [{ text: prompt }];
    if (image) {
      const imageData = this.cleanBase64(image);
      if (imageData) userParts.push({ inlineData: { mimeType: imageData.mimeType, data: imageData.data } });
    }
    const contents = [...history, { role: 'user', parts: userParts }];
    const response = await ai.models.generateContent({
      model: this.config.models.fast, contents,
      config: { systemInstruction: enhancedSystemInstruction, temperature: 0.7 },
    });
    return { text: response.text || "AI service provided no output.", metadata: { model: this.config.models.fast, tokens: response.usageMetadata?.totalTokenCount } };
  }

  parseArchitectResponse(text: string): ArchitectResponse {
    return parseArchitectResponse(text);
  }

  async generateStructuredJson(prompt: string, schema: Record<string, any>): Promise<any> {
    if (this.config.provider === 'openai-compat') {
      const text = await this.openAiChat({ model: this.config.models.structured, userContent: prompt, jsonMode: true, maxTokens: 4096 });
      return JSON.parse(text || 'null');
    }
    const ai = this.getClient();
    const response = await ai.models.generateContent({ model: this.config.models.structured, contents: prompt, config: { responseMimeType: 'application/json', responseSchema: schema as any } });
    return JSON.parse(response.text || 'null');
  }

  async generateProductImage(description: string, referenceImage?: string): Promise<string | null> {
    try {
      if (this.config.provider === 'openai-compat') {
        // DashScope async image generation.
        // Endpoints are tried in order: the legacy image-generation path (used
        // by wanx / wan2.x-pro models AND local LAN image servers) first, then
        // the newer text2image path (wan2.2/wan2.5 flash models). Response
        // parsing accepts both result shapes.
        const endpoints = [
          `${this.config.imageBaseUrl}/services/aigc/image-generation/generation`,
          `${this.config.imageBaseUrl}/services/aigc/text2image/image-synthesis`,
        ];
        let taskId: string | null = null;
        for (const submitUrl of endpoints) {
          const resp = await fetch(submitUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.config.apiKey}`, 'X-DashScope-Async': 'enable' },
            body: JSON.stringify({ model: this.config.models.image, input: { messages: [{ role: 'user', content: [{ text: description }] }] }, parameters: { n: 1, size: '1024*1024' } }),
          });
          let data: any = null;
          try { data = await resp.json(); } catch { data = null; }
          if (resp.ok && data?.output?.task_id) {
            taskId = data.output.task_id;
            break;
          }
          console.warn(`[DashScope] Image submission failed (${submitUrl}):`, data?.message || data?.code || `HTTP ${resp.status}`);
        }
        if (!taskId) {
          throw new Error('DashScope image generation submission failed on all endpoints');
        }
        for (let i = 0; i < 45; i++) {
          await new Promise(r => setTimeout(r, 3000));
          const pollResp = await fetch(`${this.config.imageBaseUrl}/tasks/${taskId}`, { headers: { 'Authorization': `Bearer ${this.config.apiKey}` } });
          const pollData: any = await pollResp.json();
          const status = pollData.output?.task_status;
          if (status === 'SUCCEEDED') {
            const imageUrl = pollData.output?.results?.[0]?.url
              || pollData.output?.choices?.[0]?.message?.content?.[0]?.image;
            if (!imageUrl) throw new Error('DashScope returned SUCCEEDED but no image URL was found');
            return imageUrl;
          }
          if (status === 'FAILED' || status === 'CANCELED') {
              throw new Error(`DashScope image generation task ${status}: ${JSON.stringify(pollData)}`);
          }
        }
        throw new Error('DashScope image generation polling timed out');
      }
      const ai = this.getClient();
      const parts: any[] = [{ text: `Product design concept sketch: ${description}` }];
      if (referenceImage) {
        const imageData = this.cleanBase64(referenceImage);
        if (imageData) parts.unshift({ inlineData: { mimeType: imageData.mimeType, data: imageData.data } });
      }
      const response = await ai.models.generateContent({ model: this.config.models.image, contents: { parts } });
      const candidateParts = response.candidates?.[0]?.content?.parts;
      // Gemini returns inline base64 data — we have no CDN URL, so return null.
      // Use DashScope (openai-compat) for image generation.
      void candidateParts;
      return null;
    } catch (e: any) { throw new Error(e.cause ? `DashScope request failed: ${e.cause.message}` : e.message); }
  }

  /**
   * Web product search using Gemini Google Search grounding. Returns
   * real-world purchase options (title, price, source, url) — the closest
   * Google offers to a web-wide "AI product search".
   *
   * NOTE: structured output (responseMimeType/responseSchema) is deliberately
   * NOT requested here — combined with googleSearch grounding it returns HTTP
   * 400 INVALID_ARGUMENT on Gemini 2.x and silently drops grounding metadata
   * on Gemini 3.x. We parse JSON out of free-form text instead, then verify
   * every URL server-side before surfacing it.
   *
   * Server-side only: the key never leaves this process.
   */
  async findPartSources(query: string, designContext?: string, localeContext?: string, preferredVendors?: string[]): Promise<ShoppingOption[] | null> {
    try {
      if (this.config.provider === 'openai-compat') {
        const text = await this.openAiChat({
          model: this.config.models.fast,
          system: 'You are a hardware sourcing specialist. Return valid JSON array: [{"title","url","source","price","isEstimated"}]',
          userContent: `Find purchase options for: ${query}. Return JSON array only.`,
          jsonMode: true, maxTokens: 1024,
        });
        try {
          const parsed = JSON.parse(text);
          const arr = (Array.isArray(parsed) ? parsed : parsed.results ?? []).map((r: any) => ({ ...r, isEstimated: true }));
          // No grounding chunks exist on this path — every URL here is pure
          // model hallucination risk, so verify each one before returning.
          const verified = arr.length ? await validateShoppingOptions(arr) : [];
          return verified.length ? verified : [{ title: 'Local Market Research Required', url: '', source: 'BuildSheet' }];
        } catch { return [{ title: 'Local Market Research Required', url: '', source: 'BuildSheet' }]; }
      }

      const ai = this.getSearchClient();
      const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const designHint = designContext ? ` Design context: ${designContext}.` : '';
      const localeHint = localeContext ? ` Shipping region: ${localeContext}.` : '';
      const vendorHint = preferredVendors?.length ? ` Prefer these vendors: ${preferredVendors.join(', ')}.` : '';
      const prompt = `The current date is ${today}. Find real-world purchase options and actual prices for: ${query}.${designHint}${localeHint}${vendorHint}`;

      const response = await ai.models.generateContent({
        model: this.config.models.fast,
        contents: prompt,
        // No responseMimeType/responseSchema here: structured output plus
        // googleSearch grounding is rejected by Gemini 2.x (HTTP 400
        // INVALID_ARGUMENT — "Tool use with a response mime type:
        // 'application/json' is unsupported") and silently disables the
        // grounding metadata on Gemini 3.x. parseShoppingOptions below
        // handles fences/prose-wrapped JSON robustly instead.
        config: {
          systemInstruction: 'You are a hardware sourcing specialist. Search the web for real-world purchase options. Return a JSON array of objects, each with: title (string, product name), url (string, real product page URL), source (string, retailer/merchant name), price (string, e.g. "$12.99"), currency (string, e.g. "USD"), rating (number or null), reviews (number or null), isEstimated (boolean). Return 4-8 options when possible. Return ONLY the JSON array, no commentary.',
          tools: [{ googleSearch: {} }],
        },
      });

      // Ground the extracted options in real URLs returned by Google.
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const parsed = this.parseShoppingOptions(response.text || '');
      const grounded = this.resolveUrlsFromChunks(parsed, chunks);
      const clean = this.filterShoppingOptions(grounded);
      if (clean.length) {
        // Verify links before surfacing: unwrap vertexaisearch redirect
        // wrappers to their real destination, drop dead pages, flag the rest.
        // Noise filtering runs AGAIN afterwards because a RESOLVED destination
        // can itself be a forum/news/PDF that the redirect wrapper masked.
        const verified = await validateShoppingOptions(clean);
        const verifiedClean = this.filterShoppingOptions(verified);
        if (verifiedClean.length) return verifiedClean.slice(0, 8);
      }

      // Fallback: build options directly from grounding chunks.
      const supports = response.candidates?.[0]?.groundingMetadata?.groundingSupports ?? [];
      if (chunks.length === 0) return [{ title: 'Local Market Research Required', url: '', source: 'BuildSheet' }];
      const confidenceMap = buildChunkConfidenceMap(supports);
      const options: ShoppingOption[] = chunks.map((chunk, idx) => ({
        title: chunk.web?.title || 'Unknown Retailer', url: chunk.web?.uri || '',
        source: chunk.web?.title || 'Unknown', isEstimated: (confidenceMap.get(idx) ?? 1.0) < 0.5,
      }));
      // Chunk URIs are vertexaisearch.cloud.google.com redirects too — resolve
      // them to real destinations before the final noise filter/slice.
      const fallbackFiltered = this.filterShoppingOptions(options);
      const fallbackVerified = await validateShoppingOptions(fallbackFiltered);
      const fallbackClean = this.filterShoppingOptions(fallbackVerified);
      return fallbackClean.length ? fallbackClean.slice(0, 5) : [{ title: 'Local Market Research Required', url: '', source: 'BuildSheet' }];
    } catch (e) { console.error("findPartSources error:", e); return null; }
  }

  /**
   * Coerce any `ports` value from an openai-compat model into a stable
   * PortDefinition[] array. Models frequently return a string list ("USB-C,
   * HDMI") or an object — neither is safe for `entry.part.ports.map(...)`.
   */
  private normalizePorts(value: any): { name: string; type: string; gender: string; spec: string }[] {
    // Non-array / empty -> []
    if (!Array.isArray(value)) return [];
    return value
      .filter((p: any) => p != null)
      .map((p: any) => {
        // Object-shaped port
        if (typeof p === 'object') {
          const name = typeof p.name === 'string' ? p.name
            : typeof p.id === 'string' ? p.id
            : typeof p.spec === 'string' ? p.spec : 'Port';
          return {
            name,
            type: typeof p.type === 'string' ? p.type : '',
            gender: typeof p.gender === 'string' ? p.gender : '',
            spec: typeof p.spec === 'string' ? p.spec : '',
          };
        }
        // String port ("USB-C") -> name only
        return { name: String(p), type: '', gender: '', spec: '' };
      })
      .filter((p: any) => p.name);
  }

  /** Parse a JSON array of shopping options from the model's response text. */
  private parseShoppingOptions(text: string): ShoppingOption[] {
    if (!text) return [];
    let cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    let data: any = null;
    try { data = JSON.parse(cleaned); } catch { /* fall through */ }
    if (!data) {
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) { try { data = JSON.parse(match[0]); } catch { /* give up */ } }
    }
    const arr = Array.isArray(data) ? data : (data?.results ?? []);
    return arr
      .filter((r: any) => r && typeof r === 'object')
      .map((r: any) => ({
        title: typeof r.title === 'string' ? r.title : 'Unknown Retailer',
        url: typeof r.url === 'string' ? r.url : '',
        source: typeof r.source === 'string' ? r.source : 'Unknown',
        price: typeof r.price === 'string' ? r.price : (r.price != null ? String(r.price) : undefined),
        currency: typeof r.currency === 'string' ? r.currency : undefined,
        rating: typeof r.rating === 'number' ? r.rating : undefined,
        reviews: typeof r.reviews === 'number' ? r.reviews : undefined,
        isEstimated: r.isEstimated === true,
      }))
      .filter((r: ShoppingOption) => r.url);
  }

  /** Replace hallucinated URLs with real URLs from Google's grounding chunks. */
  private resolveUrlsFromChunks(options: ShoppingOption[], chunks: any[]): ShoppingOption[] {
    if (chunks.length === 0) return options; // No grounding metadata to verify against
    const realUrls = new Set<string>();
    for (const chunk of chunks) {
      const uri = chunk.web?.uri || chunk.maps?.uri;
      if (uri) realUrls.add(uri);
    }
    return options.map(opt => {
      if (realUrls.has(opt.url)) return opt;
      const match = chunks.find(c => {
        const title = c.web?.title || '';
        return title && (title.toLowerCase().includes(opt.title.toLowerCase()) || opt.title.toLowerCase().includes(title.toLowerCase()));
      });
      const resolvedUrl = match?.web?.uri || match?.maps?.uri;
      if (resolvedUrl) return { ...opt, url: resolvedUrl, source: match?.web?.title || opt.source };
      return { ...opt, isEstimated: true };
    });
  }

  /** Filter out noisy/irrelevant sources (forums, news, docs, social, etc.). */
  private filterShoppingOptions(options: ShoppingOption[]): ShoppingOption[] {
    return options.filter(opt => opt.url && !NOISY_DOMAINS.some(d => opt.url.includes(d)) && !NOISY_URL_PATTERNS.some(p => p.test(opt.url)));
  }

  async findLocalSuppliers(query: string): Promise<LocalSupplier[] | null> {
    try {
      if (this.config.provider === 'openai-compat') return null;
      const ai = this.getSearchClient();
      const response = await ai.models.generateContent({
        model: this.config.models.structured, contents: `Find local hardware stores for: ${query}.`,
        config: { tools: [{ googleMaps: {} }] }
      });
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      return chunks.map(chunk => ({ name: chunk.maps?.title || 'Local Supplier', address: 'Check Maps Link', url: chunk.maps?.uri || chunk.web?.uri })).slice(0, 5);
    } catch { return null; }
  }

  async hydratePartDetails(name: string, category: string, designContext?: string, localeContext?: string, preferredVendors?: string[]): Promise<Partial<any> | null> {
    try {
      if (this.config.provider === 'openai-compat') {
        const text = await this.openAiChat({
          model: this.config.models.structured,
          system: 'You are a hardware research specialist. Return JSON with keys: brand, description, price (number, USD), sku, ports (array of {name, type, gender, spec}).',
          userContent: `Look up hardware component: "${name}" (category: ${category}). Return JSON only.`,
          jsonMode: true, maxTokens: 1024,
        });
        const parsed = JSON.parse(text || 'null');
        // Normalize ports — openai-compat models often return strings or
        // malformed shapes. Coerce to a stable PortDefinition[] so the
        // frontend never crashes on `entry.part.ports.map(...)`.
        if (parsed && parsed.ports !== undefined) {
          parsed.ports = this.normalizePorts(parsed.ports);
        }
        return parsed;
      }
      const ai = this.getSearchClient();
      const response = await ai.models.generateContent({
        model: this.config.models.fast, contents: `Look up the real-world hardware component: "${name}" (category: ${category}).`,
        config: {
          systemInstruction: 'You are a hardware research specialist.', tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: { type: Type.OBJECT, properties: { brand: { type: Type.STRING }, description: { type: Type.STRING }, price: { type: Type.NUMBER }, sku: { type: Type.STRING }, ports: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, name: { type: Type.STRING }, type: { type: Type.STRING }, gender: { type: Type.STRING }, spec: { type: Type.STRING } }, required: ['id', 'name', 'type', 'gender', 'spec'] } } }, required: ['brand', 'description', 'price', 'ports'] }
        }
      });
      return JSON.parse(response.text || 'null');
    } catch { return null; }
  }

  async verifyDesign(bom: any[], requirements: string, previousAudit?: string, advancedChecks?: AdvancedValidationOption[]): Promise<ArchitectResponse & { auditActions?: AuditAction[] }> {
    try {
      const digest = bom.map(b => `[ID: ${b.instanceId}] ${b.quantity}x ${b.part.name} (${b.part.category}, Brand: ${b.part.brand || 'TBD'}) - Price: $${b.part.price}`).join('\n');
      let prompt = `DESIGN CONTEXT/REQUIREMENTS: ${requirements}\n\nCURRENT BILL OF MATERIALS:\n${digest}\n`;
      if (previousAudit) prompt += `\nPREVIOUS AUDIT RESULT:\n${previousAudit}\n`;
      let fullText: string;
      if (this.config.provider === 'openai-compat') {
        // VerifyDesign is a thinking-heavy task (deep analysis of BOM + requirements).
        // Bump max_tokens to leave ample room for thinking tokens + full audit output.
        fullText = await this.openAiChat({ model: this.config.models.smart, system: AUDIT_SYSTEM_INSTRUCTION, userContent: prompt, maxTokens: 16384 });
      } else {
        const ai = this.getClient();
        const response = await ai.models.generateContent({ model: this.config.models.smart, contents: prompt, config: { systemInstruction: AUDIT_SYSTEM_INSTRUCTION, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 2048 } } });
        fullText = response.text || "";
      }
      let auditText = fullText;
      let auditActions: AuditAction[] | undefined;
      const delimiterIndex = fullText.indexOf('===ACTIONS_JSON===');
      if (delimiterIndex !== -1) {
        auditText = fullText.substring(0, delimiterIndex).trim();
        let jsonPart = fullText.substring(delimiterIndex + 18).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        const parsed = this.extractJson<{ actions?: any[]; summary?: string }>(jsonPart);
        if (parsed?.actions && Array.isArray(parsed.actions)) {
          const isAdd = (a: any) => (a.type ?? a.action ?? '') === 'addPart';
          auditActions = parsed.actions.map((a: any) => ({
            type: isAdd(a) ? 'addPart' : 'removePart',
            // addPart: prefer partId, then id, then instanceId
            partId: a.partId ?? a.id ?? (isAdd(a) ? a.instanceId : undefined),
            // name: prefer name, then spec, then description
            name: a.name ?? a.spec ?? a.description,
            category: a.category ?? 'Component',
            quantity: a.quantity ?? 1,
            instanceId: a.instanceId,
            reason: a.reason ?? a.description ?? a.spec,
          } as AuditAction));
        }
      }
      return { ...this.parseArchitectResponse(auditText), auditActions };
    } catch (e: any) { return { reasoning: `Verification failed: ${e.message}`, toolCalls: [] }; }
  }

  async generateFabricationBrief(partName: string, context: string): Promise<string> {
    try {
      const system = 'You are a senior manufacturing engineer. Provide detailed fabrication specifications.';
      let text: string;
      if (this.config.provider === 'openai-compat') {
        text = await this.openAiChat({ model: this.config.models.smart, system, userContent: `Manufacturing specs for: ${partName}. Context: ${context}.`, maxTokens: 4096 });
      } else {
        const ai = this.getClient();
        const response = await ai.models.generateContent({ model: this.config.models.smart, contents: `Manufacturing specs for: ${partName}. Context: ${context}.`, config: { systemInstruction: system, maxOutputTokens: 4096 } });
        text = response.text || '';
      }
      return text || '';
    } catch (e: any) { return `Generation failed: ${e.message}`; }
  }

  async generateQAProtocol(partName: string, category: string): Promise<InspectionProtocol | null> {
    try {
      const system = 'You are a quality assurance engineer. Return JSON with: recommendedSensors, inspectionStrategy, defects.';
      if (this.config.provider === 'openai-compat') {
        const text = await this.openAiChat({ model: this.config.models.fast, system, userContent: `QA protocol for: ${partName} (${category}).`, jsonMode: true, maxTokens: 2048 });
        return JSON.parse(text || 'null');
      }
      const ai = this.getClient();
      const response = await ai.models.generateContent({ model: this.config.models.fast, contents: `QA protocol for: ${partName} (category: ${category}).`, config: { systemInstruction: system, responseMimeType: "application/json" } });
      return JSON.parse(response.text || 'null');
    } catch { return null; }
  }

  async generateAssemblyPlan(bom: any[], previousPlan?: AssemblyPlan): Promise<AssemblyPlan | null> {
    try {
      const bomDigest = bom.map(b => `${b.quantity}x ${b.part.name}`).join('\n');
      const prompt = `Generate a robotic assembly plan for:\n${bomDigest}`;
      const system = 'You are a robotics assembly planner. Return JSON with: steps (array of objects, each {stepNumber: number, description: string, requiredTool: string, estimatedTime: string}), totalTime (minutes), difficulty (string), requiredEndEffectors (array of strings), automationFeasibility (number 0-100), notes (string).';
      if (this.config.provider === 'openai-compat') {
        // AssemblyPlan is a thinking-heavy task (multi-step planning with tool/robotics reasoning).
        // Keep thinking enabled for better planning quality; extractJson + openAiChat's
        // thinking-block stripping handles the JSON extraction cleanly.
        const text = await this.openAiChat({ model: this.config.models.smart, system, userContent: prompt, maxTokens: 12288 });
        return this.normalizeAssemblyPlan(this.extractJson<AssemblyPlan>(text));
      }
      const ai = this.getClient();
      const response = await ai.models.generateContent({ model: this.config.models.smart, contents: prompt, config: { systemInstruction: system, responseMimeType: "application/json" } });
      return this.normalizeAssemblyPlan(JSON.parse(response.text || 'null'));
    } catch { return null; }
  }

  /**
   * Coerce any plan shape into a stable AssemblyPlan. Models frequently return
   * `steps` as an array of plain strings ("Pick and place...") or objects with
   * variant key names — neither renders in the UI (`step.description` etc.).
   * Also coerces automationFeasibility, which arrives as "High"/"85%" as often
   * as a number.
   */
  private normalizeAssemblyPlan(plan: any): AssemblyPlan | null {
    if (!plan || typeof plan !== 'object') return null;

    const feasibilityFrom = (v: any): number => {
      if (typeof v === 'number' && Number.isFinite(v)) return Math.min(100, Math.max(0, v));
      if (typeof v === 'string') {
        const pct = v.match(/(\d+(?:\.\d+)?)\s*%/);
        if (pct) return Math.min(100, Math.max(0, parseFloat(pct[1])));
        const n = parseFloat(v);
        if (Number.isFinite(n)) return Math.min(100, Math.max(0, n));
        const word = v.trim().toLowerCase();
        if (word === 'high' || word === 'full' || word === 'complete') return 85;
        if (word === 'medium' || word === 'moderate' || word === 'partial') return 50;
        if (word === 'low' || word === 'manual') return 20;
      }
      return 0;
    };

    const firstString = (o: Record<string, any>, keys: string[]): string =>
      String(keys.map(k => o[k]).find(v => typeof v === 'string' && v.trim()) ?? '').trim();

    const steps: AssemblyStep[] = (Array.isArray(plan.steps) ? plan.steps : []).map((s: any, i: number): AssemblyStep => {
      if (s && typeof s === 'object') {
        const description = firstString(s, ['description', 'instruction', 'action', 'task', 'text', 'step']);
        const requiredTool = firstString(s, ['requiredTool', 'tool', 'equipment', 'endEffector']);
        let estimatedTime = ['estimatedTime', 'time', 'duration', 'durationMinutes']
          .map(k => s[k]).find(v => v !== undefined && v !== null && v !== '') ?? '';
        if (typeof estimatedTime === 'number') estimatedTime = String(estimatedTime);
        const stepNumber = typeof s.stepNumber === 'number' ? s.stepNumber
          : typeof s.order === 'number' ? s.order
          : typeof s.index === 'number' ? s.index + 1
          : i + 1;
        return { stepNumber: stepNumber > 0 ? stepNumber : i + 1, description, requiredTool, estimatedTime: String(estimatedTime).trim() };
      }
      // Plain-string step ("Pick and place the MCU") — the common failure mode.
      return { stepNumber: i + 1, description: String(s ?? '').trim(), requiredTool: '', estimatedTime: '' };
    });

    return {
      ...plan,
      steps,
      difficulty: typeof plan.difficulty === 'string' ? plan.difficulty : String(plan.difficulty ?? ''),
      requiredEndEffectors: Array.isArray(plan.requiredEndEffectors) ? plan.requiredEndEffectors.map(String) : [],
      automationFeasibility: feasibilityFrom(plan.automationFeasibility),
      notes: typeof plan.notes === 'string' ? plan.notes : '',
      generatedAt: new Date(),
    };
  }

  async generateEnclosure(context: string, bom: any[]): Promise<EnclosureSpec | null> {
    try {
      const bomDigest = bom.map(b => `${b.quantity}x ${b.part.name}`).join('\n');
      const system = 'You are an expert mechanical engineer and OpenSCAD programmer. Return JSON with: material, dimensions, openSCAD, description.';
      const prompt = `Generate a 3D printable enclosure for: ${context}. Components: ${bomDigest}`;
      let spec: any;
      if (this.config.provider === 'openai-compat') {
        const text = await this.openAiChat({ model: this.config.models.smart, system, userContent: prompt, jsonMode: true, maxTokens: 8192 });
        spec = this.extractJson(text) ?? {};
      } else {
        const ai = this.getClient();
        const response = await ai.models.generateContent({ model: this.config.models.smart, contents: prompt, config: { systemInstruction: system, responseMimeType: "application/json", maxOutputTokens: 8192 } });
        spec = JSON.parse(response.text || '{}');
      }
      const img = await this.generateProductImage(`3D CAD render of enclosure: ${spec.description}`);
      return { ...spec, renderUrl: img };
    } catch { return null; }
  }

  async identifyComponent(image: string): Promise<ComponentIdentification | null> {
    try {
      const imageData = this.cleanBase64(image);
      if (!imageData) return null;
      const system = 'You are a hardware component identification specialist. Return JSON with: name, category, brand, condition, conditionNotes, defects, estimatedPrice, suggestedPartId, description, ports.';
      if (this.config.provider === 'openai-compat') {
        const text = await this.openAiChat({ model: this.config.models.fast, system, userContent: [{ type: 'image_url', image_url: { url: image } }, { type: 'text', text: 'Identify this component.' }], jsonMode: true, maxTokens: 2048 });
        return JSON.parse(text || 'null');
      }
      const ai = this.getClient();
      const response = await ai.models.generateContent({ model: this.config.models.fast, contents: { parts: [{ inlineData: { mimeType: imageData.mimeType, data: imageData.data } }, { text: 'Identify this hardware component.' }] }, config: { systemInstruction: system, responseMimeType: "application/json" } });
      return JSON.parse(response.text || 'null');
    } catch { return null; }
  }

  async applyAuditRecommendations(bom: any[], auditResult: string, requirements: string): Promise<{ actions: AuditAction[]; summary: string }> {
    const digest = bom.map(b => `[ID: ${b.instanceId}] ${b.quantity}x ${b.part.name} (${b.part.category})`).join('\n');
    const prompt = `DESIGN REQUIREMENTS: ${requirements}\n\nCURRENT BOM:\n${digest}\n\nAUDIT RESULT:\n${auditResult}\n\nExtract concrete BOM changes.`;
    const system = 'You are a hardware engineering audit assistant. Return JSON: {"actions":[{"type":"addPart","partId":"kebab-id","name":"Name","category":"Cat","quantity":1,"reason":"why"} or {"type":"removePart","instanceId":"EXACT_ID","reason":"why"}],"summary":"text"}. Use EXACTLY these field names.';
    if (this.config.provider === 'openai-compat') {
      const text = await this.openAiChat({ model: this.config.models.fast, system, userContent: prompt, jsonMode: true, maxTokens: 2048 });
      return this.extractJson<{ actions: AuditAction[]; summary: string }>(text) ?? { actions: [], summary: 'No changes.' };
    }
    const ai = this.getClient();
    const response = await ai.models.generateContent({ model: this.config.models.fast, contents: prompt, config: { systemInstruction: system, responseMimeType: "application/json" } });
    return JSON.parse(response.text || '{"actions":[],"summary":"No changes."}');
  }

  async getARGuidance(image: string, currentStep: number, plan: AssemblyPlan): Promise<string> {
    try {
      const step = plan.steps?.find((s: any) => s.stepNumber === currentStep);
      const imageData = this.cleanBase64(image);
      if (!imageData) return 'Unable to process camera frame.';
      const system = 'You are an AR assembly guidance system. Analyze the camera frame and provide concise, actionable assembly instructions for the current step.';
      const stepText = `Current Step ${currentStep}: ${step?.description ?? ''}. Analyze this frame and guide the user.`;
      if (this.config.provider === 'openai-compat') {
        const text = await this.openAiChat({
          model: this.config.models.fast, system,
          userContent: [
            { type: 'image_url', image_url: { url: image } },
            { type: 'text', text: stepText },
          ],
          maxTokens: 512,
        });
        return text || 'Continue with the assembly step.';
      }
      const ai = this.getClient();
      const response = await ai.models.generateContent({
        model: this.config.models.audio,
        contents: { parts: [
          { inlineData: { mimeType: imageData.mimeType, data: imageData.data } },
          { text: stepText },
        ]},
        config: { systemInstruction: system },
      });
      return response.text || 'Continue with the assembly step.';
    } catch { return 'Guidance temporarily unavailable.'; }
  }
}
