import { NextResponse } from "next/server";

/**
 * GET /api/auth/dev-login
 *
 * Auto-login pour Electron en mode dev (HEARST_DEV_AUTH_BYPASS=1).
 * Retourne une page HTML minimaliste qui :
 *   1. Récupère le csrfToken de NextAuth
 *   2. POST les credentials au callback
 *   3. Redirige vers / une fois la session créée
 *
 * Désactivé en prod (403 si bypass inactif).
 */
export async function GET() {
  if (process.env.HEARST_DEV_AUTH_BYPASS !== "1") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>body{background:#000;color:#2DD4BF;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}</style>
</head><body>
<div>Connexion dev en cours…</div>
<script>
(async () => {
  try {
    const csrf = await fetch('/api/auth/csrf').then(r => r.json());
    await fetch('/api/auth/callback/dev-bypass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrfToken: csrf.csrfToken, callbackUrl: '/', json: 'true' })
    });
    window.location.href = '/';
  } catch(e) {
    document.body.textContent = 'Erreur login: ' + e.message;
  }
})();
</script>
</body></html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
