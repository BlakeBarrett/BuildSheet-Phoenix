/**
 * Shared parser for architect response text — server-side copy.
 * Extracts tool calls (initializeDraft, addPart, removePart) from LLM output.
 */
import type { ArchitectResponse } from './types.js';

export function parseArchitectResponse(text: string): ArchitectResponse {
    const toolCalls: any[] = [];
    if (!text) return { reasoning: "No output provided.", toolCalls };

    let reasoning = text;

    const initMatch = text.match(/initializeDraft\s*\(\s*["'](.*?)["']\s*,\s*["'](.*?)["']\s*\)\s*;?/);
    if (initMatch) {
        toolCalls.push({ type: 'initializeDraft', name: initMatch[1], reqs: initMatch[2] });
        reasoning = reasoning.replace(initMatch[0], '');
    }

    const addMatches = [...text.matchAll(/addPart\s*\(\s*["']([^"']+)["']\s*,\s*["'](.*?)(?<!\\)["']\s*,\s*["']([^"']+)["']\s*,\s*(\d+)\s*\)\s*;?/gs)];
    addMatches.forEach(m => {
        toolCalls.push({ type: 'addPart', partId: m[1], name: m[2].replace(/\\"/g, '"').replace(/\\'/g, "'"), category: m[3], qty: parseInt(m[4]) });
        reasoning = reasoning.replace(m[0], '');
    });

    const removeMatches = [...text.matchAll(/removePart\s*\(\s*["']?([^"',\s]+)["']?\s*\)\s*;?/g)];
    removeMatches.forEach(m => {
        toolCalls.push({ type: 'removePart', instanceId: m[1] });
        reasoning = reasoning.replace(m[0], '');
    });

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
