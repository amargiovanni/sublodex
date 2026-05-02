import { useEffect, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useUI } from '../lib/ui';
import { useSettings, activeProject } from '../lib/settings';
import { SidebarLeft } from './SidebarLeft';
import { SidebarRail } from './SidebarRail';
import { CenterPane } from './CenterPane';
import { Editor } from './Editor';
import { TerminalPane } from './TerminalPane';
import { useScopedTheme } from './ThemeApplier';

export function Layout() {
  const sidebarOpen = useUI((s) => s.sidebarOpen);
  const terminalOpen = useUI((s) => s.terminalOpen);
  const toggleTerminal = useUI((s) => s.toggleTerminal);

  const settings = useSettings((s) => s.settings);
  const active = activeProject(settings);

  const top = sidebarOpen ? (
    <PanelGroup direction="horizontal" autoSaveId="cw-3col" className="layout">
      <Panel defaultSize={20} minSize={15} maxSize={36} className="layout__pane">
        <SidebarLeft />
      </Panel>
      <PanelResizeHandle className="layout__handle" />
      <Panel defaultSize={50} minSize={28} className="layout__pane">
        <CenterPane />
      </Panel>
      <PanelResizeHandle className="layout__handle" />
      <Panel defaultSize={30} minSize={20} className="layout__pane">
        <Editor />
      </Panel>
    </PanelGroup>
  ) : (
    <div className="layout layout--rail">
      <SidebarRail />
      <PanelGroup direction="horizontal" autoSaveId="cw-2col" className="layout__panels">
        <Panel defaultSize={60} minSize={30} className="layout__pane">
          <CenterPane />
        </Panel>
        <PanelResizeHandle className="layout__handle" />
        <Panel defaultSize={40} minSize={20} className="layout__pane">
          <Editor />
        </Panel>
      </PanelGroup>
    </div>
  );

  if (!terminalOpen) {
    return <div className="layout-shell">{top}</div>;
  }

  return (
    <PanelGroup direction="vertical" autoSaveId="cw-vertical" className="layout-shell">
      <Panel defaultSize={65} minSize={20} className="layout-shell__top">
        {top}
      </Panel>
      <PanelResizeHandle className="layout__handle layout__handle--horizontal" />
      <Panel defaultSize={35} minSize={10} className="layout-shell__bottom">
        <TerminalContainer active={active} toggleTerminal={toggleTerminal} />
      </Panel>
    </PanelGroup>
  );
}

function TerminalContainer({ active, toggleTerminal }: {
  active: ReturnType<typeof activeProject>;
  toggleTerminal: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useScopedTheme(ref, 'terminal');

  const remote = active?.remote;
  const remoteLabel = remote
    ? `${remote.user ? remote.user + '@' : ''}${remote.host}${remote.port && remote.port !== 22 ? `:${remote.port}` : ''}`
    : null;
  const termKey = remote ? `ssh:${remoteLabel}:${active?.id ?? ''}` : `local:${active?.id ?? ''}`;

  return (
    <div className="terminal" ref={ref}>
      <div className="terminal__head">
        <span className="terminal__label">terminal</span>
        <span className="terminal__path">
          {remoteLabel
            ? <><span className="terminal__remote-pill">ssh</span> {remoteLabel}:{active?.path}</>
            : active?.path}
        </span>
        <button className="header__btn" onClick={toggleTerminal} title="close terminal">✕</button>
      </div>
      {active && <TerminalPane key={termKey} project={active} />}
    </div>
  );
}
