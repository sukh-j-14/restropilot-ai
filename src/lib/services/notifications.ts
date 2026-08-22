import "server-only";

import { loadOperationalNotifications } from "@/lib/header/notifications";
import { getLowStockItems } from "@/lib/services/inventory";
import { listPurchaseOrders } from "@/lib/services/purchase-orders";
import { listReservations } from "@/lib/services/reservations";
import { assertRestaurantId } from "@/lib/services/validation";

export async function getOperationalNotifications(input: { restaurantId: string; timeZone: string }) {
  assertRestaurantId(input.restaurantId);
  return loadOperationalNotifications(input, { getLowStockItems, listPurchaseOrders, listReservations });
}
