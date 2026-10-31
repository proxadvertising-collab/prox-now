type DemoRole = "explorer" | "owner";

type AuthClient = {
  auth: {
    signInWithPassword: (credentials: {
      email: string;
      password: string;
    }) => Promise<{ error: { message?: string } | null }>;
  };
};

/** Server-only demo sign-in. The password never goes to the browser. */
export function demoCredentials(role: DemoRole): { email: string; password: string } | null {
  const emailName = role === "explorer" ? "DEMO_EXPLORER_EMAIL" : "DEMO_OWNER_EMAIL";
  const passwordName = role === "explorer" ? "DEMO_EXPLORER_PASSWORD" : "DEMO_OWNER_PASSWORD";
  const email = process.env[emailName]?.trim() ?? "";
  const password = process.env[passwordName] ?? "";
  if (!email || !password) return null;
  return { email, password };
}

export async function signInDemoRole(
  client: AuthClient,
  role: DemoRole,
): Promise<{ ok: true } | { ok: false; error: "demo_not_ready" | "sign_in_failed" }> {
  const creds = demoCredentials(role);
  if (!creds) return { ok: false, error: "demo_not_ready" };
  const { error } = await client.auth.signInWithPassword(creds);
  if (error) return { ok: false, error: "sign_in_failed" };
  return { ok: true };
}
