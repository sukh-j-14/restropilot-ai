export type WorkspaceOption = { id: string; name: string };

export function workspaceInitials(name: string) {
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 3).map((part) => part[0]?.toUpperCase()).join("");
  return initials || "ORG";
}

export function workspaceMenuState(activeOrganizationId: string | null | undefined, memberships: WorkspaceOption[]) {
  return memberships.map((workspace) => ({ ...workspace, isActive: workspace.id === activeOrganizationId }));
}
