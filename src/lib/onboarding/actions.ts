"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  type OnboardingFieldErrors,
  type OnboardingFields,
  validateOnboardingInput,
} from "@/lib/onboarding/validation";

export type OnboardingActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: OnboardingFieldErrors;
};

function formValue(formData: FormData, name: keyof OnboardingFields) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function createRestaurantAction(
  _previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const { isAuthenticated, orgId } = await auth();
  if (!isAuthenticated) {
    return { status: "error", message: "Your session has expired. Please sign in again." };
  }
  if (!orgId) {
    return { status: "error", message: "Select an organization before setting up a restaurant." };
  }

  const validation = validateOnboardingInput({
    name: formValue(formData, "name"),
    timezone: formValue(formData, "timezone"),
    currency: formValue(formData, "currency"),
    phone: formValue(formData, "phone"),
    address: formValue(formData, "address"),
    guestCapacity: formValue(formData, "guestCapacity"),
  });
  if (!validation.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: validation.fieldErrors,
    };
  }

  const existing = await prisma.restaurant.findUnique({
    where: { clerkOrganizationId: orgId },
    select: { id: true },
  });
  if (existing) redirect("/overview");

  let setupCompletedElsewhere = false;
  try {
    await prisma.restaurant.create({
      data: {
        ...validation.data,
        clerkOrganizationId: orgId,
      },
      select: { id: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      setupCompletedElsewhere = true;
    } else {
      return {
        status: "error",
        message: "We couldn’t complete restaurant setup. Please try again.",
      };
    }
  }

  if (setupCompletedElsewhere) redirect("/overview");
  redirect("/overview");
}
