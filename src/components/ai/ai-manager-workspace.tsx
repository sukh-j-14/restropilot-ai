"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
import { MessageContent } from "@/components/ai/assistant-markdown";
import { requestAIManager } from "@/lib/ai/actions";
import type { AIConversationMessage } from "@/lib/ai/types";

type DisplayMessage = AIConversationMessage & { toolsUsed?: string[]; error?: boolean };
const suggestions = ["What needs my attention today?", "How much revenue did we make yesterday?", "Which ingredients are low?", "What are my top-selling dishes this week?", "How busy is Friday looking?", "Do we have any open purchase orders?"];
const pendingActivities = ["Understanding your question...", "Selecting approved data checks...", "Checking restaurant operations...", "Analyzing results..."];

export function AIManagerWorkspace({ restaurantName }: { restaurantName: string }) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [activityIndex, setActivityIndex] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = sessionStorage.getItem("restropilot-ai-manager");
        if (saved) {
          const parsed: unknown = JSON.parse(saved);
          if (Array.isArray(parsed)) setMessages(parsed.filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string").slice(-20));
        }
      } catch { /* Ignore invalid browser state. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { try { sessionStorage.setItem("restropilot-ai-manager", JSON.stringify(messages.slice(-20))); } catch { /* Session storage may be unavailable. */ } }, [messages]);
  useEffect(() => { if (!pending) return; const timer = window.setInterval(() => setActivityIndex((index) => (index + 1) % pendingActivities.length), 1200); return () => window.clearInterval(timer); }, [pending]);

  function submit(event?: FormEvent, suggested?: string) {
    event?.preventDefault();
    const message = (suggested ?? text).trim();
    if (!message || pending) return;
    setActivityIndex(0);
    const history = messages.filter((item) => !item.error).map(({ role, content }) => ({ role, content })).slice(-10);
    const userMessage: DisplayMessage = { role: "user", content: message };
    setMessages((current) => [...current, userMessage].slice(-20));
    setText("");
    startTransition(async () => {
      const result = await requestAIManager({ message, history });
      const reply: DisplayMessage = result.success ? { role: "assistant", content: result.answer, toolsUsed: result.toolsUsed } : { role: "assistant", content: result.message, error: true };
      setMessages((current) => [...current, reply].slice(-20));
    });
  }

  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
    <section className="flex min-h-[650px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
      <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" /><h2 className="font-semibold text-slate-900">Operations briefing</h2></div><p className="mt-1 text-xs text-slate-500">Read-only analysis for {restaurantName}</p></div>{messages.length > 0 && <button type="button" disabled={pending} onClick={() => setMessages([])} className="text-xs font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-50">Clear session</button>}</header>
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">{messages.length === 0 ? <div className="mx-auto max-w-2xl py-10 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-xl text-emerald-700">✦</div><h3 className="mt-4 text-lg font-bold text-slate-900">Ask about restaurant performance</h3><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">AI Manager checks approved operational tools for factual answers. It can analyze and recommend, but cannot change restaurant data.</p><div className="mt-6 grid gap-2 sm:grid-cols-2">{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => submit(undefined, suggestion)} className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50">{suggestion}</button>)}</div></div> : <div className="space-y-5">{messages.map((message, index) => <article key={index} className={message.role === "user" ? "ml-auto max-w-2xl" : "mr-auto max-w-3xl"}><div className={`rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-slate-900 text-white" : message.error ? "border border-rose-100 bg-rose-50 text-rose-700" : "border border-slate-200 bg-slate-50 text-slate-700"}`}><MessageContent role={message.role} content={message.content} /></div>{message.toolsUsed?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{message.toolsUsed.map((tool) => <span key={tool} className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">{tool.replaceAll("_", " ")}</span>)}</div> : null}</article>)}{pending && <div className="mr-auto flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"><span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700" />{pendingActivities[activityIndex]}</div>}</div>}</div>
      <form onSubmit={submit} className="border-t border-slate-100 bg-slate-50/50 p-4"><div className="flex items-end gap-3 rounded-xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/10"><textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} maxLength={1500} rows={2} placeholder="Ask about sales, inventory, reservations, or purchase orders..." className="max-h-32 min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400" /><button disabled={pending || !text.trim()} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-40">Ask</button></div><div className="mt-2 flex justify-between text-[11px] text-slate-400"><span>Enter to send · Shift+Enter for a new line</span><span>{text.length}/1500</span></div></form>
    </section>
    <aside className="space-y-4"><section className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">V1 capabilities</p><ul className="mt-3 space-y-2 text-sm text-slate-600"><li>Sales and order analytics</li><li>Inventory and ingredient usage</li><li>Reservation demand</li><li>Purchase-order visibility</li></ul></section><section className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-bold text-amber-900">Read-only by design</p><p className="mt-1 text-xs leading-5 text-amber-800">AI Manager cannot modify inventory, orders, reservations, suppliers, menu items, or purchase orders. Recommendations always require staff action.</p></section><section className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Data boundary</p><p className="mt-2 text-xs leading-5 text-slate-500">Restaurant facts come only from approved tenant-scoped tools. No raw database, SQL, web, filesystem, or execution access is available.</p></section></aside>
  </div>;
}
