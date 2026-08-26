import { Fragment, type ReactNode } from "react";

export type MarkdownBlock =
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] };

const unorderedItem = /^[-+*]\s+(.+)$/;
const orderedItem = /^\d+[.)]\s+(.+)$/;
const heading = /^(#{2,4})\s+(.+)$/;

export function parseControlledMarkdown(markdown: string): MarkdownBlock[] {
  const lines = markdown.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  for (let index = 0; index < lines.length;) {
    if (!lines[index].trim()) { index += 1; continue; }
    const headingMatch = lines[index].match(heading);
    if (headingMatch) { blocks.push({ type: "heading", level: headingMatch[1].length as 2 | 3 | 4, text: headingMatch[2] }); index += 1; continue; }
    if (unorderedItem.test(lines[index])) {
      const items: string[] = [];
      while (index < lines.length) { const match = lines[index].match(unorderedItem); if (!match) break; items.push(match[1]); index += 1; }
      blocks.push({ type: "unordered-list", items }); continue;
    }
    if (orderedItem.test(lines[index])) {
      const items: string[] = [];
      while (index < lines.length) { const match = lines[index].match(orderedItem); if (!match) break; items.push(match[1]); index += 1; }
      blocks.push({ type: "ordered-list", items }); continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !heading.test(lines[index]) && !unorderedItem.test(lines[index]) && !orderedItem.test(lines[index])) { paragraph.push(lines[index]); index += 1; }
    blocks.push({ type: "paragraph", lines: paragraph });
  }
  return blocks;
}

function renderInline(value: string): ReactNode[] {
  return value.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g).filter(Boolean).map((token, index) => {
    if (token.startsWith("`") && token.endsWith("`")) return <code key={index} className="rounded bg-slate-200/70 px-1 py-0.5 font-mono text-[0.9em] text-slate-800">{token.slice(1, -1)}</code>;
    if (token.startsWith("**") && token.endsWith("**")) return <strong key={index} className="font-semibold text-slate-900">{token.slice(2, -2)}</strong>;
    if (token.startsWith("*") && token.endsWith("*")) return <em key={index}>{token.slice(1, -1)}</em>;
    return <Fragment key={index}>{token}</Fragment>;
  });
}

export function AssistantMarkdown({ content }: { content: string }) {
  return <div className="space-y-3">{parseControlledMarkdown(content).map((block, index) => {
    if (block.type === "heading") return block.level === 2
      ? <h2 key={index} className="text-base font-semibold text-slate-950">{renderInline(block.text)}</h2>
      : block.level === 3
        ? <h3 key={index} className="text-sm font-semibold uppercase tracking-wide text-slate-900">{renderInline(block.text)}</h3>
        : <h4 key={index} className="text-sm font-semibold text-slate-900">{renderInline(block.text)}</h4>;
    if (block.type === "unordered-list") return <ul key={index} className="list-disc space-y-1 pl-5 marker:text-slate-400">{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}</ul>;
    if (block.type === "ordered-list") return <ol key={index} className="list-decimal space-y-1 pl-5 marker:font-medium marker:text-slate-500">{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}</ol>;
    return <p key={index}>{block.lines.map((line, lineIndex) => <Fragment key={lineIndex}>{lineIndex > 0 && <br />}{renderInline(line)}</Fragment>)}</p>;
  })}</div>;
}

export function MessageContent({ role, content }: { role: "user" | "assistant"; content: string }) {
  return role === "assistant" ? <AssistantMarkdown content={content} /> : <p className="whitespace-pre-wrap">{content}</p>;
}
