import mongoose from 'mongoose';
import User from './src/models/User';
import Room from './src/models/Room';
import Message from './src/models/Message';

async function runTests() {
  const API_URL = 'http://localhost:5000/api';
  try {
    const ts = Date.now();
    const email = `test-del-${ts}@example.com`;
    const username = `userDel${ts}`;
    const password = 'password123';

    console.log('1. Registering user...');
    await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username, password })
    });
    
    console.log('2. Logging in...');
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const { token, user } = await loginRes.json() as any;
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    console.log('\n3. Creating an owned room...');
    const roomRes = await fetch(`${API_URL}/rooms`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: `DelRoom ${ts}`, visibility: 'public' })
    });
    const room = await roomRes.json() as any;
    const roomId = room._id;

    console.log('\n4. Sending a message in the room...');
    await fetch(`${API_URL}/rooms/${roomId}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: 'Test message' })
    });
    console.log('✅ Message sent');

    console.log('\n5. Deleting account...');
    const delAccRes = await fetch(`${API_URL}/auth/account`, {
      method: 'DELETE',
      headers
    });
    if (!delAccRes.ok) throw new Error(`Account deletion failed: ${await delAccRes.text()}`);
    console.log('✅ Account deleted');

    console.log('\n6. Verifying cleanup...');
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect('mongodb://localhost:27017/chat');
    }

    // Check if user is gone
    const userDoc = await User.findById(user.id);
    if (userDoc) throw new Error('User document still exists');
    console.log('✅ User document removed');

    // Check if room is gone
    const roomDoc = await Room.findById(roomId);
    if (roomDoc) throw new Error('Owned room document still exists');
    console.log('✅ Owned room removed');

    // Check if messages in that room are gone
    const msgCount = await Message.countDocuments({ room: roomId });
    if (msgCount !== 0) throw new Error(`Messages still exist: ${msgCount}`);
    console.log('✅ Messages in owned room removed');

    console.log('\n🎉 ALL ACCOUNT DELETION TESTS PASSED!');
    await mongoose.disconnect();
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

runTests();
