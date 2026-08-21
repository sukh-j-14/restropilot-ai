export function recipeOwnershipError(
  restaurantId: string,
  menuRestaurantId: string | null,
  ingredientRestaurantId: string | null,
) {
  if (menuRestaurantId !== restaurantId || ingredientRestaurantId !== restaurantId) {
    return "The menu item and ingredient must belong to your restaurant.";
  }
  return null;
}

export function duplicateRecipeIngredientReason(exists: boolean) {
  return exists ? "This ingredient is already in the recipe." : null;
}
