/**
 * Embed service — cache LRU, truncation, EmbeddingsUnavailableError.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

const { embeddingsCreateMock } = vi.hoisted(() => ({
  embeddingsCreateMock: vi.fn(),
}));

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      embeddings = { create: embeddingsCreateMock };
    },
  };
});

import {
  embedText,
  EmbeddingsUnavailableError,
  isEmbeddingsAvailable,
  __clearEmbedCache,
  EMBEDDING_DIM,
} from "@/lib/embeddings/embed";

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

function makeVec(): number[] {
  return Array.from({ length: EMBEDDING_DIM }, (_, i) => (i % 7) * 0.0001);
}

describe("embed", () => {
  beforeEach(() => {
    __clearEmbedCache();
    embeddingsCreateMock.mockReset();
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = ORIGINAL_KEY;
    }
  });

  it("retourne un vecteur 1536-dim", async () => {
    embeddingsCreateMock.mockResolvedValue({ data: [{ embedding: makeVec() }] });
    const v = await embedText("hello world");
    expect(v).toHaveLength(EMBEDDING_DIM);
  });

  it("cache LRU — second appel sur même input ne touche pas l'API", async () => {
    embeddingsCreateMock.mockResolvedValue({ data: [{ embedding: makeVec() }] });
    await embedText("ping");
    await embedText("ping");
    await embedText("ping");
    expect(embeddingsCreateMock).toHaveBeenCalledTimes(1);
  });

  it("truncate input > 32k chars", async () => {
    embeddingsCreateMock.mockResolvedValue({ data: [{ embedding: makeVec() }] });
    const huge = "x".repeat(50_000);
    await embedText(huge);
    const arg = embeddingsCreateMock.mock.calls[0][0] as { input: string };
    expect(arg.input.length).toBeLessThanOrEqual(32_000);
  });

  it("throw EmbeddingsUnavailableError sans OPENAI_API_KEY", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(embedText("anything")).rejects.toBeInstanceOf(
      EmbeddingsUnavailableError,
    );
  });

  it("throw si vecteur de mauvaise taille", async () => {
    embeddingsCreateMock.mockResolvedValue({ data: [{ embedding: [0, 0, 0] }] });
    await expect(embedText("bad")).rejects.toThrow(/invalid embedding/i);
  });

  it("isEmbeddingsAvailable reflète la présence de la clé", () => {
    process.env.OPENAI_API_KEY = "k";
    expect(isEmbeddingsAvailable()).toBe(true);
    delete process.env.OPENAI_API_KEY;
    expect(isEmbeddingsAvailable()).toBe(false);
  });
});
