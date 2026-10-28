export const BEHIND_KEY = "prox.behind";

export function showBehind(input: {
  demoSession: boolean;
  deviceOn: boolean;
  queryOn: boolean;
}): boolean {
  return input.demoSession || input.deviceOn || input.queryOn;
}
