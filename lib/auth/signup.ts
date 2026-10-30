import { signedInDest } from "../../app/login/gate";

export type SignUpProblem = "taken" | "weak" | "confirm" | "failed";

/** Where a new account goes. A requested page wins. Otherwise the camera. */
export function accountDest(next: string | null | undefined): string {
  if (next && next.trim()) return signedInDest(next);
  return "/snap";
}

/** Maps a Supabase sign-up error onto a short reason. Confirmation is a separate check. */
export function signUpFailure(message: string): SignUpProblem {
  const text = message.toLowerCase();
  if (
    (text.includes("already") && (text.includes("registered") || text.includes("exists"))) ||
    text.includes("already been registered")
  ) {
    return "taken";
  }
  if (text.includes("password") && (text.includes("weak") || text.includes("at least") || text.includes("short") || text.includes("6"))) {
    return "weak";
  }
  if (text.includes("confirm") || text.includes("verify your")) return "confirm";
  return "failed";
}
