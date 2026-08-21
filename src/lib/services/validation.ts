import type { DateRangeInput } from "@/lib/services/types";

export class ServiceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceInputError";
  }
}

export function assertRestaurantId(restaurantId: string) {
  if (typeof restaurantId !== "string" || restaurantId.trim().length === 0) {
    throw new ServiceInputError("restaurantId is required.");
  }
}

export function assertDateRange(input: DateRangeInput) {
  assertRestaurantId(input.restaurantId);
  if (!(input.start instanceof Date) || Number.isNaN(input.start.getTime())) {
    throw new ServiceInputError("start must be a valid Date.");
  }
  if (!(input.end instanceof Date) || Number.isNaN(input.end.getTime())) {
    throw new ServiceInputError("end must be a valid Date.");
  }
  if (input.start >= input.end) {
    throw new ServiceInputError("start must be earlier than end.");
  }
}

export function assertIdentifier(value: string, name: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ServiceInputError(`${name} is required.`);
  }
}

export function assertLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ServiceInputError("limit must be an integer between 1 and 100.");
  }
}
