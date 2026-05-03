/**
 * Utility "pure" condivise da server.ts per SSH e git: nessuno stato
 * globale, nessun import circolare. Estratte da server.ts (Fase 3.1)
 * come primo passo dello split — sono il blocco con meno dipendenze.
 *
 * Future estrazioni (ssh.ts vero, git.ts, fs.ts) possono dipendere da
 * questi senza rischiare cicli.
 */

/** Valida un nome ref git: solo char "sicuri" da passare a `git diff X...Y`,
 *  esclude metacaratteri shell. Difese in profondità:
 *  - charset whitelist: alfanumerico + `._/-`
 *  - rifiuta `..` (parent ref / ranges malformati)
 *  - rifiuta `@{` (reflog / upstream qualifier)
 *  - rifiuta leading `-` (evita `--upload-pack=…` o altri flag injection
 *    in `git checkout -- <ref>`)
 *  - rifiuta `//` (path duplicati strani) */
export function isSafeRef(ref: string): boolean {
  if (!ref || ref.length > 200) return false;
  if (!/^[A-Za-z0-9._/-]+$/.test(ref)) return false;
  if (ref.startsWith('-')) return false;
  if (ref.includes('..')) return false;
  if (ref.includes('@{')) return false;
  if (ref.includes('//')) return false;
  return true;
}

/** Valida un ref di stash: `stash@{N}` (con N intero) o un indice puro `N`.
 *  Esiste perché `isSafeRef` rifiuta `@{` (richiesto in tutti gli altri
 *  contesti come anti-reflog), ma per `git stash pop/drop/apply` il selettore
 *  canonico è proprio `stash@{N}`. Restringere a una grammar minima blocca
 *  comunque flag injection (`-D`, `--orphan`, …). */
export function isSafeStashRef(ref: string): boolean {
  if (!ref || ref.length > 64) return false;
  return /^stash@\{\d+\}$/.test(ref) || /^\d+$/.test(ref);
}

/** Valida un path relativo da passare a git come pathspec dopo `--`.
 *  Il `--` blocca già flag injection lato git, ma vogliamo escludere:
 *  - path assoluti (`/etc/...`) — git li accetta come pathspec
 *  - traversal `..` che esce dalla project root
 *  - `.` da solo o pathspec wildcard (`*`, `?`, `[`) che farebbero matchare
 *    troppi file su `git clean -f -- .` o `git checkout HEAD -- *`
 *  - leading `-` (cintura+bretelle anche con `--`)
 *  - byte NUL */
export function isSafeRelativePath(p: string): boolean {
  if (typeof p !== 'string' || p.length === 0 || p.length > 4096) return false;
  if (p.includes('\0')) return false;
  if (p.startsWith('/') || p.startsWith('-')) return false;
  if (p === '.' || p === '..') return false;
  if (/[*?\[\]]/.test(p)) return false;
  // Niente segmenti `..` interni (e.g. `foo/../../bar`).
  if (p.split('/').some((seg) => seg === '..')) return false;
  return true;
}

/** Quoting POSIX-safe per stringhe da inserire dentro `sh -c`. Gestisce
 *  correttamente apici singoli interni (escape via `'\''`). */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Join naive di un path remoto con la sua base. Se `rel` è assoluto
 *  ritorna `rel` inalterato (la funzione chiamante deve gestire il
 *  containment — vedi `resolveProjectPath`). */
export function joinRemote(base: string, rel: string): string {
  if (rel.startsWith('/')) return rel;
  return base.replace(/\/+$/, '') + '/' + rel.replace(/^\/+/, '');
}

/** Heuristic: è uno stderr di SSH che indica un *vero* fallimento?
 *  sshpass torna spesso exit-code != 0 anche con stdout valido (es. via
 *  ControlMaster), quindi non possiamo affidarci all'exit code soltanto. */
export function isSshFatalError(stderr: string): boolean {
  if (!stderr) return false;
  const fatal = [
    'Permission denied',
    'Connection refused',
    'Connection timed out',
    'Could not resolve hostname',
    'No route to host',
    'Host key verification failed',
    'kex_exchange_identification',
    'sshpass: invalid option',
    'sshpass: failed',
    'no such identity',
  ];
  return fatal.some((s) => stderr.includes(s));
}
