"use client";

import { useEffect, useLayoutEffect, useState, type FormEvent } from "react";
import {
  canResend,
  codeDigits,
  codeReady,
  CODE_COOLDOWN_S,
  codeStepAfterSignUp,
  emailSendLimit,
  resendPlan,
  signInNeedsCode,
  signUpFailure,
  tickCooldown,
  verifyOutcome,
} from "@/lib/auth/signup";
import { t } from "@/lib/copy";
import {
  KEEP_STORAGE_KEY,
  SESSION_MIRROR_KEY,
  clientSkipsLogin,
  createClient,
  sessionPersistence,
  shouldClearTabSession,
} from "@/lib/supabase/client";

const primary = "btn-primary w-full";
const field = "field";

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function LoginForm({ dest, createDest, failed }: { dest: string; createDest: string; failed: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"credentials" | "code">("credentials");
  const [keep, setKeep] = useState(true);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(failed ? t("en", "auth.failed") : null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((current) => tickCooldown(current)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useLayoutEffect(() => {
    let persistence = sessionPersistence(true);
    let mirror: string | null = null;
    try {
      persistence = sessionPersistence(window.localStorage.getItem(KEEP_STORAGE_KEY) !== "0");
      mirror = persistence === "session" ? window.sessionStorage.getItem(SESSION_MIRROR_KEY) : null;
    } catch {
      return;
    }
    if (clientSkipsLogin(persistence, mirror)) {
      window.location.replace(dest);
      return;
    }
    if (shouldClearTabSession(persistence, mirror)) createClient();
  }, [dest]);

  async function signIn() {
    const address = email.trim();
    if (!isEmail(address)) {
      setError(t("en", "auth.emailInvalid"));
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient({ keepSignedIn: keep });
      const { error: signError } = await supabase.auth.signInWithPassword({
        email: address,
        password,
      });
      if (signError) {
        if (emailSendLimit(signError)) {
          setStep("code");
          setCode("");
          setNotice(null);
          setError(t("en", "auth.emailRate"));
          setCooldown(CODE_COOLDOWN_S);
          return;
        }
        if (signInNeedsCode(signError.message, signError.code)) {
          setStep("code");
          setCode("");
          setError(null);
          setNotice(t("en", "auth.sent"));
          await sendCode(address);
          return;
        }
        setError(t("en", "auth.failed"));
        return;
      }
      window.location.assign(dest);
    } catch {
      setError(t("en", "auth.failed"));
    } finally {
      setLoading(false);
    }
  }

  async function signUp() {
    const address = email.trim();
    if (!isEmail(address)) {
      setError(t("en", "auth.emailInvalid"));
      return;
    }
    if (password.length < 6) {
      setError(t("en", "auth.weak"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient({ keepSignedIn: keep });
      const { data, error: signError } = await supabase.auth.signUp({
        email: address,
        password,
      });
      if (signError) {
        if (emailSendLimit(signError)) {
          openCode(address);
          setNotice(null);
          setError(t("en", "auth.emailRate"));
          return;
        }
        const problem = signUpFailure(signError.message);
        if (problem === "confirm") {
          openCode(address);
          return;
        }
        const key = problem === "taken" ? "auth.taken" : problem === "weak" ? "auth.weak" : "auth.failed";
        setError(t("en", key));
        return;
      }
      if (codeStepAfterSignUp(data.session)) {
        openCode(address);
        return;
      }
      window.location.assign(createDest);
    } catch {
      setError(t("en", "auth.failed"));
    } finally {
      setLoading(false);
    }
  }

  function openCode(address: string) {
    setEmail(address);
    setStep("code");
    setCode("");
    setError(null);
    setNotice(t("en", "auth.sent"));
    setCooldown(CODE_COOLDOWN_S);
  }

  async function confirmCode() {
    const address = email.trim();
    const token = codeDigits(code);
    if (!codeReady(token)) {
      setError(t("en", "auth.mismatch"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient({ keepSignedIn: keep });
      const { error: otpError } = await supabase.auth.verifyOtp({
        email: address,
        token,
        type: "email",
      });
      if (verifyOutcome(otpError == null) === "mismatch") {
        setError(t("en", "auth.mismatch"));
        return;
      }
      window.location.assign(createDest);
    } catch {
      setError(t("en", "auth.mismatch"));
    } finally {
      setLoading(false);
    }
  }

  async function sendCode(address: string) {
    const plan = resendPlan(cooldown);
    if (!plan.send) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient({ keepSignedIn: keep });
      const { error: resendError } = await supabase.auth.resend({ type: "signup", email: address });
      if (resendError) {
        if (emailSendLimit(resendError)) {
          setStep("code");
          setNotice(null);
          setError(t("en", "auth.emailRate"));
          setCooldown(CODE_COOLDOWN_S);
          return;
        }
        setError(t("en", "auth.failed"));
        return;
      }
      setCooldown(plan.cooldown);
      setNotice(t("en", "auth.sent"));
    } catch {
      setError(t("en", "auth.failed"));
    } finally {
      setLoading(false);
    }
  }

  function useDifferentEmail() {
    setStep("credentials");
    setCode("");
    setNotice(null);
    setError(null);
    setCooldown(0);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const mode = submitter instanceof HTMLButtonElement ? submitter.value : step === "code" ? "confirm" : "sign-in";
    if (mode === "sign-up") void signUp();
    else if (mode === "confirm") void confirmCode();
    else if (mode === "resend") void sendCode(email.trim());
    else if (mode === "switch") useDifferentEmail();
    else void signIn();
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <p
        id="auth-message"
        role={error ? "alert" : "status"}
        className={"min-h-6 text-label " + (error ? "text-danger" : "text-fg-muted")}
      >
        {error ?? notice ?? ""}
      </p>
      {step === "code" ? (
        <>
          <p className="text-body text-fg">{email.trim()}</p>
          <div className="flex flex-col gap-2">
            <label htmlFor="code" className="text-label font-semibold text-fg">
              {t("en", "auth.codeLabel")}
            </label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoCapitalize="none"
              autoCorrect="off"
              maxLength={6}
              className={field}
              value={code}
              aria-describedby="auth-message"
              aria-invalid={error ? true : undefined}
              onChange={(event) => {
                setCode(codeDigits(event.target.value));
                setError(null);
              }}
            />
          </div>
          <button type="submit" name="mode" value="confirm" className={primary} disabled={loading}>
            {t("en", "auth.verify")}
          </button>
          <button
            type="submit"
            name="mode"
            value="resend"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-border px-4 text-base font-semibold text-fg"
            disabled={loading || !canResend(cooldown)}
          >
            {canResend(cooldown) ? t("en", "auth.resend") : t("en", "auth.resendIn", { t: String(cooldown) })}
          </button>
          <button
            type="submit"
            name="mode"
            value="switch"
            className="inline-flex min-h-12 w-full items-center justify-center text-base font-semibold text-fg"
            disabled={loading}
          >
            {t("en", "auth.switch")}
          </button>
        </>
      ) : (
      <>
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-label font-semibold text-fg">
          {t("en", "auth.emailLabel")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="email"
          className={field}
          value={email}
          aria-describedby="auth-message"
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setEmail(event.target.value);
            setError(null);
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-label font-semibold text-fg">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className={field}
          value={password}
          aria-describedby="auth-message"
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(null);
          }}
        />
      </div>
      <label className="flex min-h-11 items-center gap-3 text-label text-fg">
        <input
          type="checkbox"
          className="field-check"
          name="keep"
          checked={keep}
          onChange={(event) => setKeep(event.target.checked)}
        />
        Keep me signed in
      </label>
      <div className="flex gap-2">
        <button type="submit" name="mode" value="sign-in" className={primary + " flex-1"} disabled={loading}>
          {t("en", "auth.signIn")}
        </button>
        <button type="submit" name="mode" value="sign-up" className="inline-flex min-h-12 flex-1 items-center justify-center rounded-md border border-border px-4 text-base font-semibold text-fg" disabled={loading}>
          {t("en", "auth.create")}
        </button>
      </div>
      </>
      )}
    </form>
  );
}
