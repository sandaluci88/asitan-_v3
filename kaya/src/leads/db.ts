import Database from 'better-sqlite3';
import { join, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Lead, LeadStatus, OutreachMessage, Campaign } from './types.js';

// ─── Lead Database ──────────────────────────────────────────────────────────
// SQLite-backed lead management with FTS5 search.
// Database lives at memory/kaya-leads.db — never leaves your machine.

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..');
const DB_PATH = join(PROJECT_ROOT, 'memory', 'kaya-leads.db');

let db: Database.Database | null = null;

function getDb(): Database.Database {
    if (!db) throw new Error('Leads DB not initialized. Call initLeadsDb() first.');
    return db;
}

export function initLeadsDb(): void {
    mkdirSync(join(PROJECT_ROOT, 'memory'), { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // ── Leads table ──
    db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      company TEXT,
      title TEXT,
      email TEXT,
      phone TEXT,
      telegram_id TEXT,
      website TEXT,
      industry TEXT,
      country TEXT NOT NULL DEFAULT 'TR',
      source TEXT NOT NULL DEFAULT 'manual',
      lead_score INTEGER NOT NULL DEFAULT 0,
      score_reasons TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'new',
      persona_tag TEXT,
      tags TEXT NOT NULL DEFAULT '',
      enrichment_data TEXT NOT NULL DEFAULT '{}',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

    // ── Add conversation_stage column if missing ──
    try { db.exec(`ALTER TABLE leads ADD COLUMN conversation_stage TEXT NOT NULL DEFAULT 'cold'`); } catch { /* already exists */ }

    // ── FTS5 for leads ──
    db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS leads_fts USING fts5(
      full_name,
      company,
      industry,
      notes,
      content='leads',
      content_rowid='id'
    )
  `);

    // FTS sync triggers
    db.exec(`
    CREATE TRIGGER IF NOT EXISTS leads_ai AFTER INSERT ON leads BEGIN
      INSERT INTO leads_fts(rowid, full_name, company, industry, notes)
      VALUES (new.id, new.full_name, new.company, new.industry, new.notes);
    END
  `);

    db.exec(`
    CREATE TRIGGER IF NOT EXISTS leads_ad AFTER DELETE ON leads BEGIN
      INSERT INTO leads_fts(leads_fts, rowid, full_name, company, industry, notes)
      VALUES ('delete', old.id, old.full_name, old.company, old.industry, old.notes);
    END
  `);

    db.exec(`
    CREATE TRIGGER IF NOT EXISTS leads_au AFTER UPDATE ON leads BEGIN
      INSERT INTO leads_fts(leads_fts, rowid, full_name, company, industry, notes)
      VALUES ('delete', old.id, old.full_name, old.company, old.industry, old.notes);
      INSERT INTO leads_fts(rowid, full_name, company, industry, notes)
      VALUES (new.id, new.full_name, new.company, new.industry, new.notes);
    END
  `);

    // ── Outreach messages table ──
    db.exec(`
    CREATE TABLE IF NOT EXISTS outreach_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL REFERENCES leads(id),
      channel TEXT NOT NULL DEFAULT 'email',
      message_type TEXT NOT NULL DEFAULT 'cold_intro',
      template_id TEXT,
      message_content TEXT NOT NULL,
      personalization_data TEXT NOT NULL DEFAULT '{}',
      sent_at TEXT NOT NULL DEFAULT (datetime('now')),
      replied_at TEXT,
      reply_content TEXT,
      reply_sentiment TEXT,
      status TEXT NOT NULL DEFAULT 'sent'
    )
  `);

    // ── Campaigns table ──
    db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      target_industry TEXT,
      target_country TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

    console.log(`  Leads DB initialized: ${DB_PATH}`);
}

// ─── Lead CRUD ──────────────────────────────────────────────────────────────

export function saveLead(lead: Omit<Lead, 'id' | 'created_at' | 'updated_at' | 'lead_score' | 'score_reasons'> & Partial<Pick<Lead, 'lead_score' | 'score_reasons'>>): Lead {
    const d = getDb();
    const stmt = d.prepare(`
    INSERT INTO leads (full_name, company, title, email, phone, telegram_id, website, industry, country, source, lead_score, score_reasons, status, persona_tag, tags, enrichment_data, notes)
    VALUES (@full_name, @company, @title, @email, @phone, @telegram_id, @website, @industry, @country, @source, @lead_score, @score_reasons, @status, @persona_tag, @tags, @enrichment_data, @notes)
  `);

    const params = {
        full_name: lead.full_name,
        company: lead.company ?? null,
        title: lead.title ?? null,
        email: lead.email ?? null,
        phone: lead.phone ?? null,
        telegram_id: lead.telegram_id ?? null,
        website: lead.website ?? null,
        industry: lead.industry ?? null,
        country: lead.country,
        source: lead.source,
        lead_score: lead.lead_score ?? 0,
        score_reasons: lead.score_reasons ?? '[]',
        status: lead.status,
        persona_tag: lead.persona_tag ?? null,
        tags: lead.tags,
        enrichment_data: lead.enrichment_data,
        notes: lead.notes ?? null,
    };

    const result = stmt.run(params);
    return getLeadById(Number(result.lastInsertRowid))!;
}

export function getLeadById(id: number): Lead | undefined {
    const d = getDb();
    return d.prepare('SELECT * FROM leads WHERE id = ?').get(id) as Lead | undefined;
}

export function updateLead(id: number, fields: Partial<Omit<Lead, 'id' | 'created_at'>>): Lead | undefined {
    const d = getDb();
    const allowed = [
        'full_name', 'company', 'title', 'email', 'phone', 'telegram_id',
        'website', 'industry', 'country', 'source', 'lead_score', 'score_reasons',
        'status', 'persona_tag', 'tags', 'enrichment_data', 'notes',
    ];

    const updates: string[] = [];
    const values: unknown[] = [];

    for (const key of allowed) {
        if (key in fields) {
            updates.push(`${key} = ?`);
            values.push((fields as Record<string, unknown>)[key]);
        }
    }

    if (updates.length === 0) return getLeadById(id);

    updates.push("updated_at = datetime('now')");
    values.push(id);

    d.prepare(`UPDATE leads SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return getLeadById(id);
}

export function searchLeads(query: string, filters?: { status?: LeadStatus; country?: string; source?: string }): Lead[] {
    const d = getDb();

    // FTS search
    const sanitized = query
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => `"${w}"`)
        .join(' OR ');

    if (!sanitized) return [];

    let sql = `
    SELECT l.* FROM leads l
    JOIN leads_fts fts ON l.id = fts.rowid
    WHERE leads_fts MATCH ?
  `;
    const params: unknown[] = [sanitized];

    if (filters?.status) {
        sql += ' AND l.status = ?';
        params.push(filters.status);
    }
    if (filters?.country) {
        sql += ' AND l.country = ?';
        params.push(filters.country);
    }
    if (filters?.source) {
        sql += ' AND l.source = ?';
        params.push(filters.source);
    }

    sql += ' ORDER BY rank LIMIT 50';

    return d.prepare(sql).all(...params) as Lead[];
}

export function listLeadsByStatus(status: LeadStatus, limit: number = 50): Lead[] {
    const d = getDb();
    return d.prepare('SELECT * FROM leads WHERE status = ? ORDER BY lead_score DESC, updated_at DESC LIMIT ?').all(status, limit) as Lead[];
}

// ─── Outreach CRUD ──────────────────────────────────────────────────────────

export function saveOutreach(msg: Omit<OutreachMessage, 'id' | 'sent_at' | 'replied_at' | 'reply_content' | 'reply_sentiment'> & Partial<Pick<OutreachMessage, 'sent_at'>>): OutreachMessage {
    const d = getDb();
    const stmt = d.prepare(`
    INSERT INTO outreach_messages (lead_id, channel, message_type, template_id, message_content, personalization_data, status)
    VALUES (@lead_id, @channel, @message_type, @template_id, @message_content, @personalization_data, @status)
  `);

    const result = stmt.run({
        lead_id: msg.lead_id,
        channel: msg.channel,
        message_type: msg.message_type,
        template_id: msg.template_id ?? null,
        message_content: msg.message_content,
        personalization_data: msg.personalization_data,
        status: msg.status,
    });

    return d.prepare('SELECT * FROM outreach_messages WHERE id = ?').get(Number(result.lastInsertRowid)) as OutreachMessage;
}

export function getOutreachForLead(leadId: number): OutreachMessage[] {
    const d = getDb();
    return d.prepare('SELECT * FROM outreach_messages WHERE lead_id = ? ORDER BY sent_at DESC').all(leadId) as OutreachMessage[];
}

export function getRecentOutreach(limit: number = 20): OutreachMessage[] {
    const d = getDb();
    return d.prepare('SELECT * FROM outreach_messages ORDER BY sent_at DESC LIMIT ?').all(limit) as OutreachMessage[];
}

// ─── Stats ──────────────────────────────────────────────────────────────────

export function getLeadCount(): number {
    const d = getDb();
    const row = d.prepare('SELECT COUNT(*) as count FROM leads').get() as { count: number };
    return row.count;
}

export function getAllLeads(limit: number = 500): Lead[] {
    const d = getDb();
    return d.prepare('SELECT * FROM leads ORDER BY updated_at DESC LIMIT ?').all(limit) as Lead[];
}

export function getPipelineStats(): Record<LeadStatus, number> {
    const d = getDb();
    const rows = d.prepare('SELECT status, COUNT(*) as count FROM leads GROUP BY status').all() as { status: LeadStatus; count: number }[];

    const stats: Record<LeadStatus, number> = {
        new: 0,
        researching: 0,
        qualified: 0,
        contacted: 0,
        replied: 0,
        meeting: 0,
        won: 0,
        lost: 0,
    };

    for (const row of rows) {
        stats[row.status] = row.count;
    }

    return stats;
}
