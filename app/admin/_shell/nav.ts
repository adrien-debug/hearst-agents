/**
 * Admin sidebar nav config — single source of truth for the admin shell.
 *
 * Adding a section: extend NAV_SECTIONS. The SVG icon is rendered from `iconPath`
 * (24×24 viewBox, stroke="currentColor"). The route must already exist as a
 * working page under app/admin/.
 */

export type NavItem = {
  href: string;
  label: string;
  iconPath: string;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Pipeline",
    items: [
      {
        href: "/admin",
        label: "Accueil",
        iconPath:
          "M3 10 12 3l9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10z",
      },
      {
        href: "/admin/pipeline",
        label: "Canvas live",
        iconPath:
          "M3 12h4l2-7 4 14 2-7h6",
      },
      {
        href: "/admin/agents",
        label: "Agents",
        iconPath:
          "M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4zM6 22v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2",
      },
      {
        href: "/admin/runs",
        label: "Runs",
        iconPath: "M5 4l14 8-14 8V4z",
      },
    ],
  },
  {
    title: "Data",
    items: [
      {
        href: "/admin/tools",
        label: "Tools",
        iconPath:
          "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
      },
      {
        href: "/admin/datasets",
        label: "Datasets",
        iconPath:
          "M3 5c0-1.1 4-2 9-2s9 .9 9 2-4 2-9 2-9-.9-9-2zM3 5v6c0 1.1 4 2 9 2s9-.9 9-2V5M3 11v6c0 1.1 4 2 9 2s9-.9 9-2v-6",
      },
      {
        href: "/admin/workflows",
        label: "Workflows",
        iconPath:
          "M5 3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h3a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5zM16 14a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h3a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2h-3zM10 6.5h6a2 2 0 0 1 2 2V14",
      },
      {
        href: "/admin/skills",
        label: "Skills",
        iconPath: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
      },
    ],
  },
  {
    title: "Système",
    items: [
      {
        href: "/admin/metrics",
        label: "Métriques",
        iconPath:
          "M3 3v18h18M7 16l4-4 4 4 4-4",
      },
      {
        href: "/admin/health",
        label: "Health",
        iconPath:
          "M22 12h-4l-3 9L9 3l-3 9H2",
      },
      {
        href: "/admin/audit",
        label: "Audit",
        iconPath:
          "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6M9 13h6M9 17h6M9 9h2",
      },
      {
        href: "/admin/settings",
        label: "Settings",
        iconPath:
          "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
      },
    ],
  },
];

/**
 * Resolve the active item for a given pathname. Longest `href` gagne pour que
 * `/admin/pipeline` batte `/admin`, et `/admin/agents/xyz` batte `/admin`.
 */
export function activeItem(pathname: string): NavItem | null {
  const n = pathname.replace(/\/$/, "") || "/";
  let best: NavItem | null = null;
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      const exact = n === item.href;
      const nested = n.startsWith(`${item.href}/`);
      if (!exact && !nested) continue;
      if (!best || item.href.length > best.href.length) best = item;
    }
  }
  return best;
}
