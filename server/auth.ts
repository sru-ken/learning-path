import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';
import type { Profile, UserRole } from '../src/types/learnpath.ts';

const TOKEN_SECRET =
  process.env.AUTH_SECRET ||
  process.env.SESSION_SECRET ||
  'learnpath-adaptive-graph-secret-key-2026';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

interface TokenPayload {
  sub: string;
  role: UserRole;
  exp: number;
}

export function signAuthToken(userId: string, role: UserRole): string {
  const payload: TokenPayload = {
    sub: userId,
    role,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyAuthToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
    if (!parsed.sub || !parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export interface AuthenticatedRequest extends Request {
  user?: Profile;
}

export function mapProfileRow(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id),
    email: String(row.email),
    full_name: String(row.full_name),
    role: row.role as UserRole,
    avatar_url: row.avatar_url ? String(row.avatar_url) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired session token. Please sign in again.' });
    return;
  }

  const row = db
    .prepare('SELECT id, email, full_name, role, avatar_url, created_at, updated_at FROM profiles WHERE id = ?')
    .get(payload.sub) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(401).json({ error: 'User profile not found.' });
    return;
  }

  req.user = mapProfileRow(row);
  next();
}

export function requireInstructor(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (req.user.role !== 'instructor') {
    res.status(403).json({
      error: 'Instructor privileges required to access or modify curriculum architecture.',
    });
    return;
  }
  next();
}
