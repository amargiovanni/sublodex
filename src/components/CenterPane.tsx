import { useRef } from 'react';
import { Conversation } from './Conversation';
import { Composer } from './Composer';
import { SessionsBar } from './SessionsBar';
import { useScopedTheme } from './ThemeApplier';

export function CenterPane() {
  const ref = useRef<HTMLDivElement>(null);
  useScopedTheme(ref, 'center');
  return (
    <div className="center" ref={ref}>
      <SessionsBar />
      <Conversation />
      <Composer />
    </div>
  );
}
