"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { CsvParseError, MAX_CSV_BYTES, parseCsv } from "@/lib/imports/csv";
import { getAIProvider } from "@/lib/ai/provider";
import { suggestImportMappingsWithAI, type AIImportMappingOutcome } from "@/lib/imports/ai-mapping";
import { parseAIImportMappingRequest, suggestImportMapping } from "@/lib/imports/mapping";
import { IMPORT_TYPES, type ColumnMapping, type ImportTargetField, type ImportTypeValue, type PreviewSummary } from "@/lib/imports/types";
import { ImportEngineError } from "@/lib/services/import-errors";
import { confirmImport, prepareImportPreview } from "@/lib/services/imports";
import { getCurrentRestaurant } from "@/lib/services/tenant";

export type ImportActionState = { status: "idle" | "preview" | "success" | "error"; message?: string; preview?: PreviewSummary; result?: { importedCount: number; failedCount: number; type: ImportTypeValue } };
export type ImportMappingActionResult = Pick<AIImportMappingOutcome, "mappings" | "warnings" | "status" | "aiMappingCount"> & { message: string };
const mappingAnalysisCache = new Map<string, { expiresAt: number; result: ImportMappingActionResult }>();
const MAPPING_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_MAPPING_CACHE_ENTRIES = 200;
const value = (formData: FormData, name: string) => { const entry = formData.get(name); return typeof entry === "string" ? entry : ""; };
async function restaurantId() { try { return (await getCurrentRestaurant())?.id ?? null; } catch { return null; } }

function request(formData: FormData, tenantId: string) {
  const importType = value(formData, "importType") as ImportTypeValue;
  if (!IMPORT_TYPES.includes(importType)) throw new ImportEngineError("Import type is invalid.");
  let parsed: unknown;
  try { parsed = JSON.parse(value(formData, "mappings")); } catch { throw new ImportEngineError("Column mappings are malformed."); }
  if (!Array.isArray(parsed) || parsed.length > 200) throw new ImportEngineError("Column mappings are malformed.");
  const mappings: ColumnMapping[] = parsed.map((mapping) => {
    if (!mapping || typeof mapping.sourceColumn !== "string" || mapping.sourceColumn.length > 255 || (mapping.targetField !== null && typeof mapping.targetField !== "string")) throw new ImportEngineError("Column mappings are malformed.");
    return { sourceColumn: mapping.sourceColumn, targetField: mapping.targetField as ImportTargetField | null, confidence: typeof mapping.confidence === "number" && mapping.confidence >= 0 && mapping.confidence <= 1 ? mapping.confidence : 0, source: mapping.source === "manual" || mapping.source === "ai" ? mapping.source : "heuristic" };
  });
  return { restaurantId: tenantId, filename: value(formData, "filename"), csv: value(formData, "csv"), importType, mappings };
}
function errorMessage(error: unknown) { return error instanceof CsvParseError || error instanceof ImportEngineError ? error.message : "Import processing failed. Please review the file and try again."; }

export async function previewImportAction(_state: ImportActionState, formData: FormData): Promise<ImportActionState> {
  const tenantId = await restaurantId(); if (!tenantId) return { status: "error", message: "Restaurant setup is required." };
  try { const preview = await prepareImportPreview(request(formData, tenantId)); return { status: "preview", message: preview.summary.canImport ? "Preview ready. Review it before confirming." : "No records are currently ready to import.", preview: preview.summary }; }
  catch (error) { return { status: "error", message: errorMessage(error) }; }
}

export async function confirmImportAction(_state: ImportActionState, formData: FormData): Promise<ImportActionState> {
  const tenantId = await restaurantId(); if (!tenantId) return { status: "error", message: "Restaurant setup is required." };
  try { const result = await confirmImport(request(formData, tenantId)); revalidatePath("/imports"); revalidatePath("/orders"); revalidatePath("/"); return { status: "success", message: `${result.importedCount} records imported successfully.`, result: { importedCount: result.importedCount, failedCount: result.failedCount, type: result.type } }; }
  catch (error) { return { status: "error", message: errorMessage(error) }; }
}

export async function suggestImportMappingsAction(input: unknown): Promise<ImportMappingActionResult> {
  const tenantId = await restaurantId();
  if (!tenantId) return { status: "unavailable", mappings: [], warnings: [], aiMappingCount: 0, message: "Restaurant setup is required." };
  try {
    const candidate = parseAIImportMappingRequest(input);
    if (!candidate || Buffer.byteLength(candidate.csv, "utf8") > MAX_CSV_BYTES) throw new ImportEngineError("Import mapping request is invalid.");
    const importType = candidate.importType;
    const cacheKey = createHash("sha256").update(`${tenantId}\0${importType}\0${candidate.csv}`).digest("hex");
    const cached = mappingAnalysisCache.get(cacheKey);
    if (!candidate.retry && cached && cached.expiresAt > Date.now()) return cached.result;
    const document = parseCsv(candidate.csv);
    const heuristic = suggestImportMapping({ headers: document.headers, sampleRows: document.rows.slice(0, 10), importType });
    const startedAt = Date.now();
    const result = await suggestImportMappingsWithAI({ document, importType, heuristicMappings: heuristic.mappings, provider: getAIProvider });
    console.info(JSON.stringify({ event: "ai_import_mapping", importType, columnCount: document.headers.length, heuristicMappings: heuristic.mappings.filter((mapping) => mapping.targetField).length, aiMappings: result.aiMappingCount, unresolvedColumns: result.mappings.filter((mapping) => !mapping.targetField).length, status: result.status, durationMs: Date.now() - startedAt }));
    const message = result.status === "not_needed" ? "Automatic mappings are already high confidence." : result.status === "applied" ? `AI reviewed the unfamiliar columns and suggested ${result.aiMappingCount} mapping${result.aiMappingCount === 1 ? "" : "s"}.` : result.warnings[0];
    const response = { ...result, message };
    if (mappingAnalysisCache.size >= MAX_MAPPING_CACHE_ENTRIES) mappingAnalysisCache.delete(mappingAnalysisCache.keys().next().value ?? "");
    mappingAnalysisCache.set(cacheKey, { expiresAt: Date.now() + MAPPING_CACHE_TTL_MS, result: response });
    return response;
  } catch (error) {
    return { status: "unavailable", mappings: [], warnings: [], aiMappingCount: 0, message: errorMessage(error) };
  }
}
