"use client";

/**
 * /personas — gestion des Brand Voice (C4)
 *
 * Liste + create + edit + A/B test inline. Tokens uniquement (CLAUDE.md §1).
 */

import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { PersonaABTestPanel } from "../components/PersonaABTestPanel";
import { PublishTemplateModal } from "../components/marketplace/PublishTemplateModal";
import type { Persona, PersonaTone } from "@/lib/personas/types";
import { PERSONA_TONES } from "@/lib/personas/types";

const SURFACES = ["chat", "inbox", "simulation", "voice", "cockpit"] as const;

export default function PersonasPage() {
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [editing, setEditing] = useState<Persona | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<Persona | null>(null);

  async function reload() {
    const res = await fetch("/api/v2/personas", { credentials: "include" });
    if (!res.ok) return;
    const data = (await res.json()) as { personas: Persona[] };
    setPersonas(data.personas ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/v2/personas", { credentials: "include" });
      if (cancelled || !res.ok) return;
      const data = (await res.json()) as { personas: Persona[] };
      if (!cancelled) setPersonas(data.personas ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(form: ReturnType<typeof toPayload>) {
    setBusy(true);
    try {
      if (editing && !editing.id.startsWith("builtin:")) {
        const res = await fetch(`/api/v2/personas/${editing.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error(`patch_${res.status}`);
        setFlash("Persona mise à jour.");
      } else {
        const res = await fetch("/api/v2/personas", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error(`post_${res.status}`);
        setFlash("Persona créée.");
      }
      setEditing(null);
      setCreating(false);
      await reload();
    } catch (err) {
      setFlash(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
      setTimeout(() => setFlash(null), 4000);
    }
  }

  async function remove(persona: Persona) {
    if (persona.id.startsWith("builtin:")) return;
    if (!confirm(`Supprimer la persona "${persona.name}" ?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v2/personas/${persona.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`delete_${res.status}`);
      setFlash("Supprimée.");
      await reload();
    } catch (err) {
      setFlash(err instanceof Error ? err.message : "Erreur suppression");
    } finally {
      setBusy(false);
      setTimeout(() => setFlash(null), 4000);
    }
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-bg text-text">
      <PageHeader
        title="Brand Voice — Personas"
        subtitle="Voix éditoriales appliquées au LLM. Une persona = ton + vocabulaire + system prompt addon."
        actions={
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setCreating(true);
            }}
            className="ghost-btn-solid ghost-btn-cykan rounded-(--radius-sm)"
            style={{ padding: "var(--space-2) var(--space-4)" }}
          >
            <span className="t-11 font-medium">+ Nouvelle persona</span>
          </button>
        }
      />

      <div
        className="px-12 py-8 mx-auto w-full max-w-[min(100%,var(--width-actions))] flex flex-col"
        style={{ gap: "var(--space-6)" }}
      >
        {flash && (
          <p className="t-13 font-light text-[var(--cykan)]">
            {flash}
          </p>
        )}

        {(creating || editing) && (
          <PersonaForm
            initial={editing ?? null}
            busy={busy}
            onCancel={() => {
              setCreating(false);
              setEditing(null);
            }}
            onSave={save}
          />
        )}

        <section className="flex flex-col" style={{ gap: "var(--space-3)" }}>
          <h2 className="t-15 font-medium text-[var(--text)]">Personas</h2>
          {personas === null ? (
            <p className="t-11 font-light text-[var(--text-faint)]">
              Chargement…
            </p>
          ) : personas.length === 0 ? (
            <p className="t-11 text-[var(--text-muted)]">
              Aucune persona — utilise le bouton ci-dessus pour en créer une.
            </p>
          ) : (
            <ul
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
              style={{ gap: "var(--space-3)" }}
            >
              {personas.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col"
                  style={{
                    gap: "var(--space-2)",
                    padding: "var(--space-4)",
                    border: p.isDefault ? "1px solid var(--cykan)" : "1px solid var(--line-strong)",
                    borderRadius: "var(--radius-md)",
                    background: p.isDefault ? "var(--cykan-surface)" : "var(--bg-elev)",
                  }}
                >
                  <header
                    className="flex items-baseline justify-between"
                    style={{ gap: "var(--space-2)" }}
                  >
                    <span className="t-13 font-medium text-[var(--text)]">{p.name}</span>
                    {p.isDefault && (
                      <span className="t-11 font-medium text-[var(--cykan)]">
                        Par défaut
                      </span>
                    )}
                  </header>
                  {p.description && (
                    <p className="t-11 text-[var(--text-muted)]">{p.description}</p>
                  )}
                  <div
                    className="flex flex-wrap"
                    style={{ gap: "var(--space-2)" }}
                  >
                    {p.tone && <Chip>{p.tone}</Chip>}
                    {p.surface && <Chip>surface · {p.surface}</Chip>}
                    {p.id.startsWith("builtin:") && <Chip>builtin</Chip>}
                  </div>
                  <div
                    className="flex items-center mt-(--space-2)"
                    style={{ gap: "var(--space-2)" }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setCreating(false);
                        setEditing(p);
                      }}
                      disabled={p.id.startsWith("builtin:") || busy}
                      className="t-11 font-light text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors duration-base"
                      style={{ background: "transparent", border: "none", cursor: "pointer" }}
                    >
                      Éditer
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(p)}
                      disabled={p.id.startsWith("builtin:") || busy}
                      className="t-11 font-light text-[var(--text-faint)] hover:text-[var(--danger)] transition-colors duration-base"
                      style={{ background: "transparent", border: "none", cursor: "pointer" }}
                    >
                      Supprimer
                    </button>
                    <button
                      type="button"
                      onClick={() => setPublishing(p)}
                      disabled={busy}
                      className="t-11 font-light text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors duration-base"
                      style={{ background: "transparent", border: "none", cursor: "pointer" }}
                    >
                      Publier
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {personas && personas.length >= 2 && (
          <PersonaABTestPanel personas={personas} />
        )}

        {publishing && (
          <PublishTemplateModal
            open={!!publishing}
            kind="persona"
            defaultTitle={publishing.name}
            defaultDescription={publishing.description ?? ""}
            payload={{
              name: publishing.name,
              description: publishing.description,
              tone: publishing.tone ?? null,
              vocabulary: publishing.vocabulary ?? null,
              styleGuide: publishing.styleGuide ?? null,
              systemPromptAddon: publishing.systemPromptAddon ?? null,
              surface: publishing.surface ?? null,
            }}
            onClose={() => setPublishing(null)}
            onPublished={() => {
              setFlash("Persona publiée au marketplace.");
              setPublishing(null);
              setTimeout(() => setFlash(null), 4000);
            }}
          />
        )}
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="t-11 font-light text-[var(--text-faint)]"
      style={{
        padding: "var(--space-1) var(--space-2)",
        border: "1px solid var(--line-strong)",
        borderRadius: "var(--radius-pill)",
      }}
    >
      {children}
    </span>
  );
}

interface PersonaFormState {
  name: string;
  description: string;
  tone: PersonaTone | "";
  surface: string;
  styleGuide: string;
  systemPromptAddon: string;
  isDefault: boolean;
  vocabulary: { preferred: string; avoid: string };
}

function emptyForm(): PersonaFormState {
  return {
    name: "",
    description: "",
    tone: "",
    surface: "",
    styleGuide: "",
    systemPromptAddon: "",
    isDefault: false,
    vocabulary: { preferred: "", avoid: "" },
  };
}

function fromPersona(p: Persona): PersonaFormState {
  return {
    name: p.name,
    description: p.description ?? "",
    tone: (p.tone ?? "") as PersonaTone | "",
    surface: p.surface ?? "",
    styleGuide: p.styleGuide ?? "",
    systemPromptAddon: p.systemPromptAddon ?? "",
    isDefault: p.isDefault,
    vocabulary: {
      preferred: (p.vocabulary?.preferred ?? []).join(", "),
      avoid: (p.vocabulary?.avoid ?? []).join(", "),
    },
  };
}

function PersonaForm({
  initial,
  busy,
  onCancel,
  onSave,
}: {
  initial: Persona | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (form: ReturnType<typeof toPayload>) => void;
}) {
  const [form, setForm] = useState<PersonaFormState>(
    initial ? fromPersona(initial) : emptyForm(),
  );

  function update<K extends keyof PersonaFormState>(key: K, value: PersonaFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit() {
    onSave(toPayload(form));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col"
      style={{
        gap: "var(--space-4)",
        padding: "var(--space-5)",
        border: "1px solid var(--cykan-border)",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-elev)",
      }}
    >
      <h3 className="t-15 font-medium text-[var(--text)]">
        {initial ? `Éditer "${initial.name}"` : "Nouvelle persona"}
      </h3>

      <div
        className="grid grid-cols-1 md:grid-cols-2"
        style={{ gap: "var(--space-3)" }}
      >
        <Field label="Nom">
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            className="block w-full bg-transparent t-13 text-[var(--text)] focus:outline-none"
            style={{
              padding: "var(--space-2) var(--space-3)",
              border: "1px solid var(--line-strong)",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-1)",
            }}
          />
        </Field>
        <Field label="Description">
          <input
            type="text"
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            className="block w-full bg-transparent t-13 text-[var(--text)] focus:outline-none"
            style={{
              padding: "var(--space-2) var(--space-3)",
              border: "1px solid var(--line-strong)",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-1)",
            }}
          />
        </Field>
        <Field label="Ton">
          <select
            value={form.tone}
            onChange={(e) => update("tone", e.target.value as PersonaTone | "")}
            className="block w-full bg-transparent t-13 text-[var(--text)] focus:outline-none"
            style={{
              padding: "var(--space-2) var(--space-3)",
              border: "1px solid var(--line-strong)",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-1)",
            }}
          >
            <option value="">— aucun —</option>
            {PERSONA_TONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Surface (auto-apply)">
          <select
            value={form.surface}
            onChange={(e) => update("surface", e.target.value)}
            className="block w-full bg-transparent t-13 text-[var(--text)] focus:outline-none"
            style={{
              padding: "var(--space-2) var(--space-3)",
              border: "1px solid var(--line-strong)",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-1)",
            }}
          >
            <option value="">— aucune —</option>
            {SURFACES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vocabulaire préféré (séparé par virgules)">
          <input
            type="text"
            value={form.vocabulary.preferred}
            onChange={(e) =>
              update("vocabulary", { ...form.vocabulary, preferred: e.target.value })
            }
            className="block w-full bg-transparent t-13 text-[var(--text)] focus:outline-none"
            style={{
              padding: "var(--space-2) var(--space-3)",
              border: "1px solid var(--line-strong)",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-1)",
            }}
          />
        </Field>
        <Field label="Vocabulaire à éviter">
          <input
            type="text"
            value={form.vocabulary.avoid}
            onChange={(e) =>
              update("vocabulary", { ...form.vocabulary, avoid: e.target.value })
            }
            className="block w-full bg-transparent t-13 text-[var(--text)] focus:outline-none"
            style={{
              padding: "var(--space-2) var(--space-3)",
              border: "1px solid var(--line-strong)",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-1)",
            }}
          />
        </Field>
      </div>

      <Field label="Style guide (markdown)">
        <textarea
          rows={3}
          value={form.styleGuide}
          onChange={(e) => update("styleGuide", e.target.value)}
          className="block w-full bg-transparent t-13 text-[var(--text)] focus:outline-none resize-none"
          style={{
            padding: "var(--space-2) var(--space-3)",
            border: "1px solid var(--line-strong)",
            borderRadius: "var(--radius-sm)",
            background: "var(--surface-1)",
          }}
        />
      </Field>
      <Field label="Addon system prompt">
        <textarea
          rows={3}
          value={form.systemPromptAddon}
          onChange={(e) => update("systemPromptAddon", e.target.value)}
          className="block w-full bg-transparent t-13 text-[var(--text)] focus:outline-none resize-none"
          style={{
            padding: "var(--space-2) var(--space-3)",
            border: "1px solid var(--line-strong)",
            borderRadius: "var(--radius-sm)",
            background: "var(--surface-1)",
          }}
        />
      </Field>

      <label className="flex items-center" style={{ gap: "var(--space-2)" }}>
        <input
          type="checkbox"
          checked={form.isDefault}
          onChange={(e) => update("isDefault", e.target.checked)}
        />
        <span className="t-11 text-[var(--text-soft)]">Persona par défaut</span>
      </label>

      <div className="flex items-center justify-end" style={{ gap: "var(--space-3)" }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="t-11 font-light text-[var(--text-faint)] hover:text-[var(--text-soft)] transition-colors duration-base"
          style={{ background: "transparent", border: "none", cursor: "pointer" }}
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={busy || !form.name.trim()}
          className="ghost-btn-solid ghost-btn-cykan rounded-(--radius-sm)"
          style={{ padding: "var(--space-2) var(--space-4)" }}
        >
          <span className="t-11 font-medium">{busy ? "…" : "Sauvegarder"}</span>
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col" style={{ gap: "var(--space-2)" }}>
      <span className="t-11 font-light text-[var(--text-faint)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function toPayload(form: PersonaFormState) {
  const preferred = form.vocabulary.preferred
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const avoid = form.vocabulary.avoid
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    tone: form.tone || null,
    surface: form.surface || null,
    styleGuide: form.styleGuide.trim() || null,
    systemPromptAddon: form.systemPromptAddon.trim() || null,
    isDefault: form.isDefault,
    vocabulary:
      preferred.length > 0 || avoid.length > 0 ? { preferred, avoid } : null,
  };
}
