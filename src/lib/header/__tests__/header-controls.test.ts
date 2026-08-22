import assert from "node:assert/strict";
import test from "node:test";
import { deriveOperationalNotifications, loadOperationalNotifications, MAX_HEADER_NOTIFICATIONS } from "../notifications";
import { workspaceInitials, workspaceMenuState } from "../workspaces";

test("workspace state identifies the active Clerk organization", () => {
  assert.deepEqual(workspaceMenuState("org-b", [{ id: "org-a", name: "Alpha" }, { id: "org-b", name: "Beta" }]), [
    { id: "org-a", name: "Alpha", isActive: false },
    { id: "org-b", name: "Beta", isActive: true },
  ]);
});

test("single-organization state still exposes the current workspace", () => {
  assert.deepEqual(workspaceMenuState("org-a", [{ id: "org-a", name: "Very Special Academy" }]), [
    { id: "org-a", name: "Very Special Academy", isActive: true },
  ]);
  assert.equal(workspaceInitials("Very Special Academy"), "VSA");
});

test("notification derivation has a polished empty state contract", () => {
  assert.deepEqual(deriveOperationalNotifications({ lowStockItems: [], purchaseOrders: [], reservations: [] }), []);
});

test("low stock produces an inventory attention item without exposing its id", () => {
  const [item] = deriveOperationalNotifications({
    lowStockItems: [{ ingredientId: "internal-id", name: "Paneer", unit: "kg", currentStock: 3, reorderLevel: 10 }],
    purchaseOrders: [], reservations: [],
  });
  assert.equal(item.href, "/inventory");
  assert.match(item.title, /Paneer/);
  assert.doesNotMatch(`${item.title} ${item.detail}`, /internal-id/);
});

test("pending reservations and actionable purchase orders produce attention items", () => {
  const items = deriveOperationalNotifications({
    lowStockItems: [],
    purchaseOrders: [
      { id: "draft", status: "DRAFT", expectedAt: null, supplier: { name: "Supplier" } },
      { id: "late", status: "ORDERED", expectedAt: "2026-08-20T00:00:00.000Z", supplier: { name: "Supplier" } },
    ],
    reservations: [{ id: "reservation", status: "PENDING", guestCount: 4 }],
    now: new Date("2026-08-22T00:00:00.000Z"),
  });
  assert.ok(items.some((item) => item.href === "/purchase-orders" && item.title.includes("overdue")));
  assert.ok(items.some((item) => item.href === "/purchase-orders" && item.title.includes("draft")));
  assert.ok(items.some((item) => item.href === "/reservations" && item.title.includes("confirmation")));
});

test("notification results remain bounded", () => {
  const items = deriveOperationalNotifications({
    lowStockItems: Array.from({ length: 20 }, (_, index) => ({ ingredientId: String(index), name: `Ingredient ${index}`, unit: "kg", currentStock: 0, reorderLevel: 10 })),
    purchaseOrders: [
      { id: "draft", status: "DRAFT", expectedAt: null, supplier: { name: "Supplier" } },
      { id: "partial", status: "PARTIALLY_RECEIVED", expectedAt: null, supplier: { name: "Supplier" } },
      { id: "late", status: "ORDERED", expectedAt: "2026-01-01T00:00:00.000Z", supplier: { name: "Supplier" } },
    ],
    reservations: [{ id: "r", status: "PENDING", guestCount: 2 }],
    now: new Date("2026-08-22T00:00:00.000Z"),
  });
  assert.ok(items.length <= MAX_HEADER_NOTIFICATIONS);
});

test("notification loading scopes every service call to the trusted tenant", async () => {
  const seen: string[] = [];
  const result = await loadOperationalNotifications(
    { restaurantId: "trusted-restaurant", timeZone: "Asia/Kolkata", now: new Date("2026-08-22T06:00:00.000Z") },
    {
      getLowStockItems: async ({ restaurantId }) => { seen.push(restaurantId); return []; },
      listPurchaseOrders: async ({ restaurantId }) => { seen.push(restaurantId); return []; },
      listReservations: async ({ restaurantId }) => { seen.push(restaurantId); return []; },
    },
  );
  assert.deepEqual(seen, ["trusted-restaurant", "trusted-restaurant", "trusted-restaurant"]);
  assert.deepEqual(result, { items: [], hadErrors: false });
});

test("one failed source degrades safely without discarding other signals", async () => {
  const result = await loadOperationalNotifications(
    { restaurantId: "trusted", timeZone: "UTC", now: new Date("2026-08-22T06:00:00.000Z") },
    {
      getLowStockItems: async () => { throw new Error("unavailable"); },
      listPurchaseOrders: async () => [],
      listReservations: async () => [{ id: "r", status: "PENDING", guestCount: 2 }],
    },
  );
  assert.equal(result.hadErrors, true);
  assert.equal(result.items[0]?.href, "/reservations");
});
