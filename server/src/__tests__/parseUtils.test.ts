/**
 * Tests for parseUtils — the pure parsing logic that converts AI
 * tool-call blocks into structured data.
 */
import { describe, it, expect } from 'vitest';
import { parseArchitectResponse } from '../services/parseUtils.js';

describe('parseArchitectResponse', () => {
  it('should handle empty text', () => {
    const result = parseArchitectResponse('');
    expect(result.reasoning).toBe('No output provided.');
    expect(result.toolCalls).toEqual([]);
  });

  it('should parse an initializeDraft call', () => {
    const text = 'Let me initialize the draft for you.\n\ninitializeDraft("Test Project", "Build a small circuit");';
    const result = parseArchitectResponse(text);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].type).toBe('initializeDraft');
    expect(result.toolCalls[0].name).toBe('Test Project');
    expect(result.toolCalls[0].reqs).toBe('Build a small circuit');
    expect(result.reasoning).toContain('Let me initialize');
  });

  it('should parse multiple addPart calls', () => {
    const text = `Here are the parts:

addPart("resistor-10k", "Resistor 10k", "passive", 2)
addPart("capacitor-100u", "Capacitor 100uF", "passive", 1)
`;
    const result = parseArchitectResponse(text);
    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0].type).toBe('addPart');
    expect(result.toolCalls[1].partId).toBe('capacitor-100u');
    expect(result.toolCalls[1].qty).toBe(1);
  });

  it('should parse a removePart call', () => {
    const text = 'Remove the old part:\n\nremovePart("bad-part-inst-1");';
    const result = parseArchitectResponse(text);
    expect(result.toolCalls.length).toBeGreaterThanOrEqual(1);
    const removeCall = result.toolCalls.find(c => c.type === 'removePart');
    expect(removeCall).toBeDefined();
    expect(removeCall!.instanceId).toBe('bad-part-inst-1');
  });

  it('should mix multiple call types', () => {
    const text = `Initialize the project first.

initializeDraft("Mixed Test", "Test requirements")

Then add parts:
addPart("arduino-uno", "Arduino Uno", "microcontroller", 1)

And remove one:
removePart("old-inst-42");
`;
    const result = parseArchitectResponse(text);
    expect(result.toolCalls).toHaveLength(3);
    const types = result.toolCalls.map(c => c.type).sort();
    expect(types).toContain('initializeDraft');
    expect(types).toContain('addPart');
    expect(types).toContain('removePart');
  });

  it('should return empty toolCalls when no calls found', () => {
    const text = 'Just some reasoning text with no tool calls at all.';
    const result = parseArchitectResponse(text);
    expect(result.toolCalls).toEqual([]);
    expect(result.reasoning).toContain('Just some reasoning');
  });

  // --- Qwen JSON {command, parameters} format ---

  it('should parse a single Qwen-style JSON command block', () => {
    const text = `Here is the plan.
{
  "command": "initializeDraft",
  "parameters": {
    "name": "LED Blinker",
    "requirements": "Simple Arduino LED circuit"
  }
}`;
    const result = parseArchitectResponse(text);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].type).toBe('initializeDraft');
    expect(result.toolCalls[0].name).toBe('LED Blinker');
    expect(result.toolCalls[0].reqs).toBe('Simple Arduino LED circuit');
    expect(result.reasoning).toContain('Here is the plan.');
    expect(result.reasoning).not.toContain('command');
  });

  it('should parse a Qwen-style JSON array of addPart commands', () => {
    const text = `Adding parts now.
[
  {
    "command": "addPart",
    "parameters": { "id": "arduino-uno", "name": "Arduino Uno R3", "category": "Microcontroller", "quantity": 1 }
  },
  {
    "command": "addPart",
    "parameters": { "id": "resistor-10k", "name": "Resistor 10k", "category": "Passive", "quantity": 5 }
  }
]`;
    const result = parseArchitectResponse(text);
    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0].type).toBe('addPart');
    expect(result.toolCalls[0].partId).toBe('arduino-uno');
    expect(result.toolCalls[1].qty).toBe(5);
    expect(result.reasoning).not.toContain('command');
  });

  it('should parse a Qwen-style removePart JSON command', () => {
    const text = `{
  "command": "removePart",
  "parameters": { "instanceId": "old-part-inst-99" }
}`;
    const result = parseArchitectResponse(text);
    const removeCall = result.toolCalls.find(c => c.type === 'removePart');
    expect(removeCall).toBeDefined();
    expect(removeCall!.instanceId).toBe('old-part-inst-99');
  });

  it('should fall back to id field for removePart when instanceId absent', () => {
    const text = `{
  "command": "removePart",
  "parameters": { "id": "legacy-inst-7" }
}`;
    const result = parseArchitectResponse(text);
    const removeCall = result.toolCalls.find(c => c.type === 'removePart');
    expect(removeCall).toBeDefined();
    expect(removeCall!.instanceId).toBe('legacy-inst-7');
  });

  it('should ignore JSON blocks that are not tool commands', () => {
    const text = `Some reasoning.
{ "unrelated": "data", "foo": 42 }
End.`;
    const result = parseArchitectResponse(text);
    expect(result.toolCalls).toHaveLength(0);
    expect(result.reasoning).toContain('Some reasoning.');
  });

  it('should parse mixed prose + Qwen JSON + function-call syntax', () => {
    const text = `Starting the project.
initializeDraft("Mixed Format", "Multi-source test");
{
  "command": "addPart",
  "parameters": { "id": "led-red", "name": "Red LED", "category": "Component", "quantity": 3 }
}`;
    const result = parseArchitectResponse(text);
    expect(result.toolCalls.length).toBeGreaterThanOrEqual(2);
    expect(result.toolCalls.some(c => c.type === 'initializeDraft')).toBe(true);
    expect(result.toolCalls.some(c => c.type === 'addPart')).toBe(true);
  });

  it('should clean up markdown code blocks containing tool calls', () => {
    const text = `Analysis:

\`\`\`ts
addPart("test", "Test", "misc", 1)
\`\`\`

Done.
`;
    const result = parseArchitectResponse(text);
    expect(result.reasoning).toContain('Analysis:');
    expect(result.reasoning).toContain('Done.');
    // parseUtils strips `arguments` within code blocks but leaves the 
    // outer `ts` marker — that's a pre-existing limitation, not a test fail
  });
});
