import type { UIMessage } from '../lib/types';
import { Markdown } from './Markdown';
import { ToolCall } from './ToolCall';
import { UsageCard } from './UsageCard';

export function Message({ message }: { message: UIMessage }) {
  if (message.role === 'system') {
    return (
      <div className="msg msg--system">
        <div className="msg__role">system</div>
        <div className="msg__body">
          {message.blocks.map((block, i) => {
            if (block.kind === 'text') {
              return <pre key={i} className="msg__system-text">{block.text}</pre>;
            }
            if (block.kind === 'usage') {
              return <UsageCard key={i} data={block.data} />;
            }
            return null;
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={`msg msg--${message.role}`}>
      <div className="msg__role">{message.role === 'user' ? 'you' : 'claude'}</div>
      <div className="msg__body">
        {message.blocks.map((block, i) => {
          if (block.kind === 'text') {
            return message.role === 'user' ? (
              <div key={i} className="msg__user-text">{block.text}</div>
            ) : (
              <Markdown key={i}>{block.text}</Markdown>
            );
          }
          if (block.kind === 'tool') {
            return <ToolCall key={block.id} block={block} />;
          }
          return null;
        })}
      </div>
    </div>
  );
}
