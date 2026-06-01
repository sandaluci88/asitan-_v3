-- ============================================================
-- ORDER CRON JOBS — Sipariş bazlı otomatik takip job'ları
-- Hermes Agent'tan ilham: Context-scoped cron jobs
-- Her sipariş kendi job setini alır, sipariş bitince job'lar silinir
-- ============================================================

CREATE TABLE IF NOT EXISTS order_cron_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL,
    job_type TEXT NOT NULL CHECK (job_type IN (
        'delivery_warning',
        'fabric_check',
        'production_followup',
        'status_check'
    )),
    cron_expression TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    is_one_shot BOOLEAN DEFAULT false,
    next_run TIMESTAMPTZ,
    last_run TIMESTAMPTZ,
    last_result TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- Performans indexleri
CREATE INDEX IF NOT EXISTS idx_order_cron_order
    ON order_cron_jobs(order_id, is_active);

CREATE INDEX IF NOT EXISTS idx_order_cron_type
    ON order_cron_jobs(job_type, is_active);

CREATE INDEX IF NOT EXISTS idx_order_cron_next_run
    ON order_cron_jobs(next_run) WHERE is_active = true;

-- RLS
ALTER TABLE order_cron_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for service role" ON order_cron_jobs
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- HELPER: Belirli bir siparişin aktif job'larını getir
-- ============================================================
CREATE OR REPLACE FUNCTION get_order_active_jobs(p_order_id TEXT)
RETURNS TABLE (
    id UUID,
    order_id TEXT,
    job_type TEXT,
    cron_expression TEXT,
    is_active BOOLEAN,
    is_one_shot BOOLEAN,
    next_run TIMESTAMPTZ,
    last_run TIMESTAMPTZ,
    metadata JSONB,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ocj.id, ocj.order_id, ocj.job_type, ocj.cron_expression,
        ocj.is_active, ocj.is_one_shot, ocj.next_run, ocj.last_run,
        ocj.metadata, ocj.created_at
    FROM order_cron_jobs ocj
    WHERE ocj.order_id = p_order_id
      AND ocj.is_active = true
    ORDER BY ocj.created_at;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- HELPER: Sipariş tamamlandığında tüm job'ları deaktif et
-- ============================================================
CREATE OR REPLACE FUNCTION deactivate_order_jobs(p_order_id TEXT)
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE order_cron_jobs
    SET is_active = false,
        completed_at = now()
    WHERE order_id = p_order_id
      AND is_active = true;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- HELPER: Tüm aktif sipariş job'larını getir (bot restart için)
-- ============================================================
CREATE OR REPLACE FUNCTION get_all_active_order_jobs()
RETURNS TABLE (
    id UUID,
    order_id TEXT,
    job_type TEXT,
    cron_expression TEXT,
    is_active BOOLEAN,
    is_one_shot BOOLEAN,
    next_run TIMESTAMPTZ,
    last_run TIMESTAMPTZ,
    metadata JSONB,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ocj.id, ocj.order_id, ocj.job_type, ocj.cron_expression,
        ocj.is_active, ocj.is_one_shot, ocj.next_run, ocj.last_run,
        ocj.metadata, ocj.created_at
    FROM order_cron_jobs ocj
    WHERE ocj.is_active = true
    ORDER BY ocj.order_id, ocj.job_type;
END;
$$ LANGUAGE plpgsql;
