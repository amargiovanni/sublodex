import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { useSettings, activeProject } from '../lib/settings';
import { useUI } from '../lib/ui';

type GitFileStatus = {
  path: string;
  staged: 'A' | 'M' | 'D' | 'R' | 'U' | null;
  workdir: 'M' | 'D' | 'U' | '?' | null;
};

type GitStatus =
  | { isGitRepo: false }
  | {
      isGitRepo: true;
      branch: string;
      upstream?: string;
      ahead: number;
      behind: number;
      files: GitFileStatus[];
    };

type RunResult = { ok: boolean; stdout: string; stderr: string; code: number };

type Commit = {
  hash: string;
  abbrev: string;
  author: string;
  date: string;
  subject: string;
};

type Branch = {
  name: string;
  sha: string;
  upstream?: string;
  current: boolean;
};

type Stash = { ref: string; message: string };

export function GitPanel() {
  const settings = useSettings((s) => s.settings);
  const active = activeProject(settings);
  const setActiveFile = useStore((s) => s.setActiveFile);
  const setIsGitRepo = useUI((s) => s.setIsGitRepo);

  const [data, setData] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commitMsg, setCommitMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);
  const [opOutput, setOpOutput] = useState<{ label: string; text: string } | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);
  const [stashes, setStashes] = useState<Stash[]>([]);
  const [stashOpen, setStashOpen] = useState(false);
  const [stashMsg, setStashMsg] = useState('');
  const [prInput, setPrInput] = useState('');
  const [prOpen, setPrOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, logRes, branchesRes, stashRes] = await Promise.all([
        fetch('/api/git/status'),
        fetch('/api/git/log?limit=30'),
        fetch('/api/git/branches'),
        fetch('/api/git/stash/list'),
      ]);
      if (!statusRes.ok) throw new Error(await statusRes.text());
      const j = (await statusRes.json()) as GitStatus;
      setData(j);
      setIsGitRepo(j.isGitRepo);
      if (logRes.ok) {
        const lj = (await logRes.json()) as { commits: Commit[] };
        setCommits(lj.commits ?? []);
      } else {
        setCommits([]);
      }
      if (branchesRes.ok) {
        const bj = (await branchesRes.json()) as { branches: Branch[] };
        setBranches(bj.branches ?? []);
      } else {
        setBranches([]);
      }
      if (stashRes.ok) {
        const sj = (await stashRes.json()) as { stashes: Stash[] };
        setStashes(sj.stashes ?? []);
      } else {
        setStashes([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh, active?.id]);

  const runOp = async (label: string, op: () => Promise<Response>) => {
    setBusy(true);
    setOpError(null);
    setOpOutput(null);
    try {
      const r = await op();
      const j = (await r.json()) as RunResult;
      const text = (j.stdout + (j.stderr ? `\n${j.stderr}` : '')).trim();
      if (!j.ok) {
        setOpError(text || `git failed (code ${j.code})`);
      } else if (text) {
        setOpOutput({ label, text });
      }
      await refresh();
    } catch (err) {
      setOpError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const stage = (p: string) =>
    runOp(`stage ${p}`, () =>
      fetch('/api/git/stage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: p }),
      }),
    );
  const unstage = (p: string) =>
    runOp(`unstage ${p}`, () =>
      fetch('/api/git/unstage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: p }),
      }),
    );
  const stageAll = () =>
    runOp('stage all', () => fetch('/api/git/stage-all', { method: 'POST' }));
  const unstageAll = () =>
    runOp('unstage all', () => fetch('/api/git/unstage-all', { method: 'POST' }));
  const discard = (p: string, untracked: boolean) =>
    runOp(`discard ${p}`, () =>
      fetch('/api/git/discard', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: p, untracked }),
      }),
    ).then(() => setConfirmDiscard(null));
  const commit = () =>
    runOp('commit', () =>
      fetch('/api/git/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: commitMsg }),
      }),
    ).then(() => setCommitMsg(''));
  const pull = () => runOp('pull', () => fetch('/api/git/pull', { method: 'POST' }));
  const push = () => runOp('push', () => fetch('/api/git/push', { method: 'POST' }));
  const checkout = (branch: string, create = false) =>
    runOp(create ? `checkout -b ${branch}` : `checkout ${branch}`, () =>
      fetch('/api/git/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ branch, create }),
      }),
    ).then(() => {
      setBranchMenuOpen(false);
      setCreatingBranch(false);
      setNewBranchName('');
    });
  const stashSave = () =>
    runOp('stash save', () =>
      fetch('/api/git/stash/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: stashMsg }),
      }),
    ).then(() => setStashMsg(''));
  const stashPop = (ref: string) =>
    runOp(`stash pop ${ref}`, () =>
      fetch('/api/git/stash/pop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ref }),
      }),
    );
  const stashDrop = (ref: string) =>
    runOp(`stash drop ${ref}`, () =>
      fetch('/api/git/stash/drop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ref }),
      }),
    );

  /** Estrae il numero PR da varie forme di input:
   *   - "https://github.com/owner/repo/pull/123" → 123
   *   - "#123" → 123
   *   - "123" → 123 */
  const extractPrNumber = (s: string): number | null => {
    const t = s.trim();
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    if (/^#\d+$/.test(t)) return parseInt(t.slice(1), 10);
    const m = t.match(/\/pull\/(\d+)/);
    if (m) return parseInt(m[1], 10);
    return null;
  };

  const reviewPr = async () => {
    const num = extractPrNumber(prInput);
    if (!num) {
      setOpError('paste a PR url or number (e.g. https://github.com/.../pull/123 or 123)');
      return;
    }
    setBusy(true);
    setOpError(null);
    setOpOutput(null);
    try {
      // 1) fetch del branch del PR sotto refs/heads/pr-N
      const fr = await fetch('/api/git/fetch-pr', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ number: num }),
      });
      const fj = (await fr.json()) as RunResult & { branch?: string };
      if (!fj.ok || !fj.branch) {
        setOpError(((fj.stderr || fj.stdout) ?? '').trim() || `fetch failed (code ${fj.code})`);
        return;
      }
      // 2) base branch (origin/HEAD → main/master)
      const dbRes = await fetch('/api/git/default-branch');
      const db = (await dbRes.json()) as { branch: string | null };
      const base = db.branch || 'main';
      // 3) apri tab diff range
      setActiveFile(`diff://range:${base}..${fj.branch}`);
      setPrInput('');
      setPrOpen(false);
      setOpOutput({
        label: `PR #${num}`,
        text: `fetched into branch ${fj.branch} → diff vs ${base} opened in editor`,
      });
      await refresh();
    } catch (err) {
      setOpError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) {
    return <div className="git-panel git-panel--empty">loading…</div>;
  }
  if (error) {
    return <div className="git-panel git-panel--empty">{error}</div>;
  }
  if (!data || !data.isGitRepo) {
    return (
      <div className="git-panel git-panel--empty">
        <div>not a git repository</div>
        <div className="git-panel__hint">
          run <code>git init</code> in the project, then refresh
        </div>
        <button className="header__btn" onClick={refresh}>refresh</button>
      </div>
    );
  }

  const stagedFiles = data.files.filter((f) => f.staged !== null);
  const unstagedFiles = data.files.filter((f) => f.staged === null);

  return (
    <div className="git-panel">
      <div className="git-panel__head">
        <button
          className="git-panel__branch git-panel__branch--clickable"
          onClick={() => setBranchMenuOpen((v) => !v)}
          title={data.upstream ?? '(no upstream)'}
        >
          <span className="git-panel__branch-glyph">⎇</span>
          <span className="git-panel__branch-name">{data.branch}</span>
          {(data.ahead > 0 || data.behind > 0) && (
            <span className="git-panel__ab">
              {data.ahead > 0 && <span title="ahead">↑{data.ahead}</span>}
              {data.behind > 0 && <span title="behind">↓{data.behind}</span>}
            </span>
          )}
          <span className="git-panel__branch-chev">{branchMenuOpen ? '▾' : '▸'}</span>
        </button>
        <button className="ftree__refresh" onClick={refresh} title="refresh">⟳</button>
      </div>

      {branchMenuOpen && (
        <div className="git-panel__branches">
          {branches.map((b) => (
            <button
              key={b.name}
              className={`git-branch ${b.current ? 'git-branch--current' : ''}`}
              onClick={() => !b.current && checkout(b.name)}
              disabled={busy || b.current}
              title={b.upstream ?? ''}
            >
              <span className="git-branch__glyph">{b.current ? '●' : '○'}</span>
              <span className="git-branch__name">{b.name}</span>
              {b.upstream && <span className="git-branch__upstream">{b.upstream}</span>}
            </button>
          ))}
          {creatingBranch ? (
            <div className="git-branch__create">
              <input
                className="field__input field__input--mono"
                placeholder="new branch name"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newBranchName.trim()) checkout(newBranchName.trim(), true);
                  if (e.key === 'Escape') { setCreatingBranch(false); setNewBranchName(''); }
                }}
              />
              <button
                className="header__btn"
                onClick={() => newBranchName.trim() && checkout(newBranchName.trim(), true)}
                disabled={busy || !newBranchName.trim()}
              >
                create
              </button>
            </div>
          ) : (
            <button className="git-branch__new" onClick={() => setCreatingBranch(true)}>
              + new branch
            </button>
          )}
        </div>
      )}

      <div className="git-panel__actions">
        <button className="header__btn" onClick={pull} disabled={busy || data.behind === 0}>
          pull
        </button>
        <button className="header__btn" onClick={push} disabled={busy || data.ahead === 0}>
          push
        </button>
        <button
          className={`header__btn ${prOpen ? 'header__btn--active' : ''}`}
          onClick={() => setPrOpen((v) => !v)}
          disabled={busy}
          title="review a GitHub PR"
        >
          review PR
        </button>
      </div>

      {prOpen && (
        <div className="git-panel__pr">
          <input
            className="field__input field__input--mono"
            placeholder="PR url or #number"
            value={prInput}
            onChange={(e) => setPrInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') reviewPr();
              if (e.key === 'Escape') { setPrOpen(false); setPrInput(''); }
            }}
            autoFocus
          />
          <button
            className="composer__send"
            onClick={reviewPr}
            disabled={busy || !prInput.trim()}
          >
            review
          </button>
        </div>
      )}

      {opError && <div className="git-panel__error">{opError}</div>}
      {opOutput && (
        <div className="git-panel__op">
          <div className="git-panel__op-head">
            <span>{opOutput.label}</span>
            <button className="git-panel__op-close" onClick={() => setOpOutput(null)} title="dismiss">✕</button>
          </div>
          <pre className="git-panel__op-text">{opOutput.text}</pre>
        </div>
      )}

      <div className="git-panel__list">
        {stagedFiles.length > 0 && (
          <>
            <div className="git-panel__section">
              <span>staged ({stagedFiles.length})</span>
              <button className="git-panel__bulk" onClick={unstageAll} disabled={busy}>
                unstage all
              </button>
            </div>
            {stagedFiles.map((f) => (
              <FileRow
                key={`staged-${f.path}`}
                f={f}
                staged
                onClick={() => setActiveFile(`diff://staged:${f.path}`)}
                onAction={() => unstage(f.path)}
                onDiscard={null}
                busy={busy}
                confirming={false}
                onRequestDiscard={() => {}}
                onCancelDiscard={() => {}}
              />
            ))}
          </>
        )}
        {unstagedFiles.length > 0 && (
          <>
            <div className="git-panel__section">
              <span>changes ({unstagedFiles.length})</span>
              <button className="git-panel__bulk" onClick={stageAll} disabled={busy}>
                stage all
              </button>
            </div>
            {unstagedFiles.map((f) => (
              <FileRow
                key={`workdir-${f.path}`}
                f={f}
                staged={false}
                onClick={() =>
                  f.workdir === '?' ? setActiveFile(f.path) : setActiveFile(`diff://workdir:${f.path}`)
                }
                onAction={() => stage(f.path)}
                onDiscard={() => discard(f.path, f.workdir === '?')}
                busy={busy}
                confirming={confirmDiscard === f.path}
                onRequestDiscard={() => setConfirmDiscard(f.path)}
                onCancelDiscard={() => setConfirmDiscard(null)}
              />
            ))}
          </>
        )}
        {data.files.length === 0 && (
          <div className="git-panel__clean">working tree clean</div>
        )}

        <div className="git-panel__stash">
          <button
            className="git-panel__history-toggle"
            onClick={() => setStashOpen((v) => !v)}
          >
            <span>{stashOpen ? '▾' : '▸'} stash ({stashes.length})</span>
          </button>
          {stashOpen && (
            <div className="git-stash">
              <div className="git-stash__save">
                <input
                  className="field__input field__input--mono"
                  placeholder="optional message"
                  value={stashMsg}
                  onChange={(e) => setStashMsg(e.target.value)}
                />
                <button
                  className="header__btn"
                  onClick={stashSave}
                  disabled={busy || data.files.length === 0}
                  title={data.files.length === 0 ? 'nothing to stash' : 'stash current changes'}
                >
                  stash
                </button>
              </div>
              {stashes.length === 0 && (
                <div className="git-stash__empty">no stash entries</div>
              )}
              {stashes.map((s) => (
                <div className="git-stash__row" key={s.ref}>
                  <span className="git-stash__ref">{s.ref}</span>
                  <span className="git-stash__msg" title={s.message}>{s.message}</span>
                  <button
                    className="git-stash__act"
                    onClick={() => stashPop(s.ref)}
                    disabled={busy}
                    title="pop (apply + drop)"
                  >
                    pop
                  </button>
                  <button
                    className="git-stash__act git-stash__act--danger"
                    onClick={() => stashDrop(s.ref)}
                    disabled={busy}
                    title="drop (delete)"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {commits.length > 0 && (
          <div className="git-panel__history">
            <button
              className="git-panel__history-toggle"
              onClick={() => setHistoryOpen((v) => !v)}
            >
              <span>{historyOpen ? '▾' : '▸'} history ({commits.length})</span>
            </button>
            {historyOpen && (
              <div className="git-panel__commits">
                {commits.map((c) => (
                  <button
                    className="git-commit"
                    key={c.hash}
                    title={`${c.hash}\n${c.author} · ${c.date}`}
                    onClick={() => setActiveFile(`diff://commit:${c.hash}`)}
                  >
                    <div className="git-commit__head">
                      <span className="git-commit__abbrev">{c.abbrev}</span>
                      <span className="git-commit__date">{c.date}</span>
                    </div>
                    <div className="git-commit__subject">{c.subject}</div>
                    <div className="git-commit__author">{c.author}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {stagedFiles.length > 0 && (
        <div className="git-panel__commit">
          <textarea
            className="field__textarea"
            rows={2}
            value={commitMsg}
            placeholder="commit message"
            onChange={(e) => setCommitMsg(e.target.value)}
          />
          <button
            className="composer__send"
            onClick={commit}
            disabled={busy || !commitMsg.trim()}
          >
            commit
          </button>
        </div>
      )}
    </div>
  );
}

function FileRow({
  f, staged, onClick, onAction, onDiscard, busy, confirming, onRequestDiscard, onCancelDiscard,
}: {
  f: GitFileStatus;
  staged: boolean;
  onClick: () => void;
  onAction: () => void;
  /** null = staged file (no discard available); altrimenti il discard handler */
  onDiscard: (() => void) | null;
  busy: boolean;
  confirming: boolean;
  onRequestDiscard: () => void;
  onCancelDiscard: () => void;
}) {
  const code = staged ? f.staged : f.workdir;
  const label = code ?? '·';
  if (confirming && onDiscard) {
    return (
      <div className="git-row git-row--confirm">
        <span className="git-row__confirm-text">discard {f.path}?</span>
        <div className="git-row__confirm-actions">
          <button className="header__btn" onClick={onCancelDiscard}>cancel</button>
          <button className="header__btn header__btn--danger" onClick={onDiscard} disabled={busy}>
            discard
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="git-row">
      <button className="git-row__select" onClick={onClick} title={f.path}>
        <span className={`git-row__code git-row__code--${label}`}>{label}</span>
        <span className="git-row__path">{f.path}</span>
      </button>
      {onDiscard && (
        <button
          className="git-row__action git-row__action--discard"
          onClick={onRequestDiscard}
          disabled={busy}
          title="discard changes"
        >
          ⌫
        </button>
      )}
      <button
        className="git-row__action"
        onClick={onAction}
        disabled={busy}
        title={staged ? 'unstage' : 'stage'}
      >
        {staged ? '−' : '+'}
      </button>
    </div>
  );
}
