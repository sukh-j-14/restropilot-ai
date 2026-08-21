import type { FieldErrors } from "@/lib/catalog/validation";

export type RecipeFields = { quantityRequired: string };

export function validateRecipe(fields: RecipeFields):
  | { success: true; data: RecipeFields }
  | { success: false; fieldErrors: FieldErrors<RecipeFields> } {
  const quantityRequired = fields.quantityRequired.trim();
  const valid = /^\d+(?:\.\d{1,3})?$/.test(quantityRequired)
    && Number(quantityRequired) > 0
    && Number(quantityRequired) <= 999_999_999.999;

  return valid
    ? { success: true, data: { quantityRequired } }
    : { success: false, fieldErrors: { quantityRequired: "Enter a quantity greater than zero with up to 3 decimal places." } };
}
