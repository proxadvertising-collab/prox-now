export type BookWriteAction = "add" | "replace" | "delete";

/** Add is open on an unclaimed shop. Replace and delete need the verified owner, or the server during demo reset. */
export function bookWriteAllowed(input: {
  claimed: boolean;
  verifiedOwner: boolean;
  serverReset: boolean;
  demoShop?: boolean;
  demoAccount?: boolean;
  action: BookWriteAction;
}): boolean {
  if (input.serverReset || input.verifiedOwner) return true;
  if (input.action !== "add") return false;
  if (!input.claimed) return true;
  return input.demoShop === true && input.demoAccount === true;
}
