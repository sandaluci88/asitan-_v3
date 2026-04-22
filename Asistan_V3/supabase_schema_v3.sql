-- Sandaluci Asistan V3 — Database Schema Additions
-- Run on top of existing V2 schema (staff, orders, order_items, visual_memory)

-- Enable pgvector if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- WIKI PAGES — Persistent knowledge base
-- ============================================================
CREATE TABLE IF NOT EXISTS wiki_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    page_type TEXT NOT NULL CHECK (page_type IN (
        'department', 'order', 'person', 'procedure',
        'product', 'concept', 'synthesis'
    )),
    tags TEXT[] DEFAULT '{}',
    source_refs TEXT[] DEFAULT '{}',
    outgoing_links TEXT[] DEFAULT '{}',
    incoming_links TEXT[] DEFAULT '{}',
    last_lint_status TEXT CHECK (last_lint_status IN ('healthy', 'stale', 'orphan', 'contradiction')),
    lint_notes TEXT,
    embedding vector(1024),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_wiki_pages_fts ON wiki_pages
    USING gin(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content,'')));

-- Tag-based search index
CREATE INDEX IF NOT EXISTS idx_wiki_pages_tags ON wiki_pages USING gin(tags);

-- Page type index
CREATE INDEX IF NOT EXISTS idx_wiki_pages_type ON wiki_pages(page_type);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_wiki_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wiki_updated_at ON wiki_pages;
CREATE TRIGGER trg_wiki_updated_at
    BEFORE UPDATE ON wiki_pages
    FOR EACH ROW EXECUTE FUNCTION update_wiki_updated_at();

-- ============================================================
-- WIKI CHANGELOG — Audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS wiki_changelog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_slug TEXT NOT NULL,
    change_type TEXT NOT NULL CHECK (change_type IN (
        'created', 'updated', 'contradiction_flagged', 'linted', 'merged'
    )),
    diff_summary TEXT,
    triggered_by TEXT NOT NULL DEFAULT 'manual' CHECK (triggered_by IN (
        'interaction', 'cron', 'manual'
    )),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wiki_changelog_slug ON wiki_changelog(page_slug);
CREATE INDEX IF NOT EXISTS idx_wiki_changelog_date ON wiki_changelog(created_at DESC);

-- ============================================================
-- PROMPT DECISIONS — Kaizen tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS prompt_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_version TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    input_summary TEXT,
    output TEXT NOT NULL,
    context JSONB,
    confidence REAL,
    outcome TEXT DEFAULT 'unknown' CHECK (outcome IN (
        'correct', 'corrected', 'rejected', 'unknown'
    )),
    user_feedback TEXT,
    interaction_type TEXT CHECK (interaction_type IN (
        'order_status', 'production_request', 'general',
        'distribution', 'staff_management'
    )),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompt_decisions_version ON prompt_decisions(prompt_version);
CREATE INDEX IF NOT EXISTS idx_prompt_decisions_outcome ON prompt_decisions(outcome);
CREATE INDEX IF NOT EXISTS idx_prompt_decisions_date ON prompt_decisions(created_at DESC);

-- ============================================================
-- PROMPT VERSIONS — Version-controlled system prompts
-- ============================================================
CREATE TABLE IF NOT EXISTS prompt_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version TEXT UNIQUE NOT NULL,
    content TEXT NOT NULL,
    score REAL DEFAULT 0,
    is_active BOOLEAN DEFAULT false,
    wiki_context_used TEXT[] DEFAULT '{}',
    evaluation_notes TEXT,
    activated_at TIMESTAMPTZ,
    deactivated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Only one active version at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_versions_active ON prompt_versions(is_active) WHERE is_active = true;

-- ============================================================
-- WIKI SEMANTIC SEARCH — pgvector similarity
-- ============================================================
CREATE OR REPLACE FUNCTION match_wiki_pages(
    query_embedding vector(1024),
    match_threshold float DEFAULT 0.6,
    match_count int DEFAULT 5,
    filter_tags text[] DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    slug TEXT,
    title TEXT,
    content TEXT,
    page_type TEXT,
    tags TEXT[],
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        wp.id, wp.slug, wp.title, wp.content, wp.page_type, wp.tags,
        1 - (wp.embedding <=> query_embedding) AS similarity
    FROM wiki_pages wp
    WHERE (1 - (wp.embedding <=> query_embedding)) > match_threshold
      AND (filter_tags IS NULL OR wp.tags && filter_tags)
    ORDER BY similarity DESC
    LIMIT match_count;
END;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE wiki_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE wiki_changelog ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for service role" ON wiki_pages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON wiki_changelog FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON prompt_decisions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON prompt_versions FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- INITIAL DATA — Seed prompt version
-- ============================================================
INSERT INTO prompt_versions (version, content, is_active, score)
VALUES (
    '3.0.0',
    'Sandaluci Asistan V3 — Ayca (Kaya SDR) — Temel sistem promptu. Wiki destekli dinamik baglam.',
    true,
    0
) ON CONFLICT (version) DO NOTHING;
