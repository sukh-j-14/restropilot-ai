export const INGREDIENT_UNITS = ["kg", "litre", "piece"] as const;

export type MenuItemFields = {
  name: string;
  category: string;
  price: string;
};

export type IngredientFields = {
  name: string;
  unit: string;
  currentStock: string;
  reorderLevel: string;
  costPerUnit: string;
};

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

function decimalValue(value: string, decimalPlaces: number, maximum: number) {
  const normalized = value.trim();
  const pattern = new RegExp(`^\\d+(?:\\.\\d{1,${decimalPlaces}})?$`);
  if (!pattern.test(normalized)) return null;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > maximum) return null;
  return normalized;
}

export function validateMenuItem(fields: MenuItemFields):
  | { success: true; data: MenuItemFields }
  | { success: false; fieldErrors: FieldErrors<MenuItemFields> } {
  const name = fields.name.trim();
  const category = fields.category.trim();
  const price = decimalValue(fields.price, 2, 9_999_999.99);
  const fieldErrors: FieldErrors<MenuItemFields> = {};

  if (name.length < 2 || name.length > 120) fieldErrors.name = "Name must be between 2 and 120 characters.";
  if (category.length < 2 || category.length > 80) fieldErrors.category = "Category must be between 2 and 80 characters.";
  if (price === null || Number(price) <= 0) fieldErrors.price = "Enter a price greater than zero with up to 2 decimal places.";

  return Object.keys(fieldErrors).length
    ? { success: false, fieldErrors }
    : { success: true, data: { name, category, price: price! } };
}

export function validateIngredient(fields: IngredientFields):
  | { success: true; data: IngredientFields }
  | { success: false; fieldErrors: FieldErrors<IngredientFields> } {
  const name = fields.name.trim();
  const unit = fields.unit.trim();
  const currentStock = decimalValue(fields.currentStock, 3, 999_999_999.999);
  const reorderLevel = decimalValue(fields.reorderLevel, 3, 999_999_999.999);
  const costPerUnit = decimalValue(fields.costPerUnit, 4, 99_999_999.9999);
  const fieldErrors: FieldErrors<IngredientFields> = {};

  if (name.length < 2 || name.length > 120) fieldErrors.name = "Name must be between 2 and 120 characters.";
  if (!INGREDIENT_UNITS.includes(unit as (typeof INGREDIENT_UNITS)[number])) fieldErrors.unit = "Select a supported unit.";
  if (currentStock === null) fieldErrors.currentStock = "Enter non-negative stock with up to 3 decimal places.";
  if (reorderLevel === null) fieldErrors.reorderLevel = "Enter a non-negative reorder level with up to 3 decimal places.";
  if (costPerUnit === null) fieldErrors.costPerUnit = "Enter a non-negative unit cost with up to 4 decimal places.";

  return Object.keys(fieldErrors).length
    ? { success: false, fieldErrors }
    : { success: true, data: { name, unit, currentStock: currentStock!, reorderLevel: reorderLevel!, costPerUnit: costPerUnit! } };
}
