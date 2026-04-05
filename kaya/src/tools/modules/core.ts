import type { Tool } from '../../llm/openai.js';
import { timeToolDefinition, getCurrentTime } from '../time.js';
import { remember, recall } from '../../memory/index.js';

// ─── Core Tools ─────────────────────────────────────────────────────────────
// Available to ALL agents: time, memory.

type ToolHandler = (input: Record<string, unknown>) => string | Promise<string>;

export const toolHandlers: Record<string, ToolHandler> = {
    get_current_time: () => getCurrentTime(),

    remember_fact: (input) => {
        const fact = String(input.fact || '');
        if (!fact) return JSON.stringify({ error: 'No fact provided' });
        const mem = remember(fact, 'agent');
        return JSON.stringify({ stored: true, id: mem.id, fact: mem.content });
    },

    recall_memories: (input) => {
        const query = String(input.query || '');
        const topK = typeof input.top_k === 'number' ? input.top_k : 5;
        if (!query) return JSON.stringify({ error: 'No query provided' });
        const results = recall(query, topK);
        return JSON.stringify({ count: results.length, memories: results });
    },
};

const rememberDef: Tool = {
    name: 'remember_fact',
    description: 'Store an important fact, preference, or piece of information for future reference.',
    input_schema: {
        type: 'object' as const,
        properties: {
            fact: { type: 'string', description: 'The fact or information to remember.' },
        },
        required: ['fact'],
    },
};

const recallDef: Tool = {
    name: 'recall_memories',
    description: 'Search stored memories for information relevant to the current conversation.',
    input_schema: {
        type: 'object' as const,
        properties: {
            query: { type: 'string', description: 'Search query to find relevant memories.' },
            top_k: { type: 'number', description: 'Maximum results to return. Default: 5.' },
        },
        required: ['query'],
    },
};

export const toolDefinitions: Tool[] = [
    timeToolDefinition,
    rememberDef,
    recallDef,
];
