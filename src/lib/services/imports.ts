import "server-only";

import { ImportType, Prisma } from "@/generated/prisma/client";
import { MAX_CSV_BYTES, parseCsv, validateCsvFile } from "@/lib/imports/csv";
import { normalizeDate } from "@/lib/imports/normalization";
import { buildOrderPreview, buildReservationPreview, reservationDuplicateKey, type InternalPreview } from "@/lib/imports/preview";
import { IMPORT_TYPES, type ColumnMapping, type ImportTypeValue } from "@/lib/imports/types";
import { prisma } from "@/lib/prisma";
import { ImportEngineError } from "@/lib/services/import-errors";
import { assertRestaurantId } from "@/lib/services/validation";

export type ImportRequest = { restaurantId: string; filename: string; csv: string; importType: ImportTypeValue; mappings: ColumnMapping[] };

function validateRequest(input: ImportRequest) {
  assertRestaurantId(input.restaurantId);
  if (!IMPORT_TYPES.includes(input.importType)) throw new ImportEngineError("Import type is invalid.");
  const filename = input.filename.trim();
  if (!filename || filename.length > 255) throw new ImportEngineError("Filename is invalid.");
  validateCsvFile(filename, new TextEncoder().encode(input.csv).byteLength);
  if (new TextEncoder().encode(input.csv).byteLength > MAX_CSV_BYTES) throw new ImportEngineError("CSV files must be 5 MB or smaller.");
}

function mappedSource(mappings: ColumnMapping[], field: string) { return mappings.find((mapping) => mapping.targetField === field)?.sourceColumn; }

export async function prepareImportPreview(input: ImportRequest): Promise<InternalPreview> {
  validateRequest(input);
  const document = parseCsv(input.csv);
  if (input.importType === "HISTORICAL_ORDERS") {
    const orderColumn = mappedSource(input.mappings, "orderNumber");
    const candidateNumbers = orderColumn ? [...new Set(document.rows.map((row) => row[orderColumn]?.trim()).filter(Boolean))] : [];
    const [menuItems, existingOrders] = await Promise.all([
      prisma.menuItem.findMany({ where: { restaurantId: input.restaurantId }, select: { id: true, name: true, restaurantId: true } }),
      prisma.order.findMany({ where: { restaurantId: input.restaurantId, orderNumber: { in: candidateNumbers } }, select: { orderNumber: true } }),
    ]);
    return buildOrderPreview({ filename: input.filename, document, mappings: input.mappings, restaurantId: input.restaurantId, menuItems, existingOrderNumbers: new Set(existingOrders.map((order) => order.orderNumber)) });
  }

  const timeColumn = mappedSource(input.mappings, "reservationTime");
  const times = timeColumn ? document.rows.map((row) => normalizeDate(row[timeColumn] ?? "").value).filter((date): date is Date => Boolean(date)) : [];
  const reservations = times.length ? await prisma.reservation.findMany({ where: { restaurantId: input.restaurantId, reservationTime: { gte: new Date(Math.min(...times.map(Number))), lte: new Date(Math.max(...times.map(Number))) } }, select: { customerName: true, reservationTime: true, guestCount: true } }) : [];
  return buildReservationPreview({ filename: input.filename, document, mappings: input.mappings, existingDuplicateKeys: new Set(reservations.map(reservationDuplicateKey)) });
}

export async function confirmImport(input: ImportRequest) {
  const preview = await prepareImportPreview(input);
  if (!preview.summary.canImport) throw new ImportEngineError("No valid, non-duplicate records are available to import.");
  try {
    return await prisma.$transaction(async (transaction) => {
      if (input.importType === "HISTORICAL_ORDERS") {
        const numbers = preview.orders.map((order) => order.orderNumber);
        const duplicate = await transaction.order.findFirst({ where: { restaurantId: input.restaurantId, orderNumber: { in: numbers } }, select: { orderNumber: true } });
        if (duplicate) throw new ImportEngineError(`Order ${duplicate.orderNumber} was imported by another request. Refresh the preview.`);
        for (const order of preview.orders) {
          await transaction.order.create({ data: { restaurantId: input.restaurantId, orderNumber: order.orderNumber, createdAt: order.createdAt, status: order.status, orderType: order.orderType, subtotal: order.subtotal, discount: order.discount, tax: order.tax, total: order.total, inventoryConsumedAt: null, items: { create: order.items.map((item) => ({ menuItemId: item.menuItemId, quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: item.totalPrice })) } } });
        }
      } else {
        for (const reservation of preview.reservations) {
          const duplicate = await transaction.reservation.findFirst({ where: { restaurantId: input.restaurantId, customerName: { equals: reservation.customerName, mode: "insensitive" }, reservationTime: reservation.reservationTime, guestCount: reservation.guestCount }, select: { id: true } });
          if (duplicate) throw new ImportEngineError(`A reservation for ${reservation.customerName} was imported by another request. Refresh the preview.`);
          await transaction.reservation.create({ data: { restaurantId: input.restaurantId, ...reservation } });
        }
      }
      const importedCount = input.importType === "HISTORICAL_ORDERS" ? preview.orders.length : preview.reservations.length;
      const batch = await transaction.importBatch.create({ data: { restaurantId: input.restaurantId, type: input.importType as ImportType, filename: input.filename, rowCount: preview.summary.rowCount, importedCount, failedCount: preview.summary.invalidRecords } });
      return { batchId: batch.id, importedCount, failedCount: preview.summary.invalidRecords, type: input.importType };
    });
  } catch (error) {
    if (error instanceof ImportEngineError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ImportEngineError("A duplicate record was created by another request. Refresh the preview and try again.");
    throw error;
  }
}

export async function listImportBatches(input: { restaurantId: string }) {
  assertRestaurantId(input.restaurantId);
  return (await prisma.importBatch.findMany({ where: { restaurantId: input.restaurantId }, orderBy: { createdAt: "desc" }, take: 20 })).map((batch) => ({ ...batch, createdAt: batch.createdAt.toISOString() }));
}
