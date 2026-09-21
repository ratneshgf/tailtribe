import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authRequired, requireRole, requireActive, issueSession, rotateSession, revokeSession, audit, validate } from '../middleware/auth.js';
import { parsePetImages, removePetImages, uploadPetImages } from '../lib/petMedia.js';
import { parseKycDocument, removeKycDocument, signKycDocument, uploadKycDocument } from '../lib/kycDocuments.js';
import { sendNotification, notifyAdmins } from '../lib/notifications.js';
import { User, PasswordReset, Kyc, Pet, Request as ReqModel, Reservation, Conversation, Message, Report, Favorite, AuditLog, Notification, LISTING_TRANSITIONS } from '../models/index.js';
import { isEmailConfigured, sendPasswordResetEmail } from '../lib/email.js';

const r = Router();
const googleClient = new OAuth2Client();
const authLimit = rateLimit({ windowMs: 15 * 60e3, max: 20 });
const resetLimit = rateLimit({ windowMs: 60 * 60e3, max: 5 });
const writeLimit = rateLimit({ windowMs: 60e3, max: 30 });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const notify = (req, userId, details) => sendNotification(req.app.get('io'), userId, details)
  .catch((error) => console.error('Could not save notification:', error?.message));
const notifyAdminUsers = (req, details) => notifyAdmins(req.app.get('io'), details)
  .catch((error) => console.error('Could not notify admins:', error?.message));

const REFRESH_COOKIE = 'tt_refresh';
const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/auth',
  maxAge: Number(process.env.REFRESH_COOKIE_DAYS || 7) * 24 * 60 * 60 * 1000,
};
const readCookie = (req, name) => (req.headers.cookie || '').split(';').map((part) => part.trim())
  .find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
const sendSession = async (res, user, status = 200) => {
  const { accessToken, refreshToken } = await issueSession(user);
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
  return res.status(status).json({ user: user.publicView(), accessToken });
};

/** PET-06: strip everything the public must never see. */
const publicPet = (p) => ({
  id: p.id, name: p.name, species: p.species, breed: p.breed, ageYears: p.ageYears, gender: p.gender,
  about: p.about, health: p.health, healthVerified: p.healthVerified, vaccination: p.vaccination,
  media: p.media, city: p.city, pincode: p.pincode, price: p.price, adoptionType: p.adoptionType,
  status: p.status, rejectionReason: p.rejectionReason, createdAt: p.createdAt,
  owner: p.ownerId?.publicView ? p.ownerId.publicView() : { id: String(p.ownerId) },
});

/* ---------------------------------------------------------------- auth */
r.post('/auth/register', authLimit, validate(z.object({
  name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(8).max(18).optional().or(z.literal('')),
  password: z.string().min(8).max(72)
    .regex(/[a-z]/, 'Password needs a lowercase letter')
    .regex(/[A-Z]/, 'Password needs an uppercase letter')
    .regex(/[0-9]/, 'Password needs a number'),
  role: z.enum(['buyer', 'seller']).default('buyer'),
})), wrap(async (req, res) => {
  if (await User.findOne({ email: req.body.email })) return res.status(409).json({ error: 'Account already exists' });
  const passwordHash = await bcrypt.hash(req.body.password, 12);
  const user = await User.create({ ...req.body, passwordHash, status: 'Pending Verification' });
  await audit(user.id, 'Account registered', 'User', user.id, user.role);
  return sendSession(res, user, 201);
}));

// The first administrator is created with a private setup key held only in the API environment.
// This keeps public registration from granting anyone administrator access.
r.post('/auth/register-admin', authLimit, validate(z.object({
  name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(8).max(18).optional().or(z.literal('')),
  password: z.string().min(8).max(72)
    .regex(/[a-z]/, 'Password needs a lowercase letter')
    .regex(/[A-Z]/, 'Password needs an uppercase letter')
    .regex(/[0-9]/, 'Password needs a number'),
  setupKey: z.string().min(16).max(256),
})), wrap(async (req, res) => {
  const configuredKey = process.env.ADMIN_SETUP_KEY;
  if (!configuredKey) return res.status(503).json({ error: 'Admin setup is not configured. Add ADMIN_SETUP_KEY to the API environment first.' });
  const supplied = Buffer.from(req.body.setupKey);
  const expected = Buffer.from(configuredKey);
  const validKey = supplied.length === expected.length && timingSafeEqual(supplied, expected);
  if (!validKey) return res.status(403).json({ error: 'The admin setup key is invalid.' });
  if (await User.exists({ role: 'admin' })) return res.status(409).json({ error: 'An administrator account already exists. Please use Admin login.' });
  if (await User.findOne({ email: req.body.email })) return res.status(409).json({ error: 'Account already exists for this email.' });
  const passwordHash = await bcrypt.hash(req.body.password, 12);
  const user = await User.create({ name: req.body.name, email: req.body.email, phone: req.body.phone, passwordHash, role: 'admin', status: 'Active', kycStatus: 'Approved' });
  await audit(user.id, 'Administrator account created', 'User', user.id, 'Initial administrator setup');
  return sendSession(res, user, 201);
}));

r.post('/auth/login', authLimit, validate(z.object({ email: z.string().email(), password: z.string() })), wrap(async (req, res) => {
  const user = await User.findOne({ email: req.body.email }).select('+passwordHash');
  // AUTH-02: identical response whether the account exists or the password is wrong.
  if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash))) return res.status(401).json({ error: 'Invalid credentials' });
  if (['Suspended', 'Deactivated'].includes(user.status)) return res.status(403).json({ error: 'This account is not available' });
  return sendSession(res, user);
}));

r.post('/auth/google', authLimit, validate(z.object({ credential: z.string().min(100) })), wrap(async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'Google sign-in is not configured yet.' });
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: req.body.credential, audience: process.env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: 'Google could not verify this sign-in request.' });
  }
  if (!payload?.email || !payload.email_verified) return res.status(401).json({ error: 'Use a Google account with a verified email address.' });
  const email = payload.email.toLowerCase();
  let user = await User.findOne({ email });
  if (!user) {
    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
    user = await User.create({ name: payload.name?.trim() || email.split('@')[0], email, passwordHash, role: 'buyer', status: 'Pending Verification' });
    await audit(user.id, 'Account registered with Google', 'User', user.id, 'buyer');
  }
  if (['Suspended', 'Deactivated'].includes(user.status)) return res.status(403).json({ error: 'This account is not available' });
  return sendSession(res, user);
}));

r.post('/auth/forgot-password', resetLimit, validate(z.object({ email: z.string().trim().toLowerCase().email() })), wrap(async (req, res) => {
  const generic = { message: 'If an account exists for that email, a password reset link has been sent.' };
  if (!isEmailConfigured()) return res.status(503).json({ error: 'Password reset email is not configured yet. Add SMTP settings to the API environment.' });
  const user = await User.findOne({ email: req.body.email });
  if (user && !['Suspended', 'Deactivated'].includes(user.status)) {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await PasswordReset.deleteMany({ userId: user.id });
    const ttlMinutes = Math.max(5, Number(process.env.PASSWORD_RESET_TTL_MINUTES) || 30);
    await PasswordReset.create({ userId: user.id, tokenHash, expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000) });
    try {
      await sendPasswordResetEmail({ to: user.email, name: user.name, token: rawToken, ttlMinutes });
    } catch (error) {
      await PasswordReset.deleteOne({ tokenHash });
      console.error('Password reset email delivery failed:', error?.message);
      return res.json(generic);
    }
  }
  res.json(generic);
}));

r.post('/auth/reset-password', resetLimit, validate(z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i),
  password: z.string().min(8).max(72)
    .regex(/[a-z]/, 'Password needs a lowercase letter')
    .regex(/[A-Z]/, 'Password needs an uppercase letter')
    .regex(/[0-9]/, 'Password needs a number'),
})), wrap(async (req, res) => {
  const tokenHash = createHash('sha256').update(req.body.token).digest('hex');
  const reset = await PasswordReset.findOneAndDelete({ tokenHash, expiresAt: { $gt: new Date() } });
  if (!reset) return res.status(400).json({ error: 'This reset link is invalid or expired. Request a new one.' });
  const passwordHash = await bcrypt.hash(req.body.password, 12);
  const user = await User.findByIdAndUpdate(reset.userId, { $set: { passwordHash } }, { new: true });
  if (!user) return res.status(400).json({ error: 'This account no longer exists. Create a new account.' });
  await User.updateOne({ _id: user.id }, { $set: { refreshTokens: [] } });
  await PasswordReset.deleteMany({ userId: user.id });
  await audit(user.id, 'Password reset', 'User', user.id, 'Password changed via email reset link');
  res.json({ message: 'Password updated. Sign in with your new password.' });
}));

r.post('/auth/refresh', wrap(async (req, res) => {
  const currentToken = readCookie(req, REFRESH_COOKIE);
  if (!currentToken) return res.status(401).json({ error: 'No active session' });
  const tokens = await rotateSession(currentToken);
  if (!tokens) return res.status(401).json({ error: 'Invalid or already used refresh token' });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, refreshCookieOptions);
  res.json({ accessToken: tokens.accessToken });
}));

r.post('/auth/logout', wrap(async (req, res) => {
  const currentToken = readCookie(req, REFRESH_COOKIE);
  if (currentToken) await revokeSession(null, currentToken);
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions, maxAge: undefined });
  res.json({ ok: true });
}));

r.get('/users/me', authRequired, (req, res) => res.json(req.user.publicView()));

r.get('/notifications', authRequired, wrap(async (req, res) => {
  const [items, unreadCount] = await Promise.all([
    Notification.find({ userId: req.user.id }).sort('-createdAt').limit(40).lean(),
    Notification.countDocuments({ userId: req.user.id, readAt: { $exists: false } }),
  ]);
  res.json({ items, unreadCount });
}));

r.patch('/notifications/read-all', authRequired, writeLimit, wrap(async (req, res) => {
  await Notification.updateMany({ userId: req.user.id, readAt: { $exists: false } }, { $set: { readAt: new Date() } });
  res.json({ ok: true });
}));

r.patch('/notifications/:id/read', authRequired, writeLimit, wrap(async (req, res) => {
  const item = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id }, { $set: { readAt: new Date() } }, { new: true },
  ).lean();
  if (!item) return res.status(404).json({ error: 'Notification not found' });
  res.json({ ok: true });
}));

/* ----------------------------------------------------------------- kyc */
r.post('/kyc', authRequired, writeLimit, parseKycDocument, validate(z.object({ documentType: z.enum(['Government ID', 'Passport', 'Driving licence', 'Other']) })), wrap(async (req, res) => {
  if (!req.file) return res.status(422).json({ error: 'Choose a verification document to upload.' });
  if (req.user.kycStatus === 'Approved') return res.status(409).json({ error: 'Your identity is already approved.' });
  if (req.user.kycStatus === 'Submitted') return res.status(409).json({ error: 'Your verification is already under review.' });
  const stored = await uploadKycDocument(req.file, req.user.id);
  let submission;
  try {
    submission = await Kyc.create({ ...stored, documentType: req.body.documentType, userId: req.user.id });
    req.user.kycStatus = 'Submitted';
    await req.user.save();
  } catch (error) {
    if (submission) await Kyc.deleteOne({ _id: submission._id }).catch(() => {});
    await removeKycDocument(stored).catch((cleanupError) => {
      console.error('Could not remove unreferenced KYC document:', cleanupError?.message);
    });
    if (error?.code === 11000) return res.status(409).json({ error: 'Your verification is already under review.' });
    throw error;
  }
  await audit(req.user.id, 'KYC submitted', 'User', req.user.id, req.body.documentType);
  await notifyAdminUsers(req, {
    title: 'Identity check needs review',
    body: `${req.user.name} submitted a ${req.body.documentType}.`,
    targetTab: 'admin',
  });
  res.status(201).json({ status: submission.status });
}));

/* ---------------------------------------------------------------- pets */
r.get('/pets', wrap(async (req, res) => {
  const { q, species, vaccination, adoptionType, pincode, sort = 'new', page = 1, limit = 12 } = req.query;
  const filter = { status: { $in: ['Published', 'Reserved'] } };           // SEARCH-01
  if (species) filter.species = species;
  if (vaccination) filter.vaccination = vaccination;
  if (adoptionType) filter.adoptionType = adoptionType;
  if (pincode) filter.pincode = pincode;
  if (q) filter.$or = [{ name: new RegExp(q, 'i') }, { breed: new RegExp(q, 'i') }, { city: new RegExp(q, 'i') }];
  const sortBy = { new: { createdAt: -1 }, price: { price: 1 }, age: { ageYears: 1 } }[sort] || { createdAt: -1 };
  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    Pet.find(filter).populate('ownerId').sort(sortBy).skip(skip).limit(Number(limit)),   // SEARCH-04
    Pet.countDocuments(filter),
  ]);
  res.json({ items: items.map(publicPet), total, page: Number(page) });
}));

r.get('/pets/mine', authRequired, wrap(async (req, res) =>
  res.json((await Pet.find({ ownerId: req.user.id }).populate('ownerId').sort('-createdAt')).map(publicPet))));

r.get('/pets/:id', wrap(async (req, res) => {
  const pet = await Pet.findById(req.params.id).populate('ownerId');
  if (!pet) return res.status(404).json({ error: 'Listing not found' });
  res.json(publicPet(pet));
}));

r.post('/pets', authRequired, requireActive, requireRole('seller'), writeLimit, parsePetImages, validate(z.object({
  name: z.string().min(1), species: z.enum(['Dog', 'Cat', 'Rabbit', 'Bird']), breed: z.string().min(1),
  ageYears: z.coerce.number().min(0), gender: z.enum(['Male', 'Female']), city: z.string().min(1),
  pincode: z.string().regex(/^\d{6}$/, 'Six-digit PIN required'), price: z.coerce.number().min(0).default(0),
  meetingAddress: z.string().trim().min(8).max(220), meetingLandmark: z.string().trim().max(120).optional(),
  vaccination: z.enum(['Full', 'Partial', 'None']).default('None'), health: z.string().optional(), about: z.string().optional(),
})), wrap(async (req, res) => {
  // PET-01: only KYC-approved sellers may put a live animal in front of buyers.
  if (req.user.kycStatus !== 'Approved') return res.status(403).json({ error: 'Identity verification required before listing' });
  const media = await uploadPetImages(req.files, req.user.id);
  let pet;
  try {
    pet = await Pet.create({ ...req.body, media, ownerId: req.user.id, adoptionType: req.body.price > 0 ? 'sale' : 'free', status: 'Pending Review' });
  } catch (error) {
    await removePetImages(media);
    throw error;
  }
  await audit(req.user.id, 'Listing submitted', 'Pet', pet.id, pet.name);
  await notifyAdminUsers(req, {
    title: 'Listing needs review',
    body: `${pet.name} was submitted for moderation.`,
    targetTab: 'admin',
  });
  res.status(201).json(publicPet(pet));
}));

/** PET-07 / PET-08: one guarded door for every listing state change. */
r.patch('/pets/:id/status', authRequired, wrap(async (req, res) => {
  const pet = await Pet.findById(req.params.id);
  if (!pet) return res.status(404).json({ error: 'Listing not found' });
  const isOwner = String(pet.ownerId) === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Not permitted' });
  const next = req.body.status;
  if (!(LISTING_TRANSITIONS[pet.status] || []).includes(next)) return res.status(409).json({ error: `Cannot move from ${pet.status} to ${next}` });
  if (['Published', 'Rejected'].includes(next) && !isAdmin) return res.status(403).json({ error: 'Moderation decisions are admin-only' });
  if (next === 'Rejected' && !req.body.reason) return res.status(422).json({ error: 'A rejection reason is required' }); // ADMIN-03
  pet.status = next;
  pet.rejectionReason = next === 'Rejected' ? req.body.reason : undefined;
  await pet.save();
  await audit(req.user.id, `Listing ${next}`, 'Pet', pet.id, req.body.reason || pet.name);
  if (isAdmin && ['Published', 'Rejected'].includes(next)) {
    await notify(req, pet.ownerId, {
      title: next === 'Published' ? 'Listing approved' : 'Listing needs changes',
      body: next === 'Published' ? `${pet.name} is now visible in the Marketplace.` : `${pet.name}: ${req.body.reason}`,
      targetTab: 'seller',
    });
  }
  res.json(publicPet(pet));
}));

/* ------------------------------------------------------------ requests */
r.post('/pets/:id/requests', authRequired, requireActive, writeLimit, wrap(async (req, res) => {
  const pet = await Pet.findById(req.params.id);
  if (!pet || pet.status !== 'Published') return res.status(409).json({ error: 'Listing is not accepting requests' });
  if (String(pet.ownerId) === req.user.id) return res.status(409).json({ error: 'You cannot request your own listing' });
  const open = await ReqModel.findOne({ petId: pet.id, buyerId: req.user.id, status: { $nin: ['Declined', 'Cancelled', 'Completed'] } });
  if (open) return res.status(409).json({ error: 'You already have an active request for this pet' }); // REQ-01
  const doc = await ReqModel.create({ petId: pet.id, buyerId: req.user.id, sellerId: pet.ownerId, type: pet.price > 0 ? 'purchase' : 'adoption', message: req.body.message });
  await audit(req.user.id, 'Request submitted', 'Request', doc.id, pet.name);
  await notify(req, pet.ownerId, {
    title: doc.type === 'purchase' ? 'New purchase request' : 'New adoption request',
    body: `${req.user.name} is interested in ${pet.name}.`,
    targetTab: 'seller',
  });
  res.status(201).json(doc);
}));

// Exact meeting details are disclosed only after the seller accepts this buyer's request.
r.get('/pets/:id/meeting-location', authRequired, wrap(async (req, res) => {
  const pet = await Pet.findById(req.params.id).select('+meetingAddress +meetingLandmark');
  if (!pet) return res.status(404).json({ error: 'Listing not found' });
  const isOwner = String(pet.ownerId) === req.user.id;
  const accepted = await ReqModel.exists({ petId: pet.id, buyerId: req.user.id, status: 'Accepted' });
  if (!isOwner && !accepted && req.user.role !== 'admin') return res.status(403).json({ error: 'Meeting location becomes available after the seller accepts your request.' });
  if (!pet.meetingAddress) return res.status(404).json({ error: 'The seller has not added a meeting location yet.' });
  const query = [pet.meetingAddress, pet.meetingLandmark, pet.city, pet.pincode].filter(Boolean).join(', ');
  await audit(req.user.id, 'Meeting location viewed', 'Pet', pet.id, pet.name);
  res.json({ address: pet.meetingAddress, landmark: pet.meetingLandmark || '', city: pet.city, pincode: pet.pincode, mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` });
}));

r.get('/requests', authRequired, wrap(async (req, res) =>
  res.json(await ReqModel.find({ $or: [{ buyerId: req.user.id }, { sellerId: req.user.id }] }).populate('petId buyerId sellerId').sort('-createdAt'))));

// A completed request is the transaction record used by both parties' history views.
r.get('/history', authRequired, wrap(async (req, res) => {
  const records = await ReqModel.find({
    status: 'Completed',
    $or: [{ buyerId: req.user.id }, { sellerId: req.user.id }],
  }).populate('petId buyerId sellerId').sort('-completedAt -updatedAt');
  res.json(records.map((record) => ({
    id: record.id,
    completedAt: record.completedAt || record.updatedAt,
    type: record.type,
    pet: record.petId ? { id: record.petId.id, name: record.petId.name, species: record.petId.species, breed: record.petId.breed, price: record.petId.price, media: record.petId.media } : null,
    buyer: record.buyerId?.publicView ? record.buyerId.publicView() : { name: 'Unknown buyer' },
    seller: record.sellerId?.publicView ? record.sellerId.publicView() : { name: 'Unknown seller' },
  })));
}));

r.patch('/requests/:id', authRequired, wrap(async (req, res) => {
  const doc = await ReqModel.findById(req.params.id).populate('petId');
  if (!doc) return res.status(404).json({ error: 'Request not found' });
  const isSeller = String(doc.sellerId) === req.user.id;
  const isBuyer = String(doc.buyerId) === req.user.id;
  if (!isSeller && !isBuyer) return res.status(403).json({ error: 'Not permitted' });   // REQ-04 / IDOR guard
  const next = req.body.status;
  if (isBuyer && next !== 'Cancelled') return res.status(403).json({ error: 'Buyers may only cancel' });
  if (isSeller && !['Accepted', 'Declined', 'Under Review', 'More Info Required', 'Completed'].includes(next)) return res.status(422).json({ error: 'Invalid seller request status' });
  if (next === 'Completed' && doc.status !== 'Accepted') return res.status(409).json({ error: 'Only an accepted request can be completed.' });
  doc.status = next;
  if (next === 'Completed') doc.completedAt = new Date();
  await doc.save();
  if (next === 'Completed' && doc.petId) {
    doc.petId.status = 'Sold/Adopted';
    await doc.petId.save();
  }
  await audit(req.user.id, `Request ${next}`, 'Request', doc.id);
  const recipientId = isSeller ? doc.buyerId : doc.sellerId;
  await notify(req, recipientId, {
    title: `Request ${next.toLowerCase()}`,
    body: `${doc.petId?.name || 'A pet'} request was ${next.toLowerCase()}.`,
    targetTab: isSeller ? 'dashboard' : 'seller',
  });
  res.json(doc);
}));

/* -------------------------------------------------------- reservations */
r.post('/pets/:id/reservations', authRequired, requireActive, wrap(async (req, res) => {
  const pet = await Pet.findById(req.params.id);
  if (!pet || pet.status !== 'Published') return res.status(409).json({ error: 'Listing is not available to hold' });
  if (String(pet.ownerId) === req.user.id) return res.status(409).json({ error: 'You cannot reserve your own listing' });
  const accepted = await ReqModel.findOne({ petId: pet.id, buyerId: req.user.id, status: 'Accepted' });
  if (!accepted) return res.status(409).json({ error: 'An accepted request is required first' });
  const hours = Number(process.env.RESERVATION_HOURS || 48);
  try {
    // BOOK-04: the unique partial index rejects the second concurrent hold.
    const hold = await Reservation.create({
      petId: pet.id, buyerId: req.user.id, sellerId: pet.ownerId, status: 'Approved',
      approvedAt: new Date(), expiresAt: new Date(Date.now() + hours * 36e5),
      history: [{ status: 'Approved', at: new Date() }],
    });
    pet.status = 'Reserved'; await pet.save();
    await audit(req.user.id, 'Reservation approved', 'Reservation', hold.id, `${hours}h hold on ${pet.name}`);
    res.status(201).json(hold);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'This pet already has an active hold' });
    throw e;
  }
}));

r.get('/reservations', authRequired, wrap(async (req, res) =>
  res.json(await Reservation.find({ $or: [{ buyerId: req.user.id }, { sellerId: req.user.id }] }).populate('petId').sort('-createdAt'))));

/* ------------------------------------------------------------ messages */
const memberOf = (conv, userId) => conv.participantIds.some((p) => String(p._id || p) === userId);

r.post('/conversations', authRequired, requireActive, wrap(async (req, res) => {
  const pet = await Pet.findById(req.body.petId);
  if (!pet) return res.status(404).json({ error: 'Listing not found' });
  const ids = [req.user.id, String(pet.ownerId)];
  let conv = await Conversation.findOne({ petId: pet.id, participantIds: { $all: ids } });
  if (!conv) conv = await Conversation.create({ petId: pet.id, participantIds: ids, lastMessageAt: new Date() });
  res.json(conv);
}));

r.get('/conversations', authRequired, wrap(async (req, res) =>
  res.json(await Conversation.find({ participantIds: req.user.id }).populate('petId participantIds').sort('-lastMessageAt'))));

r.get('/conversations/:id/messages', authRequired, wrap(async (req, res) => {
  const conv = await Conversation.findById(req.params.id);
  if (!conv || !memberOf(conv, req.user.id)) return res.status(403).json({ error: 'Not permitted' }); // CHAT-01
  res.json(await Message.find({ conversationId: conv.id }).sort('createdAt').limit(200));
}));

const CONTACT = /(\+?\d[\d\s-]{8,}\d)|([\w.]+@[\w.]+\.\w+)/;
r.post('/conversations/:id/messages', authRequired, requireActive, writeLimit, wrap(async (req, res) => {
  const conv = await Conversation.findById(req.params.id);
  if (!conv || !memberOf(conv, req.user.id)) return res.status(403).json({ error: 'Not permitted' });
  const body = String(req.body.body || '').trim();
  if (!body) return res.status(422).json({ error: 'Message cannot be empty' });
  // CHAT-05: flag premature contact exchange rather than silently forwarding it.
  const flags = CONTACT.test(body) ? ['contact-details'] : [];
  const msg = await Message.create({ conversationId: conv.id, senderId: req.user.id, body, moderationFlags: flags });
  conv.lastMessageAt = new Date(); await conv.save();
  req.app.get('io')?.to(`conv:${conv.id}`).emit('message', msg);
  const recipientId = conv.participantIds.find((id) => String(id) !== req.user.id);
  await notify(req, recipientId, {
    title: 'New message',
    body: `${req.user.name} sent you a message about a pet listing.`,
    targetTab: 'messages',
  });
  res.status(201).json(msg);
}));

/* ------------------------------------------------- favorites & reports */
r.get('/favorites', authRequired, wrap(async (req, res) =>
  res.json((await Favorite.find({ userId: req.user.id }).populate({ path: 'petId', populate: 'ownerId' })).filter((f) => f.petId).map((f) => publicPet(f.petId)))));

r.post('/favorites/:petId', authRequired, wrap(async (req, res) => {
  const existing = await Favorite.findOneAndDelete({ userId: req.user.id, petId: req.params.petId });
  if (existing) return res.json({ saved: false });
  await Favorite.create({ userId: req.user.id, petId: req.params.petId });
  res.json({ saved: true });
}));

r.post('/reports', authRequired, writeLimit, validate(z.object({
  petId: z.string(), reason: z.string(), description: z.string().optional(),
})), wrap(async (req, res) => {
  const doc = await Report.create({ ...req.body, reporterId: req.user.id });
  await audit(req.user.id, 'Report filed', 'Pet', req.body.petId, req.body.reason);
  res.status(201).json(doc);
}));

/* --------------------------------------------------------------- admin */
const admin = [authRequired, requireRole('admin')];

r.get('/admin/dashboard', ...admin, wrap(async (req, res) => {
  const [activeUsers, pendingKyc, pendingListings, activeListings, openReports, holds] = await Promise.all([
    User.countDocuments({ status: 'Active' }), User.countDocuments({ kycStatus: 'Submitted' }),
    Pet.countDocuments({ status: 'Pending Review' }), Pet.countDocuments({ status: 'Published' }),
    Report.countDocuments({ status: 'Open' }), Reservation.countDocuments({ status: 'Approved' }),
  ]);
  res.json({ activeUsers, pendingKyc, pendingListings, activeListings, openReports, activeReservations: holds });
}));

r.get('/admin/listings', ...admin, wrap(async (req, res) =>
  res.json((await Pet.find({ status: req.query.status || 'Pending Review' }).populate('ownerId')).map(publicPet))));

r.get('/admin/kyc', ...admin, wrap(async (req, res) =>
  res.json(await Kyc.find({ status: 'Submitted' }).populate('userId'))));

r.get('/admin/kyc/:id/document', ...admin, wrap(async (req, res) => {
  const document = await Kyc.findById(req.params.id);
  if (!document) return res.status(404).json({ error: 'Submission not found' });
  if (!document.documentRef?.startsWith('tailtribe/kyc/')) return res.status(404).json({ error: 'This record has no uploaded private document.' });
  res.json({ url: signKycDocument(document), expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() });
}));

r.patch('/admin/kyc/:id', ...admin, wrap(async (req, res) => {
  const doc = await Kyc.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Submission not found' });
  const approved = req.body.status === 'Approved';
  if (!approved && !req.body.reason) return res.status(422).json({ error: 'A reason is required' }); // KYC-02
  doc.status = req.body.status; doc.reviewedBy = req.user.id; doc.reviewReason = req.body.reason;
  await doc.save();
  await User.findByIdAndUpdate(doc.userId, { kycStatus: doc.status, status: approved ? 'Active' : 'Pending Verification' });
  await audit(req.user.id, `KYC ${doc.status}`, 'User', doc.userId, req.body.reason);
  await notify(req, doc.userId, {
    title: approved ? 'Identity check approved' : 'Identity check needs attention',
    body: approved ? 'Your account is verified and ready to use.' : `Please review the admin's note: ${req.body.reason}`,
    targetTab: 'dashboard',
  });
  res.json(doc);
}));

r.get('/admin/users', ...admin, wrap(async (req, res) => res.json((await User.find()).map((u) => u.publicView()))));

r.patch('/admin/users/:id', ...admin, wrap(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  await audit(req.user.id, `User ${req.body.status}`, 'User', req.params.id, req.body.reason);
  res.json(user.publicView());
}));

r.get('/admin/reports', ...admin, wrap(async (req, res) =>
  res.json(await Report.find().populate('petId reporterId').sort('-createdAt'))));

r.patch('/admin/reports/:id', ...admin, wrap(async (req, res) => {
  const doc = await Report.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Report not found' });
  doc.status = req.body.status || 'Resolved';
  doc.resolution = req.body.resolution; doc.resolvedBy = req.user.id;
  await doc.save();
  // Welfare rule: unpublish fast while the investigation continues.
  if (req.body.unpublish) await Pet.findByIdAndUpdate(doc.petId, { status: 'Paused' });
  await audit(req.user.id, 'Report resolved', 'Pet', doc.petId, req.body.resolution);
  res.json(doc);
}));

r.get('/admin/audit-logs', ...admin, wrap(async (req, res) =>
  res.json(await AuditLog.find().populate('actorId').sort('-createdAt').limit(200))));

export default r;
