import { ORDER_IMPORT_FIELDS, RESERVATION_IMPORT_FIELDS, type ColumnMapping, type ImportMappingSuggester, type ImportTargetField, type ImportTypeValue, type MappingSuggestionResult } from "@/lib/imports/types";

export const AI_MAPPING_CONFIDENCE_THRESHOLD = 0.9;
export type AIImportMappingRequest = { csv: string; importType: ImportTypeValue; retry: boolean };

export function parseAIImportMappingRequest(input: unknown): AIImportMappingRequest | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const candidate = input as Record<string, unknown>;
  if (Object.keys(candidate).some((key) => !["csv", "importType", "retry"].includes(key)) || typeof candidate.csv !== "string" || typeof candidate.importType !== "string" || (candidate.retry !== undefined && typeof candidate.retry !== "boolean")) return null;
  if (candidate.importType !== "HISTORICAL_ORDERS" && candidate.importType !== "HISTORICAL_RESERVATIONS") return null;
  return { csv: candidate.csv, importType: candidate.importType, retry: candidate.retry === true };
}

const aliases: Record<ImportTargetField, string[]> = {
  orderNumber: ["order number", "order no", "order id", "bill no", "bill number", "invoice", "invoice no", "ticket", "ticket no"],
  createdAt: ["created at", "created", "order date", "transaction date", "txn date", "date time", "datetime", "date"],
  status: ["status", "order status", "booking status", "reservation status"],
  orderType: ["order type", "type", "channel", "service type"],
  menuItemName: ["menu item", "menu item name", "item", "item name", "dish", "dish name", "product", "product name", "item description"],
  quantity: ["quantity", "qty", "units", "item quantity"],
  unitPrice: ["unit price", "unit rate", "rate", "price", "item price", "net rate"],
  discount: ["discount", "discount amount", "disc", "disc amount"],
  tax: ["tax", "tax amount", "gst", "vat"],
  customerName: ["customer name", "guest name", "name", "customer", "guest"],
  guestCount: ["guest count", "guests", "party size", "pax", "covers"],
  reservationTime: ["reservation time", "booking time", "booking date", "reservation date", "date time", "datetime"],
  tableNumber: ["table number", "table no", "table", "table id"],
};

function normalize(value: string) { return value.toLocaleLowerCase().replace(/[_-]+/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
function candidates(importType: ImportTypeValue): readonly ImportTargetField[] { return importType === "HISTORICAL_ORDERS" ? ORDER_IMPORT_FIELDS : RESERVATION_IMPORT_FIELDS; }
function score(header: string, target: ImportTargetField) {
  const normalized = normalize(header); let best = 0;
  for (const alias of aliases[target]) {
    if (normalized === alias) best = Math.max(best, 0.98);
    else if (normalized.replaceAll(" ", "") === alias.replaceAll(" ", "")) best = Math.max(best, 0.94);
    else if (normalized.includes(alias) || alias.includes(normalized)) best = Math.max(best, normalized.length >= 4 ? 0.76 : 0.62);
  }
  return best;
}

export function suggestImportMapping(input: { headers: string[]; sampleRows: Array<Record<string, string>>; importType: ImportTypeValue }): MappingSuggestionResult {
  const suggestions = input.headers.map((sourceColumn) => {
    const ranked = candidates(input.importType).map((targetField) => ({ targetField, confidence: score(sourceColumn, targetField) })).sort((a, b) => b.confidence - a.confidence);
    const best = ranked[0];
    return { sourceColumn, targetField: best?.confidence >= 0.6 ? best.targetField : null, confidence: best?.confidence ?? 0, source: "heuristic" as const };
  });
  const used = new Map<ImportTargetField, ColumnMapping>();
  for (const suggestion of suggestions) { if (suggestion.targetField) { const existing = used.get(suggestion.targetField); if (!existing || suggestion.confidence > existing.confidence) used.set(suggestion.targetField, suggestion); } }
  const mappings = suggestions.map((suggestion) => suggestion.targetField && used.get(suggestion.targetField)?.sourceColumn !== suggestion.sourceColumn ? { ...suggestion, targetField: null, confidence: 0 } : suggestion);
  return { mappings, warnings: mappings.some((mapping) => !mapping.targetField) ? ["Some columns could not be mapped confidently and require review."] : [] };
}

export const heuristicMappingSuggester: ImportMappingSuggester = { suggest: suggestImportMapping };

export function applyManualMapping(mappings: ColumnMapping[], sourceColumn: string, targetField: ImportTargetField | null) {
  return mappings.map((mapping) => {
    if (mapping.sourceColumn === sourceColumn) return { sourceColumn, targetField, confidence: targetField ? 1 : 0, source: "manual" as const };
    if (targetField && mapping.targetField === targetField) return { ...mapping, targetField: null, confidence: 0, source: "manual" as const };
    return mapping;
  });
}

export function mergeImportMappingSuggestions(current: ColumnMapping[], ai: MappingSuggestionResult): MappingSuggestionResult {
  const warnings = [...ai.warnings];
  const aiBySource = new Map(ai.mappings.map((mapping) => [mapping.sourceColumn, mapping]));
  const protectedTargets = new Set(current.filter((mapping) => mapping.source === "manual" || (mapping.targetField && mapping.confidence >= AI_MAPPING_CONFIDENCE_THRESHOLD)).map((mapping) => mapping.targetField).filter(Boolean));
  const result = current.map((mapping) => {
    if (mapping.source === "manual" || (mapping.targetField && mapping.confidence >= AI_MAPPING_CONFIDENCE_THRESHOLD)) return mapping;
    const suggestion = aiBySource.get(mapping.sourceColumn);
    if (!suggestion) return mapping;
    if (suggestion.targetField && protectedTargets.has(suggestion.targetField)) {
      warnings.push(`${suggestion.sourceColumn} conflicts with a protected automatic or manual mapping and needs review.`);
      return mapping;
    }
    return suggestion;
  });
  const winners = new Map<ImportTargetField, ColumnMapping>();
  for (const mapping of result) {
    if (!mapping.targetField) continue;
    const existing = winners.get(mapping.targetField);
    if (!existing || (existing.source !== "manual" && mapping.confidence > existing.confidence)) winners.set(mapping.targetField, mapping);
  }
  return {
    mappings: result.map((mapping) => mapping.targetField && winners.get(mapping.targetField)?.sourceColumn !== mapping.sourceColumn ? { ...mapping, targetField: null, confidence: 0 } : mapping),
    warnings: [...new Set(warnings)].slice(0, 12),
  };
}
