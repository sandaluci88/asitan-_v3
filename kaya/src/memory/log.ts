import { appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Memory Log ──────────────────────────────────────────────────────────────
// Append-only log of safe summaries to memory/memory_log.md.
// Never overwrites — only appends. Never stores secrets.

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..');
const LOG_PATH = join(PROJECT_ROOT, 'memory', 'memory_log.md');

/** Append an entry to the memory log */
export function appendToMemoryLog(content: string, source: string = 'user'): void {
    mkdirSync(join(PROJECT_ROOT, 'memory'), { recursive: true });

    const timestamp = new Date().toISOString();
    const entry = `- **[${timestamp}]** \`${source}\`: ${content}\n`;

    try {
        appendFileSync(LOG_PATH, entry, 'utf-8');
    } catch (err) {
        console.error('Could not write to memory_log.md:', err);
    }
}
