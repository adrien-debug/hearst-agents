/**
 * @vitest-environment jsdom
 *
 * ProviderChip — render, statut, tooltip latence/coût.
 */

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProviderChip } from "@/app/(user)/components/ProviderChip";

describe("ProviderChip", () => {
  it("rend le label fourni", () => {
    render(<ProviderChip providerId="gmail" label="Gmail" status="success" />);
    expect(screen.getByText("Gmail")).toBeTruthy();
  });

  it("expose data-provider et data-status", () => {
    const { container } = render(
      <ProviderChip providerId="slack" status="pending" />,
    );
    const chip = container.querySelector('[data-provider="slack"]');
    expect(chip).toBeTruthy();
    expect(chip?.getAttribute("data-status")).toBe("pending");
  });

  it("statut error visible côté a11y label", () => {
    render(
      <ProviderChip providerId="stripe" label="Stripe" status="error" />,
    );
    const chip = screen.getByLabelText(/Provider Stripe, statut error/);
    expect(chip).toBeTruthy();
  });

  it("affiche un tooltip avec la latence et le coût au focus", () => {
    render(
      <ProviderChip
        providerId="gmail"
        label="Gmail"
        status="success"
        latencyMs={420}
        costUSD={0.0042}
      />,
    );
    const chip = screen.getByLabelText(/Provider Gmail/);
    fireEvent.focus(chip);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toContain("420 ms");
    expect(tooltip.textContent).toContain("< $0.01");
  });

  it("ne rend pas de tooltip quand ni latence ni coût ne sont disponibles", () => {
    render(<ProviderChip providerId="hubspot" label="HubSpot" />);
    const chip = screen.getByLabelText(/Provider HubSpot/);
    fireEvent.focus(chip);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("formate les latences > 1s en secondes", () => {
    render(
      <ProviderChip
        providerId="notion"
        label="Notion"
        latencyMs={2340}
        costUSD={0.05}
      />,
    );
    fireEvent.focus(screen.getByLabelText(/Provider Notion/));
    expect(screen.getByRole("tooltip").textContent).toContain("2.34 s");
    expect(screen.getByRole("tooltip").textContent).toContain("$0.05");
  });
});
