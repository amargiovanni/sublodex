import { useRef, useState, type KeyboardEvent } from 'react';
import { sendPrompt, cancel } from '../lib/ws';
import { useStore } from '../lib/store';

export function Composer() {
  const [value, setValue] = useState('');
  const isStreaming = useStore((s) => s.isStreaming);
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const text = value.trim();
    if (!text || isStreaming) return;
    sendPrompt(text);
    setValue('');
    if (ref.current) ref.current.style.height = 'auto';
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      submit();
    }
  };

  const autoresize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(220, el.scrollHeight) + 'px';
  };

  return (
    <div className="composer">
      <div className="composer__box">
        <textarea
          ref={ref}
          className="composer__textarea"
          placeholder={isStreaming ? 'claude is working…' : 'talk to claude…'}
          value={value}
          onChange={(e) => { setValue(e.target.value); autoresize(); }}
          onKeyDown={onKey}
          rows={1}
        />
        <div className="composer__bar">
          <span className="composer__hint"><kbd>↵</kbd> send · <kbd>⇧↵</kbd> newline</span>
          {isStreaming ? (
            <button className="composer__cancel" onClick={cancel}>stop</button>
          ) : (
            <button className="composer__send" onClick={submit} disabled={!value.trim()}>
              send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
