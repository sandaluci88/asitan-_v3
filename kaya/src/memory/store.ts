import Database from 'better-sqlite3';
import { join, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ─── Memory Store (SQLite + FTS5) ────────────────────────────────────────────
// Local-first persistent memory. Full-text search via FTS5.
// Database lives at memory/memories.db — never leaves your machine.

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..');
const DB_PATH = join(PROJECT_ROOT, 'memory', 'memories.db');

let db: Database.Database | null = null;

export function initMemoryDb(): void {
    mkdirSync(join(PROJECT_ROOT, 'memory'), { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // Main table
    db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

    // FTS5 virtual table for full-text search
    db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      source,
      content='memories',
      content_rowid='id'
    )
  `);

    // Triggers to keep FTS in sync
    db.exec(`
    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content, source)
      VALUES (new.id, new.content, new.source);
    END
  `);

    db.exec(`
    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, source)
      VALUES ('delete', old.id, old.content, old.source);
    END
  `);

    console.log(`  Memory DB initialized: ${DB_PATH}`);
}

function getDb(): Database.Database {
    if (!db) throw new Error('Memory DB not initialized. Call initMemoryDb() first.');
    return db;
}

export interface Memory {
    id: number;
    content: string;
    source: string;
    created_at: string;
}

/** Save a memory to the store */
export function saveMemory(content: string, source: string = 'user'): Memory {
    const d = getDb();
    const stmt = d.prepare('INSERT INTO memories (content, source) VALUES (?, ?)');
    const result = stmt.run(content, source);

    return {
        id: Number(result.lastInsertRowid),
        content,
        source,
        created_at: new Date().toISOString(),
    };
}

/** Search memories using FTS5 ranked search, returns top-k results */
export function searchMemories(query: string, topK: number = 5): Memory[] {
    const d = getDb();

    // Sanitize query for FTS5 — wrap each word in quotes to avoid syntax errors
    const sanitized = query
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => `"${w}"`)
        .join(' OR ');

    if (!sanitized) return [];

    const stmt = d.prepare(`
    SELECT m.id, m.content, m.source, m.created_at
    FROM memories m
    JOIN memories_fts fts ON m.id = fts.rowid
    WHERE memories_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `);

    return stmt.all(sanitized, topK) as Memory[];
}

/** Get the N most recent memories */
export function listRecent(n: number = 10): Memory[] {
    const d = getDb();
    const stmt = d.prepare(`
    SELECT id, content, source, created_at
    FROM memories
    ORDER BY id DESC
    LIMIT ?
  `);
    return stmt.all(n) as Memory[];
}

/** Get total memory count */
export function memoryCount(): number {
    const d = getDb();
    const row = d.prepare('SELECT COUNT(*) as count FROM memories').get() as { count: number };
    return row.count;
}
