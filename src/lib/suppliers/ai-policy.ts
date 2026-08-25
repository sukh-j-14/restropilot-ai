export type SupplierIdentity = { id: string; name: string };

const normalize = (value: string) => value.trim().toLocaleLowerCase();

export function resolveSupplierMatch<T extends SupplierIdentity>(suppliers: T[], query: string): { kind: "resolved"; supplier: T } | { kind: "ambiguous"; matches: T[] } | { kind: "missing" } {
  const exact = suppliers.filter((supplier) => normalize(supplier.name) === normalize(query));
  if (exact.length === 1) return { kind: "resolved", supplier: exact[0] };
  const partial = suppliers.filter((supplier) => normalize(supplier.name).includes(normalize(query)));
  if (partial.length === 1) return { kind: "resolved", supplier: partial[0] };
  if (partial.length > 1) return { kind: "ambiguous", matches: partial };
  return { kind: "missing" };
}

export function supplierSnapshotMatches(current: { name: string; email: string | null; phone: string | null; updatedAt: Date }, snapshot: { name?: string; email?: string | null; phone?: string | null; updatedAt?: string }) {
  return current.name === snapshot.name && current.email === snapshot.email && current.phone === snapshot.phone && current.updatedAt.toISOString() === snapshot.updatedAt;
}
