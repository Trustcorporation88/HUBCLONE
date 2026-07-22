import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { requireAuthSecret } from "@/lib/runtime";

export const SESSION_COOKIE = "hub_session";

export type SessionPayload = {
  userId: string;
  firmId: string;
  clientId: string | null;
  email: string;
  name: string;
  role: string;
  firmSlug: string;
  firmName: string;
  brandName: string;
};

function secretKey() {
  return new TextEncoder().encode(requireAuthSecret());
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey());
}

export async function readSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const p = payload as unknown as SessionPayload;
    return {
      ...p,
      clientId: p.clientId ?? null,
      brandName: p.brandName || p.firmName,
    };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await readSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}

export async function requireStaffSession(): Promise<SessionPayload> {
  const session = await requireSession();
  if (session.role === "CLIENT") throw new Error("FORBIDDEN");
  return session;
}

export async function requireClientSession(): Promise<SessionPayload> {
  const session = await requireSession();
  if (session.role !== "CLIENT" || !session.clientId) {
    throw new Error("FORBIDDEN");
  }
  return session;
}
