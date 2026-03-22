import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { createUserRecord, getUserByEmail, saveSessionRecord, getSessionRecord, deleteSessionRecord } from './db.js';

// --- Password Validation ---

export function validatePassword(password) {
  if (!password || password.length < 8) {
    return 'הסיסמה חייבת להכיל לפחות 8 תווים';
  }
  return null; // valid
}

// --- User Management ---

export async function createUser(email, password, tenantId) {
  const existing = await getUserByEmail(email);
  if (existing) return { error: 'Email already exists' };
  const passwordHash = await bcrypt.hash(password, 10);
  return await createUserRecord(email, passwordHash, tenantId);
}

export async function verifyUser(email, password) {
  const user = await getUserByEmail(email);
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  return valid ? user : null;
}

// --- Sessions ---

export async function createSession(email, tenantId) {
  const id = 'sess_' + crypto.randomUUID();
  const expires = new Date();
  expires.setDate(expires.getDate() + 30);
  await saveSessionRecord(id, {
    email,
    tenantId,
    createdAt: new Date().toISOString(),
    expiresAt: expires.toISOString(),
  });
  return id;
}

export async function destroySession(sessionId) {
  await deleteSessionRecord(sessionId);
}

// --- Middleware ---

export async function authMiddleware(req, res, next) {
  const sessionId = req.cookies && req.cookies.session_id;
  if (!sessionId) return res.redirect('/login');

  const session = await getSessionRecord(sessionId);
  if (!session) {
    res.clearCookie('session_id');
    return res.redirect('/login');
  }

  // Check expiry
  if (new Date(session.expiresAt) < new Date()) {
    await deleteSessionRecord(sessionId);
    res.clearCookie('session_id');
    return res.redirect('/login');
  }

  // Impersonation: admin can temporarily act as another tenant
  req.tenantId = session.impersonatingTenantId || session.tenantId;
  req.originalTenantId = session.tenantId;
  req.userEmail = session.email;
  req.isImpersonating = !!session.impersonatingTenantId;
  next();
}
