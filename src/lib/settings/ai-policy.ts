import type { RestaurantSettingsSnapshot } from "@/lib/ai/action-proposal-types";

export type CurrentRestaurantSettings = {
  name: string;
  phone: string | null;
  address: string | null;
  timezone: string;
  currency: string;
  guestCapacity: number | null;
  updatedAt: Date;
};

export function restaurantSettingsSnapshot(row: CurrentRestaurantSettings): RestaurantSettingsSnapshot {
  return { name: row.name, phone: row.phone, address: row.address, timezone: row.timezone, currency: row.currency, guestCapacity: row.guestCapacity ?? 96, updatedAt: row.updatedAt.toISOString() };
}

export function restaurantSettingsSnapshotMatches(row: CurrentRestaurantSettings, expected: RestaurantSettingsSnapshot) {
  return JSON.stringify(restaurantSettingsSnapshot(row)) === JSON.stringify(expected);
}
