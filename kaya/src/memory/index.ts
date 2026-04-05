import { config } from '../config.js';
import { getCoreMemory } from './core.js';
import { appendToMemoryLog } from './log.js';
import {
    initMemoryDb,
    saveMemory as dbSave,
    searchMemories as dbSearch,
    listRecent as dbRecent,
    memoryCount as dbCount,
    type Memory,
} from './store.js';
import {
    mockSaveMemory,
    mockSearchMemories,
    mockListRecent,
    mockMemoryCount,
} from './mock.js';

// ─── Memory Facade ───────────────────────────────────────────────────────────
// Unified API that dispatches to mock or real (SQLite) store based on config.

/** Initialize the memory system. Must be called at startup. */
export function initMemory(): void {
    if (!config.mockMemory) {
        initMemoryDb();
    } else {
        console.log('  Memory: mock mode (in-memory, no persistence)');
    }
}

/** Store a fact or snippet in memory */
export function remember(text: string, source: string = 'user'): Memory {
    // Always append to the human-readable log
    appendToMemoryLog(text, source);

    if (config.mockMemory) {
        const m = mockSaveMemory(text, source);
        return { id: m.id, content: m.content, source: m.source, created_at: m.created_at };
    }

    return dbSave(text, source);
}

/** Search memories by relevance, returns top-k results */
export function recall(query: string, topK: number = 5): Memory[] {
    if (config.mockMemory) {
        return mockSearchMemories(query, topK).map((m) => ({
            id: m.id,
            content: m.content,
            source: m.source,
            created_at: m.created_at,
        }));
    }

    return dbSearch(query, topK);
}

/** Get recent memories */
export function recentMemories(n: number = 10): Memory[] {
    if (config.mockMemory) {
        return mockListRecent(n).map((m) => ({
            id: m.id,
            content: m.content,
            source: m.source,
            created_at: m.created_at,
        }));
    }

    return dbRecent(n);
}

/** Get memory count */
export function getMemoryCount(): number {
    if (config.mockMemory) return mockMemoryCount();
    return dbCount();
}

/** Re-export core memory reader */
export { getCoreMemory } from './core.js';
