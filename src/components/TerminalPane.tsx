import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { invoke, Channel } from '@tauri-apps/api/core';
import { useTheme, resolveTheme } from '../lib/themeStore';
import { THEMES } from '../lib/themes';
import type { Project } from '../lib/types';

function buildXtermTheme(themeId: keyof typeof THEMES) {
  const t = THEMES[themeId].colors;
  return {
    background: t.bg,
    foreground: t.fg,
    cursor: t.fg,
    cursorAccent: t.bg,
    selectionBackground: t.bgCard2,
    ...t.ansi,
  };
}

/** Encode/decode base64 ↔ Uint8Array. */
function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

type PtyEvent = { kind: 'data' | 'exit'; data?: string };

type Props = {
  /** Progetto corrente: il PTY usa `path` per cwd locale o per `cd` remoto. */
  project: Project;
};

export function TerminalPane({ project }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const themeSettings = useTheme();
  const themeId = resolveTheme(themeSettings, 'terminal');

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    let term: Terminal | null = null;
    let sessionId: string | null = null;
    let onDataDisposable: { dispose: () => void } | null = null;
    let ro: ResizeObserver | null = null;
    const encoder = new TextEncoder();

    document.fonts.load('400 13px "JetBrainsMono Nerd Font"').finally(async () => {
      if (cancelled) return;

      term = new Terminal({
        fontFamily: '"JetBrainsMono Nerd Font", "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
        fontSize: 13,
        lineHeight: 1.2,
        cursorBlink: true,
        cursorStyle: 'block',
        theme: buildXtermTheme(themeId),
        allowProposedApi: true,
        scrollback: 5000,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(el);
      fit.fit();

      const opts = {
        cols: term.cols,
        rows: term.rows,
        kind: project.remote ? 'ssh' : 'local',
        cwd: project.remote ? null : project.path,
        ssh: project.remote
          ? {
              host: project.remote.host,
              port: project.remote.port ?? null,
              user: project.remote.user ?? null,
              password: project.remote.password ?? null,
              identityFile: project.remote.identityFile ?? null,
              agentForwarding: project.remote.agentForwarding ?? null,
              remotePath: project.path,
              shellType: project.remote.shellType ?? null,
            }
          : null,
      };

      // Channel = stream tipizzato Rust→JS, alternativa a `event::listen`.
      // Viene allocato qui e passato a `pty_open` come parametro: il read loop
      // Rust invia direttamente a noi via questa pipe, senza event broadcast.
      const onEvent = new Channel<PtyEvent>();
      onEvent.onmessage = (msg) => {
        if (!term) return;
        if (msg.kind === 'data' && msg.data) {
          term.write(base64ToBytes(msg.data));
        } else if (msg.kind === 'exit') {
          term.write('\r\n\x1b[90m[connection closed — reload to reopen]\x1b[0m\r\n');
        }
      };

      try {
        sessionId = await invoke<string>('pty_open', { opts, onEvent });
      } catch (err) {
        term.write(`\r\n\x1b[31m[failed to open pty: ${String(err)}]\x1b[0m\r\n`);
        return;
      }
      if (cancelled || !sessionId) {
        if (sessionId) {
          try { await invoke('pty_close', { sessionId }); } catch { /* */ }
        }
        return;
      }

      // terminal → PTY: input UTF-8 → bytes → base64.
      onDataDisposable = term.onData((data) => {
        if (!sessionId) return;
        const bytes = encoder.encode(data);
        const b64 = bytesToBase64(bytes);
        invoke('pty_write', { sessionId, data: b64 }).catch(() => { /* sessione morta */ });
      });

      // Resize debounciato.
      let resizeTimer: number | null = null;
      const sendResize = () => {
        if (!term || !sessionId) return;
        try { fit.fit(); } catch { /* */ }
        const { cols, rows } = term;
        invoke('pty_resize', { sessionId, cols, rows }).catch(() => { /* */ });
      };
      ro = new ResizeObserver(() => {
        if (resizeTimer !== null) clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(sendResize, 80);
      });
      ro.observe(el);

      setTimeout(() => term?.focus(), 100);
    });

    return () => {
      cancelled = true;
      ro?.disconnect();
      onDataDisposable?.dispose();
      if (sessionId) {
        invoke('pty_close', { sessionId }).catch(() => { /* */ });
      }
      try { term?.dispose(); } catch { /* */ }
    };
    // riapri la sessione se cambia progetto, host SSH, o tema (xterm si rerenderizza)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, project.path, project.remote?.host, project.remote?.user, project.remote?.port, themeId]);

  return <div className="terminal-pane" ref={containerRef} />;
}
