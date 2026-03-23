import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../../src/models/User';

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
});

describe('User Model Test', () => {
  it('should create & save user successfully', async () => {
    const validUser = new User({
      email: 'test@test.com',
      username: 'testuser',
      passwordHash: 'hashedpassword'
    });
    const savedUser = await validUser.save();
    
    expect(savedUser._id).toBeDefined();
    expect(savedUser.email).toBe('test@test.com');
    expect(savedUser.username).toBe('testuser');
  });

  it('should fail if email is not provided', async () => {
    const userWithoutEmail = new User({
      username: 'testu',
      passwordHash: 'hash'
    });
    
    let err: any;
    try {
      await userWithoutEmail.save();
    } catch (error) {
      err = error;
    }
    expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
    expect(err.errors.email).toBeDefined();
  });

  it('should fail if username is not provided', async () => {
    const userWithoutUsername = new User({
      email: 'a@a.com',
      passwordHash: 'hash'
    });
    
    let err: any;
    try {
      await userWithoutUsername.save();
    } catch (error) {
      err = error;
    }
    expect(err.errors.username).toBeDefined();
  });
});
