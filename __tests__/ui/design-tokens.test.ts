import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const globalsCss = readFileSync(path.join(__dirname, "../../app/globals.css"), "utf8");

function parseHexTokens(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /--([\w-]+):\s*(#[0-9a-fA-F]{3,8})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

describe("design tokens (app/globals.css)", () => {
  it("expose les surfaces et le rail pour Tailwind @theme", () => {
    expect(globalsCss).toContain("--surface:");
    expect(globalsCss).toContain("--rail:");
    expect(globalsCss).toContain("--color-surface:");
    expect(globalsCss).toContain("--color-rail:");
  });

  it("centralise les glows cyan (évite les rgba dupliqués dans les composants)", () => {
    expect(globalsCss).toContain("--glow-cyan-sm:");
    expect(globalsCss).toContain("--glow-cyan-md:");
    expect(globalsCss).toContain("--glow-cyan-core:");
    expect(globalsCss).toContain("--glow-cyan-soft:");
    expect(globalsCss).toContain("--glow-cyan-dot:");
  });

  it("garde le canvas et l’accent documentés", () => {
    expect(globalsCss).toContain("--background:");
    expect(globalsCss).toContain("--cyan-accent:");
    expect(globalsCss).toContain("--color-background:");
    expect(globalsCss).toContain("--color-cyan-accent:");
  });

  it("surface, background et rail sont 3 valeurs distinctes (anti-régression : éviter #000 partout, qui rend la refacto invisible)", () => {
    const tokens = parseHexTokens(globalsCss);
    expect(tokens.surface, "--surface absent ou non-hex dans :root").toBeDefined();
    expect(tokens.background, "--background absent ou non-hex dans :root").toBeDefined();
    expect(tokens.rail, "--rail absent ou non-hex dans :root").toBeDefined();

    const distinct = new Set([tokens.surface, tokens.background, tokens.rail]);
    expect(distinct.size, `surface/background/rail doivent être 3 valeurs différentes, vu : ${[...distinct].join(", ")}`).toBe(3);
  });
});
