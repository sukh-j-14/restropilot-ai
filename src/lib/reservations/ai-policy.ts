import type { ReservationStatusValue } from "@/lib/reservations/policy";

export type ReservationSnapshot = { customerName?: string; reservationTime?: string; guestCount?: number; tableNumber?: string | null; status?: string; updatedAt?: string };

export function resolveReservationMatch<T extends { customerName: string; reservationTime: Date }>(reservations: T[], customerName: string, reservationTime: Date) {
  const name = customerName.trim().toLocaleLowerCase();
  const matches = reservations.filter((item) => item.customerName.trim().toLocaleLowerCase().includes(name) && item.reservationTime.getTime() === reservationTime.getTime());
  if (matches.length === 1) return { kind: "resolved" as const, reservation: matches[0] };
  if (matches.length > 1) return { kind: "ambiguous" as const, matches };
  return { kind: "missing" as const, matches: [] as T[] };
}

export function reservationSnapshotMatches(current: { customerName: string; reservationTime: Date; guestCount: number; tableNumber: string | null; status: ReservationStatusValue; updatedAt: Date }, snapshot: ReservationSnapshot) {
  return current.customerName === snapshot.customerName && current.reservationTime.toISOString() === snapshot.reservationTime && current.guestCount === snapshot.guestCount && current.tableNumber === snapshot.tableNumber && current.status === snapshot.status && current.updatedAt.toISOString() === snapshot.updatedAt;
}
