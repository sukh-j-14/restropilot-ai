"use server";

import { revalidatePath } from "next/cache";
import { ReservationError } from "@/lib/services/reservation-errors";
import { createReservation, transitionReservation, updateReservation } from "@/lib/services/reservations";
import { getCurrentRestaurant } from "@/lib/services/tenant";
import { validateReservation, validateReservationTransition } from "@/lib/reservations/validation";

export type ReservationActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

function value(formData: FormData, name: string) {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : "";
}

function hasUnexpectedFields(formData: FormData, allowed: string[]) {
  return [...formData.keys()].some((key) => !key.startsWith("$ACTION_") && !allowed.includes(key));
}

async function tenant() {
  try { return await getCurrentRestaurant(); } catch { return null; }
}

function safeMessage(error: unknown) {
  return error instanceof ReservationError ? error.message : "The reservation could not be saved. Please try again.";
}

function fields(formData: FormData) {
  return {
    customerName: value(formData, "customerName"),
    guestCount: value(formData, "guestCount"),
    reservationTime: value(formData, "reservationTime"),
    tableNumber: value(formData, "tableNumber"),
  };
}

export async function createReservationAction(_state: ReservationActionState, formData: FormData): Promise<ReservationActionState> {
  const restaurant = await tenant();
  if (!restaurant) return { status: "error", message: "Restaurant setup is required." };
  if (hasUnexpectedFields(formData, ["customerName", "guestCount", "reservationTime", "tableNumber"])) return { status: "error", message: "Invalid reservation request." };
  const validation = validateReservation(fields(formData), restaurant);
  if (!validation.success) return { status: "error", message: "Please correct the highlighted fields.", fieldErrors: validation.fieldErrors };
  try {
    await createReservation({ restaurantId: restaurant.id, ...validation.data });
    revalidatePath("/reservations");
    return { status: "success", message: "Reservation created." };
  } catch (error) { return { status: "error", message: safeMessage(error) }; }
}

export async function updateReservationAction(_state: ReservationActionState, formData: FormData): Promise<ReservationActionState> {
  const restaurant = await tenant();
  if (!restaurant) return { status: "error", message: "Restaurant setup is required." };
  if (hasUnexpectedFields(formData, ["reservationId", "customerName", "guestCount", "reservationTime", "tableNumber"])) return { status: "error", message: "Invalid reservation request." };
  const reservationId = value(formData, "reservationId");
  if (!reservationId || reservationId.length > 100) return { status: "error", message: "Reservation not found." };
  const validation = validateReservation(fields(formData), restaurant);
  if (!validation.success) return { status: "error", message: "Please correct the highlighted fields.", fieldErrors: validation.fieldErrors };
  try {
    await updateReservation({ restaurantId: restaurant.id, reservationId, ...validation.data });
    revalidatePath("/reservations");
    return { status: "success", message: "Reservation updated." };
  } catch (error) { return { status: "error", message: safeMessage(error) }; }
}

export async function transitionReservationAction(_state: ReservationActionState, formData: FormData): Promise<ReservationActionState> {
  const restaurant = await tenant();
  if (!restaurant) return { status: "error", message: "Restaurant setup is required." };
  if (hasUnexpectedFields(formData, ["reservationId", "status"])) return { status: "error", message: "Invalid status request." };
  const reservationId = value(formData, "reservationId");
  const status = validateReservationTransition(value(formData, "status"));
  if (!reservationId || reservationId.length > 100 || !status) return { status: "error", message: "Invalid reservation status request." };
  try {
    await transitionReservation({ restaurantId: restaurant.id, reservationId, to: status });
    revalidatePath("/reservations");
    return { status: "success", message: status === "CANCELLED" ? "Reservation cancelled." : `Reservation marked ${status.toLocaleLowerCase().replaceAll("_", " ")}.` };
  } catch (error) { return { status: "error", message: safeMessage(error) }; }
}
