import type { NextFunction, Request, Response } from 'express';
import { env } from '../env.js';
import { findSessionUser, type PublicUser } from '../services/users.js';

export const SESSION_COOKIE = 'agentcart_session';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: PublicUser;
      sessionToken?: string;
    }
  }
}

export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === 'string' && token.length > 20) {
    const user = await findSessionUser(token);
    if (user) {
      req.user = user;
      req.sessionToken = token;
    }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Sign in to continue', code: 'unauthenticated' });
    return;
  }
  next();
}

/** Mutations must come from the app origin, so a foreign page cannot drive the agent. */
export function sameOriginOnly(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }
  const origin = req.get('origin');
  if (!origin) {
    next();
    return;
  }
  const allowed = new Set([env.appOrigin, `http://localhost:${env.port}`, `http://127.0.0.1:${env.port}`]);
  if (allowed.has(origin)) {
    next();
    return;
  }
  res.status(403).json({ error: 'Request origin is not allowed', code: 'bad_origin' });
}

export function sessionCookieOptions(expiresAt?: string) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.isProd,
    path: '/',
    expires: expiresAt ? new Date(expiresAt) : undefined,
  };
}
