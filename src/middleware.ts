import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "hub_session";

function secretKey() {
  const secret = process.env.AUTH_SECRET ?? "hub-dev-secret-change-me";
  return new TextEncoder().encode(secret);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPortalLogin = pathname === "/portal/login";
  const isPortal = pathname.startsWith("/portal") && !isPortalLogin;
  const isApp = pathname.startsWith("/app");
  const isApiProtected =
    pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/");

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
    "/api/pipeline/:path*",
    "/api/obligations/:path*",
    "/api/deliveries/:path*",
    "/api/certificates/:path*",
    "/api/xml/:path*",
    "/api/payments/:path*",
  ],
};
