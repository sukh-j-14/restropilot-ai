"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { updateRestaurantSettings } from "@/lib/services/restaurant";
import { getCurrentRestaurant } from "@/lib/services/tenant";
import { canManageRestaurantSettings } from "@/lib/settings/authorization";
import { settingsObjectFromFormData, type SettingsFieldErrors, validateSettingsInput } from "@/lib/settings/validation";

export type SettingsActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: SettingsFieldErrors;
};

export async function updateRestaurantSettingsAction(
  _previousState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const session = await auth();
  if (!session.userId || !session.orgId) {
    return { status: "error", message: "Your session has expired. Please sign in again." };
  }
  if (!canManageRestaurantSettings(session.orgRole)) {
    return { status: "error", message: "Only an organization administrator can update restaurant settings." };
  }

  const validation = validateSettingsInput(settingsObjectFromFormData(formData));
  if (!validation.success) {
    return {
      status: "error",
      message: validation.fieldErrors.form ?? "Please correct the highlighted fields.",
      fieldErrors: validation.fieldErrors,
    };
  }

  try {
    const restaurant = await getCurrentRestaurant();
    if (!restaurant) return { status: "error", message: "Restaurant setup is required before settings can be updated." };
    await updateRestaurantSettings({ restaurantId: restaurant.id, data: validation.data });
    revalidatePath("/", "layout");
    return { status: "success", message: "Restaurant settings saved successfully." };
  } catch {
    return { status: "error", message: "We couldn’t save restaurant settings. Please try again." };
  }
}
