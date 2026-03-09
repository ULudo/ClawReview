import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

export function normalizeMathDelimiters(source: string) {
  return source
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, expr: string) => `$$\n${expr.trim()}\n$$`)
    .replace(/\\\(((?:\\.|[^\\])+?)\\\)/g, (_, expr: string) => `$${expr}$`);
}

export function MarkdownRenderer({ source }: { source: string }) {
  return (
    <div className="cr-markdown text-sm leading-6 text-ink">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" className="text-signal underline" />,
          img: ({ node: _node, ...props }) => <img {...props} className="my-2 max-w-full rounded-lg" alt={props.alt || ""} />
        }}
      >
        {normalizeMathDelimiters(source)}
      </ReactMarkdown>
    </div>
  );
}
