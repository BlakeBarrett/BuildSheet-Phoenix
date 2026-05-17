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

    // Handle Qwen-style JSON command format: {"command":"...","parameters":{...}} or [{...}]
    {
        let buf = '';
        let depth = 0;
        let inJson = false;
        const lines = reasoning.split('\n');
        const cleanedLines: string[] = [];
        const jsonBlocks: string[] = [];
        for (const line of lines) {
            const t = line.trim();
            if (!inJson && (t.startsWith('{') || t.startsWith('['))) { inJson = true; buf = ''; depth = 0; }
            if (inJson) {
                buf += line + '\n';
                for (const ch of line) {
                    if (ch === '{' || ch === '[') depth++;
                    else if (ch === '}' || ch === ']') depth--;
                }
                if (depth <= 0) {
                    jsonBlocks.push(buf.trim());
                    inJson = false; buf = '';
                }
            } else {
                cleanedLines.push(line);
            }
        }
        for (const block of jsonBlocks) {
            try {
                const data = JSON.parse(block);
                const items: any[] = Array.isArray(data) ? data : [data];
                let matched = false;
                for (const item of items) {
                    if (!item?.command || !item?.parameters) continue;
                    if (item.command === 'initializeDraft') {
                        toolCalls.push({ type: 'initializeDraft', name: item.parameters.name ?? '', reqs: item.parameters.requirements ?? '' });
                        matched = true;
                    } else if (item.command === 'addPart') {
                        toolCalls.push({ type: 'addPart', partId: item.parameters.id ?? item.parameters.partId ?? '', name: item.parameters.name ?? '', category: item.parameters.category ?? 'Component', qty: item.parameters.quantity ?? 1 });
                        matched = true;
                    } else if (item.command === 'removePart') {
                        toolCalls.push({ type: 'removePart', instanceId: item.parameters.instanceId ?? item.parameters.id ?? '' });
                        matched = true;
                    }
                }
                if (!matched) cleanedLines.push(block); // not a tool call block — keep it
            } catch { cleanedLines.push(block); } // invalid JSON — keep it
        }
        if (toolCalls.length > 0) reasoning = cleanedLines.join('\n');
    }

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
