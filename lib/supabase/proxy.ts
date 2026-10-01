import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "./config";

function preventCaching(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = getSupabaseConfig();
  let authenticated = false;

  if (config) {
    const supabase = createServerClient(config.url, config.key, {
      cookieOptions: {
        path: "/",
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:"
          || request.headers.get("x-forwarded-proto") === "https",
      },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, cacheHeaders) {
          const previousCookies = response.cookies.getAll();
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          previousCookies.forEach((cookie) => response.cookies.set(cookie));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(cacheHeaders).forEach(([name, value]) =>
            response.headers.set(name, value),
          );
        },
      },
    });

    try {
      // Refresh first, before returning any response or rendering the page.
      const { data, error } = await supabase.auth.getClaims();
      authenticated = !error && !!data?.claims.sub;
    } catch {
      authenticated = false;
    }
  }

  if (request.nextUrl.pathname === "/" && !authenticated) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    const redirect = NextResponse.redirect(loginUrl);
    // Preserve cookie updates/clears even when the response is a redirect.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return preventCaching(redirect);
  }

  return preventCaching(response);
}
