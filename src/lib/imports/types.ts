export const IMPORT_TYPES = ["HISTORICAL_ORDERS", "HISTORICAL_RESERVATIONS"] as const;
export type ImportTypeValue = (typeof IMPORT_TYPES)[number];

export const ORDER_IMPORT_FIELDS = ["orderNumber", "createdAt", "status", "orderType", "menuItemName", "quantity", "unitPrice", "discount", "tax"] as const;
export const RESERVATION_IMPORT_FIELDS = ["customerName", "guestCount", "reservationTime", "status", "tableNumber"] as const;
export type OrderImportField = (typeof ORDER_IMPORT_FIELDS)[number];
export type ReservationImportField = (typeof RESERVATION_IMPORT_FIELDS)[number];
export type ImportTargetField = OrderImportField | ReservationImportField;
export type MappingSource = "heuristic" | "manual" | "ai";

export type ColumnMapping = {
  sourceColumn: string;
  targetField: ImportTargetField | null;
  confidence: number;
  source: MappingSource;
};

export type ParsedCsv = {
  headers: string[];
  rows: Array<Record<string, string>>;
  rowCount: number;
  inferredTypes: Record<string, "empty" | "integer" | "decimal" | "date" | "text" | "mixed">;
};

export type MappingSuggestionInput = { headers: string[]; sampleRows: Array<Record<string, string>>; importType: ImportTypeValue };
export type MappingSuggestionResult = { mappings: ColumnMapping[]; warnings: string[] };
export interface ImportMappingSuggester { suggest(input: MappingSuggestionInput): Promise<MappingSuggestionResult> | MappingSuggestionResult }

export type RowError = { row: number; field?: string; message: string };
export type PreviewSummary = {
  filename: string;
  importType: ImportTypeValue;
  rowCount: number;
  mappedColumns: number;
  unmappedColumns: string[];
  validRecords: number;
  invalidRecords: number;
  detectedRecords: number;
  duplicateRecords: number;
  unknownMenuItems: string[];
  rowErrors: RowError[];
  sampleRecords: Array<Record<string, unknown>>;
  canImport: boolean;
};

export const REQUIRED_FIELDS: Record<ImportTypeValue, readonly ImportTargetField[]> = {
  HISTORICAL_ORDERS: ["orderNumber", "createdAt", "menuItemName", "quantity", "unitPrice"],
  HISTORICAL_RESERVATIONS: ["customerName", "guestCount", "reservationTime"],
};

export const FIELD_LABELS: Record<ImportTargetField, string> = {
  orderNumber: "Order Number", createdAt: "Created At", status: "Status", orderType: "Order Type", menuItemName: "Menu Item", quantity: "Quantity", unitPrice: "Unit Price", discount: "Discount", tax: "Tax",
  customerName: "Customer Name", guestCount: "Guest Count", reservationTime: "Reservation Time", tableNumber: "Table Number",
};
