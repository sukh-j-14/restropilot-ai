import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistantMarkdown, MessageContent } from "../assistant-markdown";

test("assistant bold text renders as strong content", () => {
  const html = renderToStaticMarkup(<AssistantMarkdown content="**Revenue today:** ₹700" />);
  assert.match(html, /<strong[^>]*>Revenue today:<\/strong> ₹700/);
});

test("assistant bullet lists render as unordered lists", () => {
  const html = renderToStaticMarkup(<AssistantMarkdown content={"- Check paneer\n- Review chicken"} />);
  assert.match(html, /<ul[^>]*>/); assert.equal((html.match(/<li>/g) ?? []).length, 2);
});

test("assistant numbered lists render as ordered lists", () => {
  const html = renderToStaticMarkup(<AssistantMarkdown content={"1. Review sales\n2. Check reservations"} />);
  assert.match(html, /<ol[^>]*>/); assert.equal((html.match(/<li>/g) ?? []).length, 2);
});

test("raw HTML remains escaped text", () => {
  const html = renderToStaticMarkup(<AssistantMarkdown content={'<img src=x onerror="alert(1)">'} />);
  assert.doesNotMatch(html, /<img/i);
  assert.match(html, /&lt;img/);
});

test("user messages remain plain text", () => {
  const html = renderToStaticMarkup(<MessageContent role="user" content="**do not format me**" />);
  assert.doesNotMatch(html, /<strong/); assert.match(html, /\*\*do not format me\*\*/);
});
