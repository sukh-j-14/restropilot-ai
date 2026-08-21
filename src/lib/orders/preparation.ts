export type InventoryRequirement = { ingredientId: string; ingredientName: string; required: string };

type PreparationCommitPort = {
  requirements: InventoryRequirement[];
  consumedAt: Date;
  claim: (consumedAt: Date) => Promise<boolean>;
  decrement: (requirement: InventoryRequirement) => Promise<boolean>;
  onClaimFailed: () => Promise<never>;
  onDecrementFailed: (requirement: InventoryRequirement) => never;
};

export async function commitPreparationInventory(port: PreparationCommitPort) {
  const claimed = await port.claim(port.consumedAt);
  if (!claimed) return port.onClaimFailed();
  for (const requirement of port.requirements) {
    if (!await port.decrement(requirement)) port.onDecrementFailed(requirement);
  }
  return { inventoryConsumedAt: port.consumedAt };
}
