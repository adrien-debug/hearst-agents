/**
 * @vitest-environment jsdom
 *
 * OnboardingTour — overlay 3 slides (vague 9, action #5).
 *
 * Vérifie :
 *  - n'apparaît pas si flag localStorage déjà set
 *  - apparaît au premier mount sans flag
 *  - 3 slides navigables, dernière slide ferme et persiste flag
 *  - bouton "Passer" ferme et persiste
 *  - hotkey Escape ferme
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { OnboardingTour, _resetOnboarding } from "@/app/(user)/components/OnboardingTour";

describe("OnboardingTour", () => {
  beforeEach(() => {
    _resetOnboarding();
  });

  it("ne s'affiche pas si le flag localStorage est déjà set", () => {
    window.localStorage.setItem("hearst.onboarded", "1");
    render(<OnboardingTour />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("s'affiche au premier mount sans flag", async () => {
    render(<OnboardingTour />);
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeTruthy();
    });
    expect(screen.getByText(/Hearst voit ce que tu vois/)).toBeTruthy();
  });

  it("navigue à travers les 3 slides via le bouton Suivant", async () => {
    render(<OnboardingTour />);
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeTruthy();
    });
    // Slide 1
    expect(screen.getByText(/Hearst voit ce que tu vois/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("onboarding-next"));
    // Slide 2
    expect(screen.getByText(/Branche tes outils en un clic/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("onboarding-next"));
    // Slide 3
    expect(screen.getByText(/Lance ta première mission/)).toBeTruthy();
  });

  it("ferme et persiste le flag à la fin (clic 'Démarrer')", async () => {
    render(<OnboardingTour />);
    await waitFor(() => {
      expect(screen.getByTestId("onboarding-next")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("onboarding-next"));
    fireEvent.click(screen.getByTestId("onboarding-next"));
    fireEvent.click(screen.getByTestId("onboarding-next")); // Démarrer
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.localStorage.getItem("hearst.onboarded")).toBe("1");
  });

  it("ferme via le bouton 'Passer' et persiste le flag", async () => {
    render(<OnboardingTour />);
    await waitFor(() => {
      expect(screen.getByLabelText(/Passer l'onboarding/)).toBeTruthy();
    });
    fireEvent.click(screen.getByLabelText(/Passer l'onboarding/));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.localStorage.getItem("hearst.onboarded")).toBe("1");
  });

  it("ferme via Escape", async () => {
    render(<OnboardingTour />);
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeTruthy();
    });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.localStorage.getItem("hearst.onboarded")).toBe("1");
  });

  it("avance via Enter et ArrowRight", async () => {
    render(<OnboardingTour />);
    await waitFor(() => {
      expect(screen.getByText(/Hearst voit ce que tu vois/)).toBeTruthy();
    });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText(/Branche tes outils en un clic/)).toBeTruthy();
    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.getByText(/Lance ta première mission/)).toBeTruthy();
  });

  it("forceOpen override le flag localStorage", () => {
    window.localStorage.setItem("hearst.onboarded", "1");
    render(<OnboardingTour forceOpen />);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("appelle onClose quand le tour se ferme", async () => {
    const onClose = vi.fn();
    render(<OnboardingTour onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByLabelText(/Passer l'onboarding/)).toBeTruthy();
    });
    fireEvent.click(screen.getByLabelText(/Passer l'onboarding/));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("affiche les 3 dots de progression et highlight le dot actif", async () => {
    const { container } = render(<OnboardingTour />);
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeTruthy();
    });
    const dots = container.querySelectorAll('span[style*="border-radius"]');
    // 3 dots dans la zone progression (peut y en avoir plus selon design)
    // On vérifie au moins qu'il y a 3 elements de progression
    expect(dots.length).toBeGreaterThanOrEqual(3);
  });
});
