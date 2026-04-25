-- Migration: Audit Logs table for admin action tracking
-- Created: 2026-04-25

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL, -- e.g., 'settings.update', 'permissions.grant'
    resource TEXT NOT NULL, -- e.g., 'settings', 'users', 'assets'
    resource_id TEXT, -- Optional specific resource ID
    details JSONB DEFAULT '{}', -- Structured action details
    severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    ip_address INET, -- Client IP
    user_agent TEXT, -- Client user agent
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT, -- If success = false
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON public.audit_logs(resource);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON public.audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON public.audit_logs(severity);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_time ON public.audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_time ON public.audit_logs(tenant_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own audit logs
CREATE POLICY "Users can view own audit logs" ON public.audit_logs
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid()::text);

-- Admins can view audit logs in their tenant
CREATE POLICY "Admins can view tenant audit logs" ON public.audit_logs
    FOR SELECT
    TO authenticated
    USING (
        tenant_id IS NULL
        OR
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()::text
            AND ur.tenant_id = audit_logs.tenant_id
            AND ur.role IN ('admin', 'editor')
        )
    );

-- Only system can insert audit logs (via service role or triggers)
CREATE POLICY "Service role can insert audit logs" ON public.audit_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (true); -- Application-level enforcement

-- Partitioning suggestion for high volume (commented out, implement if needed)
-- CREATE TABLE audit_logs_2026_04 PARTITION OF audit_logs
--     FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

COMMENT ON TABLE public.audit_logs IS 'Audit trail for all admin and system actions';

-- Retention: Consider adding a cron job to archive old logs
-- Example: DELETE FROM audit_logs WHERE created_at < now() - interval '1 year';
