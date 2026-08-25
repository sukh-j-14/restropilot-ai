import type { AIActionRiskLevel, AIActionType } from "@/lib/ai/action-policy";
import type { ProposalLifecycleStatus } from "@/lib/ai/action-lifecycle";

export type PurchaseOrderProposalCandidate = {
  supplierName: string;
  items: Array<{ ingredientName: string; quantity: number }>;
  expectedAt?: string;
  explanation: string;
};

export type PurchaseOrderProposalPayload = {
  supplierId: string;
  items: Array<{ ingredientId: string; quantity: number; unitCost: number; stockAtProposal: number; reorderLevelAtProposal: number; openIncomingAtProposal: number }>;
  expectedAt?: string;
};

export type PurchaseOrderProposalDisplay = {
  supplierName: string;
  items: Array<{ ingredientName: string; unit: string; quantity: number; unitCost: number; lineTotal: number }>;
  totalAmount: number;
};

type ProposalBase<T extends AIActionType, P, D> = {
  type: T;
  proposalId: string;
  title: string;
  explanation: string;
  riskLevel: AIActionRiskLevel;
  approvalRequired: boolean;
  status: ProposalLifecycleStatus;
  expiresAt: string;
  payload: P;
  display: D;
};

export type MenuRecipeActionType = "CREATE_MENU_ITEM" | "UPDATE_MENU_ITEM" | "SET_MENU_ITEM_AVAILABILITY" | "ADD_RECIPE_INGREDIENT" | "UPDATE_RECIPE_INGREDIENT" | "REMOVE_RECIPE_INGREDIENT";
export type MenuRecipeProposalCandidate = { actionType: MenuRecipeActionType; menuItemName: string; name?: string; category?: string; price?: number; isActive?: boolean; ingredientName?: string; quantityRequired?: number; explanation: string };
export type MenuRecipeProposalPayload = { menuItemId?: string; recipeItemId?: string; ingredientId?: string; name?: string; category?: string; price?: number; isActive?: boolean; quantityRequired?: number; snapshot: { name?: string; category?: string; price?: number; isActive?: boolean; quantityRequired?: number } };
export type MenuRecipeProposalDisplay = { menuItemName: string; ingredientName?: string; unit?: string; changes: Array<{ label: string; current?: string; proposed?: string }> };
export type PurchaseOrderAIActionProposal = ProposalBase<"CREATE_PURCHASE_ORDER_DRAFT", PurchaseOrderProposalPayload, PurchaseOrderProposalDisplay>;
export type MenuRecipeAIActionProposal = ProposalBase<MenuRecipeActionType, MenuRecipeProposalPayload, MenuRecipeProposalDisplay>;

export type InventoryActionType = "CREATE_INGREDIENT" | "UPDATE_INGREDIENT" | "ADJUST_INVENTORY_STOCK";
export type InventoryAdjustmentKind = "RECEIPT" | "USAGE" | "WASTE" | "COUNT";
export type InventoryProposalCandidate = { actionType: InventoryActionType; ingredientName: string; name?: string; unit?: string; initialStock?: number; reorderLevel?: number; costPerUnit?: number; adjustmentKind?: InventoryAdjustmentKind; quantity?: number; quantityUnit?: string; countedStock?: number; reason?: string; explanation: string };
export type InventoryProposalPayload = { ingredientId?: string; name?: string; unit?: string; initialStock?: number; reorderLevel?: number; costPerUnit?: number; adjustmentKind?: InventoryAdjustmentKind; normalizedQuantity?: number; countedStock?: number; reason?: string; snapshot: { name?: string; unit?: string; currentStock?: number; reorderLevel?: number; costPerUnit?: number } };
export type InventoryProposalDisplay = { ingredientName: string; unit: string; movementType?: InventoryAdjustmentKind; changes: Array<{ label: string; current?: string; proposed?: string; tone?: "decrease" | "increase" }> };
export type InventoryAIActionProposal = ProposalBase<InventoryActionType, InventoryProposalPayload, InventoryProposalDisplay>;
export type SupplierActionType = "CREATE_SUPPLIER" | "UPDATE_SUPPLIER";
export type SupplierProposalCandidate = { actionType: SupplierActionType; supplierName: string; name?: string; email?: string; phone?: string; explanation: string };
export type SupplierProposalPayload = { supplierId?: string; name?: string; email?: string; phone?: string; snapshot: { name?: string; email?: string | null; phone?: string | null; updatedAt?: string } };
export type SupplierProposalDisplay = { supplierName: string; changes: Array<{ label: string; current?: string; proposed?: string }> };
export type SupplierAIActionProposal = ProposalBase<SupplierActionType, SupplierProposalPayload, SupplierProposalDisplay>;
export type ReservationActionType = "CREATE_RESERVATION" | "UPDATE_RESERVATION" | "TRANSITION_RESERVATION_STATUS";
export type ReservationProposalCandidate = { actionType: ReservationActionType; customerName: string; currentReservationTime?: string; reservationTime?: string; guestCount?: number; tableNumber?: string | null; status?: string; explanation: string };
export type ReservationProposalPayload = { reservationId?: string; customerName: string; reservationTime?: string; guestCount?: number; tableNumber?: string | null; status?: string; snapshot: { customerName?: string; reservationTime?: string; guestCount?: number; tableNumber?: string | null; status?: string; updatedAt?: string } };
export type ReservationProposalDisplay = { customerName: string; localDateTime: string; guestCount: number; tableNumber: string | null; status?: string; changes: Array<{ label: string; current?: string; proposed?: string }> };
export type ReservationAIActionProposal = ProposalBase<ReservationActionType, ReservationProposalPayload, ReservationProposalDisplay>;
export type OrderActionType = "CREATE_ORDER" | "UPDATE_ORDER_ITEMS" | "TRANSITION_ORDER_STATUS";
export type OrderProposalCandidate = { actionType: OrderActionType; orderNumber?: string; orderType?: string; items?: Array<{ menuItemName: string; quantity: number }>; discount?: number; tax?: number; status?: string; explanation: string };
export type OrderProposalPayload = { orderId?: string; orderNumber?: string; orderType?: string; items?: Array<{ menuItemId: string; quantity: number; unitPrice: number }>; discount?: number; tax?: number; status?: string; snapshot: { status?: string; orderType?: string; inventoryConsumedAt?: string | null; subtotal?: number; discount?: number; tax?: number; total?: number; items?: Array<{ menuItemId: string; quantity: number; unitPrice: number }> } };
export type OrderProposalDisplay = { orderNumber?: string; orderType?: string; items: Array<{ menuItemName: string; quantity: number; unitPrice: number; totalPrice: number }>; subtotal?: number; discount?: number; tax?: number; total?: number; currentStatus?: string; proposedStatus?: string; changes: Array<{ label: string; current?: string; proposed?: string }> };
export type OrderAIActionProposal = ProposalBase<OrderActionType, OrderProposalPayload, OrderProposalDisplay>;
export type RestaurantSettingsSnapshot = { name: string; phone: string | null; address: string | null; timezone: string; currency: string; guestCapacity: number; updatedAt: string };
export type RestaurantSettingsProposalCandidate = { actionType: "UPDATE_RESTAURANT_SETTINGS"; name?: string; phone?: string; address?: string; timezone?: string; currency?: string; guestCapacity?: number; explanation: string };
export type RestaurantSettingsProposalPayload = { proposed: Omit<RestaurantSettingsSnapshot, "updatedAt">; snapshot: RestaurantSettingsSnapshot };
export type RestaurantSettingsProposalDisplay = { restaurantName: string; changes: Array<{ label: string; current: string; proposed: string }>; timezoneChanged: boolean };
export type RestaurantSettingsAIActionProposal = ProposalBase<"UPDATE_RESTAURANT_SETTINGS", RestaurantSettingsProposalPayload, RestaurantSettingsProposalDisplay>;
export type PurchaseOrderStatusProposalCandidate = { actionType: "TRANSITION_PURCHASE_ORDER_STATUS"; reference?: string; supplierName?: string; currentStatus?: string; status: string; explanation: string };
export type PurchaseOrderStatusSnapshot = { status: string; supplierId: string; totalAmount: number; expectedAt: string | null; orderedAt: string | null; updatedAt: string; items: Array<{ ingredientId: string; quantity: number; unitCost: number }> };
export type PurchaseOrderStatusProposalPayload = { purchaseOrderId: string; status: string; snapshot: PurchaseOrderStatusSnapshot };
export type PurchaseOrderStatusProposalDisplay = { reference: string; supplierName: string; currentStatus: string; proposedStatus: string; totalAmount: number; items: Array<{ ingredientName: string; unit: string; quantity: number; unitCost: number }>; inventoryImpact: boolean };
export type PurchaseOrderStatusAIActionProposal = ProposalBase<"TRANSITION_PURCHASE_ORDER_STATUS", PurchaseOrderStatusProposalPayload, PurchaseOrderStatusProposalDisplay>;
export type AIActionProposal = PurchaseOrderAIActionProposal | MenuRecipeAIActionProposal | InventoryAIActionProposal | SupplierAIActionProposal | ReservationAIActionProposal | OrderAIActionProposal | RestaurantSettingsAIActionProposal | PurchaseOrderStatusAIActionProposal;
export type AIProposalCandidate = PurchaseOrderProposalCandidate | MenuRecipeProposalCandidate | InventoryProposalCandidate | SupplierProposalCandidate | ReservationProposalCandidate | OrderProposalCandidate | RestaurantSettingsProposalCandidate | PurchaseOrderStatusProposalCandidate;
