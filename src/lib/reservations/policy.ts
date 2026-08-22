export const RESERVATION_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "SEATED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;

export type ReservationStatusValue = (typeof RESERVATION_STATUSES)[number];

const transitions: Record<ReservationStatusValue, ReservationStatusValue[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SEATED", "CANCELLED", "NO_SHOW"],
  SEATED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function validateReservationStatus(value: string) {
  return RESERVATION_STATUSES.includes(value as ReservationStatusValue)
    ? (value as ReservationStatusValue)
    : null;
}

export function canTransitionReservation(
  from: ReservationStatusValue,
  to: ReservationStatusValue,
) {
  return transitions[from].includes(to);
}

export function reservationTransitionError(
  from: ReservationStatusValue,
  to: ReservationStatusValue,
) {
  return canTransitionReservation(from, to)
    ? null
    : `Reservation cannot move from ${from.replaceAll("_", " ")} to ${to.replaceAll("_", " ")}.`;
}

export function nextReservationStatuses(status: ReservationStatusValue) {
  return [...transitions[status]];
}

export function canEditReservation(status: ReservationStatusValue) {
  return status === "PENDING" || status === "CONFIRMED";
}

export function reservationOwnershipError(expectedRestaurantId: string, actualRestaurantId: string | null) {
  return actualRestaurantId === expectedRestaurantId ? null : "Reservation does not belong to your restaurant.";
}
