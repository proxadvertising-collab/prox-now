export const FRESH_DEMO_NEXT = "/snap";

/** A row goes only when a demo account made it at a demo shop. */
export function resetRemoves(
  row: { actorId: string; shopDemo: boolean },
  demoIds: readonly string[],
): boolean {
  return row.shopDemo && demoIds.includes(row.actorId);
}
