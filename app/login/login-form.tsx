"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { safeNext } from "@/lib/auth/safe-next";
import { t } from "@/lib/copy";
import { createClient } from "@/lib/supabase/client";

const primary =
  "inline-flex min-h-12 w-full items-center justify-center rounded-md bg-accent px-4 text-base font-semibold text-accent-ink no-underline touch-manipulation disabled:opacity-60";

const field =
  "min-h-12 w-full rounded-md border border-border bg-surface-1 px-3 text-base text-fg";

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function LoginForm({ nextPath, failed }: { nextPath: string; failed: boolean }) {
  const next = safeNext(nextPath);
  const codeRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<"email" | "code">("email");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(failed ? t("en", "auth.failed") : null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (phase === "code") codeRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  async function sendCode() {
    const address = email.trim();
    if (!isEmail(address)) {
      setInfo(null);
      setError(t("en", "auth.emailInvalid"));
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = createClient();
      const { error: sendError } = await supabase.auth.signInWithOtp({
        email: address,
        options: { shouldCreateUser: true },
      });
      if (sendError) {
        setError(t("en", "auth.failed"));
        return;
      }
      setPhase("code");
      setCooldown(30);
      setInfo(t("en", "auth.sent"));
    } catch {
      setError(t("en", "auth.failed"));
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    const address = email.trim();
    const token = code.replace(/\D/g, "").slice(0, 6);
    if (token.length !== 6) {
      setInfo(null);
      setError(t("en", "auth.mismatch"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: address,
        token,
        type: "email",
      });
      if (verifyError) {
        setError(t("en", "auth.mismatch"));
        return;
      }
      window.location.assign(next);
    } catch {
      setError(t("en", "auth.failed"));
    } finally {
      setLoading(false);
    }
  }

  async function continueWithGoogle() {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo:
            window.location.origin + "/auth/callback?next=" + encodeURIComponent(next),
        },
      });
      if (oauthError) {
        setError(t("en", "auth.failed"));
        setLoading(false);
      }
    } catch {
      setError(t("en", "auth.failed"));
      setLoading(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    if (phase === "email") void sendCode();
    else void verifyCode();
  }

  const message = error ?? info ?? "";

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <p
        id="auth-message"
        role={error ? "alert" : "status"}
        className={"min-h-6 text-label " + (error ? "text-danger" : "text-fg-muted")}
      >
        {message}
      </p>
      <button
        type="button"
        className={primary}
        disabled={loading}
        onClick={() => void continueWithGoogle()}
      >
        {t("en", "auth.google")}
      </button>
      <div className="flex items-center gap-3 text-label text-fg-muted" role="separator">
        <span className="h-px flex-1 bg-border" />
        <span>{t("en", "auth.or")}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
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
      {phase === "email" ? (
        <button type="submit" className={primary} disabled={loading}>
          {t("en", "auth.email")}
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <label htmlFor="code" className="text-label font-semibold text-fg">
              {t("en", "auth.codeLabel")}
            </label>
            <input
              id="code"
              ref={codeRef}
              name="one-time-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              className={field}
              value={code}
              aria-describedby="auth-message"
              aria-invalid={error ? true : undefined}
              onChange={(event) => {
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                setError(null);
              }}
            />
          </div>
          <button type="submit" className={primary} disabled={loading || code.length !== 6}>
            {t("en", "auth.verify")}
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md px-4 text-base font-semibold text-fg no-underline disabled:opacity-60"
            disabled={loading || cooldown > 0}
            onClick={() => void sendCode()}
          >
            {cooldown > 0
              ? t("en", "auth.resendIn", { t: String(cooldown) })
              : t("en", "auth.resend")}
          </button>
        </div>
      )}
    </form>
  );
}
