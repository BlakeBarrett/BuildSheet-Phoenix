/**
 * Quick diagnostic: tests DashScope API call patterns used in cloudAiService.ts
 * Run: cd server && npx tsx test-dashscope.ts
 */
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load root .env
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const API_KEY = process.env.AI_KEY;
const BASE_URL = process.env.AI_BASE_URL;
const MODEL_SMART = process.env.AI_MODEL_SMART;
const MODEL_FAST = process.env.AI_MODEL_FAST;

if (!API_KEY || !BASE_URL || !MODEL_SMART) {
  console.error('Missing env vars: AI_KEY, AI_BASE_URL, AI_MODEL_SMART');
  process.exit(1);
}

console.log('BASE_URL:', BASE_URL);
console.log('MODEL_SMART:', MODEL_SMART);
console.log('MODEL_FAST:', MODEL_FAST);
console.log('');

async function callApi(testName: string, body: any): Promise<void> {
  console.log(`=== ${testName} ===`);
  console.log('Request body (no messages):', JSON.stringify({ ...body, messages: '[omitted]' }));
  try {
    const resp = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    console.log('HTTP Status:', resp.status);
    if (!resp.ok) {
      console.error('ERROR RESPONSE:', text.substring(0, 500));
      return;
    }
    let data: any;
    try { data = JSON.parse(text); } catch { console.error('Failed to parse response JSON:', text.substring(0, 300)); return; }
    const content = data.choices?.[0]?.message?.content ?? '[no content]';
    console.log('Content length:', content.length);
    console.log('Has <think> tags:', /<think>/i.test(content));
    console.log('Has ===ACTIONS_JSON===:', content.includes('===ACTIONS_JSON==='));
    console.log('--- Content ---');
    console.log(content);
    console.log('--- End Content ---');
    // Try to parse as JSON
    const cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      console.log('JSON parse SUCCESS:', JSON.stringify(parsed).substring(0, 200));
    } catch (e: any) {
      console.warn('JSON.parse failed:', e.message);
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          console.log('Regex JSON fallback SUCCESS:', JSON.stringify(parsed).substring(0, 200));
        } catch {
          console.error('All JSON parsing failed.');
        }
      }
    }
  } catch (e: any) {
    console.error('Fetch error:', e.message);
  }
  console.log('');
}

const AUDIT_SYSTEM = `You are a senior hardware engineering auditor at BuildSheet.
PRIMARY OBJECTIVE: Verify that a given Bill of Materials (BOM) will produce a functional, buildable system.
CRITICAL — COMPATIBILITY CROSS-CHECK: Every single part in the BOM MUST be verified against the DESIGN CONTEXT.
OUTPUT FORMAT: After your audit text, append ===ACTIONS_JSON=== followed by JSON: {"actions":[...],"summary":"..."}
For removePart actions, use the EXACT instanceId from the BOM. For addPart, use descriptive kebab-case IDs.`;

const ASSEMBLY_SYSTEM = 'You are a robotics assembly planner. Return JSON with: steps, totalTime, difficulty, requiredEndEffectors, automationFeasibility, notes.';

async function main() {
  // Test 1: Assembly plan (exact server path: jsonMode=true, enable_thinking=false)
  await callApi('Assembly Plan — exact server path', {
    model: MODEL_SMART,
    messages: [
      { role: 'system', content: ASSEMBLY_SYSTEM },
      { role: 'user', content: 'Generate a robotic assembly plan for:\n1x Arduino Uno\n1x LED\n1x 220 ohm resistor' }
    ],
    temperature: 0.7,
    max_tokens: 4096,
    response_format: { type: 'json_object' },
    enable_thinking: false,
  });

  // Test 2: Verify design — exact AUDIT_SYSTEM_INSTRUCTION with ===ACTIONS_JSON=== delimiter
  await callApi('Verify Design — exact AUDIT_SYSTEM_INSTRUCTION', {
    model: MODEL_SMART,
    messages: [
      { role: 'system', content: AUDIT_SYSTEM },
      { role: 'user', content: 'DESIGN CONTEXT/REQUIREMENTS: Build a simple LED blinker circuit\n\nCURRENT BILL OF MATERIALS:\n[ID: inst-1] 1x Arduino Uno (Microcontroller, Brand: Arduino) - Price: $25\n[ID: inst-2] 1x LED (Component, Brand: Generic) - Price: $0.50' }
    ],
    temperature: 0.7,
    max_tokens: 4096,
  });
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
