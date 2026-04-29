const BB_API_BASE = "https://www.browserbase.com/v1";

function getApiKey(): string {
  const key = process.env.BROWSERBASE_API_KEY;
  if (!key) throw new Error("Browserbase non configuré");
  return key;
}

export async function createSession(opts?: { proxied?: boolean }): Promise<{
  sessionId: string;
  connectUrl: string;
  debugViewerUrl?: string;
}> {
  void opts;
  const res = await fetch(`${BB_API_BASE}/sessions`, {
    method: "POST",
    headers: {
      "X-BB-API-Key": getApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      projectId: process.env.BROWSERBASE_PROJECT_ID,
      browserSettings: {},
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`[Browserbase] status=${res.status} message=${body.slice(0, 200)}`);
  }

  const data = await res.json() as {
    id: string;
    connectUrl: string;
    debugViewerUrl?: string;
  };

  return {
    sessionId: data.id,
    connectUrl: data.connectUrl,
    debugViewerUrl: data.debugViewerUrl,
  };
}

export async function getSession(sessionId: string): Promise<{
  status: string;
  createdAt?: string;
  stoppedAt?: string;
}> {
  const res = await fetch(`${BB_API_BASE}/sessions/${sessionId}`, {
    headers: { "X-BB-API-Key": getApiKey() },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`[Browserbase] status=${res.status} message=${body.slice(0, 200)}`);
  }

  const data = await res.json() as {
    status: string;
    createdAt?: string;
    stoppedAt?: string;
  };

  return {
    status: data.status,
    createdAt: data.createdAt,
    stoppedAt: data.stoppedAt,
  };
}

export async function stopSession(sessionId: string): Promise<void> {
  const res = await fetch(`${BB_API_BASE}/sessions/${sessionId}`, {
    method: "DELETE",
    headers: { "X-BB-API-Key": getApiKey() },
  });

  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => "");
    throw new Error(`[Browserbase] status=${res.status} message=${body.slice(0, 200)}`);
  }
}
