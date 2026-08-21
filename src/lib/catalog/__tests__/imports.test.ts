import assert from "node:assert/strict";
import test from "node:test";

import { CsvParseError, parseCsv, validateCsvFile } from "../../imports/csv";
import { applyManualMapping, suggestImportMapping } from "../../imports/mapping";
import { normalizeDate, normalizeDecimal, normalizeHistoricalOrderStatus } from "../../imports/normalization";
import { buildOrderPreview, buildReservationPreview, reservationDuplicateKey } from "../../imports/preview";
import type { ColumnMapping } from "../../imports/types";
import { canTransitionOrder } from "../../orders/policy";

test("CSV parser detects headers, quoted values, and primitive types", () => {
  const parsed = parseCsv('Bill No,Txn Date,Item,Qty,Rate\r\n1001,2026-08-20 19:30,"Paneer, Tikka",2,350.00');
  assert.deepEqual(parsed.headers, ["Bill No", "Txn Date", "Item", "Qty", "Rate"]);
  assert.equal(parsed.rows[0].Item, "Paneer, Tikka");
  assert.equal(parsed.inferredTypes.Qty, "integer");
  assert.equal(parsed.inferredTypes.Rate, "decimal");
});

test("CSV parser rejects malformed input and excessive rows", () => {
  assert.throws(() => parseCsv('name\n"unclosed'), CsvParseError);
  assert.throws(() => parseCsv("name\na\nb", { maxRows: 1 }), /row limit/i);
  assert.throws(() => validateCsvFile("orders.xlsx", 100), /only .csv/i);
});

test("heuristics map flexible order headers with confidence", () => {
  const result = suggestImportMapping({ headers: ["Bill No", "Txn Date", "Dish", "Units", "Unit Price"], sampleRows: [], importType: "HISTORICAL_ORDERS" });
  const bySource = new Map(result.mappings.map((mapping) => [mapping.sourceColumn, mapping]));
  assert.equal(bySource.get("Bill No")?.targetField, "orderNumber");
  assert.equal(bySource.get("Dish")?.targetField, "menuItemName");
  assert.equal(bySource.get("Units")?.targetField, "quantity");
  assert.ok((bySource.get("Bill No")?.confidence ?? 0) >= 0.9);
});

test("manual mapping overrides suggestions and clears duplicate targets", () => {
  const mappings: ColumnMapping[] = [{ sourceColumn: "Bill", targetField: "orderNumber", confidence: 0.8, source: "heuristic" }, { sourceColumn: "Ticket", targetField: null, confidence: 0, source: "heuristic" }];
  const overridden = applyManualMapping(mappings, "Ticket", "orderNumber");
  assert.equal(overridden[0].targetField, null);
  assert.deepEqual(overridden[1], { sourceColumn: "Ticket", targetField: "orderNumber", confidence: 1, source: "manual" });
});

test("normalization handles currency decimals and safe date formats", () => {
  assert.deepEqual(normalizeDecimal("₹1,250.50", { required: true }), { value: "1250.50", error: null });
  assert.equal(normalizeDate("2026-08-20 19:30").value?.toISOString(), "2026-08-20T19:30:00.000Z");
  assert.equal(normalizeDate("13/08/2026 19:30").value?.toISOString(), "2026-08-13T19:30:00.000Z");
  assert.match(normalizeDate("08/09/2026").error ?? "", /ambiguous/i);
});

const orderMappings: ColumnMapping[] = [
  { sourceColumn: "Bill No", targetField: "orderNumber", confidence: 1, source: "manual" },
  { sourceColumn: "Txn Date", targetField: "createdAt", confidence: 1, source: "manual" },
  { sourceColumn: "Item", targetField: "menuItemName", confidence: 1, source: "manual" },
  { sourceColumn: "Qty", targetField: "quantity", confidence: 1, source: "manual" },
  { sourceColumn: "Rate", targetField: "unitPrice", confidence: 1, source: "manual" },
];

test("order preview groups multiple item rows into one server-calculated order", () => {
  const document = parseCsv("Bill No,Txn Date,Item,Qty,Rate\n100,2026-08-20 19:30,Paneer Tikka,2,350\n100,2026-08-20 19:30,Garlic Naan,3,80");
  const preview = buildOrderPreview({ filename: "orders.csv", document, mappings: orderMappings, restaurantId: "r1", menuItems: [{ id: "m1", name: "Paneer Tikka", restaurantId: "r1" }, { id: "m2", name: "Garlic Naan", restaurantId: "r1" }], existingOrderNumbers: new Set() });
  assert.equal(preview.orders.length, 1);
  assert.equal(preview.orders[0].items.length, 2);
  assert.equal(preview.orders[0].subtotal, "940.00");
  assert.equal(preview.orders[0].status, "COMPLETED");
});

test("order preview reports database duplicates and unknown menu items", () => {
  const document = parseCsv("Bill No,Txn Date,Item,Qty,Rate\n100,2026-08-20,Known,1,100\n101,2026-08-20,Unknown,1,50");
  const preview = buildOrderPreview({ filename: "orders.csv", document, mappings: orderMappings, restaurantId: "r1", menuItems: [{ id: "m1", name: "Known", restaurantId: "r1" }], existingOrderNumbers: new Set(["100"]) });
  assert.equal(preview.summary.duplicateRecords, 1);
  assert.deepEqual(preview.summary.unknownMenuItems, ["Unknown"]);
  assert.equal(preview.summary.validRecords, 0);
});

test("menu matching ignores identically named cross-tenant menu items", () => {
  const document = parseCsv("Bill No,Txn Date,Item,Qty,Rate\n100,2026-08-20,Paneer Tikka,1,350");
  const preview = buildOrderPreview({ filename: "orders.csv", document, mappings: orderMappings, restaurantId: "r1", menuItems: [{ id: "other", name: "Paneer Tikka", restaurantId: "r2" }], existingOrderNumbers: new Set() });
  assert.deepEqual(preview.summary.unknownMenuItems, ["Paneer Tikka"]);
  assert.equal(preview.orders.length, 0);
});

test("historical order normalization produces terminal states that cannot consume live inventory", () => {
  const status = normalizeHistoricalOrderStatus("confirmed");
  assert.equal(status, "COMPLETED");
  assert.equal(canTransitionOrder(status!, "PREPARING"), false);
});

test("reservation preview detects file and database duplicates conservatively", () => {
  const mappings: ColumnMapping[] = [
    { sourceColumn: "Guest Name", targetField: "customerName", confidence: 1, source: "manual" },
    { sourceColumn: "Party Size", targetField: "guestCount", confidence: 1, source: "manual" },
    { sourceColumn: "Booking Time", targetField: "reservationTime", confidence: 1, source: "manual" },
  ];
  const document = parseCsv("Guest Name,Party Size,Booking Time\nAarav Shah,4,2026-08-20 19:30\nAarav Shah,4,2026-08-20 19:30\nMira Patel,2,2026-08-21 20:00");
  const existing = new Set([reservationDuplicateKey({ customerName: "Mira Patel", guestCount: 2, reservationTime: new Date("2026-08-21T20:00:00.000Z") })]);
  const preview = buildReservationPreview({ filename: "reservations.csv", document, mappings, existingDuplicateKeys: existing });
  assert.equal(preview.summary.duplicateRecords, 2);
  assert.equal(preview.reservations.length, 1);
});
