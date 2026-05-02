import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { okaidia } from 'react-syntax-highlighter/dist/esm/styles/prism';

export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // react-markdown v9: tutti i `code` passano da qui (sia inline che blocco).
          // Distinguiamo via className: `language-xxx` ⇒ blocco fenced.
          code({ className, children, ...rest }: any) {
            const match = /language-(\w+)/.exec(className ?? '');
            if (!match) {
              return <code className={className} {...rest}>{children}</code>;
            }
            const lang = match[1];
            const code = String(children).replace(/\n$/, '');
            return <CodeBlock language={lang} code={code} />;
          },
          // sopprimi il <pre> wrapper: il nostro CodeBlock lo fornisce già
          pre({ children }: any) {
            return <>{children}</>;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="md__codeblock">
      <div className="md__codeblock-head">
        <span className="md__codeblock-lang">{language}</span>
        <button className="md__codeblock-copy" onClick={copy}>
          {copied ? '✓ copied' : 'copy'}
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={okaidia}
        customStyle={{
          margin: 0,
          background: 'transparent',
          padding: '12px 14px',
          fontSize: 12.5,
        }}
        codeTagProps={{ style: { fontFamily: 'inherit' } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
