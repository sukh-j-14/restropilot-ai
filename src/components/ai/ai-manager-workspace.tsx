"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { AIActionRenderer } from "@/components/ai/ai-action-renderer";
import { ProposalStateProvider } from "@/components/ai/proposal-state-provider";
import { MessageContent } from "@/components/ai/assistant-markdown";
import { requestAIManager } from "@/lib/ai/actions";
import type { AIActionProposal } from "@/lib/ai/action-proposal-types";
import { getAIEvidenceLinks } from "@/lib/ai/evidence";
import { buildBrowserConversationHistory } from "@/lib/ai/history";
import { safeAssistantDisplayText } from "@/lib/ai/provider-protocol";
import type { AIConversationMessage } from "@/lib/ai/types";

type DisplayMessage = AIConversationMessage & { toolsUsed?: string[]; error?: boolean; clearHistory?: boolean; actionProposal?: AIActionProposal | null };
const suggestions = ["What needs my attention today?", "How much Paneer do we have?", "We received 15 kg onions", "Show me the recipe for Paneer Tikka", "Set Paneer's reorder level to 10 kg", "Do we have any open purchase orders?"];
const pendingActivities = ["Understanding your question...", "Selecting approved data checks...", "Checking restaurant operations...", "Analyzing results..."];

export function AIManagerWorkspace({ restaurantName, currency = "INR" }: { restaurantName: string; currency?: string }) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [activityIndex, setActivityIndex] = useState(0);
  useEffect(() => { const timer = window.setTimeout(() => { try { const saved = sessionStorage.getItem("restropilot-ai-manager"); if (saved) { const parsed: unknown = JSON.parse(saved); if (Array.isArray(parsed)) setMessages(parsed.filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string").slice(-20)); } } catch {} }, 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => { try { sessionStorage.setItem("restropilot-ai-manager", JSON.stringify(buildBrowserConversationHistory(messages))); } catch {} }, [messages]);
  useEffect(() => { if (!pending) return; const timer = window.setInterval(() => setActivityIndex((index) => (index + 1) % pendingActivities.length), 1200); return () => window.clearInterval(timer); }, [pending]);

  function submit(event?: FormEvent, suggested?: string) {
    event?.preventDefault(); const message = (suggested ?? text).trim(); if (!message || pending) return;
    setActivityIndex(0); const history = buildBrowserConversationHistory(messages); const userMessage: DisplayMessage = { role: "user", content: message };
    setMessages((current) => [...current, userMessage].slice(-20)); setText("");
    startTransition(async () => { const result = await requestAIManager({ message, history }); const reply: DisplayMessage = result.success ? { role: "assistant", content: result.answer, toolsUsed: result.toolsUsed, actionProposal: result.actionProposal } : { role: "assistant", content: result.message, error: true, clearHistory: result.clearHistory }; setMessages((current) => [...current, reply].slice(-20)); });
  }

  const proposals = useMemo(() => messages.flatMap((message) => message.actionProposal ? [message.actionProposal] : []), [messages]);
  return <ProposalStateProvider proposals={proposals}><div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
    <section className="flex min-h-[650px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
      <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" /><h2 className="font-semibold">Operations briefing</h2></div><p className="mt-1 text-xs text-slate-500">Controlled analysis for {restaurantName}</p></div>{messages.length > 0 && <button disabled={pending} onClick={() => setMessages([])} className="text-xs font-semibold text-slate-500">Clear session</button>}</header>
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">{messages.length === 0 ? <EmptyState onSuggestion={(suggestion) => submit(undefined, suggestion)} /> : <div className="space-y-5">{messages.map((message, index) => <Message key={index} message={message} currency={currency} clear={() => setMessages([])} />)}{pending && <div className="mr-auto flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"><span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700" />{pendingActivities[activityIndex]}</div>}</div>}</div>
      <form onSubmit={submit} className="border-t border-slate-100 bg-slate-50/50 p-4"><div className="flex items-end gap-3 rounded-xl border border-slate-200 bg-white p-2"><textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} maxLength={1500} rows={2} placeholder="Ask about operations or propose a controlled change..." className="min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none" /><button disabled={pending || !text.trim()} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">Ask</button></div></form>
    </section>
    <aside className="space-y-4"><section className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Capabilities</p><ul className="mt-3 space-y-2 text-sm text-slate-600"><li>Sales and order analytics</li><li>Menu and recipe proposals</li><li>Inventory insights and adjustments</li><li>Reservation demand</li><li>Purchase-order visibility and drafts</li></ul></section><section className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-bold text-amber-900">Human approval required</p><p className="mt-1 text-xs leading-5 text-amber-800">AI can only propose controlled changes. Authorized staff must approve before any database mutation occurs.</p></section></aside>
  </div></ProposalStateProvider>;
}

function EmptyState({ onSuggestion }: { onSuggestion: (suggestion: string) => void }) { return <div className="mx-auto max-w-2xl py-10 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-xl text-emerald-700">✦</div><h3 className="mt-4 text-lg font-bold">Ask about restaurant operations</h3><p className="mt-2 text-sm leading-6 text-slate-500">AI Manager uses approved read tools. Every controlled change requires explicit human approval.</p><div className="mt-6 grid gap-2 sm:grid-cols-2">{suggestions.map((suggestion) => <button key={suggestion} onClick={() => onSuggestion(suggestion)} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-medium hover:bg-emerald-50">{suggestion}</button>)}</div></div>; }

function Message({ message, currency, clear }: { message: DisplayMessage; currency: string; clear: () => void }) {
  const evidence = getAIEvidenceLinks(message.toolsUsed ?? []);
  const content = message.role === "assistant" ? safeAssistantDisplayText(message.content) : message.content;
  return <article className={message.role === "user" ? "ml-auto max-w-2xl" : "mr-auto max-w-3xl"}><div className={`rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-slate-900 text-white" : message.error ? "border border-rose-100 bg-rose-50 text-rose-700" : "border border-slate-200 bg-slate-50 text-slate-700"}`}><MessageContent role={message.role} content={content} /></div>{message.clearHistory && <button onClick={clear} className="mt-2 text-xs font-semibold text-rose-700 underline">Clear conversation and retry</button>}{evidence.length ? <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Restaurant data checked">{evidence.map((item) => <Link key={item.href} href={item.href} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800 transition hover:border-emerald-400 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">Checked: {item.label}<span aria-hidden="true"> →</span></Link>)}</div> : null}{message.actionProposal && <AIActionRenderer proposal={message.actionProposal} currency={currency} />}</article>;
}
