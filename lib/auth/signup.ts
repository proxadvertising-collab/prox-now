import { signedInDest } from "../../app/login/gate";

export type SignUpProblem = "taken" | "weak" | "confirm" | "failed";

/** Where a new account goes. A requested page wins. Otherwise the camera. */
export function accountDest(next: string | null | undefined): string {
  if (next && next.trim()) return signedInDest(next);
  return "/snap";
}

export const CODE_COOLDOWN_S = 60;

/** No session means the confirmation code is still in the email. */
export function codeStepAfterSignUp(session: unknown): boolean {
  return session == null;
}

/** A password sign-in for an account that has not confirmed yet. */
export function signInNeedsCode(message: string, code?: string): boolean {
  if (code === "email_not_confirmed") return true;
  return signUpFailure(message) === "confirm";
}

export function codeDigits(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 6);
}

export function codeReady(token: string): boolean {
  return /^\d{6}$/.test(token);
}

export function verifyOutcome(ok: boolean): "signed-in" | "mismatch" {
  return ok ? "signed-in" : "mismatch";
}

export function canResend(cooldown: number): boolean {
  return cooldown <= 0;
}

/** A new code is allowed only after the wait. A send starts another full wait. */
export function resendPlan(cooldown: number): { send: boolean; cooldown: number } {
  if (!canResend(cooldown)) return { send: false, cooldown };
  return { send: true, cooldown: CODE_COOLDOWN_S };
}

export function tickCooldown(seconds: number): number {
  return seconds > 0 ? seconds - 1 : 0;
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
