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
  const isApp = pathname.startsWith("/app");
  const isApiProtected =
    pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/");

  if (!isApp && !isApiProtected) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    if (isApiProtected) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  try {
    await jwtVerify(token, secretKey());
    return NextResponse.next();
  } catch {
    if (isApiProtected) {
      return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: ["/app/:path*", "/api/pipeline/:path*"],
};
