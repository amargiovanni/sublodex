import { useCallback, useEffect, useState } from 'react';
import { useUI } from '../lib/ui';
import { useStore } from '../lib/store';
import { useSettings, activeProject } from '../lib/settings';
import {
  createNewSession,
  deleteConversation,
  listSessions,
  loadConversation,
  type SessionMeta,
} from '../lib/conversation';

/** Mini-bar in cima alla conversation con il selettore di session.
 *  Visibile solo se ci sono ≥2 session per il progetto attivo (con 1 sola
 *  session il selettore sarebbe rumore). C'è comunque sempre il bottone
 *  "+ new" per creare una nuova session. */
export function SessionsBar() {
  const settings = useSettings((s) => s.settings);
  const active = activeProject(settings);
  const activeSessionByProject = useUI((s) => s.activeSessionByProject);
  const setActiveSession = useUI((s) => s.setActiveSession);

  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const isStreaming = useStore((s) => s.isStreaming);
  const turns = useStore((s) => s.turns);

  const refresh = useCallback(async () => {
    if (!active?.id) return;
    const list = await listSessions(active.id);
    setSessions(list);
  }, [active?.id]);

  // Refresh quando: progetto cambia, sessione cambia, oppure ogni volta che
  // un turno finisce (così il messageCount in dropdown è aggiornato).
  useEffect(() => { void refresh(); }, [refresh, turns]);

  if (!active?.id) return null;

  const currentId = activeSessionByProject[active.id];
  const current = sessions.find((s) => s.id === currentId);

  const switchTo = async (id: string) => {
    if (!active?.id || id === currentId) { setOpen(false); return; }
    setActiveSession(active.id, id);
    setOpen(false);
    // L'effect in App.tsx caricherà la nuova session
  };

  const createNew = async () => {
    if (!active?.id) return;
    const id = await createNewSession(active.id);
    if (id) {
      setActiveSession(active.id, id);
      // forziamo il reset locale finché l'App effect non ricarica
      useStore.getState().resetSession();
      setOpen(false);
      void refresh();
    }
  };

  const requestDelete = (id: string) => setConfirmDelete(id);
  const doDelete = async (id: string) => {
    if (!active?.id) return;
    await deleteConversation(active.id, id);
    if (currentId === id) {
      // dopo aver cancellato la session attiva, torna alla più recente
      // rimasta (il prossimo refresh reload-erà)
      setActiveSession(active.id, undefined);
      useStore.getState().resetSession();
    }
    setConfirmDelete(null);
    void refresh();
    // forza ricaricamento quando si cancella la session attiva
    if (currentId === id && active?.id) {
      const remaining = await listSessions(active.id);
      const fallback = remaining[0]?.id;
      if (fallback) {
        setActiveSession(active.id, fallback);
        const snap = await loadConversation(active.id, fallback);
        if (snap) useStore.getState().hydrateConversation(snap);
      }
    }
  };

  // Se c'è 1 sola session e non è aperta la dropdown, non sprecare spazio
  // (mostriamo solo se: > 1 session, OPPURE l'utente sta scegliendo).
  if (sessions.length <= 1 && !open) {
    return (
      <div className="sessions-bar sessions-bar--minimal">
        <button
          className="sessions-bar__title"
          onClick={() => setOpen(true)}
          disabled={isStreaming}
        >
          <span className="sessions-bar__label">session</span>
          <span className="sessions-bar__current">{shortLabel(current, currentId)}</span>
          <span className="sessions-bar__chev">▾</span>
        </button>
      </div>
    );
  }

  return (
    <div className="sessions-bar">
      <button
        className="sessions-bar__title"
        onClick={() => setOpen((v) => !v)}
        disabled={isStreaming}
      >
        <span className="sessions-bar__label">session</span>
        <span className="sessions-bar__current">{shortLabel(current, currentId)}</span>
        <span className="sessions-bar__chev">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="sessions-bar__menu">
          {sessions.map((s) => (
            <div
              className={`sessions-row ${s.id === currentId ? 'sessions-row--active' : ''}`}
              key={s.id}
            >
              <button
                className="sessions-row__select"
                onClick={() => switchTo(s.id)}
                disabled={isStreaming}
              >
                <span className="sessions-row__head">
                  <span className="sessions-row__date">{formatDate(s.updatedAt)}</span>
                  <span className="sessions-row__count">· {s.messageCount} msg</span>
                </span>
                <span className="sessions-row__summary">
                  {s.summary || <em className="sessions-row__empty">empty conversation</em>}
                </span>
              </button>
              {confirmDelete === s.id ? (
                <div className="sessions-row__confirm">
                  <button onClick={() => setConfirmDelete(null)}>cancel</button>
                  <button className="header__btn--danger" onClick={() => doDelete(s.id)}>delete</button>
                </div>
              ) : (
                <button
                  className="sessions-row__delete"
                  onClick={(e) => { e.stopPropagation(); requestDelete(s.id); }}
                  title="delete this session"
                  disabled={isStreaming}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            className="sessions-bar__new"
            onClick={createNew}
            disabled={isStreaming}
          >
            + new session
          </button>
        </div>
      )}
    </div>
  );
}

function shortLabel(s: SessionMeta | undefined, id: string | undefined): string {
  if (!s) {
    if (id) return id.slice(0, 16);
    return '— ';
  }
  if (s.summary) return s.summary.slice(0, 50);
  return formatDate(s.updatedAt);
}

function formatDate(t: number): string {
  const d = new Date(t);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
         d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
