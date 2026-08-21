import "server-only";

import { prisma } from "@/lib/prisma";
import { assertIdentifier } from "@/lib/services/validation";

const DEFAULT_DEMO_RESTAURANT_NAME = "The Olive Kitchen";

export type RestaurantRecord = {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  phone: string | null;
  address: string | null;
  guestCapacity: number | null;
  createdAt: string;
  updatedAt: string;
};

export async function getRestaurantById(restaurantId: string): Promise<RestaurantRecord | null> {
  assertIdentifier(restaurantId, "restaurantId");
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant) return null;

  return {
    ...restaurant,
    createdAt: restaurant.createdAt.toISOString(),
    updatedAt: restaurant.updatedAt.toISOString(),
  };
}

export async function resolveDevelopmentRestaurant(
  name = process.env.DEMO_RESTAURANT_NAME ?? DEFAULT_DEMO_RESTAURANT_NAME,
): Promise<RestaurantRecord | null> {
  assertIdentifier(name, "name");
  const restaurant = await prisma.restaurant.findFirst({ where: { name } });
  if (!restaurant) return null;

  return {
    ...restaurant,
    createdAt: restaurant.createdAt.toISOString(),
    updatedAt: restaurant.updatedAt.toISOString(),
  };
}
