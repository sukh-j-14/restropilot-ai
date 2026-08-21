import "server-only";

import { ReservationStatus } from "@/generated/prisma/client";
import { getZonedDateParts } from "@/lib/dashboard/date";
import { prisma } from "@/lib/prisma";
import { aggregateReservations } from "@/lib/services/calculations";
import { getRestaurantById } from "@/lib/services/restaurant";
import type { DateRangeInput } from "@/lib/services/types";
import { assertDateRange } from "@/lib/services/validation";

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
