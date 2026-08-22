import "server-only";

import { prisma } from "@/lib/prisma";
import { assertIdentifier } from "@/lib/services/validation";
import type { ValidatedOnboardingInput } from "@/lib/onboarding/validation";

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

export async function updateRestaurantSettings(input: {
  restaurantId: string;
  data: ValidatedOnboardingInput;
}): Promise<RestaurantRecord> {
  assertIdentifier(input.restaurantId, "restaurantId");
  const restaurant = await prisma.restaurant.update({
    where: { id: input.restaurantId },
    data: {
      name: input.data.name,
      phone: input.data.phone,
      address: input.data.address,
      timezone: input.data.timezone,
      currency: input.data.currency,
      guestCapacity: input.data.guestCapacity,
    },
  });
  return {
    ...restaurant,
    createdAt: restaurant.createdAt.toISOString(),
    updatedAt: restaurant.updatedAt.toISOString(),
  };
}
