const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-reasoner";
const TIMEOUT_MS = 120_000;

export async function deepseekChat(params: {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ content: string; reasoningContent?: string }> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DeepSeek non configuré");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(DEEPSEEK_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: params.messages,
        temperature: params.temperature ?? 0.6,
        max_tokens: params.maxTokens ?? 8192,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`[DeepSeek] ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await res.json() as {
      choices: Array<{
        message: {
          content: string;
          reasoning_content?: string;
        };
      }>;
    };

    const choice = data.choices[0];
    return {
      content: choice.message.content,
      reasoningContent: choice.message.reasoning_content,
    };
  } finally {
    clearTimeout(timeout);
  }
}
