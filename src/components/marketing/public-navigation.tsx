"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { ThemeControl } from "@/components/theme-control";

const links = [{ label: "Product", href: "#product" }, { label: "How it works", href: "#how-it-works" }, { label: "Features", href: "#features" }, { label: "Pricing", href: "#pricing" }, { label: "Contact", href: "#contact" }];

export function PublicNavigation({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    function escape(event: KeyboardEvent) { if (event.key === "Escape") { setOpen(false); buttonRef.current?.focus(); } }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, []);
  useEffect(() => { if (open) menuRef.current?.querySelector<HTMLAnchorElement>("a")?.focus(); }, [open]);
  return <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
    <nav aria-label="Public navigation" className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 sm:px-8">
      <Link href="/" className="flex items-center gap-3" aria-label="RestroPilot AI home"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-white shadow-sm"><Icon name="sparkles" className="h-5 w-5" /></span><span><span className="block text-base font-bold tracking-tight text-slate-950">RestroPilot AI</span><span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Operations OS</span></span></Link>
      <div className="hidden items-center gap-7 lg:flex">{links.map((link) => <a key={link.href} href={link.href} className="text-sm font-semibold text-slate-600 transition hover:text-emerald-700">{link.label}</a>)}</div>
      <div className="hidden items-center gap-2 sm:flex"><ThemeControl compact /><Link href={signedIn ? "/overview" : "/sign-in"} className="rounded-full px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">{signedIn ? "Open dashboard" : "Sign in"}</Link>{!signedIn && <Link href="/sign-up" className="rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-800">Get started</Link>}</div>
      <div className="flex items-center gap-2 sm:hidden"><ThemeControl compact /><button ref={buttonRef} type="button" aria-label="Open navigation menu" aria-expanded={open} aria-controls="mobile-public-menu" onClick={() => setOpen((value) => !value)} className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700"><span aria-hidden>{open ? "×" : "☰"}</span></button></div>
    </nav>
    {open && <div ref={menuRef} id="mobile-public-menu" className="border-t border-slate-200 bg-white px-5 py-5 sm:hidden"><div className="mx-auto flex max-w-7xl flex-col gap-1">{links.map((link) => <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">{link.label}</a>)}<div className="mt-3 grid grid-cols-2 gap-2"><Link href={signedIn ? "/overview" : "/sign-in"} className="rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-bold text-slate-700">{signedIn ? "Dashboard" : "Sign in"}</Link>{!signedIn && <Link href="/sign-up" className="rounded-xl bg-emerald-700 px-4 py-3 text-center text-sm font-bold text-white">Get started</Link>}</div></div></div>}
  </header>;
}
