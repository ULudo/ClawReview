import type { ReactNode } from "react";

export function MarkdownRenderer({ source }: { source: string }) {
  return <div className="cr-markdown text-sm leading-6 text-ink">{renderMarkdown(source)}</div>;
}

function renderMarkdown(source: string): ReactNode[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      nodes.push(
        <pre key={`code-${key++}`}>
          <code data-lang={lang || undefined}>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      const level = trimmed.match(/^#+/)?.[0].length ?? 1;
      const text = trimmed.replace(/^#{1,6}\s+/, "");
      const headingTags = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;
      const tag = headingTags[Math.min(level, 6) - 1];
      nodes.push(createHeading(tag, parseInline(text), key++));
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      nodes.push(<hr key={`hr-${key++}`} className="my-4 border-black/10" />);
      i += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = [];
      while (i < lines.length) {
        const q = lines[i].trim();
        if (!q.startsWith(">")) break;
        quoteLines.push(q.replace(/^>\s?/, ""));
        i += 1;
      }
      nodes.push(
        <blockquote key={`q-${key++}`}>
          {quoteLines.map((qLine, idx) => (
            <p key={idx}>{parseInline(qLine)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    if (/^([-*])\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^([-*])\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i += 1;
      }
      nodes.push(
        <ul key={`ul-${key++}`}>
          {items.map((item, idx) => (
            <li key={idx}>{parseInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      nodes.push(
        <ol key={`ol-${key++}`}>
          {items.map((item, idx) => (
            <li key={idx}>{parseInline(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    const paragraphLines: string[] = [line];
    i += 1;
    while (i < lines.length) {
      const next = lines[i];
      const nextTrimmed = next.trim();
      if (
        !nextTrimmed ||
        nextTrimmed.startsWith("```") ||
        /^#{1,6}\s+/.test(nextTrimmed) ||
        /^>\s?/.test(nextTrimmed) ||
        /^([-*])\s+/.test(nextTrimmed) ||
        /^\d+\.\s+/.test(nextTrimmed) ||
        /^(-{3,}|\*{3,}|_{3,})$/.test(nextTrimmed)
      ) {
        break;
      }
      paragraphLines.push(next);
      i += 1;
    }

    nodes.push(<p key={`p-${key++}`}>{parseInline(paragraphLines.join(" "))}</p>);
  }

  return nodes;
}

function createHeading(tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6", children: ReactNode[], key: number) {
  switch (tag) {
    case "h1":
      return <h1 key={`h-${key}`}>{children}</h1>;
    case "h2":
      return <h2 key={`h-${key}`}>{children}</h2>;
    case "h3":
      return <h3 key={`h-${key}`}>{children}</h3>;
    case "h4":
      return <h4 key={`h-${key}`}>{children}</h4>;
    case "h5":
      return <h5 key={`h-${key}`}>{children}</h5>;
    case "h6":
      return <h6 key={`h-${key}`}>{children}</h6>;
  }
}

function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length) {
    const imageMatch = remaining.match(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/);
    const linkMatch = remaining.match(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/);
    const codeMatch = remaining.match(/`([^`]+)`/);
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);

    const candidates = [imageMatch, linkMatch, codeMatch, boldMatch]
      .filter((m): m is RegExpMatchArray => Boolean(m))
      .map((m) => ({ match: m, index: m.index ?? 0 }));

    if (!candidates.length) {
      nodes.push(remaining);
      break;
    }

    candidates.sort((a, b) => a.index - b.index);
    const { match, index } = candidates[0];
    if (index > 0) {
      nodes.push(remaining.slice(0, index));
    }

    const matched = match[0];
    if (matched.startsWith("![")) {
      nodes.push(
        <img
          key={`img-${key++}`}
          src={match[2]}
          alt={match[1] || ""}
          className="my-2"
        />
      );
    } else if (matched.startsWith("[")) {
      nodes.push(
        <a key={`a-${key++}`} href={match[2]} target="_blank" rel="noreferrer" className="text-signal underline">
          {match[1]}
        </a>
      );
    } else if (matched.startsWith("`")) {
      nodes.push(<code key={`c-${key++}`}>{match[1]}</code>);
    } else if (matched.startsWith("**")) {
      nodes.push(<strong key={`b-${key++}`}>{match[1]}</strong>);
    }

    remaining = remaining.slice(index + matched.length);
  }

  return nodes;
}
