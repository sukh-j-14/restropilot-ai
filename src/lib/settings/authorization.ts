export function canManageRestaurantSettings(orgRole: string | null | undefined) {
  return orgRole === "org:admin";
}
