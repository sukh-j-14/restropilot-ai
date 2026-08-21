import { calculateOrderTotals } from "@/lib/orders/calculations";
import { normalizeDate, normalizeDecimal, normalizeHistoricalOrderStatus, normalizeOrderType, normalizePositiveInteger, normalizeReservationStatus, type ReservationStatusValue } from "@/lib/imports/normalization";
import { FIELD_LABELS, ORDER_IMPORT_FIELDS, REQUIRED_FIELDS, RESERVATION_IMPORT_FIELDS, type ColumnMapping, type ImportTargetField, type ImportTypeValue, type ParsedCsv, type PreviewSummary, type RowError } from "@/lib/imports/types";
import type { OrderStatusValue, OrderTypeValue } from "@/lib/orders/policy";

export type ImportMenuItem = { id: string; name: string; restaurantId: string };
export type NormalizedOrder = { orderNumber: string; createdAt: Date; status: OrderStatusValue; orderType: OrderTypeValue; discount: string; tax: string; subtotal: string; total: string; items: Array<{ menuItemId: string; menuItemName: string; quantity: number; unitPrice: string; totalPrice: string }> };
export type NormalizedReservation = { customerName: string; guestCount: number; reservationTime: Date; status: ReservationStatusValue; tableNumber: string | null };
export type InternalPreview = { summary: PreviewSummary; orders: NormalizedOrder[]; reservations: NormalizedReservation[] };

function allowedFields(type: ImportTypeValue): readonly ImportTargetField[] { return type === "HISTORICAL_ORDERS" ? ORDER_IMPORT_FIELDS : RESERVATION_IMPORT_FIELDS; }
export function validateMappings(type: ImportTypeValue, headers: string[], mappings: ColumnMapping[]) {
  const errors: string[] = [];
  const mapped = mappings.filter((mapping) => mapping.targetField);
  if (new Set(mapped.map((mapping) => mapping.targetField)).size !== mapped.length) errors.push("Each RestroPilot field can be mapped only once.");
  if (mappings.some((mapping) => !headers.includes(mapping.sourceColumn))) errors.push("A mapping references a column that is not present in the CSV.");
  if (mapped.some((mapping) => !allowedFields(type).includes(mapping.targetField!))) errors.push("A mapping targets a field that is not allowed for this import type.");
  const targets = new Set(mapped.map((mapping) => mapping.targetField));
  for (const required of REQUIRED_FIELDS[type]) if (!targets.has(required)) errors.push(`${FIELD_LABELS[required]} is required.`);
  return errors;
}

function sourceFor(mappings: ColumnMapping[], target: ImportTargetField) { return mappings.find((mapping) => mapping.targetField === target)?.sourceColumn; }
function value(row: Record<string, string>, mappings: ColumnMapping[], target: ImportTargetField) { const source = sourceFor(mappings, target); return source ? row[source] ?? "" : ""; }
function baseSummary(filename: string, type: ImportTypeValue, document: ParsedCsv, mappings: ColumnMapping[]): PreviewSummary {
  const mappedSources = new Set(mappings.filter((mapping) => mapping.targetField).map((mapping) => mapping.sourceColumn));
  return { filename, importType: type, rowCount: document.rowCount, mappedColumns: mappedSources.size, unmappedColumns: document.headers.filter((header) => !mappedSources.has(header)), validRecords: 0, invalidRecords: 0, detectedRecords: 0, duplicateRecords: 0, unknownMenuItems: [], rowErrors: [], sampleRecords: [], canImport: false };
}

export function buildOrderPreview(input: { filename: string; document: ParsedCsv; mappings: ColumnMapping[]; restaurantId: string; menuItems: ImportMenuItem[]; existingOrderNumbers: Set<string> }): InternalPreview {
  const summary = baseSummary(input.filename, "HISTORICAL_ORDERS", input.document, input.mappings);
  const mappingErrors = validateMappings("HISTORICAL_ORDERS", input.document.headers, input.mappings);
  if (mappingErrors.length) { summary.rowErrors = mappingErrors.map((message) => ({ row: 1, message })); summary.invalidRecords = input.document.rowCount; return { summary, orders: [], reservations: [] }; }
  const menuByName = new Map(input.menuItems.filter((item) => item.restaurantId === input.restaurantId).map((item) => [item.name.trim().toLocaleLowerCase(), item]));
  const groups = new Map<string, { rows: number[]; createdAt: Date; status: OrderStatusValue; orderType: OrderTypeValue; discount: string; tax: string; items: NormalizedOrder["items"]; invalid: boolean }>();
  const errors: RowError[] = []; const unknown = new Set<string>(); const seenOrderNumbers = new Set<string>(); const invalidOrderNumbers = new Set<string>();
  input.document.rows.forEach((row, index) => {
    const rowNumber = index + 2; const orderNumber = value(row, input.mappings, "orderNumber").trim(); const menuItemName = value(row, input.mappings, "menuItemName").trim();
    const createdAt = normalizeDate(value(row, input.mappings, "createdAt")); const quantity = normalizePositiveInteger(value(row, input.mappings, "quantity")); const unitPrice = normalizeDecimal(value(row, input.mappings, "unitPrice"), { required: true, decimalPlaces: 2 });
    const discount = normalizeDecimal(value(row, input.mappings, "discount"), { decimalPlaces: 2 }); const tax = normalizeDecimal(value(row, input.mappings, "tax"), { decimalPlaces: 2 });
    const status = normalizeHistoricalOrderStatus(value(row, input.mappings, "status")); const orderType = normalizeOrderType(value(row, input.mappings, "orderType")); const menuItem = menuByName.get(menuItemName.toLocaleLowerCase());
    if (orderNumber) seenOrderNumbers.add(orderNumber);
    const rowMessages: string[] = [];
    if (!orderNumber) rowMessages.push("Order Number is required."); if (!menuItemName) rowMessages.push("Menu Item is required.");
    if (createdAt.error) rowMessages.push(`Created At: ${createdAt.error}`); if (quantity.error) rowMessages.push(`Quantity: ${quantity.error}`); if (unitPrice.error) rowMessages.push(`Unit Price: ${unitPrice.error}`); if (discount.error) rowMessages.push(`Discount: ${discount.error}`); if (tax.error) rowMessages.push(`Tax: ${tax.error}`);
    if (!status) rowMessages.push("Status is not recognized."); if (!orderType) rowMessages.push("Order Type is not recognized."); if (menuItemName && !menuItem) { rowMessages.push(`Unknown menu item: ${menuItemName}.`); unknown.add(menuItemName); }
    for (const message of rowMessages) errors.push({ row: rowNumber, message });
    if (rowMessages.length && orderNumber) invalidOrderNumbers.add(orderNumber);
    if (!orderNumber || !createdAt.value || !quantity.value || !unitPrice.value || !discount.value || !tax.value || !status || !orderType || !menuItem) return;
    const line = { menuItemId: menuItem.id, menuItemName: menuItem.name, quantity: quantity.value, unitPrice: unitPrice.value, totalPrice: (Number(unitPrice.value) * quantity.value).toFixed(2) };
    const existing = groups.get(orderNumber);
    if (existing) {
      existing.rows.push(rowNumber); existing.items.push(line);
      if (existing.createdAt.toISOString() !== createdAt.value.toISOString() || existing.status !== status || existing.orderType !== orderType || existing.discount !== discount.value || existing.tax !== tax.value) { existing.invalid = true; errors.push({ row: rowNumber, message: `Order ${orderNumber} has inconsistent order-level values across rows.` }); }
    } else groups.set(orderNumber, { rows: [rowNumber], createdAt: createdAt.value, status, orderType, discount: discount.value, tax: tax.value, items: [line], invalid: rowMessages.length > 0 });
  });
  const orders: NormalizedOrder[] = [];
  for (const [orderNumber, group] of groups) {
    if (input.existingOrderNumbers.has(orderNumber)) { summary.duplicateRecords += 1; errors.push({ row: group.rows[0], message: `Order ${orderNumber} already exists for this restaurant.` }); continue; }
    if (group.invalid || invalidOrderNumbers.has(orderNumber)) continue;
    const totals = calculateOrderTotals(group.items.map((item) => ({ menuItemId: item.menuItemId, quantity: item.quantity, unitPrice: item.unitPrice })), group.discount, group.tax);
    if (Number(totals.discount) > Number(totals.subtotal)) { errors.push({ row: group.rows[0], message: `Order ${orderNumber} discount exceeds its subtotal.` }); continue; }
    orders.push({ orderNumber, createdAt: group.createdAt, status: group.status, orderType: group.orderType, discount: totals.discount, tax: totals.tax, subtotal: totals.subtotal, total: totals.total, items: group.items });
  }
  summary.detectedRecords = seenOrderNumbers.size; summary.validRecords = orders.length; summary.invalidRecords = seenOrderNumbers.size - orders.length; summary.unknownMenuItems = [...unknown].sort(); summary.rowErrors = errors.slice(0, 250); summary.sampleRecords = orders.slice(0, 5).map((order) => ({ orderNumber: order.orderNumber, createdAt: order.createdAt.toISOString(), status: order.status, orderType: order.orderType, itemCount: order.items.length, subtotal: order.subtotal, total: order.total })); summary.canImport = orders.length > 0;
  return { summary, orders, reservations: [] };
}

export function reservationDuplicateKey(record: { customerName: string; reservationTime: Date | string; guestCount: number }) { const date = record.reservationTime instanceof Date ? record.reservationTime.toISOString() : new Date(record.reservationTime).toISOString(); return `${record.customerName.trim().toLocaleLowerCase()}|${date}|${record.guestCount}`; }

export function buildReservationPreview(input: { filename: string; document: ParsedCsv; mappings: ColumnMapping[]; existingDuplicateKeys: Set<string> }): InternalPreview {
  const summary = baseSummary(input.filename, "HISTORICAL_RESERVATIONS", input.document, input.mappings); const mappingErrors = validateMappings("HISTORICAL_RESERVATIONS", input.document.headers, input.mappings);
  if (mappingErrors.length) { summary.rowErrors = mappingErrors.map((message) => ({ row: 1, message })); summary.invalidRecords = input.document.rowCount; return { summary, orders: [], reservations: [] }; }
  const errors: RowError[] = []; const reservations: NormalizedReservation[] = []; const seen = new Set<string>(); let duplicates = 0;
  input.document.rows.forEach((row, index) => {
    const rowNumber = index + 2; const customerName = value(row, input.mappings, "customerName").trim(); const guests = normalizePositiveInteger(value(row, input.mappings, "guestCount")); const time = normalizeDate(value(row, input.mappings, "reservationTime")); const status = normalizeReservationStatus(value(row, input.mappings, "status")); const tableNumber = value(row, input.mappings, "tableNumber").trim() || null;
    const messages: string[] = []; if (customerName.length < 2 || customerName.length > 120) messages.push("Customer Name must be between 2 and 120 characters."); if (guests.error) messages.push(`Guest Count: ${guests.error}`); if (time.error) messages.push(`Reservation Time: ${time.error}`); if (!status) messages.push("Status is not recognized."); if (tableNumber && tableNumber.length > 40) messages.push("Table Number is too long.");
    for (const message of messages) errors.push({ row: rowNumber, message }); if (messages.length || !guests.value || !time.value || !status) return;
    const record = { customerName, guestCount: guests.value, reservationTime: time.value, status, tableNumber }; const key = reservationDuplicateKey(record);
    if (seen.has(key) || input.existingDuplicateKeys.has(key)) { duplicates += 1; errors.push({ row: rowNumber, message: "Duplicate reservation for the same guest, time, and party size." }); return; }
    seen.add(key); reservations.push(record);
  });
  summary.detectedRecords = input.document.rowCount; summary.validRecords = reservations.length; summary.invalidRecords = input.document.rowCount - reservations.length; summary.duplicateRecords = duplicates; summary.rowErrors = errors.slice(0, 250); summary.sampleRecords = reservations.slice(0, 5).map((record) => ({ ...record, reservationTime: record.reservationTime.toISOString() })); summary.canImport = reservations.length > 0;
  return { summary, orders: [], reservations };
}
