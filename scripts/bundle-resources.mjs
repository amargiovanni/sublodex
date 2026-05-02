#!/usr/bin/env node
/**
 * Prepara `src-tauri/resources/` per il bundle Tauri:
 *   - copia `dist/` → `src-tauri/resources/dist/`
 *
 * Il PTY ora è gestito interamente da Rust via portable-pty, quindi non
 * servono più pty-helper.mjs né node_modules/node-pty nel bundle.
 *
 * Idempotente: pulisce e ricopia ogni volta. Chiamato da `beforeBuildCommand`
 * di Tauri prima del bundle release.
 */
import { rm, mkdir, cp, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RES = path.join(ROOT, 'src-tauri', 'resources');

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function copy(src, dst, label) {
  if (!(await exists(src))) {
    console.error(`[bundle-resources] missing source: ${src} (${label})`);
    process.exit(1);
  }
  await rm(dst, { recursive: true, force: true });
  await mkdir(path.dirname(dst), { recursive: true });
  await cp(src, dst, { recursive: true, dereference: true });
  console.log(`[bundle-resources] ${label}: ${path.relative(ROOT, src)} → ${path.relative(ROOT, dst)}`);
}

await mkdir(RES, { recursive: true });

// Pulisci risorse vecchie che non ci servono più
for (const stale of ['pty-helper.mjs', 'node_modules']) {
  const p = path.join(RES, stale);
  if (await exists(p)) {
    await rm(p, { recursive: true, force: true });
    console.log(`[bundle-resources] removed stale: ${stale}`);
  }
}

// dist/ buildato (vite output)
await copy(path.join(ROOT, 'dist'), path.join(RES, 'dist'), 'dist');

// Native binary di @anthropic-ai/claude-agent-sdk per la piattaforma corrente.
// Vive in node_modules/@anthropic-ai/claude-agent-sdk-<platform>-<arch>/claude.
// In CI ogni runner ha il suo subpackage installato, quindi la copia funziona
// "automaticamente" per ogni target.
//
// Cross-compile (es. da Mac Intel verso aarch64-apple-darwin): Tauri esporta
// TAURI_ARCH in beforeBuildCommand. Se settato, lo usiamo per scegliere il
// subpackage giusto invece di seguire ciecamente process.arch.
const claudePlatformArch = (() => {
  const platformMap = { darwin: 'darwin', linux: 'linux', win32: 'win32' };
  const archMap = {
    'aarch64': 'arm64', 'arm64': 'arm64',
    'x86_64': 'x64',    'x64':   'x64',
  };
  const p = platformMap[process.platform] ?? process.platform;
  const a = archMap[process.env.TAURI_ARCH] ?? archMap[process.arch] ?? process.arch;
  return `${p}-${a}`;
})();
const claudeBinSrcDir = path.join(ROOT, 'node_modules', '@anthropic-ai', `claude-agent-sdk-${claudePlatformArch}`);
const claudeBinName = process.platform === 'win32' ? 'claude.exe' : 'claude';
const claudeBinSrc = path.join(claudeBinSrcDir, claudeBinName);
if (await exists(claudeBinSrc)) {
  const claudeBinDst = path.join(RES, 'claude-bin', claudeBinName);
  await rm(path.dirname(claudeBinDst), { recursive: true, force: true });
  await mkdir(path.dirname(claudeBinDst), { recursive: true });
  await cp(claudeBinSrc, claudeBinDst);
  // assicurati che resti exec
  const { chmod } = await import('node:fs/promises');
  try { await chmod(claudeBinDst, 0o755); } catch { /* */ }
  console.log(`[bundle-resources] claude bin: ${claudePlatformArch} → ${path.relative(ROOT, claudeBinDst)}`);
} else {
  console.error(`[bundle-resources] WARNING: claude binary not found at ${claudeBinSrc}`);
  console.error('[bundle-resources] the .app will not work without it. Make sure');
  console.error(`[bundle-resources] @anthropic-ai/claude-agent-sdk-${claudePlatformArch} is installed.`);
}

console.log('[bundle-resources] done.');
