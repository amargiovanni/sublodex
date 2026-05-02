import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { useSettings, activeProject } from '../lib/settings';
import { ChevronRight, FolderIcon } from './icons';

async function deleteFsEntry(relPath: string): Promise<boolean> {
  const r = await fetch(`/api/file?path=${encodeURIComponent(relPath)}`, { method: 'DELETE' });
  return r.ok;
}

type FileNode = {
  name: string;
  path: string;       // relative to project root
  isDir: boolean;
  children?: FileNode[];
};

type TreeResponse = { root: string; tree: FileNode[] };

export function FileTree() {
  const settings = useSettings((s) => s.settings);
  const active = activeProject(settings);
  const [data, setData] = useState<TreeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/tree');
      if (!r.ok) throw new Error(await r.text());
      const j = (await r.json()) as TreeResponse;
      setData(j);
      setExpanded(new Set(j.tree.filter((n) => n.isDir).map((n) => n.path)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Ricarica il tree quando il progetto attivo cambia (incluso il primo mount).
  useEffect(() => { void load(); }, [load, active?.id]);

  const toggle = (path: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const filteredTree = useMemo(() => {
    if (!data || !filter.trim()) return data?.tree ?? [];
    const q = filter.toLowerCase();
    const matches = (node: FileNode): FileNode | null => {
      if (!node.isDir) {
        return node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)
          ? node
          : null;
      }
      const kids = (node.children ?? []).map(matches).filter((n): n is FileNode => n !== null);
      if (kids.length === 0 && !node.name.toLowerCase().includes(q)) return null;
      return { ...node, children: kids };
    };
    return data.tree.map(matches).filter((n): n is FileNode => n !== null);
  }, [data, filter]);

  // se c'è un filtro attivo, espandi tutto
  const effectiveExpanded = useMemo(() => {
    if (!filter.trim() || !data) return expanded;
    const all = new Set<string>();
    const walk = (nodes: FileNode[]) => {
      for (const n of nodes) {
        if (n.isDir) {
          all.add(n.path);
          if (n.children) walk(n.children);
        }
      }
    };
    walk(filteredTree);
    return all;
  }, [filter, expanded, filteredTree, data]);

  return (
    <div className="ftree">
      <div className="ftree__head">
        <input
          className="ftree__filter"
          placeholder="filter… (e.g. .py)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button className="ftree__refresh" onClick={load} title="refresh">⟳</button>
      </div>

      {data?.root && (
        <div className="ftree__root" title={data.root}>
          {shortRoot(data.root)}
        </div>
      )}

      <div className="ftree__list">
        {loading && <div className="ftree__msg">loading…</div>}
        {error && <div className="ftree__error">{error}</div>}
        {!loading && !error && data && filteredTree.length === 0 && (
          <div className="ftree__msg">{filter ? 'no matches' : 'empty project'}</div>
        )}
        {filteredTree.map((node) => (
          <NodeRow
            key={node.path}
            node={node}
            depth={0}
            expanded={effectiveExpanded}
            onToggle={toggle}
            pendingDelete={pendingDelete}
            requestDelete={setPendingDelete}
            confirmDelete={async (p) => {
              const ok = await deleteFsEntry(p);
              setPendingDelete(null);
              if (ok) {
                // se il file era aperto in editor, chiudi il tab
                useStore.getState().closeFile(p);
                await load();
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

function NodeRow({
  node, depth, expanded, onToggle, pendingDelete, requestDelete, confirmDelete,
}: {
  node: FileNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  pendingDelete: string | null;
  requestDelete: (path: string | null) => void;
  confirmDelete: (path: string) => Promise<void>;
}) {
  const activeFile = useStore((s) => s.activeFile);
  const openFiles = useStore((s) => s.openFiles);
  const streamingFiles = useStore((s) => s.streamingFiles);
  const setActiveFile = useStore((s) => s.setActiveFile);

  const isOpen = expanded.has(node.path);
  const isActive = activeFile === node.path;
  const isOpenInTab = openFiles.includes(node.path);
  const isStreaming = streamingFiles[node.path] !== undefined;

  const onClick = () => {
    if (node.isDir) onToggle(node.path);
    else setActiveFile(node.path);
  };

  const isPendingDelete = pendingDelete === node.path;

  return (
    <>
      <div
        className={`fnode-row ${isActive ? 'fnode-row--active' : ''}`}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <button
          className={`fnode ${node.isDir ? 'fnode--dir' : 'fnode--file'} ${isActive ? 'fnode--active' : ''} ${isOpenInTab ? 'fnode--in-tab' : ''}`}
          onClick={onClick}
          title={node.path}
        >
          <span className={`fnode__chev ${node.isDir && isOpen ? 'fnode__chev--open' : ''}`}>
            {node.isDir && <ChevronRight size={9} />}
          </span>
          <span className="fnode__icon">
            {node.isDir
              ? <FolderIcon size={15} />
              : <span className="fnode__ext">{iconFor(node.name)}</span>}
          </span>
          <span className="fnode__name">{node.name}</span>
          {isStreaming && <span className="fnode__live" />}
          {!isStreaming && isOpenInTab && !node.isDir && <span className="fnode__open-dot" />}
        </button>
        {!isPendingDelete && (
          <button
            className="fnode__trash"
            title={node.isDir ? 'delete folder (recursive)' : 'delete file'}
            onClick={(e) => { e.stopPropagation(); requestDelete(node.path); }}
          >
            ✕
          </button>
        )}
      </div>
      {isPendingDelete && (
        <div className="fnode-confirm" style={{ paddingLeft: 8 + depth * 12 }}>
          <span>delete <b>{node.name}</b>{node.isDir ? ' and everything inside' : ''}?</span>
          <div className="fnode-confirm__actions">
            <button className="fnode-confirm__cancel" onClick={() => requestDelete(null)}>cancel</button>
            <button className="fnode-confirm__yes" onClick={() => confirmDelete(node.path)}>delete</button>
          </div>
        </div>
      )}
      {node.isDir && isOpen && node.children?.map((child) => (
        <NodeRow
          key={child.path}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
          pendingDelete={pendingDelete}
          requestDelete={requestDelete}
          confirmDelete={confirmDelete}
        />
      ))}
    </>
  );
}

function iconFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  if (!ext) return '·';
  const map: Record<string, string> = {
    ts: 'T', tsx: 'T', js: 'J', jsx: 'J', mjs: 'J', cjs: 'J',
    py: 'P', rs: 'R', go: 'G', java: 'J', kt: 'K',
    rb: 'R', php: 'P', swift: 'S',
    c: 'C', cpp: 'C', cc: 'C', h: 'H', hpp: 'H', cs: 'C',
    md: 'M', mdx: 'M',
    json: '{}', yaml: 'Y', yml: 'Y', toml: 'T',
    css: '#', scss: '#', html: 'H', xml: 'X',
    sql: 'S', sh: '$', bash: '$', zsh: '$',
  };
  return map[ext] ?? '·';
}

function shortRoot(p: string): string {
  const home = '/Users/';
  if (p.startsWith(home)) {
    const parts = p.slice(home.length).split('/');
    if (parts.length <= 2) return '~/' + parts.slice(1).join('/');
    return '~/…/' + parts.slice(-2).join('/');
  }
  return p;
}
