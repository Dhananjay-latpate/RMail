import jwt from "jsonwebtoken";
import type { FastifyRequest } from "fastify";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";

export class AuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}

export interface JwtPayload {
  userId: string;
  email: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function getAuthUser(req: FastifyRequest): JwtPayload | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    return verifyToken(header.slice(7));
  } catch {
    return null;
  }
}

export function requireAuth(req: FastifyRequest): JwtPayload {
  const user = getAuthUser(req);
  if (!user) throw new AuthError();
  return user;
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}
