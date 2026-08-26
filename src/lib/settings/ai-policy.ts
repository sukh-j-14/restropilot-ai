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
  const current = restaurantSettingsSnapshot(row);
  return current.name === expected.name
    && current.phone === expected.phone
    && current.address === expected.address
    && current.timezone === expected.timezone
    && current.currency === expected.currency
    && current.guestCapacity === expected.guestCapacity
    && current.updatedAt === expected.updatedAt;
}
