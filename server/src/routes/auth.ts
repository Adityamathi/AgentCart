import { Router } from 'express';
import { asyncHandler, HttpError } from '../lib/http.js';
import { credentialsSchema } from '../lib/schemas.js';
import { SESSION_COOKIE, requireAuth, sessionCookieOptions } from '../middleware/auth.js';
import {
  createAuthSession,
  createUser,
  destroySession,
  findUserByEmail,
  findUserById,
  readMemory,
  toPublicUser,
  verifyPassword,
} from '../services/users.js';
import { getPolicy } from '../services/policies.js';
import { integrationStatus } from '../env.js';

export const authRouter = Router();

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = credentialsSchema.extend({ name: credentialsSchema.shape.name.unwrap() }).parse(req.body);
    if (!body.name) throw new HttpError(400, 'Tell us a name for the account', 'name_required');
    const existing = await findUserByEmail(body.email);
    if (existing) throw new HttpError(409, 'An account with that email already exists', 'email_taken');
    const user = await createUser({ email: body.email, name: body.name, password: body.password });
    const session = await createAuthSession(user.id);
    res.cookie(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
    res.status(201).json({ user, policy: await getPolicy(user.id), integrations: integrationStatus() });
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = credentialsSchema.parse(req.body);
    const existing = await findUserByEmail(body.email);
    if (!existing || !verifyPassword(body.password, existing.password_hash)) {
      throw new HttpError(401, 'Email or password is incorrect', 'invalid_credentials');
    }
    const session = await createAuthSession(existing.id);
    res.cookie(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
    res.json({
      user: toPublicUser(existing),
      policy: await getPolicy(existing.id),
      memory: readMemory(existing),
      integrations: integrationStatus(),
    });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    if (req.sessionToken) await destroySession(req.sessionToken);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const row = await findUserById(req.user!.id);
    if (!row) throw new HttpError(401, 'Session is no longer valid', 'unauthenticated');
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({
      user: toPublicUser(row),
      memory: readMemory(row),
      policy: await getPolicy(row.id),
      integrations: integrationStatus(),
    });
  }),
);
