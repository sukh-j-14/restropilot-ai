import type { ParsedCsv } from "@/lib/imports/types";

export const MAX_CSV_BYTES = 5 * 1024 * 1024;
export const MAX_CSV_ROWS = 10_000;

export class CsvParseError extends Error {
  constructor(message: string) { super(message); this.name = "CsvParseError"; }
}

function infer(values: string[]): ParsedCsv["inferredTypes"][string] {
  const populated = values.map((value) => value.trim()).filter(Boolean);
  if (!populated.length) return "empty";
  const types = new Set(populated.map((value) => {
    if (/^[+-]?\d+$/.test(value)) return "integer";
    if (/^[₹$€£]?\s*[+-]?[\d,]+(?:\.\d+)?$/.test(value)) return "decimal";
    if (/^\d{4}-\d{1,2}-\d{1,2}(?:[T\s].*)?$/.test(value) || /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}(?:[T\s].*)?$/.test(value)) return "date";
    return "text";
  }));
  return types.size === 1 ? [...types][0] : "mixed";
}

export function parseCsv(input: string, options: { maxRows?: number } = {}): ParsedCsv {
  const maxRows = options.maxRows ?? MAX_CSV_ROWS;
  if (!input.trim()) throw new CsvParseError("The CSV file is empty.");
  const source = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const matrix: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"') {
      if (field.length) throw new CsvParseError(`Malformed quote near row ${matrix.length + 1}.`);
      quoted = true;
    } else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field); field = "";
      if (row.some((value) => value.trim())) matrix.push(row);
      row = [];
      if (matrix.length > maxRows + 1) throw new CsvParseError(`CSV exceeds the ${maxRows.toLocaleString()} row limit.`);
    } else field += character;
  }
  if (quoted) throw new CsvParseError("Malformed CSV: an quoted field is not closed.");
  row.push(field);
  if (row.some((value) => value.trim())) matrix.push(row);
  if (!matrix.length) throw new CsvParseError("The CSV file is empty.");
  const headers = matrix[0].map((header) => header.trim());
  if (!headers.length || headers.some((header) => !header)) throw new CsvParseError("Every CSV column must have a header.");
  if (new Set(headers.map((header) => header.toLocaleLowerCase())).size !== headers.length) throw new CsvParseError("CSV headers must be unique.");
  const dataRows = matrix.slice(1);
  if (dataRows.length > maxRows) throw new CsvParseError(`CSV exceeds the ${maxRows.toLocaleString()} row limit.`);
  const rows = dataRows.map((values, index) => {
    if (values.length > headers.length) throw new CsvParseError(`Row ${index + 2} contains more values than the header row.`);
    return Object.fromEntries(headers.map((header, column) => [header, values[column]?.trim() ?? ""]));
  });
  return { headers, rows, rowCount: rows.length, inferredTypes: Object.fromEntries(headers.map((header) => [header, infer(rows.slice(0, 50).map((item) => item[header]))])) };
}

export function validateCsvFile(filename: string, byteSize: number) {
  if (!filename.toLocaleLowerCase().endsWith(".csv")) throw new CsvParseError("Only .csv files are supported.");
  if (byteSize > MAX_CSV_BYTES) throw new CsvParseError("CSV files must be 5 MB or smaller.");
}
