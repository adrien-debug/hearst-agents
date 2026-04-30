"use client";

/**
 * Table top-tenants pour /admin/analytics — drill-down via callback `onSelect`.
 */

import type { TenantUsage } from "@/lib/admin/usage/aggregate";

interface TenantsTableProps {
  tenants: TenantUsage[];
  selectedId?: string | null;
  onSelect: (tenantId: string) => void;
}

export function TenantsTable({ tenants, selectedId = null, onSelect }: TenantsTableProps) {
  if (tenants.length === 0) {
    return (
      <div
        className="flex items-center justify-center"
        style={{
          padding: "var(--space-6)",
          border: "1px solid var(--line-strong)",
          borderRadius: "var(--radius-md)",
          background: "var(--bg-elev)",
        }}
      >
        <span className="t-11 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
          Aucun tenant sur la fenêtre
        </span>
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden"
      style={{
        border: "1px solid var(--line-strong)",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-elev)",
      }}
    >
      <header
        className="grid grid-cols-12 items-center"
        style={{
          padding: "var(--space-3) var(--space-4)",
          borderBottom: "1px solid var(--line-strong)",
          gap: "var(--space-3)",
        }}
      >
        <Th className="col-span-3">Tenant</Th>
        <Th className="col-span-2 text-right">Runs</Th>
        <Th className="col-span-2 text-right">Cost USD</Th>
        <Th className="col-span-2 text-right">Tokens</Th>
        <Th className="col-span-1 text-right">Missions</Th>
        <Th className="col-span-1 text-right">Assets</Th>
        <Th className="col-span-1 text-right">Users</Th>
      </header>
      <ul>
        {tenants.map((t) => {
          const selected = t.tenantId === selectedId;
          return (
            <li key={t.tenantId}>
              <button
                type="button"
                onClick={() => onSelect(t.tenantId)}
                className="grid grid-cols-12 items-center w-full text-left transition-colors"
                style={{
                  padding: "var(--space-3) var(--space-4)",
                  borderBottom: "1px solid var(--line-strong)",
                  gap: "var(--space-3)",
                  background: selected ? "var(--cykan-surface)" : "transparent",
                }}
              >
                <Td className="col-span-3 truncate t-13 font-medium text-[var(--text)]">
                  {t.tenantId}
                </Td>
                <Td className="col-span-2 text-right t-13 font-mono text-[var(--text-soft)]">
                  {t.totalRuns}
                </Td>
                <Td className="col-span-2 text-right t-13 font-mono text-[var(--cykan)]">
                  ${t.totalCostUsd.toFixed(4)}
                </Td>
                <Td className="col-span-2 text-right t-11 font-mono text-[var(--text-muted)]">
                  {(t.totalTokensIn + t.totalTokensOut).toLocaleString("en-US")}
                </Td>
                <Td className="col-span-1 text-right t-13 font-mono text-[var(--text-soft)]">
                  {t.totalMissions}
                </Td>
                <Td className="col-span-1 text-right t-13 font-mono text-[var(--text-soft)]">
                  {t.totalAssets}
                </Td>
                <Td className="col-span-1 text-right t-13 font-mono text-[var(--text-soft)]">
                  {t.activeUsers}
                </Td>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)] ${className ?? ""}`}
    >
      {children}
    </span>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={className}>{children}</span>;
}
