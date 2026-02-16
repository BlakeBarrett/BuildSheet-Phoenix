
import { AIService, ArchitectResponse } from './aiTypes.ts';
import { ShoppingOption, LocalSupplier, InspectionProtocol, AssemblyPlan, EnclosureSpec } from '../types.ts';

export interface LocalAIConfig {
  baseUrl: string;
  model: string;
  visionModel?: string;  // Optional separate model for vision/multimodal tasks
  apiKey?: string;
}

export class LocalAIService implements AIService {
  public name = "Local AI (Ollama)";
  public isOffline = false;
  
  private config: LocalAIConfig;
  private abortController: AbortController | null = null;

  constructor(config: LocalAIConfig) {
    this.config = {
      ...config,
      // If baseUrl is empty or just the protocol, use relative URLs (for proxy mode)
      baseUrl: config.baseUrl ? config.baseUrl.replace(/\/$/, '') : ''
    };
  }

  /**
   * Test connection to the local AI server
   */
  public async testConnection(): Promise<{ success: boolean; error?: string; models?: string[] }> {
    try {
      // Try OpenAI-compatible /v1/models endpoint first, fallback to /models
      const urls = [`${this.config.baseUrl}/v1/models`, `${this.config.baseUrl}/models`];
      let lastError = null;
      
      for (const url of urls) {
        try {
          const response = await fetch(url, {
            method: 'GET',
            headers: this.getHeaders(),
          });

          if (response.ok) {
            const data = await response.json();
            const models = data.data?.map((m: any) => m.id) || data.models?.map((m: any) => m.name) || [];
            return { success: true, models };
          }
        } catch (e: any) {
          lastError = e;
          continue;
        }
      }
      
      throw lastError || new Error('Failed to connect to any endpoint');
    } catch (error: any) {
      return { 
        success: false, 
        error: `Connection failed: ${error.message}` 
      };
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }

  public getApiKeyStatus(): string {
    if (this.config.apiKey) {
      return `${this.config.apiKey.substring(0, 4)}... (Len: ${this.config.apiKey.length})`;
    }
    return "No API Key (Local Server)";
  }

  private cleanBase64(dataUrl: string): { mimeType: string; data: string } | null {
    try {
      const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
      if (!matches || matches.length !== 3) return null;
      return { mimeType: matches[1], data: matches[2] };
    } catch (e) { 
      return null; 
    }
  }

  /**
   * Convert our internal history format to OpenAI messages format
   */
  private convertHistory(history: any[]): any[] {
    return history.map((h: any) => ({
      role: h.role === 'model' ? 'assistant' : h.role,
      content: h.parts?.map((p: any) => p.text).join('\n') || ''
    }));
  }

  async askArchitect(prompt: string, history: any[], image?: string): Promise<string> {
    this.abortController = new AbortController();
    
    try {
      const messages: any[] = [];
      
      // Add system instruction
      messages.push({
        role: 'system',
        content: this.getSystemInstruction()
      });

      // Add history
      if (history.length > 0) {
        messages.push(...this.convertHistory(history));
      }

      // Add user message with optional image
      const userMessage: any = {
        role: 'user',
        content: []
      };

      if (image) {
        const imageData = this.cleanBase64(image);
        if (imageData) {
          userMessage.content.push({
            type: 'image_url',
            image_url: {
              url: `data:${imageData.mimeType};base64,${imageData.data}`
            }
          });
        }
      }

      userMessage.content.push({
        type: 'text',
        text: prompt
      });

      // If no image, simplify to string content
      if (userMessage.content.length === 1 && userMessage.content[0].type === 'text') {
        userMessage.content = userMessage.content[0].text;
      }

      messages.push(userMessage);

      const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        signal: this.abortController.signal,
        body: JSON.stringify({
          model: this.config.model,
          messages: messages,
          temperature: 0.7,
          stream: false
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorData}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || "Local AI provided no output.";
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return "Request was cancelled.";
      }
      console.error("[LocalAIService] askArchitect Failed:", error);
      // Check if it's a CORS error
      if (error.message?.includes('CORS') || error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
        throw new Error(`CORS/Network Error: Cannot connect to ${this.config.baseUrl}. Make sure LM Studio has CORS enabled or is configured to accept connections from ${window.location.origin}. Error: ${error.message}`);
      }
      throw new Error(`Local AI Error: ${error.message}`);
    } finally {
      this.abortController = null;
    }
  }

  parseArchitectResponse(text: string): ArchitectResponse {
    const toolCalls: any[] = [];
    if (!text) return { reasoning: "Local AI provided no output.", toolCalls };

    let reasoning = text;

    // Parse initializeDraft
    const initMatch = text.match(/initializeDraft\s*\(\s*["'](.+?)["']\s*,\s*["'](.+?)["']\s*\)\s*;?/);
    if (initMatch) {
      toolCalls.push({ type: 'initializeDraft', name: initMatch[1], reqs: initMatch[2] });
      reasoning = reasoning.replace(initMatch[0], '');
    }

    // Parse addPart
    const addMatches = [...text.matchAll(/addPart\s*\(\s*["']?([^"',\s]+)["']?\s*,\s*(\d+)\s*\)\s*;?/g)];
    addMatches.forEach(m => {
      toolCalls.push({ type: 'addPart', partId: m[1], qty: parseInt(m[2]) });
      reasoning = reasoning.replace(m[0], '');
    });

    // Parse removePart
    const removeMatches = [...text.matchAll(/removePart\s*\(\s*["']?([^"',\s]+)["']?\s*\)\s*;?/g)];
    removeMatches.forEach(m => {
      toolCalls.push({ type: 'removePart', instanceId: m[1] });
      reasoning = reasoning.replace(m[0], '');
    });

    // Clean up formatting artifacts
    reasoning = reasoning.replace(/(###?\s*(Tool Calls|Corrections|Actions|Functions|Tool\s*Commands|Correction|Correction\s*\(Tool\s*Calls\)).*)/gi, '');
    reasoning = reasoning.replace(/(Task\s*\d+:\s*(Correction|Tool Calls|Actions).*)/gi, '');
    reasoning = reasoning.replace(/```[a-z]*\s*[\s\S]*?(addPart|removePart|initializeDraft|tool|arguments)[\s\S]*?```/gi, '');
    reasoning = reasoning.replace(/\[\s*\{\s*["']tool["']\s*:[\s\S]*?\}\s*\]/gi, '');
    reasoning = reasoning.replace(/^\s*\/\/.*$/gm, '');
    reasoning = reasoning.replace(/^\s*;\s*$/gm, '');
    reasoning = reasoning.replace(/[ \t]+$/gm, '');
    reasoning = reasoning.replace(/\n{3,}/g, '\n\n');

    return { reasoning: reasoning.trim(), toolCalls };
  }

  async generateProductImage(description: string, referenceImage?: string): Promise<string | null> {
    // Local AI (Ollama) doesn't support image generation
    // Return null to trigger fallback behavior
    return null;
  }

  async findPartSources(query: string): Promise<ShoppingOption[] | null> {
    // Local AI doesn't have web search capability
    return null;
  }

  async findLocalSuppliers(query: string, location?: { lat: number; lng: number }): Promise<LocalSupplier[] | null> {
    // Local AI doesn't have maps capability
    return null;
  }

  async verifyDesign(bom: any[], requirements: string, previousAudit?: string): Promise<ArchitectResponse> {
    try {
      const digest = bom.map(b => `[ID: ${b.instanceId}] ${b.quantity}x ${b.part.name} - Price: $${b.part.price} - Description: ${b.part.description}`).join('\n');

      let prompt = `PERFORM A TECHNICAL AND PATENT AUDIT.
DESIGN CONTEXT/REQUIREMENTS: ${requirements}

CURRENT BILL OF MATERIALS:
${digest}`;

      if (previousAudit) {
        prompt += `\n\nPREVIOUS AUDIT RESULT:\n${previousAudit}`;
      }

      const messages = [
        { role: 'system', content: this.getSystemInstruction() },
        { role: 'user', content: prompt }
      ];

      const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.config.visionModel || this.config.model,
          messages: messages,
          temperature: 0.5,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "";
      return this.parseArchitectResponse(text);
    } catch (error: any) {
      return { reasoning: `Verification failed: ${error.message}`, toolCalls: [] };
    }
  }

  async generateFabricationBrief(partName: string, context: string): Promise<string> {
    try {
      const messages = [
        { role: 'system', content: this.getSystemInstruction() },
        { role: 'user', content: `Manufacturing specs for: ${partName}. Context: ${context}.` }
      ];

      const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.config.model,
          messages: messages,
          temperature: 0.5,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || "";
    } catch (error: any) {
      return `Generation failed: ${error.message}`;
    }
  }

  async generateQAProtocol(partName: string, category: string): Promise<InspectionProtocol | null> {
    try {
      const messages = [
        { role: 'system', content: this.getSystemInstruction() },
        { 
          role: 'user', 
          content: `Generate a QA protocol for: ${partName} (Category: ${category}). Respond with valid JSON matching this schema:
{
  "recommendedSensors": ["string"],
  "inspectionStrategy": "string",
  "defects": [
    {
      "name": "string",
      "severity": "string",
      "description": "string"
    }
  ]
}` 
        }
      ];

      const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.config.model,
          messages: messages,
          temperature: 0.3,
          response_format: { type: "json_object" },
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "null";
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  }

  async generateAssemblyPlan(bom: any[], previousPlan?: AssemblyPlan): Promise<AssemblyPlan | null> {
    try {
      const bomDigest = bom.map(b => `${b.quantity}x ${b.part.name}`).join('\n');
      let prompt = `Generate an assembly plan for:\n${bomDigest}`;

      if (previousPlan) {
        prompt += `\n\n--- PREVIOUS PLAN ---\nUpdate this plan based on the new BOM.`;
      }

      prompt += `\n\nRespond with valid JSON matching this schema:\n{
  "steps": [
    {
      "stepNumber": number,
      "description": "string",
      "requiredTool": "string",
      "estimatedTime": "string"
    }
  ],
  "totalTime": "string",
  "difficulty": "string",
  "requiredEndEffectors": ["string"],
  "automationFeasibility": number,
  "notes": "string"
}`;

      const messages = [
        { role: 'system', content: this.getSystemInstruction() },
        { role: 'user', content: prompt }
      ];

      const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.config.model,
          messages: messages,
          temperature: 0.3,
          response_format: { type: "json_object" },
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "null";
      const plan = JSON.parse(text);
      if (plan) plan.generatedAt = new Date();
      return plan;
    } catch (error) {
      return null;
    }
  }

  async generateEnclosure(context: string, bom: any[]): Promise<EnclosureSpec | null> {
    try {
      const bomDigest = bom.map(b => `${b.quantity}x ${b.part.name}`).join('\n');
      
      const messages = [
        { role: 'system', content: this.getSystemInstruction() },
        { 
          role: 'user', 
          content: `Generate a 3D printable enclosure specification. Context: ${context}. Components: ${bomDigest}

Respond with valid JSON matching this schema:
{
  "material": "string",
  "dimensions": "string",
  "openSCAD": "string (optional OpenSCAD code)",
  "description": "string"
}` 
        }
      ];

      const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.config.model,
          messages: messages,
          temperature: 0.3,
          response_format: { type: "json_object" },
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "null";
      const spec = JSON.parse(text);
      return spec;
    } catch (error) {
      return null;
    }
  }

  async getARGuidance(image: string, currentStep: number, plan: AssemblyPlan): Promise<string> {
    try {
      const step = plan.steps.find(s => s.stepNumber === currentStep);
      const imageData = this.cleanBase64(image);
      if (!imageData) return "Unable to process camera frame.";

      const messages: any[] = [
        { 
          role: 'system', 
          content: 'You are an AR assembly assistant. Analyze the image and provide specific guidance for the current assembly step.' 
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${imageData.mimeType};base64,${imageData.data}`
              }
            },
            {
              type: 'text',
              text: `AR ASSEMBLY GUIDE: Current Step ${currentStep}: ${step?.description}. Analyze the frame and provide specific guidance.`
            }
          ]
        }
      ];

      const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.config.model,
          messages: messages,
          temperature: 0.5,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || "Continue with the assembly step.";
    } catch (error) {
      return "Guidance temporarily unavailable.";
    }
  }

  private getSystemInstruction(): string {
    return `ROLE: You are the Senior Hardware Architect and Robotics Engineer (Robotics-ER 1.5) at BuildSheet. 

CORE DIRECTIVE:
You are a FUNCTIONAL AGENT. Your primary job is to Manipulate the State of the drafting board using Tools.
DO NOT just describe the build in text. You MUST call \`initializeDraft\` and \`addPart\` commands to actually create the BOM.

TOOLS:
- \`initializeDraft(name: string, requirements: string)\`
- \`addPart(partId: string, quantity: number)\`
- \`removePart(instanceId: string)\`

BEHAVIOR:
1. **START:** When a user asks to build something new, you MUST call \`initializeDraft(name, requirements)\` first.
2. **OUTPUT FORMAT:** Provide a brief reasoning summary. Append Tool Calls at the end. 
   **CRITICAL:** Do NOT label the tool calls with "Tool Calls:" or "Corrections:". Just output the functions.
   Syntax: \`addPart("id", quantity)\``;
  }

  public abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }
}
