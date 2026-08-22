"use client";

import { useOrganization, useOrganizationList, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Icon } from "@/components/icons";
import { ThemeControl } from "@/components/theme-control";
import type { OperationalNotification } from "@/lib/header/notifications";
import { workspaceInitials, workspaceMenuState } from "@/lib/header/workspaces";

type OpenPopover = "workspace" | "attention" | null;

export function HeaderControls({ notifications, notificationDataUnavailable }: { notifications: OperationalNotification[]; notificationDataUnavailable: boolean }) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const workspaceButtonRef = useRef<HTMLButtonElement>(null);
  const attentionButtonRef = useRef<HTMLButtonElement>(null);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const attentionMenuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<OpenPopover>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const { organization } = useOrganization();
  const { isLoaded, setActive, userMemberships } = useOrganizationList({ userMemberships: { infinite: true, pageSize: 20 } });
  const workspaces = workspaceMenuState(organization?.id, (userMemberships.data ?? []).map((membership) => ({ id: membership.organization.id, name: membership.organization.name })));

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) { if (!rootRef.current?.contains(event.target as Node)) setOpen(null); }
    function closeOnEscape(event: globalThis.KeyboardEvent) { if (event.key === "Escape") setOpen((current) => { if (current === "workspace") workspaceButtonRef.current?.focus(); if (current === "attention") attentionButtonRef.current?.focus(); return null; }); }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOnOutsideClick); document.removeEventListener("keydown", closeOnEscape); };
  }, []);

  useEffect(() => {
    const menu = open === "workspace" ? workspaceMenuRef.current : open === "attention" ? attentionMenuRef.current : null;
    if (!menu) return;
    const frame = requestAnimationFrame(() => menu.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  function navigateMenu(event: ReactKeyboardEvent<HTMLElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'));
    if (!elements.length) return;
    event.preventDefault();
    const current = elements.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? elements.length - 1 : event.key === "ArrowDown" ? (current + 1 + elements.length) % elements.length : (current - 1 + elements.length) % elements.length;
    elements[next]?.focus();
  }

  async function switchWorkspace(id: string) {
    if (!setActive || id === organization?.id) { setOpen(null); return; }
    setWorkspaceError(null); setSwitchingId(id);
    try {
      await setActive({ organization: id });
      setOpen(null);
      router.replace("/overview");
      router.refresh();
    } catch { setWorkspaceError("Workspace could not be switched. Please try again."); }
    finally { setSwitchingId(null); }
  }

  return <div ref={rootRef} className="flex items-center gap-2 sm:gap-3">
    <div className="relative">
      <button ref={workspaceButtonRef} type="button" aria-label="Choose workspace" aria-haspopup="menu" aria-controls="workspace-menu" aria-expanded={open === "workspace"} onClick={() => setOpen((value) => value === "workspace" ? null : "workspace")} className="flex h-10 max-w-36 items-center gap-2 rounded-lg px-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 sm:max-w-52 sm:px-3">
        <span className="flex h-7 min-w-7 items-center justify-center rounded-md bg-slate-950 px-1 text-[10px] font-bold text-white">{workspaceInitials(organization?.name ?? "Workspace")}</span><span className="hidden truncate sm:block">{organization?.name ?? "Workspace"}</span><span aria-hidden className="text-slate-400">⌄</span>
      </button>
      {open === "workspace" && <div ref={workspaceMenuRef} id="workspace-menu" role="menu" aria-label="Restaurant workspaces" onKeyDown={navigateMenu} className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-100 px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active workspace</p><p className="mt-1 truncate text-sm font-semibold text-slate-900">{organization?.name ?? "Loading workspace…"}</p></div>
        <div className="max-h-72 overflow-y-auto p-2">{!isLoaded || userMemberships.isLoading ? <p className="px-3 py-4 text-sm text-slate-500">Loading workspaces…</p> : workspaces.length ? workspaces.map((workspace) => <button role="menuitem" key={workspace.id} disabled={switchingId !== null} onClick={() => switchWorkspace(workspace.id)} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"><span className="truncate font-medium">{workspace.name}</span><span className="ml-3 text-xs text-emerald-700">{switchingId === workspace.id ? "Switching…" : workspace.isActive ? "Current" : "Switch"}</span></button>) : <p className="px-3 py-4 text-sm text-slate-500">No organization workspaces are available.</p>}
        {userMemberships.hasNextPage && <button role="menuitem" disabled={userMemberships.isFetching} onClick={() => userMemberships.fetchNext()} className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-emerald-700 hover:bg-emerald-50">{userMemberships.isFetching ? "Loading…" : "Load more workspaces"}</button>}</div>
        {workspaceError && <p role="alert" className="border-t border-rose-100 bg-rose-50 px-4 py-3 text-xs text-rose-700">{workspaceError}</p>}
      </div>}
    </div>

    <div className="relative">
      <button ref={attentionButtonRef} type="button" aria-label={`Operational attention items${notifications.length ? `, ${notifications.length} available` : ""}`} aria-haspopup="menu" aria-controls="attention-menu" aria-expanded={open === "attention"} onClick={() => setOpen((value) => value === "attention" ? null : "attention")} className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"><Icon name="bell" className="h-[18px] w-[18px]" />{notifications.length > 0 && <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-white bg-amber-500 px-0.5 text-[8px] font-bold text-white">{notifications.length}</span>}</button>
      {open === "attention" && <div ref={attentionMenuRef} id="attention-menu" role="menu" aria-label="Operational attention items" onKeyDown={navigateMenu} className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"><div className="border-b border-slate-100 px-4 py-3"><p className="text-sm font-bold text-slate-900">Needs attention</p><p className="mt-0.5 text-xs text-slate-500">Live operational signals, not persistent unread messages.</p></div><div className="max-h-96 overflow-y-auto p-2">{notifications.length ? notifications.map((item) => <Link role="menuitem" href={item.href} key={item.key} onClick={() => setOpen(null)} className="block rounded-lg px-3 py-3 hover:bg-slate-50"><div className="flex gap-3"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.category === "inventory" ? "bg-rose-500" : item.category === "reservations" ? "bg-sky-500" : "bg-amber-500"}`} /><span><span className="block text-sm font-semibold text-slate-800">{item.title}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{item.detail}</span></span></div></Link>) : <div className="px-4 py-8 text-center"><p className="text-sm font-semibold text-slate-800">You’re all caught up.</p><p className="mt-1 text-xs text-slate-500">No actionable operational items right now.</p></div>}{notificationDataUnavailable && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Some operational signals could not be loaded.</p>}</div></div>}
    </div>
    <ThemeControl compact />
    <UserButton showName />
  </div>;
}
