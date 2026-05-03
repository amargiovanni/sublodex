/**
 * Auth + CSP + injection del token nell'HTML servito.
 *
 * Estratto da server.ts (Fase 3.1) per concentrare in un modulo le
 * decisioni "perimetro" (chi può chiamare il bun server) e isolare la
 * policy CSP da promuovere a enforce quando stabile.
 *
 * Threat model: localhost binding + token = doppia barriera contro
 * processi locali ostili che provano a parlare al server.
 */

import { log } from './log';

/** Token di auth bun server.
 *  - Settato dall'host Tauri (`lib.rs`) all'avvio del sidecar via env var.
 *  - Se assente (es. `bun run dev` standalone senza Tauri) → no-auth, per
 *    non rompere il dev workflow.
 *  - Se presente → tutte le `/api/*` richiedono `Authorization: Bearer <t>`
 *    oppure `?token=<t>` nella query (fallback per WebSocket).
 *  - Le rotte statiche (`/`, `/index.html`, `/assets/*`) restano pubbliche
 *    perché il browser le carica come navigation requests senza header.
 *    L'HTML iniettato porta il token al frontend, che lo userà su `fetch`.
 */
export const AUTH_TOKEN: string | undefined = process.env.SUBLODEX_AUTH_TOKEN || undefined;
export const AUTH_ENABLED = !!AUTH_TOKEN;

log.info('boot', 'auth', {
  enabled: AUTH_ENABLED,
  reason: AUTH_ENABLED ? 'token set' : 'no SUBLODEX_AUTH_TOKEN',
});

export function tokenFromRequest(req: Request, url: URL): string | null {
  const auth = req.headers.get('authorization');
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  const q = url.searchParams.get('token');
  return q || null;
}

/** Confronto a tempo costante per evitare timing attacks (paranoia su loopback,
 *  ma costa nulla farlo). Lavoriamo in code-units UTF-16 — i token sono ASCII. */
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------- Content Security Policy ----------
 *
 * Modalità: di default `enforce` (blocchiamo le risorse fuori policy).
 * Per debug si può forzare `report-only` con `SUBLODEX_CSP_MODE=report-only`
 * (utile se una nuova feature triggera violazioni e serve diagnosticare
 * senza rompere la UI).
 *
 * `script-src 'self'` (senza unsafe-inline): il token viene consegnato al
 * frontend via `<meta name="sublodex-auth-token">` invece di un `<script>`
 * inline → niente bisogno di unsafe-inline. Eventuali XSS nei contenuti
 * renderizzati (markdown, tool result, ecc.) NON possono più eseguire JS.
 *
 * `'unsafe-inline'` su style-src resta perché Vite/React iniettano stili
 * inline; togliere richiederebbe nonce-CSS, lavoro ortogonale.
 */
export const CSP_POLICY = [
  "default-src 'self'",
  // `ipc:` e `http://ipc.localhost` sono i protocolli che Tauri 2 usa per
  // `invoke()` dal frontend al Rust host (PTY ops, ecc.). Senza, ogni invoke
  // viene bloccato dalla CSP. Sono URI interni al processo, non rete.
  "connect-src 'self' ipc: http://ipc.localhost http://127.0.0.1:3001 ws://127.0.0.1:3001 http://localhost:3001 ws://localhost:3001",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

const CSP_MODE = (process.env.SUBLODEX_CSP_MODE || 'enforce').toLowerCase();
const CSP_HEADER_NAME =
  CSP_MODE === 'report-only' ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';

export function htmlHeaders(): Record<string, string> {
  return {
    'content-type': 'text/html; charset=utf-8',
    [CSP_HEADER_NAME]: CSP_POLICY,
  };
}

/** Iniezione del token nell'HTML statico. Inserito subito dopo `<head>`.
 *  Usa un `<meta name="sublodex-auth-token">` invece di un `<script>` inline:
 *  così la CSP può rimanere `script-src 'self'` (senza unsafe-inline).
 *  Il frontend legge il content del meta in `src/lib/auth.ts` come prima cosa.
 *
 *  No-op se auth non abilitata (modalità dev): il frontend ha fallback `''`. */
export function injectAuthToken(html: string): string {
  if (!AUTH_ENABLED) return html;
  // Escaping HTML attribute-safe: `<`, `>`, `&`, `"`, `'` devono diventare
  // entity. Il token è UUID v4 quindi nessuno di questi appare in pratica;
  // gestiamo lo stesso per cintura+bretelle. JSON.stringify non basta per
  // attributi HTML (ad es. `&` resterebbe).
  const safeToken = AUTH_TOKEN!
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const tag = `<meta name="sublodex-auth-token" content="${safeToken}">`;
  if (html.includes('<head>')) return html.replace('<head>', `<head>${tag}`);
  if (html.includes('</head>')) return html.replace('</head>', `${tag}</head>`);
  return tag + html;
}
