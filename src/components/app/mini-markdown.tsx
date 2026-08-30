"use client";

import React from "react";

/**
 * Tiny markdown renderer for AI answers: headings, bold, italic, unordered
 * lists and paragraphs. No HTML injection — everything is plain React text nodes.
 */
export function MiniMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];

  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`}>
          {list.map((li, i) => (
            <li key={i}>{inline(li)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      list.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }
    flush();
    if (/^#{1,6}\s/.test(line)) {
      blocks.push(<h3 key={blocks.length}>{inline(line.replace(/^#{1,6}\s/, ""))}</h3>);
    } else {
      blocks.push(<p key={blocks.length}>{inline(line)}</p>);
    }
  }
  flush();

  return <div className="prose-chat">{blocks}</div>;
}

function inline(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*|_([^_]+)_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(text))) {
    if (m.index > last) tokens.push(text.slice(last, m.index));
    if (m[2]) tokens.push(<strong key={key++}>{m[2]}</strong>);
    else if (m[3]) tokens.push(<em key={key++}>{m[3]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push(text.slice(last));
  return tokens;
}
