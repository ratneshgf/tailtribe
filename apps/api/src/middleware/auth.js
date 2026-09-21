import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
import { User, AuditLog } from '../models/index.js';

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export const sign = (user) => {
  const refreshToken = jwt.sign({ sub: user.id, t: 'r' }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.REFRESH_TTL || '7d', jwtid: randomUUID(),
  });
  return {
    accessToken: jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_ACCESS_SECRET, { expiresIn: process.env.ACCESS_TTL || '15m' }),
    refreshToken,
    refreshTokenHash: hashToken(refreshToken),
  };
};

const clientTokens = ({ refreshTokenHash, ...tokens }) => tokens;

export async function issueSession(user) {
  const tokens = sign(user);
  await User.updateOne({ _id: user.id }, { $push: { refreshTokens: { $each: [tokens.refreshTokenHash], $slice: -10 } } });
  return clientTokens(tokens);
}

export async function rotateSession(refreshToken) {
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    if (payload.t !== 'r' || !payload.jti) return null;
    const user = await User.findById(payload.sub);
    if (!user || ['Suspended', 'Deactivated'].includes(user.status)) return null;

    const oldHash = hashToken(refreshToken);
    const tokens = sign(user);
    const updated = await User.findOneAndUpdate(
      { _id: user.id, refreshTokens: oldHash },
      { $set: { 'refreshTokens.$': tokens.refreshTokenHash } },
      { new: false, projection: { _id: 1 } },
    );
    return updated ? clientTokens(tokens) : null;
  } catch { return null; }
}

export async function revokeSession(userId, refreshToken) {
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    if (payload.t !== 'r' || (userId && payload.sub !== String(userId))) return;
    await User.updateOne({ _id: payload.sub }, { $pull: { refreshTokens: hashToken(refreshToken) } });
  } catch { /* expired or invalid sessions are already unusable */ }
}

/** Verifies the bearer token and loads the live user, so suspensions take effect immediately. */
export async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const user = await User.findById(payload.sub);
    if (!user || user.status === 'Deactivated') return res.status(401).json({ error: 'Authentication required' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** AUTH-03: role checks always run server-side; the client only hides affordances. */
export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Insufficient permissions' });

/** AUTH-06: suspended accounts may read, but may not create listings, requests or holds. */
export const requireActive = (req, res, next) =>
  req.user.status === 'Active' ? next() : res.status(403).json({ error: `Account is ${req.user.status}` });

export const audit = (actorId, action, entityType, entityId, detail, metadata) =>
  AuditLog.create({ actorId, action, entityType, entityId: String(entityId || ''), detail, metadata });

export const validate = (schema) => (req, res, next) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: 'Validation failed', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  }
  req.body = parsed.data;
  next();
};
