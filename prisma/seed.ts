import "dotenv/config";

import {
  OrderStatus,
  OrderType,
  Prisma,
  PurchaseOrderStatus,
  ReservationStatus,
  UserRole,
} from "../src/generated/prisma/client";
import { prisma } from "../src/lib/prisma";

const RESTAURANT_ID = "demo-olive-kitchen";
const RESTAURANT_NAME = "The Olive Kitchen";
const SEED = 20260819;
const HISTORY_DAYS = 90;

function mulberry32(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(SEED);

function randomInt(min: number, max: number) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function weightedPick<T>(entries: readonly { value: T; weight: number }[]): T {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = random() * total;

  for (const entry of entries) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.value;
  }

  return entries[entries.length - 1].value;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function localDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function keyFor(date: Date) {
  return date.toISOString().slice(0, 10);
}

function atIndiaTime(date: Date, hour: number, minute: number) {
  return new Date(`${keyFor(date)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:30`);
}

function chunk<T>(values: T[], size: number) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  );
}

const users = [
  { id: "demo-user-owner", name: "Aarav Mehta", email: "aarav.owner@example.com", role: UserRole.OWNER },
  { id: "demo-user-manager", name: "Nisha Kapoor", email: "nisha.manager@example.com", role: UserRole.MANAGER },
  { id: "demo-user-staff-1", name: "Kabir Shah", email: "kabir.staff@example.com", role: UserRole.STAFF },
  { id: "demo-user-staff-2", name: "Meera Joshi", email: "meera.staff@example.com", role: UserRole.STAFF },
  { id: "demo-user-staff-3", name: "Rohan Das", email: "rohan.staff@example.com", role: UserRole.STAFF },
];

const menuItems = [
  { id: "menu-chicken-tikka", name: "Chicken Tikka", category: "Starters", price: 420, weight: 9 },
  { id: "menu-paneer-tikka", name: "Paneer Tikka", category: "Starters", price: 360, weight: 7 },
  { id: "menu-crispy-corn", name: "Crispy Corn", category: "Starters", price: 280, weight: 4 },
  { id: "menu-butter-chicken", name: "Butter Chicken", category: "Main Course", price: 520, weight: 18 },
  { id: "menu-paneer-butter", name: "Paneer Butter Masala", category: "Main Course", price: 420, weight: 11 },
  { id: "menu-dal-makhani", name: "Dal Makhani", category: "Main Course", price: 340, weight: 9 },
  { id: "menu-veg-jalfrezi", name: "Vegetable Jalfrezi", category: "Main Course", price: 360, weight: 5 },
  { id: "menu-butter-naan", name: "Butter Naan", category: "Breads", price: 85, weight: 15 },
  { id: "menu-garlic-naan", name: "Garlic Naan", category: "Breads", price: 105, weight: 11 },
  { id: "menu-steamed-rice", name: "Steamed Basmati Rice", category: "Rice", price: 190, weight: 6 },
  { id: "menu-veg-biryani", name: "Vegetable Biryani", category: "Rice", price: 360, weight: 7 },
  { id: "menu-chicken-biryani", name: "Chicken Biryani", category: "Rice", price: 460, weight: 13 },
  { id: "menu-lime-soda", name: "Fresh Lime Soda", category: "Beverages", price: 120, weight: 8 },
  { id: "menu-chaas", name: "Masala Chaas", category: "Beverages", price: 110, weight: 6 },
  { id: "menu-gulab-jamun", name: "Gulab Jamun", category: "Desserts", price: 160, weight: 7 },
] as const;

const ingredients = [
  { id: "ingredient-chicken", name: "Chicken", unit: "kg", currentStock: 18, reorderLevel: 25, costPerUnit: 285 },
  { id: "ingredient-paneer", name: "Paneer", unit: "kg", currentStock: 22, reorderLevel: 20, costPerUnit: 390 },
  { id: "ingredient-rice", name: "Basmati Rice", unit: "kg", currentStock: 78, reorderLevel: 25, costPerUnit: 125 },
  { id: "ingredient-tomato", name: "Tomato", unit: "kg", currentStock: 42, reorderLevel: 15, costPerUnit: 48 },
  { id: "ingredient-onion", name: "Onion", unit: "kg", currentStock: 55, reorderLevel: 18, costPerUnit: 42 },
  { id: "ingredient-cream", name: "Fresh Cream", unit: "litre", currentStock: 18, reorderLevel: 8, costPerUnit: 240 },
  { id: "ingredient-butter", name: "Butter", unit: "kg", currentStock: 14, reorderLevel: 6, costPerUnit: 520 },
  { id: "ingredient-flour", name: "Refined Flour", unit: "kg", currentStock: 64, reorderLevel: 20, costPerUnit: 48 },
  { id: "ingredient-oil", name: "Cooking Oil", unit: "litre", currentStock: 48, reorderLevel: 15, costPerUnit: 145 },
  { id: "ingredient-corn", name: "Sweet Corn", unit: "kg", currentStock: 16, reorderLevel: 7, costPerUnit: 115 },
  { id: "ingredient-capsicum", name: "Capsicum", unit: "kg", currentStock: 19, reorderLevel: 8, costPerUnit: 95 },
  { id: "ingredient-garlic", name: "Garlic", unit: "kg", currentStock: 12, reorderLevel: 5, costPerUnit: 185 },
  { id: "ingredient-lentils", name: "Black Lentils", unit: "kg", currentStock: 32, reorderLevel: 12, costPerUnit: 155 },
  { id: "ingredient-yogurt", name: "Yogurt", unit: "litre", currentStock: 21, reorderLevel: 9, costPerUnit: 90 },
  { id: "ingredient-lemon", name: "Lemon", unit: "piece", currentStock: 110, reorderLevel: 40, costPerUnit: 7 },
  { id: "ingredient-milk", name: "Milk", unit: "litre", currentStock: 28, reorderLevel: 10, costPerUnit: 62 },
  { id: "ingredient-sugar", name: "Sugar", unit: "kg", currentStock: 35, reorderLevel: 10, costPerUnit: 46 },
  { id: "ingredient-spices", name: "House Spice Blend", unit: "kg", currentStock: 13, reorderLevel: 5, costPerUnit: 680 },
] as const;

const recipeQuantities: Record<string, Record<string, number>> = {
  "menu-chicken-tikka": { "ingredient-chicken": 0.24, "ingredient-yogurt": 0.06, "ingredient-spices": 0.018, "ingredient-oil": 0.012 },
  "menu-paneer-tikka": { "ingredient-paneer": 0.22, "ingredient-yogurt": 0.05, "ingredient-capsicum": 0.05, "ingredient-spices": 0.015 },
  "menu-crispy-corn": { "ingredient-corn": 0.18, "ingredient-flour": 0.035, "ingredient-oil": 0.025, "ingredient-spices": 0.008 },
  "menu-butter-chicken": { "ingredient-chicken": 0.28, "ingredient-tomato": 0.14, "ingredient-onion": 0.07, "ingredient-cream": 0.06, "ingredient-butter": 0.035, "ingredient-spices": 0.015 },
  "menu-paneer-butter": { "ingredient-paneer": 0.24, "ingredient-tomato": 0.13, "ingredient-onion": 0.06, "ingredient-cream": 0.05, "ingredient-butter": 0.03, "ingredient-spices": 0.012 },
  "menu-dal-makhani": { "ingredient-lentils": 0.17, "ingredient-tomato": 0.06, "ingredient-cream": 0.035, "ingredient-butter": 0.025, "ingredient-spices": 0.01 },
  "menu-veg-jalfrezi": { "ingredient-capsicum": 0.09, "ingredient-tomato": 0.1, "ingredient-onion": 0.08, "ingredient-oil": 0.018, "ingredient-spices": 0.01 },
  "menu-butter-naan": { "ingredient-flour": 0.12, "ingredient-butter": 0.012, "ingredient-yogurt": 0.015 },
  "menu-garlic-naan": { "ingredient-flour": 0.12, "ingredient-butter": 0.01, "ingredient-garlic": 0.012, "ingredient-yogurt": 0.015 },
  "menu-steamed-rice": { "ingredient-rice": 0.16, "ingredient-butter": 0.005 },
  "menu-veg-biryani": { "ingredient-rice": 0.16, "ingredient-onion": 0.06, "ingredient-capsicum": 0.06, "ingredient-yogurt": 0.025, "ingredient-spices": 0.012 },
  "menu-chicken-biryani": { "ingredient-chicken": 0.2, "ingredient-rice": 0.16, "ingredient-onion": 0.06, "ingredient-yogurt": 0.03, "ingredient-spices": 0.014 },
  "menu-lime-soda": { "ingredient-lemon": 1, "ingredient-sugar": 0.018 },
  "menu-chaas": { "ingredient-yogurt": 0.22, "ingredient-spices": 0.003 },
  "menu-gulab-jamun": { "ingredient-milk": 0.09, "ingredient-flour": 0.025, "ingredient-sugar": 0.055, "ingredient-oil": 0.012 },
};

const suppliers = [
  { id: "supplier-fresh-farms", name: "Fresh Farms Poultry", email: "orders@freshfarms.example", phone: "+91 90000 11001" },
  { id: "supplier-daily-dairy", name: "Daily Dairy Co.", email: "sales@dailydairy.example", phone: "+91 90000 11002" },
  { id: "supplier-grain-house", name: "Grain House Wholesale", email: "supply@grainhouse.example", phone: "+91 90000 11003" },
  { id: "supplier-city-produce", name: "City Produce Market", email: "dispatch@cityproduce.example", phone: "+91 90000 11004" },
] as const;

const customerNames = [
  "Ananya Rao", "Vikram Malhotra", "Ishita Sen", "Arjun Nair", "Priya Sharma", "Rahul Verma",
  "Neha Iyer", "Aditya Bose", "Kavya Menon", "Siddharth Jain", "Riya Khanna", "Dev Patel",
];

async function createOrders(startDate: Date, endDate: Date) {
  const orders: Prisma.OrderCreateManyInput[] = [];
  const orderItems: Prisma.OrderItemCreateManyInput[] = [];
  const yesterdayKey = keyFor(endDate);
  let sequence = 1;

  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    const day = date.getUTCDay();
    const weekendMultiplier = day === 5 ? 1.3 : day === 6 ? 1.55 : day === 0 ? 1.4 : 1;
    const lunchCount = Math.round((8 + randomInt(0, 5)) * weekendMultiplier);
    const normalDinnerCount = Math.round((15 + randomInt(0, 7)) * weekendMultiplier);
    const dinnerCount = keyFor(date) === yesterdayKey ? Math.round(normalDinnerCount * 0.48) : normalDinnerCount;

    for (const service of ["lunch", "dinner"] as const) {
      const count = service === "lunch" ? lunchCount : dinnerCount;

      for (let index = 0; index < count; index += 1) {
        const orderId = `demo-order-${String(sequence).padStart(5, "0")}`;
        const hour = service === "lunch" ? randomInt(12, 15) : randomInt(18, 22);
        const minute = randomInt(0, 11) * 5;
        const status = random() < 0.025 ? OrderStatus.CANCELLED : OrderStatus.COMPLETED;
        const orderType = weightedPick([
          { value: OrderType.DINE_IN, weight: 64 },
          { value: OrderType.TAKEAWAY, weight: 22 },
          { value: OrderType.DELIVERY, weight: 14 },
        ]);
        const lineCount = orderType === OrderType.DINE_IN ? randomInt(2, 5) : randomInt(1, 4);
        const selected = new Set<string>();
        while (selected.size < lineCount) {
          selected.add(weightedPick(menuItems.map((item) => ({ value: item.id, weight: item.weight }))));
        }

        let subtotal = 0;
        for (const menuItemId of selected) {
          const menuItem = menuItems.find((item) => item.id === menuItemId)!;
          const quantity = random() < 0.18 ? 2 : 1;
          const totalPrice = menuItem.price * quantity;
          subtotal += totalPrice;
          orderItems.push({
            id: `${orderId}-${menuItemId}`,
            orderId,
            menuItemId,
            quantity,
            unitPrice: menuItem.price,
            totalPrice,
          });
        }

        const discount = random() < 0.08 ? roundMoney(subtotal * 0.1) : 0;
        const tax = roundMoney((subtotal - discount) * 0.05);
        orders.push({
          id: orderId,
          restaurantId: RESTAURANT_ID,
          orderNumber: `OLV-${String(sequence).padStart(6, "0")}`,
          status,
          orderType,
          subtotal,
          discount,
          tax,
          total: roundMoney(subtotal - discount + tax),
          createdAt: atIndiaTime(date, hour, minute),
        });
        sequence += 1;
      }
    }
  }

  for (const batch of chunk(orders, 500)) await prisma.order.createMany({ data: batch });
  for (const batch of chunk(orderItems, 1_000)) await prisma.orderItem.createMany({ data: batch });
  return { orders: orders.length, orderItems: orderItems.length };
}

async function createReservations(startDate: Date, endDate: Date) {
  const reservations: Prisma.ReservationCreateManyInput[] = [];
  let sequence = 1;

  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    const day = date.getUTCDay();
    const count = day === 6 ? randomInt(12, 16) : day === 0 ? randomInt(9, 13) : day === 5 ? randomInt(9, 12) : randomInt(4, 7);

    for (let index = 0; index < count; index += 1) {
      const dinner = random() < 0.82;
      const status = weightedPick([
        { value: ReservationStatus.COMPLETED, weight: 88 },
        { value: ReservationStatus.CANCELLED, weight: 8 },
        { value: ReservationStatus.NO_SHOW, weight: 4 },
      ]);
      reservations.push({
        id: `demo-reservation-${String(sequence).padStart(5, "0")}`,
        restaurantId: RESTAURANT_ID,
        customerName: customerNames[randomInt(0, customerNames.length - 1)],
        guestCount: weightedPick([
          { value: 2, weight: 38 }, { value: 3, weight: 18 }, { value: 4, weight: 28 },
          { value: 5, weight: 9 }, { value: 6, weight: 7 },
        ]),
        reservationTime: atIndiaTime(date, dinner ? randomInt(19, 21) : randomInt(12, 14), randomInt(0, 3) * 15),
        status,
        tableNumber: `T${randomInt(1, 24)}`,
        createdAt: atIndiaTime(addDays(date, -randomInt(1, 8)), 10, randomInt(0, 5) * 10),
      });
      sequence += 1;
    }
  }

  let upcomingFriday = addDays(endDate, 1);
  while (upcomingFriday.getUTCDay() !== 5) upcomingFriday = addDays(upcomingFriday, 1);
  for (let index = 0; index < 27; index += 1) {
    reservations.push({
      id: `demo-reservation-friday-${String(index + 1).padStart(2, "0")}`,
      restaurantId: RESTAURANT_ID,
      customerName: customerNames[index % customerNames.length],
      guestCount: [2, 4, 4, 3, 5, 2][index % 6],
      reservationTime: atIndiaTime(upcomingFriday, 19 + (index % 3), (index % 4) * 15),
      status: ReservationStatus.CONFIRMED,
      tableNumber: `T${(index % 24) + 1}`,
      createdAt: atIndiaTime(addDays(upcomingFriday, -randomInt(3, 12)), 11, 0),
    });
  }

  for (const batch of chunk(reservations, 1_000)) await prisma.reservation.createMany({ data: batch });
  return { reservations: reservations.length, upcomingFriday };
}

async function createPurchaseOrders(today: Date) {
  const supplierIngredients: Record<string, string[]> = {
    "supplier-fresh-farms": ["ingredient-chicken"],
    "supplier-daily-dairy": ["ingredient-paneer", "ingredient-cream", "ingredient-butter", "ingredient-yogurt", "ingredient-milk"],
    "supplier-grain-house": ["ingredient-rice", "ingredient-flour", "ingredient-oil", "ingredient-lentils", "ingredient-sugar", "ingredient-spices"],
    "supplier-city-produce": ["ingredient-tomato", "ingredient-onion", "ingredient-corn", "ingredient-capsicum", "ingredient-garlic", "ingredient-lemon"],
  };
  const ingredientById = new Map<string, (typeof ingredients)[number]>(
    ingredients.map((ingredient) => [ingredient.id, ingredient]),
  );
  let count = 0;

  for (let daysAgo = 84; daysAgo >= 7; daysAgo -= 7) {
    const supplier = suppliers[count % suppliers.length];
    const lines = supplierIngredients[supplier.id].slice(0, 3);
    const items = lines.map((ingredientId, index) => {
      const ingredient = ingredientById.get(ingredientId)!;
      const quantity = ingredient.unit === "piece" ? 100 : 20 + index * 5;
      return { ingredientId, quantity, unitCost: ingredient.costPerUnit };
    });
    const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
    await prisma.purchaseOrder.create({
      data: {
        id: `demo-po-${String(count + 1).padStart(3, "0")}`,
        restaurantId: RESTAURANT_ID,
        supplierId: supplier.id,
        status: PurchaseOrderStatus.RECEIVED,
        totalAmount,
        orderedAt: atIndiaTime(addDays(today, -daysAgo), 9, 30),
        expectedAt: atIndiaTime(addDays(today, -daysAgo + 2), 11, 0),
        createdAt: atIndiaTime(addDays(today, -daysAgo), 9, 0),
        items: { create: items.map((item, index) => ({ id: `demo-po-item-${count + 1}-${index + 1}`, ...item })) },
      },
    });
    count += 1;
  }

  await prisma.purchaseOrder.create({
    data: {
      id: "demo-po-pending-chicken",
      restaurantId: RESTAURANT_ID,
      supplierId: "supplier-fresh-farms",
      status: PurchaseOrderStatus.ORDERED,
      totalAmount: 11_400,
      orderedAt: atIndiaTime(today, 9, 15),
      expectedAt: atIndiaTime(addDays(today, 1), 8, 30),
      createdAt: atIndiaTime(today, 9, 0),
      items: { create: [{ id: "demo-po-item-pending-chicken", ingredientId: "ingredient-chicken", quantity: 40, unitCost: 285 }] },
    },
  });

  return count + 1;
}

async function main() {
  const today = parseDateKey(localDateKey(new Date()));
  const historyEnd = addDays(today, -1);
  const historyStart = addDays(historyEnd, -(HISTORY_DAYS - 1));

  await prisma.restaurant.deleteMany({ where: { OR: [{ id: RESTAURANT_ID }, { name: RESTAURANT_NAME }] } });
  await prisma.restaurant.create({
    data: { id: RESTAURANT_ID, name: RESTAURANT_NAME, timezone: "Asia/Kolkata", currency: "INR" },
  });
  await prisma.user.createMany({ data: users.map((user) => ({ ...user, restaurantId: RESTAURANT_ID })) });
  await prisma.menuItem.createMany({
    data: menuItems.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      price: item.price,
      restaurantId: RESTAURANT_ID,
    })),
  });
  await prisma.ingredient.createMany({ data: ingredients.map((ingredient) => ({ ...ingredient, restaurantId: RESTAURANT_ID })) });

  const recipes = Object.entries(recipeQuantities).flatMap(([menuItemId, quantities]) =>
    Object.entries(quantities).map(([ingredientId, quantityRequired]) => ({ menuItemId, ingredientId, quantityRequired })),
  );
  await prisma.recipeItem.createMany({ data: recipes });
  await prisma.supplier.createMany({ data: suppliers.map((supplier) => ({ ...supplier, restaurantId: RESTAURANT_ID })) });

  const purchaseOrders = await createPurchaseOrders(today);
  const orderCounts = await createOrders(historyStart, historyEnd);
  const reservationCounts = await createReservations(historyStart, historyEnd);

  const counts = {
    restaurants: await prisma.restaurant.count({ where: { id: RESTAURANT_ID } }),
    users: await prisma.user.count({ where: { restaurantId: RESTAURANT_ID } }),
    menuItems: await prisma.menuItem.count({ where: { restaurantId: RESTAURANT_ID } }),
    ingredients: await prisma.ingredient.count({ where: { restaurantId: RESTAURANT_ID } }),
    recipeItems: await prisma.recipeItem.count({ where: { menuItem: { restaurantId: RESTAURANT_ID } } }),
    suppliers: await prisma.supplier.count({ where: { restaurantId: RESTAURANT_ID } }),
    purchaseOrders,
    orders: orderCounts.orders,
    orderItems: orderCounts.orderItems,
    reservations: reservationCounts.reservations,
  };

  console.info("Seed completed", {
    counts,
    historyRange: `${keyFor(historyStart)} to ${keyFor(historyEnd)}`,
    highCapacityFriday: keyFor(reservationCounts.upcomingFriday),
  });
}

main()
  .catch((error) => {
    console.error("Seed failed", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
