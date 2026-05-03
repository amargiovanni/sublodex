import type { ClientMessage, ServerMessage } from './types';
import { useStore } from './store';
import { useSettings, activeProject } from './settings';
import { useUI } from './ui';
import { saveConversation } from './conversation';
import { wsTokenQuery } from './auth';

function persistCurrentConversation(): void {
  const settings = useSettings.getState().settings;
  const active = activeProject(settings);
  if (!active) return;
  const s = useStore.getState();
  // fs-id della sessione corrente (= filename `<id>.json` lato server).
  // Senza questo, il PUT cade su "most recent by mtime" e con più sessioni
  // attive scrive nel file sbagliato → al reload `--resume` apre la
  // sessione sbagliata o non trova nulla.
  const sessionFsId = useUI.getState().activeSessionByProject[active.id];
  void saveConversation(active.id, {
    messages: s.messages,
    sessionId: s.sessionId,
    totalCost: s.totalCost,
    totalInput: s.totalInput,
    totalOutput: s.totalOutput,
    turns: s.turns,
  }, sessionFsId);
}

let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
/** Tentativi di riconnessione consecutivi falliti. Resettato a 0 ogni
 *  volta che `onopen` parte (= nuova connessione stabilita). Usato per
 *  backoff esponenziale con jitter. */
let reconnectAttempts = 0;

/** Backoff esponenziale con jitter: 1s, 2s, 4s, 8s, 16s, max 30s.
 *  Jitter ±25% per evitare che N client riprovino in sincrono dopo
 *  un riavvio del server. */
function nextReconnectDelayMs(): number {
  const base = Math.min(1000 * Math.pow(2, reconnectAttempts), 30_000);
  const jitter = base * (Math.random() * 0.5 - 0.25); // ±25%
  return Math.max(500, Math.round(base + jitter));
}

export function connect(): void {
  if (socket && socket.readyState <= WebSocket.OPEN) return;

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  // Token in query string: WebSocket browser API non accetta header custom.
  // Se auth è disabilitata (dev) wsTokenQuery() ritorna '' → URL pulita.
  const ws = new WebSocket(`${proto}://${location.host}/ws${wsTokenQuery()}`);
  socket = ws;

  ws.onopen = () => {
    // Connessione stabilita → reset del contatore. Se cade di nuovo,
    // ripartiamo dal backoff minimo.
    reconnectAttempts = 0;
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data) as ServerMessage;
      const store = useStore.getState();
      if (msg.type === 'event') store.ingestEvent(msg.event);
      else if (msg.type === 'done') {
        store.setStreaming(false);
        persistCurrentConversation();
      }
      else if (msg.type === 'error') {
        store.setError(msg.error);
        store.setStreaming(false);
        persistCurrentConversation();
      }
    } catch (err) {
      console.error('ws parse error:', err);
    }
  };

  ws.onclose = () => {
    socket = null;
    // Se il WS si chiude *durante* uno streaming, l'UI resterebbe bloccata
    // in stato "streaming". Resettiamo lo stato e segnaliamo l'errore per
    // far ripartire l'utente con un nuovo prompt una volta riconnessi.
    const store = useStore.getState();
    if (store.isStreaming) {
      store.setStreaming(false);
      store.setError('connessione persa durante la risposta — riprova');
      // Non persistiamo: la conversazione corrente è incompleta. Sarà
      // persistita normalmente al prossimo `done`.
    }
    if (reconnectTimer !== null) return;
    const delay = nextReconnectDelayMs();
    reconnectAttempts += 1;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  ws.onerror = (e) => console.error('ws error', e);
}

/** Soglia oltre la quale consideriamo il WS in backpressure: 1MB di dati
 *  in fase di invio non ancora flushati dal kernel. Per Claude prompt
 *  testuali non si raggiunge mai, ma protegge da paste enormi. */
const WS_BACKPRESSURE_THRESHOLD = 1 * 1024 * 1024;

function rawSend(msg: ClientMessage): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  if (socket.bufferedAmount > WS_BACKPRESSURE_THRESHOLD) {
    console.warn(`ws backpressure: ${socket.bufferedAmount} bytes buffered, dropping send`);
    return false;
  }
  socket.send(JSON.stringify(msg));
  return true;
}

export function sendPrompt(prompt: string): void {
  const { sessionId, model, permissionMode, appendUserMessage, setStreaming, setError } =
    useStore.getState();
  appendUserMessage(prompt);
  setStreaming(true);
  setError(undefined);
  const ok = rawSend({ type: 'send', prompt, sessionId, model, permissionMode });
  if (!ok) {
    setError('server not ready — try again in a moment');
    setStreaming(false);
  }
}

export function cancel(): void {
  rawSend({ type: 'cancel' });
}
