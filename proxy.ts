import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // The planning document and static assets stay public.
  matcher: ["/", "/login", "/composer", "/queue", "/history", "/accounts", "/bulk"],
};
