import type { Tool } from '../llm/openai.js';

// ─── Tool: get_current_time ─────────────────────────────────────────────────
// Returns current date/time in Istanbul timezone (Europe/Istanbul).

export const timeToolDefinition: Tool = {
    name: 'get_current_time',
    description:
        'Get the current date and time in Istanbul timezone. Returns ISO 8601 string, local formatted string, and unix timestamp.',
    input_schema: {
        type: 'object' as const,
        properties: {},
        required: [],
    },
};

export function getCurrentTime(): string {
    const now = new Date();
    return JSON.stringify({
        iso: now.toISOString(),
        local: now.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
        timezone: 'Europe/Istanbul',
        unix: Math.floor(now.getTime() / 1000),
    });
}
