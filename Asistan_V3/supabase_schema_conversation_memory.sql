-- ============================================================
-- CONVERSATION MEMORY — Persistent chat history with compression
-- Hermes Agent'tan ilham: Supabase (PostgreSQL) uyarlaması
-- ============================================================

-- conversation_memory tablosu: Tüm sohbet geçmişi
-- compression destekli: eski mesajlar LLM ile özetlenir
CREATE TABLE IF NOT EXISTS conversation_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'summary')),
    content TEXT NOT NULL,
    summary TEXT,
    token_count INTEGER DEFAULT 0,
    is_compressed BOOLEAN DEFAULT false,
    parent_id UUID REFERENCES conversation_memory(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Performans indexleri
CREATE INDEX IF NOT EXISTS idx_conv_mem_chat_created
    ON conversation_memory(chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conv_mem_created
    ON conversation_memory(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conv_mem_compressed
    ON conversation_memory(is_compressed) WHERE is_compressed = true;

-- İçerik arama (ILIKE + sonrası pgvector)
CREATE INDEX IF NOT EXISTS idx_conv_mem_chat_id
    ON conversation_memory(chat_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE conversation_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for service role" ON conversation_memory
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- CLEANUP: 30 günden eski compressed mesajları sil
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_old_conversations()
RETURNS void AS $$
BEGIN
    DELETE FROM conversation_memory
    WHERE created_at < now() - interval '30 days'
      AND is_compressed = true;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- STATS: Sohbet istatistikleri
-- ============================================================
CREATE OR REPLACE FUNCTION get_conversation_stats(p_chat_id TEXT)
RETURNS TABLE (
    total_messages BIGINT,
    total_tokens BIGINT,
    compressed_count BIGINT,
    oldest_message TIMESTAMPTZ,
    newest_message TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) AS total_messages,
        COALESCE(SUM(token_count), 0) AS total_tokens,
        COUNT(*) FILTER (WHERE is_compressed = true) AS compressed_count,
        MIN(created_at) AS oldest_message,
        MAX(created_at) AS newest_message
    FROM conversation_memory
    WHERE chat_id = p_chat_id;
END;
$$ LANGUAGE plpgsql;
