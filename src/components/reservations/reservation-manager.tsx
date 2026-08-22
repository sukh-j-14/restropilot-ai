"use client";

import { useActionState, useMemo, useState } from "react";
import { ConfirmSubmitButton } from "@/components/ui/confirm-action";
import { createReservationAction, transitionReservationAction, updateReservationAction, type ReservationActionState } from "@/lib/reservations/actions";
import { canEditReservation, nextReservationStatuses, RESERVATION_STATUSES, type ReservationStatusValue } from "@/lib/reservations/policy";

export type ReservationView = {
  id: string;
  customerName: string;
  guestCount: number;
  reservationTime: string;
  status: ReservationStatusValue;
  tableNumber: string | null;
};

const initialState: ReservationActionState = { status: "idle" };
const inputClass = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/10";
const statusStyle: Record<ReservationStatusValue, string> = {
  PENDING: "bg-amber-50 text-amber-700", CONFIRMED: "bg-blue-50 text-blue-700", SEATED: "bg-violet-50 text-violet-700",
  COMPLETED: "bg-emerald-50 text-emerald-700", CANCELLED: "bg-slate-100 text-slate-500", NO_SHOW: "bg-rose-50 text-rose-700",
};

function Feedback({ state }: { state: ReservationActionState }) {
  if (state.status === "idle" || !state.message) return null;
  return <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-xs ${state.status === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{state.message}</p>;
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-xs text-rose-600">{message}</p> : null;
}

function localInputValue(iso: string, timezone: string) {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function ReservationFields({ reservation, timezone, errors }: { reservation?: ReservationView; timezone: string; errors?: Record<string, string> }) {
  return <>
    <div><label className="text-xs font-semibold text-slate-600">Guest name</label><input name="customerName" required maxLength={120} defaultValue={reservation?.customerName} className={inputClass} /><FieldError message={errors?.customerName} /></div>
    <div><label className="text-xs font-semibold text-slate-600">Guests</label><input name="guestCount" required type="number" min="1" max="500" defaultValue={reservation?.guestCount ?? 2} className={inputClass} /><FieldError message={errors?.guestCount} /></div>
    <div><label className="text-xs font-semibold text-slate-600">Date and time</label><input name="reservationTime" required type="datetime-local" defaultValue={reservation ? localInputValue(reservation.reservationTime, timezone) : undefined} className={inputClass} /><FieldError message={errors?.reservationTime} /></div>
    <div><label className="text-xs font-semibold text-slate-600">Table (optional)</label><input name="tableNumber" maxLength={40} defaultValue={reservation?.tableNumber ?? ""} placeholder="T-12" className={inputClass} /><FieldError message={errors?.tableNumber} /></div>
  </>;
}

function StatusAction({ reservationId, status }: { reservationId: string; status: ReservationStatusValue }) {
  const [state, action, pending] = useActionState(transitionReservationAction, initialState);
  const destructive = status === "CANCELLED" || status === "NO_SHOW";
  const label: Record<ReservationStatusValue, string> = { PENDING: "Pending", CONFIRMED: "Confirm", SEATED: "Seat guests", COMPLETED: "Complete", CANCELLED: "Cancel", NO_SHOW: "Mark no-show" };
  const buttonClass = `rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${destructive ? "border-rose-200 text-rose-600 hover:bg-rose-50" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`;
  return <form action={action}><input type="hidden" name="reservationId" value={reservationId} /><input type="hidden" name="status" value={status} />{destructive ? <ConfirmSubmitButton pending={pending} label={label[status]} confirmLabel={label[status]} message={`${label[status]} this reservation?`} className={buttonClass} /> : <button disabled={pending} className={buttonClass}>{pending ? "Updating…" : label[status]}</button>}<Feedback state={state} /></form>;
}

function ReservationCard({ reservation, timezone }: { reservation: ReservationView; timezone: string }) {
  const [state, action, pending] = useActionState(updateReservationAction, initialState);
  const date = new Intl.DateTimeFormat("en-IN", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(reservation.reservationTime));
  const transitions = nextReservationStatuses(reservation.status);
  return <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">{reservation.customerName}</h3><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusStyle[reservation.status]}`}>{reservation.status.replaceAll("_", " ")}</span></div><p className="mt-2 text-sm font-medium text-slate-700">{date}</p><p className="mt-1 text-xs text-slate-500">{reservation.guestCount} {reservation.guestCount === 1 ? "guest" : "guests"}{reservation.tableNumber ? ` · Table ${reservation.tableNumber}` : " · Table not assigned"}</p></div><div className="flex flex-wrap gap-2">{transitions.map((status) => <StatusAction key={status} reservationId={reservation.id} status={status} />)}</div></div>
    {canEditReservation(reservation.status) && <details className="mt-4 border-t border-slate-100 pt-4"><summary className="cursor-pointer text-xs font-bold text-emerald-700">Edit reservation</summary><form action={action} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><input type="hidden" name="reservationId" value={reservation.id} /><ReservationFields reservation={reservation} timezone={timezone} errors={state.fieldErrors} /><div className="sm:col-span-2 xl:col-span-4"><button disabled={pending} className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{pending ? "Saving…" : "Save changes"}</button><Feedback state={state} /></div></form></details>}
  </article>;
}

function ReservationSection({ title, description, items, timezone }: { title: string; description: string; items: ReservationView[]; timezone: string }) {
  return <section><div><h2 className="text-base font-bold text-slate-900">{title}</h2><p className="mt-1 text-xs text-slate-500">{description}</p></div>{items.length ? <div className="mt-4 grid gap-4 xl:grid-cols-2">{items.map((item) => <ReservationCard key={item.id} reservation={item} timezone={timezone} />)}</div> : <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center"><h3 className="font-semibold text-slate-800">No reservations here</h3><p className="mt-1 text-sm text-slate-500">New reservations will appear in this operational view.</p></div>}</section>;
}

export function ReservationManager({ today, upcoming, timezone, guestCapacity }: { today: ReservationView[]; upcoming: ReservationView[]; timezone: string; guestCapacity: number | null }) {
  const [createState, createAction, creating] = useActionState(createReservationAction, initialState);
  const [filter, setFilter] = useState<ReservationStatusValue | "ALL">("ALL");
  const filteredToday = useMemo(() => filter === "ALL" ? today : today.filter((item) => item.status === filter), [filter, today]);
  const filteredUpcoming = useMemo(() => filter === "ALL" ? upcoming : upcoming.filter((item) => item.status === filter), [filter, upcoming]);
  return <div className="space-y-7">
    <details className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><summary className="cursor-pointer text-sm font-bold text-emerald-700">Create reservation</summary><form action={createAction} className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><ReservationFields timezone={timezone} errors={createState.fieldErrors} /><div className="sm:col-span-2 xl:col-span-4"><button disabled={creating} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{creating ? "Creating…" : "Create reservation"}</button><Feedback state={createState} />{guestCapacity ? <p className="mt-2 text-xs text-slate-400">Operational guest capacity: {guestCapacity}. Parties larger than this are rejected.</p> : null}</div></form></details>
    <div className="flex flex-wrap items-center gap-2" aria-label="Reservation status filter"><button onClick={() => setFilter("ALL")} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === "ALL" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>All</button>{RESERVATION_STATUSES.map((status) => <button key={status} onClick={() => setFilter(status)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === status ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>{status.replaceAll("_", " ")}</button>)}</div>
    <ReservationSection title="Today" description="Reservations scheduled for the restaurant’s local day." items={filteredToday} timezone={timezone} />
    <ReservationSection title="Upcoming" description="The next 30 days, excluding today." items={filteredUpcoming} timezone={timezone} />
  </div>;
}
