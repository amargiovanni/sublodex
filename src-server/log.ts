/**
 * Wrapper minimo per log con scope esplicito + livello + campi opzionali.
 * No nuove dep. Output formato:
 *   `HH:MM:SS.sss LEVEL [scope] msg key1=val1 key2=val2`
 *
 * Livello configurabile via env `SUBLODEX_LOG_LEVEL=debug|info|warn|error`
 * (default `info`). I messaggi sotto la soglia vengono droppati.
 * `error` e `warn` escono su stderr, `info`/`debug` su stdout.
 *
 * Estratto da server.ts (Fase 3.1) per essere riusato dai moduli del
 * server in `src-server/*`, e per ridurre il monolite.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const CONFIGURED_LEVEL: LogLevel = ((process.env.SUBLODEX_LOG_LEVEL || 'info').toLowerCase() as LogLevel);
const THRESHOLD = LEVELS[CONFIGURED_LEVEL] ?? LEVELS.info;

function emit(
  level: LogLevel,
  scope: string,
  msg: string,
  fields?: Record<string, unknown>,
): void {
  if (LEVELS[level] < THRESHOLD) return;
  const ts = new Date().toISOString().slice(11, 23);
  const tail = fields
    ? ' ' + Object.entries(fields)
        .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join(' ')
    : '';
  const line = `${ts} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}${tail}`;
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

export const log = {
  debug: (scope: string, msg: string, fields?: Record<string, unknown>) => emit('debug', scope, msg, fields),
  info:  (scope: string, msg: string, fields?: Record<string, unknown>) => emit('info',  scope, msg, fields),
  warn:  (scope: string, msg: string, fields?: Record<string, unknown>) => emit('warn',  scope, msg, fields),
  error: (scope: string, msg: string, fields?: Record<string, unknown>) => emit('error', scope, msg, fields),
};
