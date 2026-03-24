import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import authRoutes from './routes/authRoutes';
import friendRoutes from './routes/friendRoutes';
import roomRoutes from './routes/roomRoutes';
import personalChatRoutes from './routes/personalChatRoutes';

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/personal-chats', personalChatRoutes);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

import { initSocketManager } from './socketManager';

// Basic health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Chat backend is running' });
});

// Delegate all socket handling to socketManager
initSocketManager(io);


// Connect to MongoDB
const mongoUri = 'mongodb://localhost:27017/chat';
mongoose.connect(mongoUri)
  .then(() => {
    console.log('Connected to MongoDB');

    // Start server after DB connection
    server.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error('Error connecting to MongoDB:', error);
  });
