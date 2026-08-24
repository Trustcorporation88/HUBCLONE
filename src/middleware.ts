import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { requireAuthSecret } from "@/lib/runtime";

const SESSION_COOKIE = "hub_session";

function secretKey() {
  return new TextEncoder().encode(requireAuthSecret());
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPortalLogin = pathname === "/portal/login";
  const isPortal = pathname.startsWith("/portal") && !isPortalLogin;
  const isApp = pathname.startsWith("/app");
  const isApiProtected =
    pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/");

  // CSRF defense: reject cross-site state-changing API requests. Browsers always
  // send an Origin header on POST/PUT/PATCH/DELETE (including same-origin), so a
  // host mismatch means the request originated from another site.
  const isApi = pathname.startsWith("/api/");
  const isMutating = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
  if (isApi && isMutating) {
    const origin = request.headers.get("origin");
    if (origin) {
      const host = request.headers.get("host");
      let originHost: string | null = null;
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = null;
      }
      if (!originHost || originHost !== host) {
        return NextResponse.json(
          { error: "Origem não permitida (CSRF)" },
          { status: 403 },
        );
      }
    }
  }

  if (!isApp && !isPortal && !isApiProtected) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    if (isApiProtected) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = isPortal ? "/portal/login" : "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  try {
    const { payload } = await jwtVerify(token, secretKey());
    const role = String(payload.role ?? "");

    if (isApp && role === "CLIENT") {
      const url = request.nextUrl.clone();
      url.pathname = "/portal";
      return NextResponse.redirect(url);
    }

    if (isPortal && role !== "CLIENT") {
      const url = request.nextUrl.clone();
      url.pathname = "/app";
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  } catch {
    if (isApiProtected) {
      return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = isPortal ? "/portal/login" : "/login";
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: [
    "/app/:path*",
    "/portal",
    "/portal/:path*",
    // Protect every API route by default; the handler skips /api/auth/* explicitly.
    "/api/:path*",
  ],
};
