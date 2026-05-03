/**
 * Monaco loader self-hosted.
 *
 * `@monaco-editor/react` di default scarica monaco da `cdn.jsdelivr.net` via
 * loader AMD a runtime → bloccato dalla CSP `script-src 'self'` (più una
 * dipendenza di rete + supply chain). Questo modulo configura il loader perché
 * usi il pacchetto `monaco-editor` bundlato da Vite.
 *
 * I worker di Monaco (json/css/html/ts/editor) sono importati con `?worker`
 * di Vite: in build vengono emessi come asset separati e caricati come Web
 * Worker da URL `/assets/...` (same-origin). Niente `blob:`, niente CDN.
 *
 * Side-effect at import time. `main.tsx` lo importa subito dopo `auth.ts` per
 * garantirne l'esecuzione prima del primo mount di Monaco.
 */
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    switch (label) {
      case 'json':
        return new jsonWorker();
      case 'css':
      case 'scss':
      case 'less':
        return new cssWorker();
      case 'html':
      case 'handlebars':
      case 'razor':
        return new htmlWorker();
      case 'typescript':
      case 'javascript':
        return new tsWorker();
      default:
        return new editorWorker();
    }
  },
};

loader.config({ monaco });
