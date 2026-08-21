"use server";

import { revalidatePath } from "next/cache";
import { CsvParseError } from "@/lib/imports/csv";
import { IMPORT_TYPES, type ColumnMapping, type ImportTargetField, type ImportTypeValue, type PreviewSummary } from "@/lib/imports/types";
import { ImportEngineError } from "@/lib/services/import-errors";
import { confirmImport, prepareImportPreview } from "@/lib/services/imports";
import { getCurrentRestaurant } from "@/lib/services/tenant";

export type ImportActionState = { status: "idle" | "preview" | "success" | "error"; message?: string; preview?: PreviewSummary; result?: { importedCount: number; failedCount: number; type: ImportTypeValue } };
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
