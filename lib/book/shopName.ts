export function shopNameDraft(value: string): string | null {
  const name = value.trim();
  if (name.length < 2 || name.length > 80) return null;
  return name;
}

/** The creator or a verified owner may rename. Pending claims and strangers may not. */
export function canRenameShop(input: {
  userId: string | null;
  createdBy: string | null;
  ownerStatus: "verified" | "pending" | "none";
}): boolean {
  if (!input.userId) return false;
  if (input.createdBy && input.createdBy === input.userId) return true;
  return input.ownerStatus === "verified";
}
