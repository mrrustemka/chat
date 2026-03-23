import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import authRoutes from '../../src/routes/authRoutes';
import User from '../../src/models/User';
import Session from '../../src/models/Session';
import bcrypt from 'bcryptjs';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await User.deleteMany({});
  await Session.deleteMany({});
});

describe('Auth Controller Tests', () => {
  it('should register a new user', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'test@example.com',
      username: 'tester',
      password: 'password123'
    });
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('User registered successfully');
    
    const user = await User.findOne({ email: 'test@example.com' });
    expect(user).toBeDefined();
    expect(user?.username).toBe('tester');
  });

  it('should login an existing user', async () => {
    // Register first
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('password123', salt);
    await new User({ email: 'test@example.com', username: 'tester', passwordHash }).save();

    const res = await request(app).post('/api/auth/login').send({
      email: 'test@example.com',
      password: 'password123'
    });
    
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe('tester');
    
    const sessionCount = await Session.countDocuments();
    expect(sessionCount).toBe(1);
  });
  
  it('should get current user with valid token', async () => {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('password123', salt);
    await new User({ email: 'test@example.com', username: 'tester', passwordHash }).save();

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'test@example.com',
      password: 'password123'
    });
    const token = loginRes.body.token;

    const meRes = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.username).toBe('tester');
  });
  
  it('should isolate logout (keep other sessions active)', async () => {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('password123', salt);
    await new User({ email: 'test@example.com', username: 'tester', passwordHash }).save();

    const login1 = await request(app).post('/api/auth/login').send({ email: 'test@example.com', password: 'password123' });
    const login2 = await request(app).post('/api/auth/login').send({ email: 'test@example.com', password: 'password123' });
    
    const token1 = login1.body.token;
    const token2 = login2.body.token;

    // Logout session 1
    const logoutRes = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token1}`);
    expect(logoutRes.status).toBe(200);

    // Session 1 is dead
    const meRes1 = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token1}`);
    expect(meRes1.status).toBe(401);

    // Session 2 is alive
    const meRes2 = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token2}`);
    expect(meRes2.status).toBe(200);
  });
});
