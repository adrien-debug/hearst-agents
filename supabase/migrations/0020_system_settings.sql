-- Migration: System Settings table for dynamic configuration
-- Created: 2026-04-25
-- Fixed: Unique constraint for NULL tenant_id (global settings)

CREATE TABLE IF NOT EXISTS system_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    key TEXT NOT NULL,
    value TEXT NOT NULL, -- JSON stringified
    category TEXT NOT NULL CHECK (category IN (
        'feature_flags',
        'thresholds',
        'limits',
        'integrations',
        'ui',
        'analytics'
    )),
    description TEXT,
    is_encrypted BOOLEAN DEFAULT FALSE,
    tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
    updated_at TIMESTAMPTZ DEFAULT now(),
    updated_by TEXT
    -- Note: UNIQUE(key, tenant_id) removed - see partial unique indexes below
);

-- Partial unique indexes for proper constraint handling
-- Global settings: only one per key (tenant_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_global_unique 
    ON system_settings(key) 
    WHERE tenant_id IS NULL;

-- Tenant-specific settings: only one per (key, tenant_id) combo
CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_tenant_unique 
    ON system_settings(key, tenant_id) 
    WHERE tenant_id IS NOT NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);
CREATE INDEX IF NOT EXISTS idx_system_settings_tenant ON system_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_system_settings_key_lookup ON system_settings(key, tenant_id);

-- Enable RLS
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage settings" ON system_settings
    FOR ALL
    TO authenticated
    USING (auth.jwt() ->> 'role' = 'admin')
    WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Users can read non-sensitive settings" ON system_settings
    FOR SELECT
    TO authenticated
    USING (
        is_encrypted = FALSE
        AND (
            tenant_id IS NULL
            OR tenant_id = auth.jwt() ->> 'tenant_id'
        )
    );

-- Seed default settings (globals with tenant_id = NULL)
INSERT INTO system_settings (key, value, category, description, tenant_id)
VALUES
    ('analytics.enabled', 'true', 'feature_flags', 'Enable analytics event tracking', NULL),
    ('toasts.enabled', 'true', 'feature_flags', 'Enable user toast notifications', NULL),
    ('memory.max_tokens', '128000', 'thresholds', 'Maximum context window tokens', NULL),
    ('runs.max_concurrent', '5', 'thresholds', 'Maximum concurrent runs per user', NULL),
    ('upload.max_size_mb', '50', 'limits', 'Maximum file upload size in MB', NULL),
    ('nango.enabled', 'true', 'integrations', 'Enable Nango OAuth integration', NULL),
    ('ui.theme.default', '"dark"', 'ui', 'Default UI theme', NULL),
    ('analytics.retention_days', '90', 'analytics', 'Event retention period', NULL)
ON CONFLICT (key) WHERE tenant_id IS NULL DO NOTHING;

COMMENT ON TABLE system_settings IS 'Dynamic system configuration with tenant override support';
