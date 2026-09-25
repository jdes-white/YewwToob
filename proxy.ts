import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Minimal access gate: this is a personal app whose API routes trigger paid
 * transcript-provider and OpenAI requests, so it must not be left wide open
 * on a public URL. HTTP Basic Auth via BASIC_AUTH_USER/BASIC_AUTH_PASSWORD
 * is deliberately the simplest thing that works — no accounts, sessions, or
 * new UI (the browser's native Basic Auth prompt handles the "login screen").
 *
 * If those two env vars are not set (e.g. local development), this gate is
 * a no-op — nothing is blocked. Set both in production.
 */
export function proxy(request: NextRequest) {
  const expectedUser = process.env.BASIC_AUTH_USER;
  const expectedPassword = process.env.BASIC_AUTH_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    const decoded = atob(authHeader.slice("Basic ".length));
    const separatorIndex = decoded.indexOf(":");
    const suppliedUser = decoded.slice(0, separatorIndex);
    const suppliedPassword = decoded.slice(separatorIndex + 1);
    if (suppliedUser === expectedUser && suppliedPassword === expectedPassword) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="YewwToob"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
