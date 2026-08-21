import "server-only";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export class UnauthenticatedTenantError extends Error {
  constructor() {
    super("Authentication is required.");
    this.name = "UnauthenticatedTenantError";
  }
}

export class ActiveOrganizationRequiredError extends Error {
  constructor() {
    super("An active Clerk Organization is required.");
    this.name = "ActiveOrganizationRequiredError";
  }
}

export type CurrentRestaurant = {
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

export async function getCurrentRestaurant(): Promise<CurrentRestaurant | null> {
  const { isAuthenticated, orgId } = await auth();
  if (!isAuthenticated) throw new UnauthenticatedTenantError();
  if (!orgId) throw new ActiveOrganizationRequiredError();

  const restaurant = await prisma.restaurant.findUnique({
    where: { clerkOrganizationId: orgId },
    select: {
      id: true,
      name: true,
      timezone: true,
      currency: true,
      phone: true,
      address: true,
      guestCapacity: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!restaurant) return null;

  return {
    ...restaurant,
    createdAt: restaurant.createdAt.toISOString(),
    updatedAt: restaurant.updatedAt.toISOString(),
  };
}
