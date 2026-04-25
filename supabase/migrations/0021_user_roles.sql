-- Migration: User Roles table for RBAC
-- Created: 2026-04-25
-- Depends: 0020_system_settings (tenant concept)

CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer', 'guest')),
    assigned_by TEXT,
    assigned_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ, -- Optional role expiration
    metadata JSONB DEFAULT '{}',
    -- Unique constraint: one role per user per tenant
    UNIQUE(user_id, tenant_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_tenant ON public.user_roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own roles
CREATE POLICY "Users can view own roles" ON public.user_roles
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid()::text);

-- Admins can manage roles within their tenant
CREATE POLICY "Admins can manage tenant roles" ON public.user_roles
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()::text
            AND ur.tenant_id = user_roles.tenant_id
            AND ur.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()::text
            AND ur.tenant_id = user_roles.tenant_id
            AND ur.role = 'admin'
        )
    );

-- Global admins (no tenant) can manage all roles
CREATE POLICY "Global admins can manage all roles" ON public.user_roles
    FOR ALL
    TO authenticated
    USING (
        auth.jwt() ->> 'role' = 'admin'
        OR
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()::text
            AND ur.tenant_id IS NULL
            AND ur.role = 'admin'
        )
    );

COMMENT ON TABLE public.user_roles IS 'RBAC role assignments per user per tenant';
