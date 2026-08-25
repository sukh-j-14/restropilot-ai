import "server-only";

import type { AIProvider } from "@/lib/ai/types";
import { AI_MAPPING_CONFIDENCE_THRESHOLD, mergeImportMappingSuggestions } from "@/lib/imports/mapping";
import {
  ORDER_IMPORT_FIELDS,
  RESERVATION_IMPORT_FIELDS,
  type ColumnMapping,
  type ImportTargetField,
  type ImportTypeValue,
  type MappingSuggestionResult,
  type ParsedCsv,
} from "@/lib/imports/types";

export const MAX_AI_MAPPING_COLUMNS = 60;
export const MAX_AI_SAMPLES_PER_COLUMN = 4;
export const MAX_AI_SAMPLE_LENGTH = 64;
export const AI_MAPPING_TIMEOUT_MS = 15_000;
const IGNORE_TARGET = "__IGNORE__";

export type AIColumnContext = {
  sourceColumn: string;
  inferredType: ParsedCsv["inferredTypes"][string];
  heuristicTarget: ImportTargetField | null;
  heuristicConfidence: number;
  samples: string[];
};

export type AIImportMappingContext = {
  importType: ImportTypeValue;
  allowedTargets: readonly ImportTargetField[];
  columns: AIColumnContext[];
};

export type AIImportMappingOutcome = MappingSuggestionResult & {
  status: "not_needed" | "applied" | "unavailable";
  aiMappingCount: number;
};

export function allowedImportTargets(importType: ImportTypeValue): readonly ImportTargetField[] {
  return importType === "HISTORICAL_ORDERS" ? ORDER_IMPORT_FIELDS : RESERVATION_IMPORT_FIELDS;
}

function looksSensitiveHeader(header: string) {
  return /(?:customer|guest|name|email|e-mail|phone|mobile|contact)/i.test(header);
}

function looksSensitiveValue(value: string) {
  return /@/.test(value) || /(?:\+?\d[\d ()-]{7,}\d)/.test(value);
}

function boundedSamples(document: ParsedCsv, sourceColumn: string, importType: ImportTypeValue) {
  const inferredType = document.inferredTypes[sourceColumn];
  if (looksSensitiveHeader(sourceColumn)) return [];
  // Free-form reservation text is likely to contain guest identity data. Header
  // semantics are sufficient; only structural number/date examples are shared.
  if (importType === "HISTORICAL_RESERVATIONS" && (inferredType === "text" || inferredType === "mixed")) return [];
  const unique = new Set<string>();
  for (const row of document.rows) {
    const value = row[sourceColumn]?.trim();
    if (!value || looksSensitiveValue(value)) continue;
    unique.add(value.slice(0, MAX_AI_SAMPLE_LENGTH));
    if (unique.size >= MAX_AI_SAMPLES_PER_COLUMN) break;
  }
  return [...unique];
}

export function buildAIImportMappingContext(
  document: ParsedCsv,
  importType: ImportTypeValue,
  heuristicMappings: ColumnMapping[],
): AIImportMappingContext | null {
  if (document.headers.length > MAX_AI_MAPPING_COLUMNS) return null;
  const bySource = new Map(heuristicMappings.map((mapping) => [mapping.sourceColumn, mapping]));
  const columns = document.headers.flatMap((sourceColumn) => {
    const heuristic = bySource.get(sourceColumn);
    if (heuristic?.source === "manual" || (heuristic?.targetField && heuristic.confidence >= AI_MAPPING_CONFIDENCE_THRESHOLD)) return [];
    return [{
      sourceColumn: sourceColumn.slice(0, 255),
      inferredType: document.inferredTypes[sourceColumn] ?? "mixed",
      heuristicTarget: heuristic?.targetField ?? null,
      heuristicConfidence: heuristic?.confidence ?? 0,
      samples: boundedSamples(document, sourceColumn, importType),
    }];
  });
  return columns.length ? { importType, allowedTargets: allowedImportTargets(importType), columns } : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => key in value);
}

export function parseAIImportMappingResponse(
  value: unknown,
  context: AIImportMappingContext,
): MappingSuggestionResult {
  if (!isPlainObject(value) || !hasOnlyKeys(value, ["mappings", "warnings"]) || !Array.isArray(value.mappings) || !Array.isArray(value.warnings)) {
    throw new Error("AI mapping response is malformed.");
  }
  const sources = new Set(context.columns.map((column) => column.sourceColumn));
  const targets = new Set<string>(context.allowedTargets);
  const seenSources = new Set<string>();
  const mappings: ColumnMapping[] = value.mappings.map((entry) => {
    if (!isPlainObject(entry) || !hasOnlyKeys(entry, ["sourceColumn", "targetField", "confidence"])) throw new Error("AI mapping response is malformed.");
    if (typeof entry.sourceColumn !== "string" || !sources.has(entry.sourceColumn) || seenSources.has(entry.sourceColumn)) throw new Error("AI mapping references an invalid source column.");
    if (typeof entry.targetField !== "string" || (entry.targetField !== IGNORE_TARGET && !targets.has(entry.targetField))) throw new Error("AI mapping references an invalid target field.");
    if (typeof entry.confidence !== "number" || !Number.isFinite(entry.confidence) || entry.confidence < 0 || entry.confidence > 1) throw new Error("AI mapping confidence is invalid.");
    seenSources.add(entry.sourceColumn);
    return { sourceColumn: entry.sourceColumn, targetField: entry.targetField === IGNORE_TARGET ? null : entry.targetField as ImportTargetField, confidence: entry.confidence, source: "ai" };
  });
  const warnings = value.warnings.map((warning) => {
    if (typeof warning !== "string" || warning.length > 240) throw new Error("AI mapping warning is invalid.");
    return warning.trim();
  }).filter(Boolean).slice(0, 8);
  return { mappings, warnings };
}

export async function suggestImportMappingsWithAI(input: {
  document: ParsedCsv;
  importType: ImportTypeValue;
  heuristicMappings: ColumnMapping[];
  provider: AIProvider | (() => AIProvider);
}): Promise<AIImportMappingOutcome> {
  if (input.document.headers.length > MAX_AI_MAPPING_COLUMNS) return {
    mappings: input.heuristicMappings,
    warnings: [`AI mapping is limited to ${MAX_AI_MAPPING_COLUMNS} columns. Continue with automatic and manual mapping.`],
    status: "unavailable",
    aiMappingCount: 0,
  };
  const context = buildAIImportMappingContext(input.document, input.importType, input.heuristicMappings);
  if (!context) return { mappings: input.heuristicMappings, warnings: [], status: "not_needed", aiMappingCount: 0 };
  const toolName = "submit_import_mapping_suggestions";
  try {
    const provider = typeof input.provider === "function" ? input.provider() : input.provider;
    const response = await provider.generate({
      messages: [
        { role: "system", content: "You map CSV columns to an explicit import contract. Return only one function call. Never infer database fields, tenant identifiers, or normalized row data. Use __IGNORE__ when a column should not be mapped. Confidence must reflect uncertainty." },
        { role: "user", content: JSON.stringify(context) },
      ],
      tools: [{
        name: toolName,
        description: "Submit bounded CSV header mapping suggestions.",
        parameters: {
          type: "object",
          properties: {
            mappings: { type: "array", maxItems: context.columns.length, items: { type: "object", properties: { sourceColumn: { type: "string" }, targetField: { type: "string", enum: [...context.allowedTargets, IGNORE_TARGET] }, confidence: { type: "number", minimum: 0, maximum: 1 } }, required: ["sourceColumn", "targetField", "confidence"], additionalProperties: false } },
            warnings: { type: "array", maxItems: 8, items: { type: "string", maxLength: 240 } },
          },
          required: ["mappings", "warnings"],
          additionalProperties: false,
        },
      }],
      toolChoice: "auto",
      maxOutputTokens: 1_200,
      timeoutMs: AI_MAPPING_TIMEOUT_MS,
    });
    if (response.toolCalls.length !== 1 || response.toolCalls[0].name !== toolName) throw new Error("AI mapper did not return structured output.");
    const parsed = parseAIImportMappingResponse(JSON.parse(response.toolCalls[0].arguments), context);
    const merged = mergeImportMappingSuggestions(input.heuristicMappings, parsed);
    return { ...merged, status: "applied", aiMappingCount: merged.mappings.filter((mapping) => mapping.source === "ai").length };
  } catch {
    return {
      mappings: input.heuristicMappings,
      warnings: ["AI suggestions are temporarily unavailable. You can continue mapping columns manually."],
      status: "unavailable",
      aiMappingCount: 0,
    };
  }
}
