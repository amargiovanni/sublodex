import { useEffect, useRef } from 'react';
import { useStore } from '../lib/store';
import { Message } from './Message';
import { ClaudeMascot } from './ClaudeMascot';

export function Conversation() {
  const messages = useStore((s) => s.messages);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** auto-segui il fondo. Si disattiva se l'utente scrolla manualmente in su,
   *  si riattiva quando torna giù entro ~80px dal fondo. */
  const autoFollow = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (autoFollow.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    autoFollow.current = distance < 80;
  };

  return (
    <div className="conv" ref={scrollRef} onScroll={onScroll}>
      <div className="conv__inner">
        {messages.length === 0 && (
          <div className="conv__empty">
            <ClaudeMascot size={140} />
            <div className="conv__empty-title">SubLodeX</div>
            <div className="conv__empty-by">
              by Amani Andrea aka <em>The Pirate Pinperepette</em>
            </div>
            <div className="conv__empty-hint">
              type below or pick a command from the left rail.
              the file on the right updates in real time as claude works.
            </div>
          </div>
        )}
        {messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}
      </div>
    </div>
  );
}
