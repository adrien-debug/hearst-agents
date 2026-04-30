/**
 * Tests Hume provider — error handling + cache.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  analyzeVoiceEmotion,
  isHumeConfigured,
  HumeUnavailableError,
  _resetHumeCache,
} from "@/lib/capabilities/providers/hume";

const ORIGINAL_KEY = process.env.HUME_API_KEY;

describe("Hume provider", () => {
  beforeEach(() => {
    _resetHumeCache();
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.HUME_API_KEY;
    else process.env.HUME_API_KEY = ORIGINAL_KEY;
    vi.restoreAllMocks();
  });

  it("isHumeConfigured = false sans clé", () => {
    delete process.env.HUME_API_KEY;
    expect(isHumeConfigured()).toBe(false);
  });

  it("throw HumeUnavailableError sans clé", async () => {
    delete process.env.HUME_API_KEY;
    await expect(analyzeVoiceEmotion("https://x.com/a.wav")).rejects.toBeInstanceOf(
      HumeUnavailableError,
    );
  });

  it("retourne { emotions, dominant } depuis predictions Hume", async () => {
    process.env.HUME_API_KEY = "test-key";
    const fetchMock = vi.fn();
    // start
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ job_id: "job-1" }),
    });
    // poll → COMPLETED
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ state: { status: "COMPLETED" } }),
    });
    // predictions
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          results: {
            predictions: [
              {
                models: {
                  prosody: {
                    grouped_predictions: [
                      {
                        predictions: [
                          {
                            emotions: [
                              { name: "joy", score: 0.8 },
                              { name: "sadness", score: 0.2 },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await analyzeVoiceEmotion("https://x.com/a.wav", {
      pollIntervalMs: 1,
      timeoutMs: 5_000,
    });
    expect(out.dominant).toBe("joy");
    expect(out.emotions.joy).toBeGreaterThan(out.emotions.sadness);
    expect(out.jobId).toBe("job-1");
  });

  it("cache hit évite un second batch", async () => {
    process.env.HUME_API_KEY = "test-key";
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ job_id: "j" }) });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ state: { status: "COMPLETED" } }),
    });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    await analyzeVoiceEmotion("https://x.com/cached.wav", { pollIntervalMs: 1 });
    await analyzeVoiceEmotion("https://x.com/cached.wav", { pollIntervalMs: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3); // pas 6
  });
});
