import mongoose from 'mongoose';
const { Schema, model } = mongoose;
const T = { timestamps: true };

const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['buyer', 'seller', 'admin'], default: 'buyer' },
  status: { type: String, enum: ['Active', 'Pending Verification', 'Suspended', 'Deactivated'], default: 'Pending Verification' },
  kycStatus: { type: String, enum: ['None', 'Submitted', 'Approved', 'Rejected'], default: 'None' },
  refreshTokens: { type: [String], default: [], select: false },
}, T);
userSchema.index({ role: 1, status: 1 });
// AUTH-03 / KYC-04: never leak hashes, tokens or documents through the API.
userSchema.methods.publicView = function () {
  return { id: this.id, name: this.name, role: this.role, status: this.status, kycStatus: this.kycStatus };
};

const passwordResetSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: { createdAt: true, updatedAt: false } });

export const PasswordReset = model('PasswordReset', passwordResetSchema);

const kycSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  documentType: { type: String, required: true },
  documentRef: { type: String, required: true }, // private storage key — never returned publicly
  documentResourceType: { type: String, enum: ['image', 'raw'], default: 'raw' },
  documentFormat: { type: String, enum: ['pdf', 'jpg', 'png'], default: 'pdf' },
  status: { type: String, enum: ['Submitted', 'Approved', 'Rejected', 'Resubmission Required'], default: 'Submitted' },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewReason: String,
}, T);
kycSchema.index({ userId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'Submitted' } });

export const LISTING_STATES = ['Draft', 'Pending Review', 'Published', 'Reserved', 'Sold/Adopted', 'Paused', 'Rejected', 'Archived'];
// PET-07: only these transitions are legal.
export const LISTING_TRANSITIONS = {
  Draft: ['Pending Review', 'Archived'],
  'Pending Review': ['Published', 'Rejected', 'Draft'],
  Published: ['Reserved', 'Sold/Adopted', 'Paused', 'Archived'],
  Reserved: ['Published', 'Sold/Adopted', 'Archived'],
  Paused: ['Published', 'Archived'],
  Rejected: ['Draft', 'Archived'],
  'Sold/Adopted': ['Archived'],
  Archived: [],
};

const petSchema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true },
  species: { type: String, enum: ['Dog', 'Cat', 'Rabbit', 'Bird'], required: true },
  breed: { type: String, required: true, trim: true },
  ageYears: { type: Number, min: 0, max: 40, required: true },
  gender: { type: String, enum: ['Male', 'Female'], required: true },
  color: String,
  about: String,
  health: String,                       // PET-04: owner-provided, flagged as such in the UI
  healthVerified: { type: Boolean, default: false },
  vaccination: { type: String, enum: ['Full', 'Partial', 'None'], default: 'None' },
  media: [{ storageKey: String, url: String, type: { type: String, default: 'image' }, sortOrder: Number }],
  city: { type: String, required: true },
  pincode: { type: String, required: true },   // PET-06: never a full street address
  meetingAddress: { type: String, trim: true, select: false },
  meetingLandmark: { type: String, trim: true, select: false },
  price: { type: Number, default: 0, min: 0 },
  adoptionType: { type: String, enum: ['sale', 'free'], default: 'free' },
  status: { type: String, enum: LISTING_STATES, default: 'Draft' },
  rejectionReason: String,
}, T);
petSchema.index({ status: 1, pincode: 1 });
petSchema.index({ status: 1, breed: 1 });
petSchema.index({ status: 1, price: 1 });
petSchema.index({ ownerId: 1, status: 1 });

const requestSchema = new Schema({
  petId: { type: Schema.Types.ObjectId, ref: 'Pet', required: true },
  buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['purchase', 'adoption'], default: 'adoption' },
  message: String,
  status: { type: String, enum: ['Submitted', 'Under Review', 'More Info Required', 'Accepted', 'Declined', 'Cancelled', 'Completed'], default: 'Submitted' },
  completedAt: Date,
}, T);
requestSchema.index({ sellerId: 1, status: 1 });
requestSchema.index({ buyerId: 1, status: 1 });
requestSchema.index({ petId: 1, status: 1 });

const reservationSchema = new Schema({
  petId: { type: Schema.Types.ObjectId, ref: 'Pet', required: true },
  buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['Requested', 'Approved', 'Declined', 'Expired', 'Cancelled', 'Completed'], default: 'Requested' },
  expiresAt: Date,
  approvedAt: Date,
  history: [{ status: String, at: Date }],
}, T);
// BOOK-04: one active hold per pet, enforced by the database, not by application timing.
reservationSchema.index({ petId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['Requested', 'Approved'] } } });
reservationSchema.index({ expiresAt: 1 });

const conversationSchema = new Schema({
  petId: { type: Schema.Types.ObjectId, ref: 'Pet', required: true },
  participantIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  lastMessageAt: Date,
}, T);
const messageSchema = new Schema({
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  body: { type: String, required: true, maxlength: 2000 },
  readAt: Date,
  moderationFlags: [String],
}, T);
messageSchema.index({ conversationId: 1, createdAt: 1 });

const reportSchema = new Schema({
  petId: { type: Schema.Types.ObjectId, ref: 'Pet', required: true },
  reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, enum: ['Animal welfare concern', 'Misleading information', 'Suspected scam', 'Prohibited listing', 'Other'], required: true },
  description: String,
  status: { type: String, enum: ['Open', 'Investigating', 'Resolved', 'Dismissed'], default: 'Open' },
  resolution: String,
  resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, T);

const favoriteSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  petId: { type: Schema.Types.ObjectId, ref: 'Pet', required: true },
}, T);
favoriteSchema.index({ userId: 1, petId: 1 }, { unique: true });

const auditSchema = new Schema({
  actorId: { type: Schema.Types.ObjectId, ref: 'User' },
  action: { type: String, required: true },
  entityType: String,
  entityId: String,
  detail: String,
  metadata: Object,
}, { timestamps: { createdAt: true, updatedAt: false } });
auditSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditSchema.index({ actorId: 1, createdAt: -1 });

const notificationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, maxlength: 120 },
  body: { type: String, required: true, maxlength: 300 },
  targetTab: { type: String, enum: ['dashboard', 'seller', 'browse', 'messages', 'admin'], default: 'dashboard' },
  readAt: Date,
}, T);
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });

export const User = model('User', userSchema);
export const Kyc = model('Kyc', kycSchema);
export const Pet = model('Pet', petSchema);
export const Request = model('Request', requestSchema);
export const Reservation = model('Reservation', reservationSchema);
export const Conversation = model('Conversation', conversationSchema);
export const Message = model('Message', messageSchema);
export const Report = model('Report', reportSchema);
export const Favorite = model('Favorite', favoriteSchema);
export const AuditLog = model('AuditLog', auditSchema);
export const Notification = model('Notification', notificationSchema);
