import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

// Só a área administrativa precisa de sessão. O catálogo público não consulta o Auth.
export const config = {
  matcher: ["/admin/:path*"],
};