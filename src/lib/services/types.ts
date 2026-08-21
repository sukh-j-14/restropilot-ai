export type DateRangeInput = {
  restaurantId: string;
  start: Date;
  end: Date;
};

export type SerializableDateRange = {
  start: string;
  end: string;
};

export type StockItem = {
  ingredientId: string;
  name: string;
  unit: string;
  currentStock: number;
  reorderLevel: number;
  costPerUnit: number;
  isLowStock: boolean;
};

export type ReservationAggregateInput = {
  status: string;
  guestCount: number;
};

export type IngredientUsageLine = {
  orderItemQuantity: number;
  quantityRequired: number;
};
