import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { requireAuthSecret } from "@/lib/runtime";

const SESSION_COOKIE = "hub_session";

function secretKey() {
  return new TextEncoder().encode(requireAuthSecret());
}

// Rotas de API deliberadamente públicas (sem sessão). Lista explícita — um
// prefixo amplo como "/api/auth/" deixaria qualquer rota nova sob auth/*
// automaticamente sem proteção (ponto cego). Rotas novas são protegidas por padrão.
const PUBLIC_API_ROUTES = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/bootstrap",
  "/api/health",
]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPortalLogin = pathname === "/portal/login";
  const isPortal = pathname.startsWith("/portal") && !isPortalLogin;
  const isApp = pathname.startsWith("/app");
  const isApiProtected =
    pathname.startsWith("/api/") && !PUBLIC_API_ROUTES.has(pathname);

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
  // Cobre TODAS as rotas de API (exceto /api/auth/* e /api/health, públicas)
  // como rede de segurança — cada rota também faz sua própria checagem de
  // sessão, mas uma rota nova que "esqueça" isso não fica exposta.
  matcher: ["/app/:path*", "/portal", "/portal/:path*", "/api/:path*"],
};
