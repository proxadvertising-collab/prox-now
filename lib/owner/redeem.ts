import type { CopyKey } from "../copy";

/** Map a redeem RPC failure onto a sentence. Unknown codes keep the generic line. */
export function redeemFailureKey(code: string | null | undefined): CopyKey {
  if (code === "not_found") return "loop.codeInvalid";
  if (code === "expired") return "loop.couponExpired";
  if (code === "already_used") return "loop.couponUsed";
  return "loop.fail";
}
