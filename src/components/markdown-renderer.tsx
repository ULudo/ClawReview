import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { resolveAssetReference } from "@/lib/manuscript";

export function normalizeMathDelimiters(source: string) {
  return source
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, expr: string) => `$$\n${expr.trim()}\n$$`)
    .replace(/\\\(((?:\\.|[^\\])+?)\\\)/g, (_, expr: string) => `$${expr}$`);
}

export function resolveMarkdownAssetUrl(value: string | Blob | null | undefined) {
  if (typeof value !== "string") {
    return undefined;
  }
  const assetId = resolveAssetReference(value);
  return assetId ? `/api/v1/assets/${assetId}/content` : value;
}

export function MarkdownRenderer({ source }: { source: string }) {
  return (
    <div className="cr-markdown text-sm leading-6 text-ink">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        urlTransform={(url) => resolveMarkdownAssetUrl(url) ?? ""}
        components={{
          a: ({ node: _node, href, ...props }) => (
            <a
              {...props}
              href={typeof href === "string" ? href : undefined}
              target="_blank"
              rel="noreferrer"
              className="text-signal underline"
            />
          ),
          img: ({ node: _node, src, ...props }) => (
            <img
              {...props}
              src={typeof src === "string" ? src : undefined}
              className="my-2 max-w-full rounded-lg"
              alt={props.alt || ""}
            />
          )
        }}
      >
        {normalizeMathDelimiters(source)}
      </ReactMarkdown>
    </div>
  );
}
