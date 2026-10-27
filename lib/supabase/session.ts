import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type ClaimsResult = {
  data: { claims?: unknown } | null;
};

type AuthLike = {
  getClaims?: () => Promise<ClaimsResult>;
  getUser: () => Promise<{ data: { user: unknown } }>;
};

export function isProtectedPath(pathname: string): boolean {
  return (
    pathname === "/wallet" ||
    pathname.startsWith("/wallet/") ||
    pathname === "/inbox" ||
    pathname.startsWith("/inbox/")
  );
}

async function readAuthenticated(auth: AuthLike): Promise<boolean> {
  if (typeof auth.getClaims === "function") {
    const { data } = await auth.getClaims();
    return Boolean(data?.claims);
  }
  const { data } = await auth.getUser();
  return Boolean(data.user);
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  const authenticated = await readAuthenticated(supabase.auth as AuthLike);

  if (!authenticated && isProtectedPath(request.nextUrl.pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    redirectUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    const redirectResponse = NextResponse.redirect(redirectUrl);
    for (const cookie of supabaseResponse.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    return redirectResponse;
  }

  return supabaseResponse;
}
