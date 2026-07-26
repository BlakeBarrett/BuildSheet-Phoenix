/**
 * Server-side CloudAIService — lifted from the client-side version.
 * Runs in Node.js with direct API key access. No browser dependencies.
 */
import { GoogleGenAI, GenerateContentResponse, Type, Modality, GroundingSupport } from "@google/genai";
import { parseArchitectResponse } from './parseUtils.js';
import { VerifiedFactService } from './verifiedFactService.js';
import type {
  ServerAIService, AiConfig, AskArchitectResult, ArchitectResponse,
  ShoppingOption, LocalSupplier, InspectionProtocol, AssemblyPlan,
  EnclosureSpec, ComponentIdentification, AuditAction, AdvancedValidationOption
} from './types.js';

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
    const keywords = prompt.split(' ').filter(w => w.length > 3);
    const facts = await this.factService.searchFacts({
      searchTerm: keywords.join(' '),
      minConfidence: 0.8,
      limit: 10
    });
    if (facts.length === 0) return '';
    const factContext = facts.map(f => `- VERIFIED: ${f.statement} (source: ${f.source}, confidence: ${f.confidence})`).join('\n');
    return `\n\n=== VERIFIED FACTS ===\n${factContext}\n=========================\n`;
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
        // DashScope async generation
        const submitUrl = `${this.config.imageBaseUrl}/services/aigc/image-generation/generation`;
        const resp = await fetch(submitUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.config.apiKey}`, 'X-DashScope-Async': 'enable' },
          body: JSON.stringify({ model: this.config.models.image, input: { messages: [{ role: 'user', content: [{ text: description }] }] }, parameters: { n: 1, size: '1024*1024' } }),
        });
        const data: any = await resp.json();
        if (!resp.ok) {
            console.error('[DashScope] Failed to submit image generation:', data);
            throw new Error(`DashScope Error: ${data.message || data.code || 'Unknown error'}`);
        }
        const taskId = data.output?.task_id;
        if (!taskId) return null;
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 3000));
          const pollResp = await fetch(`${this.config.imageBaseUrl}/tasks/${taskId}`, { headers: { 'Authorization': `Bearer ${this.config.apiKey}` } });
          const pollData: any = await pollResp.json();
          const status = pollData.output?.task_status;
          if (status === 'SUCCEEDED') {
            const imageUrl = pollData.output?.choices?.[0]?.message?.content?.[0]?.image;
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
          return arr.length ? arr : [{ title: 'Local Market Research Required', url: '', source: 'BuildSheet' }];
        } catch { return [{ title: 'Local Market Research Required', url: '', source: 'BuildSheet' }]; }
      }
      const ai = this.getSearchClient();
      const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const prompt = `The current date is ${today}. Find real-world purchase options and actual prices for: ${query}.`;
      const response = await ai.models.generateContent({
        model: this.config.models.fast, contents: prompt,
        config: { systemInstruction: 'You are a hardware sourcing specialist. Search for real-world purchase options.', tools: [{ googleSearch: {} }] }
      });
      const candidate = response.candidates?.[0];
      const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];
      const supports = candidate?.groundingMetadata?.groundingSupports ?? [];
      if (chunks.length === 0) return [{ title: 'Local Market Research Required', url: '', source: 'BuildSheet' }];
      const confidenceMap = buildChunkConfidenceMap(supports);
      const options: ShoppingOption[] = chunks.map((chunk, idx) => ({
        title: chunk.web?.title || 'Unknown Retailer', url: chunk.web?.uri || '',
        source: chunk.web?.title || 'Unknown', isEstimated: (confidenceMap.get(idx) ?? 1.0) < 0.5,
      }));
      const clean = options.filter(opt => opt.url && !NOISY_DOMAINS.some(d => opt.url.includes(d)) && !NOISY_URL_PATTERNS.some(p => p.test(opt.url)));
      return clean.length ? clean.slice(0, 5) : [{ title: 'Local Market Research Required', url: '', source: 'BuildSheet' }];
    } catch (e) { console.error("findPartSources error:", e); return null; }
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
          system: 'You are a hardware research specialist. Return JSON with keys: brand, description, price (number, USD), sku, ports.',
          userContent: `Look up hardware component: "${name}" (category: ${category}). Return JSON only.`,
          jsonMode: true, maxTokens: 1024,
        });
        return JSON.parse(text || 'null');
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
      const system = 'You are a robotics assembly planner. Return JSON with: steps, totalTime, difficulty, requiredEndEffectors, automationFeasibility, notes.';
      if (this.config.provider === 'openai-compat') {
        // AssemblyPlan is a thinking-heavy task (multi-step planning with tool/robotics reasoning).
        // Keep thinking enabled for better planning quality; extractJson + openAiChat's
        // thinking-block stripping handles the JSON extraction cleanly.
        const text = await this.openAiChat({ model: this.config.models.smart, system, userContent: prompt, maxTokens: 12288 });
        const plan = this.extractJson<AssemblyPlan>(text);
        if (plan) plan.generatedAt = new Date();
        return plan;
      }
      const ai = this.getClient();
      const response = await ai.models.generateContent({ model: this.config.models.smart, contents: prompt, config: { systemInstruction: system, responseMimeType: "application/json" } });
      const plan = JSON.parse(response.text || 'null');
      if (plan) plan.generatedAt = new Date();
      return plan;
    } catch { return null; }
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
