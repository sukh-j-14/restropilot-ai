import "server-only";

import {
  DINNER_START_HOUR,
  LEGACY_RESTAURANT_GUEST_CAPACITY,
} from "@/lib/dashboard/config";
import {
  addDays,
  dateKey,
  dayRange,
  getZonedDateParts,
  nextFriday,
  partsFromKey,
  weekday,
  zonedDateTimeToUtc,
} from "@/lib/dashboard/date";
import { calculatePercentageChange } from "@/lib/services/calculations";
import { getInventoryStatus } from "@/lib/services/inventory";
import { getExpectedGuests } from "@/lib/services/reservations";
import { getRestaurantById } from "@/lib/services/restaurant";
import {
  compareRevenue,
  getDailyRevenue,
  getOrderSummary,
  getRevenue,
} from "@/lib/services/sales";

export type DashboardData = {
  restaurant: { name: string; timezone: string; currency: string; guestCapacity: number };
  today: { key: string; label: string };
  kpis: {
    revenue: { value: number; change: number | null };
    orders: { value: number; change: number | null };
    reservations: { count: number; guests: number; occupancy: number };
    inventoryAlerts: number;
  };
  attention: {
    inventory: { name: string; unit: string; currentStock: number; reorderLevel: number } | null;
    sales: { yesterdayRevenue: number; baselineRevenue: number; change: number | null; isWarning: boolean };
    reservations: { dateLabel: string; count: number; guests: number; occupancy: number };
  };
  performance: {
    days: { key: string; label: string; revenue: number }[];
    total: number;
    change: number | null;
  };
};

export class DashboardRestaurantNotFoundError extends Error {
  constructor() {
    super("The requested restaurant was not found.");
    this.name = "DashboardRestaurantNotFoundError";
  }
}

function occupancy(guests: number, capacity: number) {
  return Math.round((guests / capacity) * 100);
}

export async function getOverviewDashboardData(restaurantId: string): Promise<DashboardData> {
  const restaurant = await getRestaurantById(restaurantId);
  if (!restaurant) throw new DashboardRestaurantNotFoundError();

  const now = new Date();
  const guestCapacity = restaurant.guestCapacity ?? LEGACY_RESTAURANT_GUEST_CAPACITY;
  const todayKey = dateKey(getZonedDateParts(now, restaurant.timezone));
  const comparableKey = addDays(todayKey, -7);
  const yesterdayKey = addDays(todayKey, -1);
  const fridayKey = nextFriday(todayKey);
  const today = dayRange(todayKey, restaurant.timezone);
  const comparable = dayRange(comparableKey, restaurant.timezone);
  const friday = dayRange(fridayKey, restaurant.timezone);
  const dailyStartKey = addDays(todayKey, -13);
  const dailyStart = dayRange(dailyStartKey, restaurant.timezone).start;

  const yesterdayWeekday = weekday(yesterdayKey);
  const baselineKeys: string[] = [];
  for (let daysAgo = 2; daysAgo <= 35 && baselineKeys.length < 4; daysAgo += 1) {
    const key = addDays(todayKey, -daysAgo);
    if (weekday(key) === yesterdayWeekday) baselineKeys.push(key);
  }
  const dinnerRange = (key: string) => ({
    restaurantId: restaurant.id,
    start: zonedDateTimeToUtc(
      { ...partsFromKey(key), hour: DINNER_START_HOUR },
      restaurant.timezone,
    ),
    end: dayRange(key, restaurant.timezone).end,
  });

  const [
    revenueComparison,
    todayOrders,
    comparableOrders,
    tonightReservations,
    fridayReservations,
    inventoryStatus,
    dailyRevenue,
    yesterdayDinner,
    ...baselineDinnerResults
  ] = await Promise.all([
    compareRevenue({
      restaurantId: restaurant.id,
      currentStart: today.start,
      currentEnd: today.end,
      comparisonStart: comparable.start,
      comparisonEnd: comparable.end,
    }),
    getOrderSummary({ restaurantId: restaurant.id, ...today }),
    getOrderSummary({ restaurantId: restaurant.id, ...comparable }),
    getExpectedGuests({ restaurantId: restaurant.id, ...today }),
    getExpectedGuests({ restaurantId: restaurant.id, ...friday }),
    getInventoryStatus({ restaurantId: restaurant.id }),
    getDailyRevenue({
      restaurantId: restaurant.id,
      start: dailyStart,
      end: today.end,
      timeZone: restaurant.timezone,
    }),
    getRevenue(dinnerRange(yesterdayKey)),
    ...baselineKeys.map((key) => getRevenue(dinnerRange(key))),
  ]);

  const baselineRevenue = baselineDinnerResults.length
    ? baselineDinnerResults.reduce((sum, result) => sum + result.revenue, 0) /
      baselineDinnerResults.length
    : 0;
  const dinnerChange = calculatePercentageChange(yesterdayDinner.revenue, baselineRevenue);
  const revenueByDay = new Map(dailyRevenue.map((day) => [day.date, day.revenue]));
  const lastSevenKeys = Array.from({ length: 7 }, (_, index) => addDays(todayKey, index - 6));
  const priorSevenKeys = Array.from({ length: 7 }, (_, index) => addDays(todayKey, index - 13));
  const performanceDays = lastSevenKeys.map((key) => ({
    key,
    label: new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${key}T12:00:00Z`)),
    revenue: revenueByDay.get(key) ?? 0,
  }));
  const performanceTotal = performanceDays.reduce((sum, day) => sum + day.revenue, 0);
  const previousPerformanceTotal = priorSevenKeys.reduce(
    (sum, key) => sum + (revenueByDay.get(key) ?? 0),
    0,
  );

  return {
    restaurant: {
      name: restaurant.name,
      timezone: restaurant.timezone,
      currency: restaurant.currency,
      guestCapacity,
    },
    today: {
      key: todayKey,
      label: new Intl.DateTimeFormat("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: restaurant.timezone,
      }).format(now),
    },
    kpis: {
      revenue: {
        value: revenueComparison.current.revenue,
        change: revenueComparison.percentageChange,
      },
      orders: {
        value: todayOrders.nonCancelledOrders,
        change: calculatePercentageChange(
          todayOrders.nonCancelledOrders,
          comparableOrders.nonCancelledOrders,
        ),
      },
      reservations: {
        count: tonightReservations.confirmedReservations,
        guests: tonightReservations.expectedGuests,
        occupancy: occupancy(tonightReservations.expectedGuests, guestCapacity),
      },
      inventoryAlerts: inventoryStatus.lowStockCount,
    },
    attention: {
      inventory: inventoryStatus.lowStockItems[0] ?? null,
      sales: {
        yesterdayRevenue: yesterdayDinner.revenue,
        baselineRevenue,
        change: dinnerChange,
        isWarning: dinnerChange !== null && dinnerChange <= -10,
      },
      reservations: {
        dateLabel: new Intl.DateTimeFormat("en-IN", {
          weekday: "long",
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        }).format(new Date(`${fridayKey}T12:00:00Z`)),
        count: fridayReservations.confirmedReservations,
        guests: fridayReservations.expectedGuests,
        occupancy: occupancy(fridayReservations.expectedGuests, guestCapacity),
      },
    },
    performance: {
      days: performanceDays,
      total: performanceTotal,
      change: calculatePercentageChange(performanceTotal, previousPerformanceTotal),
    },
  };
}
