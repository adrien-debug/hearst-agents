/**
 * @vitest-environment jsdom
 *
 * MarketplaceTemplateCard — render, kind, rating, clones, featured.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarketplaceTemplateCard } from "@/app/(user)/components/marketplace/MarketplaceTemplateCard";
import type { MarketplaceTemplateSummary } from "@/lib/marketplace/types";

function fixture(
  overrides: Partial<MarketplaceTemplateSummary> = {},
): MarketplaceTemplateSummary {
  return {
    id: "tpl-1",
    kind: "workflow",
    title: "Daily standup",
    description: "Synthèse quotidienne GitHub + Linear → Slack",
    authorDisplayName: "Hearst OS",
    authorTenantId: "hearst-builtin",
    tags: ["standup", "slack"],
    ratingAvg: 4.5,
    ratingCount: 12,
    cloneCount: 28,
    isFeatured: false,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("MarketplaceTemplateCard", () => {
  it("rend titre, description, auteur", () => {
    render(<MarketplaceTemplateCard template={fixture()} />);
    expect(screen.getByText("Daily standup")).toBeTruthy();
    expect(screen.getByText(/Synthèse quotidienne/)).toBeTruthy();
    expect(screen.getByText("Hearst OS")).toBeTruthy();
  });

  it("affiche les tags", () => {
    render(<MarketplaceTemplateCard template={fixture()} />);
    expect(screen.getByText("standup")).toBeTruthy();
    expect(screen.getByText("slack")).toBeTruthy();
  });

  it("affiche le rating quand count > 0", () => {
    render(<MarketplaceTemplateCard template={fixture()} />);
    // Rating avec étoile
    const node = screen.getByTitle(/4\.5 \/ 5/);
    expect(node).toBeTruthy();
  });

  it("affiche tiret quand pas de rating", () => {
    render(
      <MarketplaceTemplateCard
        template={fixture({ ratingAvg: 0, ratingCount: 0 })}
      />,
    );
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("expose Anonyme quand authorDisplayName null", () => {
    render(
      <MarketplaceTemplateCard
        template={fixture({ authorDisplayName: null })}
      />,
    );
    expect(screen.getByText("Anonyme")).toBeTruthy();
  });

  it("affiche le compte de clones", () => {
    render(<MarketplaceTemplateCard template={fixture({ cloneCount: 1 })} />);
    expect(screen.getByText("1 clone")).toBeTruthy();
  });

  it("link href pointe vers le détail", () => {
    const { container } = render(
      <MarketplaceTemplateCard template={fixture()} />,
    );
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/marketplace/tpl-1");
  });
});
