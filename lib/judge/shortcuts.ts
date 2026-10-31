/** Demo shortcuts run only when both the shop and the signed-in account are demo. */
export function allowNoCodeClaim(input: { shopDemo: boolean; demoAccount: boolean }): boolean {
  return input.shopDemo === true && input.demoAccount === true;
}

/** A client flag cannot skip the live-post wait on a real shop or a real account. */
export function allowImmediatePost(input: { shopDemo: boolean; demoAccount: boolean; requested: boolean }): boolean {
  return input.requested === true && input.shopDemo === true && input.demoAccount === true;
}
