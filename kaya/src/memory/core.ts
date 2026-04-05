import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Core Memory ─────────────────────────────────────────────────────────────
// Reads memory/core_memory.md — stable user preferences.
// The user edits this file directly; the bot only reads it.

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORE_MEMORY_PATH = join(__dirname, '..', '..', '..', 'memory', 'core_memory.md');

/** Read core memory file. Returns empty string if not found. */
export function getCoreMemory(): string {
    if (!existsSync(CORE_MEMORY_PATH)) {
        return '';
    }

    try {
        const content = readFileSync(CORE_MEMORY_PATH, 'utf-8').trim();
        return content;
    } catch {
        console.warn('Could not read core_memory.md');
        return '';
    }
}
