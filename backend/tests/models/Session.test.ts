import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Session from '../../src/models/Session';

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
  await Session.deleteMany({});
});

describe('Session Model Test', () => {
  it('should create & save session successfully', async () => {
    const userId = new mongoose.Types.ObjectId();
    const validSession = new Session({
      userId,
      token: 'some-jwt-token',
      expiresAt: new Date(Date.now() + 10000)
    });
    const savedSession = await validSession.save();
    
    expect(savedSession._id).toBeDefined();
    expect(savedSession.userId.toString()).toBe(userId.toString());
    expect(savedSession.token).toBe('some-jwt-token');
  });
});
