import { addDays, dateKey, dayRange, getZonedDateParts } from "@/lib/dashboard/date";

export const MAX_HEADER_NOTIFICATIONS = 6;

export type OperationalNotification = {
  key: string;
  category: "inventory" | "purchase-orders" | "reservations";
  title: string;
  detail: string;
  href: "/inventory" | "/purchase-orders" | "/reservations";
  priority: number;
};

type LowStockItem = { ingredientId: string; name: string; unit: string; currentStock: number; reorderLevel: number };
type PurchaseOrderItem = { id: string; status: string; expectedAt: string | null; supplier: { name: string } };
type ReservationItem = { id: string; status: string; guestCount: number };

export function deriveOperationalNotifications(input: {
  lowStockItems: LowStockItem[];
  purchaseOrders: PurchaseOrderItem[];
  reservations: ReservationItem[];
  now?: Date;
  limit?: number;
}) {
  const now = input.now ?? new Date();
  const items: OperationalNotification[] = [];

  for (const ingredient of input.lowStockItems.slice(0, 3)) {
    items.push({
      key: `inventory-${ingredient.ingredientId}`,
      category: "inventory",
      title: `${ingredient.name} is low`,
      detail: `${ingredient.currentStock} ${ingredient.unit} available · reorder at ${ingredient.reorderLevel} ${ingredient.unit}`,
      href: "/inventory",
      priority: 100,
    });
  }

  const overdue = input.purchaseOrders.filter((order) =>
    ["ORDERED", "PARTIALLY_RECEIVED"].includes(order.status) && order.expectedAt && new Date(order.expectedAt) < now,
  );
  if (overdue.length) items.push({ key: "purchase-orders-overdue", category: "purchase-orders", title: `${overdue.length} purchase order${overdue.length === 1 ? " is" : "s are"} overdue`, detail: "Review expected delivery dates and supplier status.", href: "/purchase-orders", priority: 90 });
  const partialCount = input.purchaseOrders.filter((order) => order.status === "PARTIALLY_RECEIVED" && !overdue.some((value) => value.id === order.id)).length;
  if (partialCount) items.push({ key: "purchase-orders-partial", category: "purchase-orders", title: `${partialCount} order${partialCount === 1 ? " is" : "s are"} partially received`, detail: "Confirm the remaining stock and complete receiving when ready.", href: "/purchase-orders", priority: 75 });
  const draftCount = input.purchaseOrders.filter((order) => order.status === "DRAFT").length;
  if (draftCount) items.push({ key: "purchase-orders-draft", category: "purchase-orders", title: `${draftCount} purchase-order draft${draftCount === 1 ? "" : "s"} awaiting review`, detail: "Review drafts before placing orders with suppliers.", href: "/purchase-orders", priority: 55 });

  const pending = input.reservations.filter((reservation) => reservation.status === "PENDING");
  if (pending.length) {
    const guests = pending.reduce((sum, reservation) => sum + reservation.guestCount, 0);
    items.push({ key: "reservations-pending", category: "reservations", title: `${pending.length} reservation${pending.length === 1 ? "" : "s"} need confirmation`, detail: `${guests} expected guest${guests === 1 ? "" : "s"} across near-term pending bookings.`, href: "/reservations", priority: 80 });
  }

  return items.sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title)).slice(0, Math.max(0, Math.min(input.limit ?? MAX_HEADER_NOTIFICATIONS, MAX_HEADER_NOTIFICATIONS)));
}

export type NotificationDependencies = {
  getLowStockItems(input: { restaurantId: string }): Promise<LowStockItem[]>;
  listPurchaseOrders(input: { restaurantId: string }): Promise<PurchaseOrderItem[]>;
  listReservations(input: { restaurantId: string; start: Date; end: Date }): Promise<ReservationItem[]>;
};

export async function loadOperationalNotifications(input: {
  restaurantId: string;
  timeZone: string;
  now?: Date;
}, dependencies: NotificationDependencies) {
  const now = input.now ?? new Date();
  const todayKey = dateKey(getZonedDateParts(now, input.timeZone));
  const today = dayRange(todayKey, input.timeZone);
  const tomorrowEnd = dayRange(addDays(todayKey, 1), input.timeZone).end;
  const results = await Promise.allSettled([
    dependencies.getLowStockItems({ restaurantId: input.restaurantId }),
    dependencies.listPurchaseOrders({ restaurantId: input.restaurantId }),
    dependencies.listReservations({ restaurantId: input.restaurantId, start: today.start, end: tomorrowEnd }),
  ]);
  const lowStockItems = results[0].status === "fulfilled" ? results[0].value : [];
  const purchaseOrders = results[1].status === "fulfilled" ? results[1].value : [];
  const reservations = results[2].status === "fulfilled" ? results[2].value : [];
  return {
    items: deriveOperationalNotifications({ lowStockItems, purchaseOrders, reservations, now }),
    hadErrors: results.some((result) => result.status === "rejected"),
  };
}
