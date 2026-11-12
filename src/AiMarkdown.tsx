import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";

/** An answer as Markdown. Mermaid ER code blocks get a button that replaces the schema with them. */
export const AiMarkdown = memo(function AiMarkdown({ text, onApply, streaming }: { text: string; onApply: (mermaid: string) => void; streaming: boolean }) {
  return <ReactMarkdown remarkPlugins={[remarkBreaks]} skipHtml components={{
    a: ({ href, children }) => <a href={href} onClick={(event) => {
      event.preventDefault();
      if (href) void (window.vdooDesktop?.openLink(href) ?? window.open(href, "_blank", "noopener"));
    }}>{children}</a>,
    pre: ({ children }) => <>{children}</>,
    code: ({ className, children }) => {
      const source = String(children ?? "").replace(/\n$/, "");
      const block = /language-/.test(className ?? "") || source.includes("\n");
      if (!block) return <code>{children}</code>;
      const er = /language-mermaid/.test(className ?? "") && /^\s*(---[\s\S]*?---\s*)?erDiagram\b/.test(source);
      return <div className="code-block">
        <pre><code className={className}>{source}</code></pre>
        {er && !streaming && <div className="code-actions">
          <button className="btn primary small" onClick={() => onApply(source)}>Apply to diagram</button>
          <button className="link small" onClick={() => void navigator.clipboard.writeText(source)}>Copy</button>
        </div>}
      </div>;
    },
  }}>{text}</ReactMarkdown>;
});
