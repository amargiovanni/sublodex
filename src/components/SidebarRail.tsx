import { useRef } from 'react';
import { COMMANDS } from '../lib/commands';
import { useUI } from '../lib/ui';
import { FolderIcon } from './icons';
import { useScopedTheme } from './ThemeApplier';

export function SidebarRail() {
  const ref = useRef<HTMLDivElement>(null);
  useScopedTheme(ref, 'sidebar');
  const openWith = useUI((s) => s.openSidebarWith);
  const openFiles = useUI((s) => s.openFilesPanel);
  return (
    <div className="rail" ref={ref}>
      <button className="rail__expand" onClick={() => openWith()} title="expand commands">
        ›
      </button>

      <button className="rail__item rail__item--files" onClick={openFiles} title="project files">
        <FolderIcon size={18} />
      </button>

      <div className="rail__divider" />

      <div className="rail__list">
        {COMMANDS.map((cmd) => (
          <button
            key={cmd.id}
            className="rail__item"
            onClick={() => openWith(cmd.id)}
            title={`${cmd.name} — ${cmd.description}`}
          >
            <span className="rail__icon">{cmd.icon}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
