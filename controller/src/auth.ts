import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const COOKIE_NAME = "switch_session";

function digest(secret: string): string {
  return createHmac("sha256", secret).update("rydberg-switch-session-v1").digest("hex");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isAuthenticated(request: Request, secret: string): boolean {
  const token = request.cookies?.[COOKIE_NAME] as string | undefined;
  return Boolean(token && safeEqual(token, digest(secret)));
}

export function requireAuth(secret: string) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!isAuthenticated(request, secret)) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }
    next();
  };
}

export function createSession(response: Response, secret: string, secure: boolean): void {
  response.cookie(COOKIE_NAME, digest(secret), {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function clearSession(response: Response, secure: boolean): void {
  response.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
  });
}

