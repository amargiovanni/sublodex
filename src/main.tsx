// `auth.ts` PRIMA di qualsiasi altro import: ha un side-effect (monkey-patch di
// `window.fetch`) che deve essere applicato prima che qualsiasi modulo o
// componente faccia fetch.
import './lib/auth';
// Monaco loader self-hosted: configura `@monaco-editor/react` perché usi il
// pacchetto bundlato invece del CDN jsdelivr (CSP-friendly + offline).
import './lib/monaco-loader';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
