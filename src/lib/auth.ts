/**
 * Auth token bridge fra bun server e WebView.
 *
 * Il token viene iniettato dall'HTML statico (servito da bun) come
 *   `<meta name="sublodex-auth-token" content="...">`
 * (no script inline → CSP può restare `script-src 'self'`). È presente solo
 * quando l'app gira come sidecar Tauri (env var `SUBLODEX_AUTH_TOKEN`
 * settata da `lib.rs`). In `bun run dev` standalone il token è assente
 * → no-auth (fallback dev).
 *
 * Strategia: monkey-patch di `window.fetch` per aggiungere automaticamente
 * `Authorization: Bearer <t>` su tutte le richieste a `/api/*`. Fa zero
 * modifiche ai 39 call site esistenti.
 *
 * Per WebSocket (che non passa header custom dal browser API), c'è
 * `wsTokenQuery()` che ritorna `?token=<t>` o `''`.
 *
 * Backward compat: il legacy `window.__SUBLODEX_TOKEN__` viene letto come
 * fallback se il meta non c'è (es. servire HTML pre-fix). Verrà rimosso
 * dopo qualche release.
 */

declare global {
  interface Window {
    __SUBLODEX_TOKEN__?: string;
  }
}

let _cachedToken: string | null = null;
export function getAuthToken(): string {
  if (_cachedToken !== null) return _cachedToken;
  if (typeof document === 'undefined') {
    _cachedToken = '';
    return '';
  }
  // Primary: meta tag iniettato da bun server (HTML response).
  const meta = document.querySelector<HTMLMetaElement>('meta[name="sublodex-auth-token"]');
  const fromMeta = meta?.getAttribute('content') ?? '';
  // Fallback: vecchio inline script (compat con HTML pre-#3-lazy).
  const fromWin = (typeof window !== 'undefined' && window.__SUBLODEX_TOKEN__) || '';
  _cachedToken = fromMeta || fromWin || '';
  return _cachedToken;
}

/** Restituisce `?token=<t>` o `''`. Per WS URL e altri casi senza headers. */
export function wsTokenQuery(): string {
  const t = getAuthToken();
  return t ? `?token=${encodeURIComponent(t)}` : '';
}

/** Determina se un URL/Request punta al nostro bun server (rotta /api/* o /ws).
 *  Considera sia path relativi (`/api/foo`) sia URL assoluti same-origin. */
function isInternalApi(input: RequestInfo | URL): boolean {
  let pathname: string;
  if (typeof input === 'string') {
    if (input.startsWith('/')) pathname = input;
    else {
      try { pathname = new URL(input, location.origin).pathname; }
      catch { return false; }
    }
  } else if (input instanceof URL) {
    pathname = input.pathname;
  } else if (input instanceof Request) {
    try { pathname = new URL(input.url, location.origin).pathname; }
    catch { return false; }
  } else {
    return false;
  }
  return pathname.startsWith('/api/') || pathname === '/ws';
}

/** Side-effect: applica il monkey-patch a `window.fetch`. Idempotente. */
let installed = false;
export function installFetchAuth(): void {
  if (installed) return;
  if (typeof window === 'undefined') return;
  const token = getAuthToken();
  if (!token) {
    // No token → niente da fare. Modalità dev senza auth.
    installed = true;
    return;
  }
  const orig = window.fetch.bind(window);
  const patched = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!isInternalApi(input)) return orig(input, init);
    // Merge headers preservando quelli passati dal chiamante.
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has('authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return orig(input, { ...init, headers });
  }) as typeof fetch;
  // Preserva eventuali proprietà custom di `fetch` (es. `preconnect`).
  if ('preconnect' in orig) {
    (patched as unknown as { preconnect: unknown }).preconnect = (orig as unknown as { preconnect: unknown }).preconnect;
  }
  window.fetch = patched;
  installed = true;
}

// Auto-install all'import: i moduli Vite garantiscono ordine sui side-effect
// statici, e `main.tsx` lo importa prima di tutto.
installFetchAuth();
