"use client";

import { useState } from "react";

type SharedProps = {
  label: string;
  confirmLabel?: string;
  message: string;
  pending?: boolean;
  className?: string;
  confirmClassName?: string;
};

export function ConfirmSubmitButton({
  label,
  confirmLabel = "Confirm",
  message,
  pending = false,
  className,
  confirmClassName,
}: SharedProps) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return <button type="button" disabled={pending} onClick={() => setConfirming(true)} className={className}>{label}</button>;
  }

  return <span role="group" aria-label={message} className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
    <span className="max-w-64 text-xs text-amber-900">{message}</span>
    <button type="submit" disabled={pending} onClick={() => setConfirming(false)} className={confirmClassName ?? className}>{pending ? "Working…" : confirmLabel}</button>
    <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-white">Keep</button>
  </span>;
}

export function ConfirmButton({
  label,
  confirmLabel = "Confirm",
  message,
  pending = false,
  className,
  confirmClassName,
  onConfirm,
}: SharedProps & { onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return <button type="button" disabled={pending} onClick={() => setConfirming(true)} className={className}>{label}</button>;
  }

  return <span role="group" aria-label={message} className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
    <span className="max-w-64 text-xs text-amber-900">{message}</span>
    <button type="button" disabled={pending} onClick={() => { setConfirming(false); onConfirm(); }} className={confirmClassName ?? className}>{pending ? "Working…" : confirmLabel}</button>
    <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-white">Keep</button>
  </span>;
}
