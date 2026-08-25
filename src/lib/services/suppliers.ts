import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { CatalogDeletionBlockedError, CatalogDuplicateError, CatalogNotFoundError } from "@/lib/services/catalog-errors";
import { assertIdentifier, assertRestaurantId } from "@/lib/services/validation";
import { supplierDeletionBlockReason } from "@/lib/suppliers/policy";

type SupplierInput = { restaurantId: string; name: string; email: string; phone: string };
const serialize = (supplier: { id: string; name: string; email: string | null; phone: string | null; createdAt: Date; updatedAt: Date }) => ({ ...supplier, createdAt: supplier.createdAt.toISOString(), updatedAt: supplier.updatedAt.toISOString() });

async function assertUniqueName(client: Prisma.TransactionClient | typeof prisma, restaurantId: string, name: string, excludeId?: string) {
  const duplicate = await client.supplier.findFirst({ where: { restaurantId, name: { equals: name, mode: "insensitive" }, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
  if (duplicate) throw new CatalogDuplicateError("A supplier with this name already exists.");
}

export async function listSuppliers(input: { restaurantId: string }) {
  assertRestaurantId(input.restaurantId);
  return (await prisma.supplier.findMany({ where: { restaurantId: input.restaurantId }, orderBy: { name: "asc" } })).map(serialize);
}

export async function createSupplier(input: SupplierInput) {
  assertRestaurantId(input.restaurantId);
  await assertUniqueName(prisma, input.restaurantId, input.name);
  try {
    return serialize(await prisma.supplier.create({ data: { restaurantId: input.restaurantId, name: input.name, email: input.email || null, phone: input.phone || null } }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new CatalogDuplicateError("A supplier with this name already exists.");
    throw error;
  }
}

export async function createSupplierInTransaction(transaction: Prisma.TransactionClient, input: SupplierInput) {
  assertRestaurantId(input.restaurantId);
  await assertUniqueName(transaction, input.restaurantId, input.name);
  return serialize(await transaction.supplier.create({ data: { restaurantId: input.restaurantId, name: input.name, email: input.email || null, phone: input.phone || null } }));
}

export async function updateSupplier(input: SupplierInput & { supplierId: string }) {
  assertRestaurantId(input.restaurantId); assertIdentifier(input.supplierId, "supplierId");
  const existing = await prisma.supplier.findFirst({ where: { id: input.supplierId, restaurantId: input.restaurantId }, select: { id: true } });
  if (!existing) throw new CatalogNotFoundError("Supplier not found.");
  await assertUniqueName(prisma, input.restaurantId, input.name, input.supplierId);
  return serialize(await prisma.supplier.update({ where: { id: input.supplierId, restaurantId: input.restaurantId }, data: { name: input.name, email: input.email || null, phone: input.phone || null } }));
}

export async function updateSupplierInTransaction(transaction: Prisma.TransactionClient, input: SupplierInput & { supplierId: string }) {
  assertRestaurantId(input.restaurantId); assertIdentifier(input.supplierId, "supplierId");
  const existing = await transaction.supplier.findFirst({ where: { id: input.supplierId, restaurantId: input.restaurantId }, select: { id: true } });
  if (!existing) throw new CatalogNotFoundError("Supplier not found.");
  await assertUniqueName(transaction, input.restaurantId, input.name, input.supplierId);
  return serialize(await transaction.supplier.update({ where: { id: input.supplierId, restaurantId: input.restaurantId }, data: { name: input.name, email: input.email || null, phone: input.phone || null } }));
}

export async function deleteSupplier(input: { restaurantId: string; supplierId: string }) {
  assertRestaurantId(input.restaurantId); assertIdentifier(input.supplierId, "supplierId");
  return prisma.$transaction(async (transaction) => {
    const supplier = await transaction.supplier.findFirst({ where: { id: input.supplierId, restaurantId: input.restaurantId }, select: { id: true } });
    if (!supplier) throw new CatalogNotFoundError("Supplier not found.");
    const count = await transaction.purchaseOrder.count({ where: { supplierId: supplier.id, restaurantId: input.restaurantId } });
    const reason = supplierDeletionBlockReason(count);
    if (reason) throw new CatalogDeletionBlockedError(reason);
    await transaction.supplier.deleteMany({ where: { id: supplier.id, restaurantId: input.restaurantId } });
    return { supplierId: supplier.id, deleted: true };
  });
}
