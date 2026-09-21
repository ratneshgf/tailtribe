import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import http from 'http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import routes from './routes/index.js';
import { Pet, Reservation } from './models/index.js';

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.WEB_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api', routes);
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
// Never leak stack traces or Mongo internals to the client.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'Something went wrong' });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.WEB_ORIGIN || 'http://localhost:5173' } });
app.set('io', io);

// CHAT-01: sockets are authenticated too — a room is not a public channel.
io.use((socket, next) => {
  try {
    socket.userId = jwt.verify(socket.handshake.auth?.token, process.env.JWT_ACCESS_SECRET).sub;
    next();
  } catch { next(new Error('unauthorized')); }
});
io.on('connection', (socket) => {
  socket.join(`user:${socket.userId}`);
  socket.on('join', (conversationId) => socket.join(`conv:${conversationId}`));
});

// BOOK-03: expired holds release the animal back to the marketplace.
setInterval(async () => {
  const due = await Reservation.find({ status: 'Approved', expiresAt: { $lt: new Date() } });
  for (const hold of due) {
    hold.status = 'Expired';
    hold.history.push({ status: 'Expired', at: new Date() });
    await hold.save();
    await Pet.updateOne({ _id: hold.petId, status: 'Reserved' }, { status: 'Published' });
    io.to(`user:${hold.buyerId}`).emit('reservation:expired', { reservationId: hold.id });
  }
}, 60_000);

const port = process.env.PORT || 4000;
mongoose.connect(process.env.MONGODB_URI)
  .then(() => server.listen(port, () => console.log(`TailTribe API on http://localhost:${port}`)))
  .catch((e) => { console.error('MongoDB connection failed:', e.message); process.exit(1); });
