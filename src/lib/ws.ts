import type { ClientMessage, ServerMessage } from './types';
import { useStore } from './store';
import { useSettings, activeProject } from './settings';
import { saveConversation } from './conversation';

function persistCurrentConversation(): void {
  const settings = useSettings.getState().settings;
  const active = activeProject(settings);
  if (!active) return;
  const s = useStore.getState();
  void saveConversation(active.id, {
    messages: s.messages,
    sessionId: s.sessionId,
    totalCost: s.totalCost,
    totalInput: s.totalInput,
    totalOutput: s.totalOutput,
    turns: s.turns,
  });
}

let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;

export function connect(): void {
  if (socket && socket.readyState <= WebSocket.OPEN) return;

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  socket = ws;

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
    if (reconnectTimer !== null) return;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 1000);
  };

  ws.onerror = (e) => console.error('ws error', e);
}

function rawSend(msg: ClientMessage): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
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
