import { Notification, User } from '../models/index.js';

export async function sendNotification(io, userId, { title, body, targetTab = 'dashboard' }) {
  const item = await Notification.create({ userId, title, body, targetTab });
  const payload = {
    id: item.id,
    title: item.title,
    body: item.body,
    targetTab: item.targetTab,
    readAt: item.readAt,
    createdAt: item.createdAt,
  };
  io?.to(`user:${userId}`).emit('notification:new', payload);
  return payload;
}

export async function notifyAdmins(io, notification) {
  const admins = await User.find({ role: 'admin', status: { $ne: 'Deactivated' } }).select('_id').lean();
  return Promise.all(admins.map((admin) => sendNotification(io, admin._id, notification)));
}
