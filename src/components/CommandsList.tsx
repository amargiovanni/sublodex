import { useEffect, useState } from 'react';
import { COMMANDS, type Command } from '../lib/commands';
import { useStore } from '../lib/store';
import { useUI } from '../lib/ui';

export function CommandsList() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const isStreaming = useStore((s) => s.isStreaming);
  const model = useStore((s) => s.model);
  const permissionMode = useStore((s) => s.permissionMode);
  const pendingExpand = useUI((s) => s.pendingExpandCommand);
  const clearPending = useUI((s) => s.clearPendingExpand);

  // se la sidebar viene aperta da una rail icon, espandi quel comando
  useEffect(() => {
    if (pendingExpand) {
      setActiveId(pendingExpand);
      clearPending();
    }
  }, [pendingExpand, clearPending]);

  return (
    <div className="cmds">
      <div className="cmds__state">
        {model && <span className="cmds__chip" title="active model">{model.replace('claude-', '')}</span>}
        <span className="cmds__chip" title="permission mode">{permissionMode}</span>
      </div>
      <div className="cmds__list">
        {COMMANDS.map((cmd) => (
          <CommandRow
            key={cmd.id}
            cmd={cmd}
            expanded={activeId === cmd.id}
            disabled={isStreaming && cmd.id === 'ask'}
            onToggle={() => setActiveId((id) => (id === cmd.id ? null : cmd.id))}
            onLaunch={() => setActiveId(null)}
          />
        ))}
      </div>
    </div>
  );
}

function CommandRow({
  cmd, expanded, disabled, onToggle, onLaunch,
}: {
  cmd: Command;
  expanded: boolean;
  disabled: boolean;
  onToggle: () => void;
  onLaunch: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  const launch = async () => {
    if (disabled) return;
    const missing = (cmd.args ?? []).find((a) => a.required && !values[a.name]?.trim());
    if (missing) return;
    await cmd.run(values);
    setValues({});
    onLaunch();
  };

  const canLaunch = !disabled && (cmd.args ?? []).every((a) => !a.required || values[a.name]?.trim());

  return (
    <div className={`cmd ${expanded ? 'cmd--open' : ''}`}>
      <button className="cmd__head" onClick={onToggle}>
        <span className="cmd__glyph">{cmd.icon}</span>
        <span className="cmd__title">{cmd.name}</span>
        <span className="cmd__chev">{expanded ? '−' : '+'}</span>
        <div className="cmd__desc">{cmd.description}</div>
      </button>
      {expanded && (
        <div className="cmd__body">
          {(cmd.args ?? []).length === 0 && (
            <div className="cmd__empty">no parameters · press <kbd>run</kbd></div>
          )}
          {(cmd.args ?? []).map((arg) => (
            <label key={arg.name} className="cmd__field">
              <span className="cmd__label">
                {arg.label}{arg.required && <em> *</em>}
              </span>
              {arg.type === 'select' ? (
                <select
                  className="cmd__input"
                  value={values[arg.name] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [arg.name]: e.target.value }))}
                >
                  <option value="">— choose —</option>
                  {(arg.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : arg.multiline ? (
                <textarea
                  className="cmd__textarea"
                  rows={3}
                  placeholder={arg.placeholder}
                  value={values[arg.name] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [arg.name]: e.target.value }))}
                />
              ) : (
                <input
                  className="cmd__input"
                  type="text"
                  placeholder={arg.placeholder}
                  value={values[arg.name] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [arg.name]: e.target.value }))}
                />
              )}
            </label>
          ))}
          <div className="cmd__actions">
            <button className="cmd__launch" onClick={launch} disabled={!canLaunch}>
              run
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
