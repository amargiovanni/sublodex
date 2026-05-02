import type { UIMessage } from './types';

/** Serializza una conversazione in markdown leggibile. Tool calls espanse
 *  con input + risultato, text blocks come paragrafi. */
export function conversationToMarkdown(messages: UIMessage[], projectName?: string): string {
  const lines: string[] = [];
  lines.push(`# Conversation${projectName ? ` — ${projectName}` : ''}`);
  lines.push('');
  lines.push(`_exported ${new Date().toISOString()}_`);
  lines.push('');
  lines.push('---');

  for (const m of messages) {
    lines.push('');
    lines.push(`## ${roleLabel(m.role)}`);
    lines.push('');
    for (const b of m.blocks) {
      if (b.kind === 'text') {
        lines.push(b.text);
        lines.push('');
      } else if (b.kind === 'tool') {
        lines.push(`**🔧 ${b.name}** \`${b.id.slice(-8)}\``);
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(b.input, null, 2));
        lines.push('```');
        if (b.result) {
          lines.push('');
          lines.push(b.result.isError ? '_error:_' : '_result:_');
          lines.push('```');
          lines.push(truncate(b.result.content, 4000));
          lines.push('```');
        } else if (b.pending) {
          lines.push('_pending…_');
        }
        lines.push('');
      } else if (b.kind === 'usage') {
        lines.push(`**plan usage**: ${b.data.status}`);
        lines.push('');
      }
    }
    lines.push('---');
  }
  return lines.join('\n');
}

function roleLabel(r: UIMessage['role']): string {
  if (r === 'user') return '👤 user';
  if (r === 'assistant') return '🤖 assistant';
  return '⚙ system';
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n... [truncated ${s.length - max} chars]`;
}

/** Trigga il download nel browser/webview Tauri di un file markdown. */
export function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
