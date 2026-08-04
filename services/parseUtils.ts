import { ArchitectResponse } from './aiTypes.ts';

/**
 * Sanitize markdown tables by fixing common syntax errors.
 * Fixes:
 * - Extra leading/trailing pipes on separator rows
 * - Mismatched pipe counts between header and separator
 * - Missing pipes between columns
 * 
 * @param markdown - The markdown text to sanitize
 * @returns Sanitized markdown with properly formatted tables
 */
export function sanitizeMarkdownTables(markdown: string): string {
    if (!markdown) return markdown;

    const lines = markdown.split('\n');
    return lines.map((rawLine, idx) => {
        const row = rawLine.trim();
        if (row === '') return rawLine;

        // Separator row: only pipes, dashes, colons, and whitespace.
        // Leading/trailing pipes are optional so malformed LLM output is caught.
        const isSeparator = /^\|?[\s:|-]+\|?$/.test(row);
        if (!isSeparator) return rawLine;

        // Look backward for the nearest header row within the same table block.
        for (let j = idx - 1; j >= 0; j--) {
            const header = lines[j].trim();
            if (header === '') break;            // blank line ends the table block
            if (!header.startsWith('|')) break;  // non-table content above
            const colCount = countColumns(header);
            if (colCount > 0) {
                // Rebuild a properly formatted separator row: |---|---|---|
                return '| ' + Array(colCount).fill('---').join(' | ') + ' |';
            }
        }

        return row;
    }).join('\n');
}

/**
 * Count the number of visible columns in a table header row.
 * Splits on pipes and ignores the empty segments created by leading/trailing pipes.
 */
function countColumns(headerRow: string): number {
    return headerRow.trim().split('|').filter(seg => seg.trim() !== '').length;
}

/**
 * Parse architect response text and extract tool calls.
 * Also sanitizes markdown for proper rendering.
 */
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
        const partId = m[1];
        const name = m[2].replace(/\\"/g, '"').replace(/\\'/g, "'");
        const category = m[3];
        const qty = parseInt(m[4]);
        toolCalls.push({ type: 'addPart', partId, name, category, qty });
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
