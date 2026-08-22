import "server-only";

import { ReservationStatus } from "@/generated/prisma/client";
import { getZonedDateParts } from "@/lib/dashboard/date";
import { prisma } from "@/lib/prisma";
import { aggregateReservations } from "@/lib/services/calculations";
import { getRestaurantById } from "@/lib/services/restaurant";
import type { DateRangeInput } from "@/lib/services/types";
import { assertDateRange } from "@/lib/services/validation";
import { assertIdentifier, assertRestaurantId } from "@/lib/services/validation";
import {
  canEditReservation,
  reservationTransitionError,
  type ReservationStatusValue,
} from "@/lib/reservations/policy";
import { ReservationError } from "@/lib/services/reservation-errors";

async function getReservationRecords(input: DateRangeInput) {
  assertDateRange(input);
  return prisma.reservation.findMany({
    where: {
      restaurantId: input.restaurantId,
      reservationTime: { gte: input.start, lt: input.end },
    },
    select: { status: true, guestCount: true, reservationTime: true },
  });
}

export async function getReservationSummary(input: DateRangeInput) {
  const records = await getReservationRecords(input);
  const aggregate = aggregateReservations(records);
  const confirmedReservations = aggregate.byStatus.CONFIRMED ?? 0;
  const expectedGuests = records
    .filter((record) => record.status === ReservationStatus.CONFIRMED)
    .reduce((sum, record) => sum + record.guestCount, 0);

  return {
    restaurantId: input.restaurantId,
    start: input.start.toISOString(),
    end: input.end.toISOString(),
    ...aggregate,
    confirmedReservations,
    expectedGuests,
  };
}

export async function getExpectedGuests(input: DateRangeInput) {
  assertDateRange(input);
  const result = await prisma.reservation.aggregate({
    where: {
      restaurantId: input.restaurantId,
      status: ReservationStatus.CONFIRMED,
      reservationTime: { gte: input.start, lt: input.end },
    },
    _count: true,
    _sum: { guestCount: true },
  });
  return {
    restaurantId: input.restaurantId,
    start: input.start.toISOString(),
    end: input.end.toISOString(),
    confirmedReservations: result._count,
    expectedGuests: result._sum.guestCount ?? 0,
  };
}

export async function getReservationStatusBreakdown(input: DateRangeInput) {
  assertDateRange(input);
  const groups = await prisma.reservation.groupBy({
    by: ["status"],
    where: {
      restaurantId: input.restaurantId,
      reservationTime: { gte: input.start, lt: input.end },
    },
    _count: true,
    _sum: { guestCount: true },
  });
  return groups.map((group) => ({
    status: group.status,
    reservationCount: group._count,
    guestCount: group._sum.guestCount ?? 0,
  }));
}

export async function getPeakReservationHours(input: DateRangeInput) {
  assertDateRange(input);
  const restaurant = await getRestaurantById(input.restaurantId);
  if (!restaurant) return [];
  const records = await prisma.reservation.findMany({
    where: {
      restaurantId: input.restaurantId,
      status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.COMPLETED, ReservationStatus.SEATED] },
      reservationTime: { gte: input.start, lt: input.end },
    },
    select: { reservationTime: true, guestCount: true },
  });
  const hours = new Map<number, { reservationCount: number; guestCount: number }>();
  for (const record of records) {
    const hour = getZonedDateParts(record.reservationTime, restaurant.timezone).hour;
    const current = hours.get(hour) ?? { reservationCount: 0, guestCount: 0 };
    current.reservationCount += 1;
    current.guestCount += record.guestCount;
    hours.set(hour, current);
  }
  return Array.from(hours, ([hour, values]) => ({ hour, ...values })).sort(
    (a, b) => b.guestCount - a.guestCount || a.hour - b.hour,
  );
}

const reservationSelect = {
  id: true,
  customerName: true,
  guestCount: true,
  reservationTime: true,
  status: true,
  tableNumber: true,
  createdAt: true,
  updatedAt: true,
} as const;

function serializeReservation(record: {
  id: string;
  customerName: string;
  guestCount: number;
  reservationTime: Date;
  status: ReservationStatus;
  tableNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...record,
    reservationTime: record.reservationTime.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export type ReservationWriteInput = {
  restaurantId: string;
  customerName: string;
  guestCount: number;
  reservationTime: Date;
  tableNumber: string | null;
};

export async function listReservations(input: DateRangeInput & { status?: ReservationStatusValue }) {
  assertDateRange(input);
  const records = await prisma.reservation.findMany({
    where: {
      restaurantId: input.restaurantId,
      reservationTime: { gte: input.start, lt: input.end },
      ...(input.status ? { status: input.status } : {}),
    },
    select: reservationSelect,
    orderBy: { reservationTime: "asc" },
  });
  return records.map(serializeReservation);
}

async function assertNoDuplicate(input: ReservationWriteInput & { excludeId?: string }) {
  const duplicate = await prisma.reservation.findFirst({
    where: {
      restaurantId: input.restaurantId,
      customerName: { equals: input.customerName, mode: "insensitive" },
      reservationTime: input.reservationTime,
      guestCount: input.guestCount,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      status: { not: ReservationStatus.CANCELLED },
    },
    select: { id: true },
  });
  if (duplicate) throw new ReservationError("A matching reservation already exists for this guest and time.");
}

export async function createReservation(input: ReservationWriteInput) {
  assertRestaurantId(input.restaurantId);
  await assertNoDuplicate(input);
  return serializeReservation(await prisma.reservation.create({
    data: { ...input, status: ReservationStatus.PENDING },
    select: reservationSelect,
  }));
}

export async function updateReservation(input: ReservationWriteInput & { reservationId: string }) {
  assertRestaurantId(input.restaurantId);
  assertIdentifier(input.reservationId, "reservationId");
  const existing = await prisma.reservation.findFirst({
    where: { id: input.reservationId, restaurantId: input.restaurantId },
    select: { id: true, status: true },
  });
  if (!existing) throw new ReservationError("Reservation not found.");
  if (!canEditReservation(existing.status)) throw new ReservationError("Only pending or confirmed reservations can be edited.");
  await assertNoDuplicate({ ...input, excludeId: existing.id });
  const updated = await prisma.reservation.updateMany({
    where: { id: existing.id, restaurantId: input.restaurantId, status: existing.status },
    data: { customerName: input.customerName, guestCount: input.guestCount, reservationTime: input.reservationTime, tableNumber: input.tableNumber },
  });
  if (!updated.count) throw new ReservationError("Reservation changed. Refresh and try again.");
  return serializeReservation((await prisma.reservation.findFirst({ where: { id: existing.id, restaurantId: input.restaurantId }, select: reservationSelect }))!);
}

export async function transitionReservation(input: { restaurantId: string; reservationId: string; to: ReservationStatusValue }) {
  assertRestaurantId(input.restaurantId);
  assertIdentifier(input.reservationId, "reservationId");
  const existing = await prisma.reservation.findFirst({
    where: { id: input.reservationId, restaurantId: input.restaurantId },
    select: { id: true, status: true },
  });
  if (!existing) throw new ReservationError("Reservation not found.");
  const reason = reservationTransitionError(existing.status, input.to);
  if (reason) throw new ReservationError(reason);
  const updated = await prisma.reservation.updateMany({
    where: { id: existing.id, restaurantId: input.restaurantId, status: existing.status },
    data: { status: input.to },
  });
  if (!updated.count) throw new ReservationError("Reservation status changed. Refresh and try again.");
  return { reservationId: existing.id, status: input.to };
}
