import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

const API_URL = 'http://localhost:5000/api';
const MONGODB_URI = 'mongodb://localhost:27017/chat';

async function testMessageContent() {
  try {
    console.log('--- MESSAGE CONTENT TESTS ---');
    await mongoose.connect(MONGODB_URI);
    const ts = Date.now();

    // 1. Register and Login
    const userA = { email: `mc-a-${ts}@test.com`, username: `mcuserA-${ts}`, password: 'password123' };
    await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userA)
    });
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userA.email, password: userA.password })
    });
    const token = (await loginRes.json() as any).token;
    const headers = { 'Authorization': `Bearer ${token}` };

    // 2. Create Room
    console.log('2. Creating room...');
    const roomRes = await fetch(`${API_URL}/rooms`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `ContentRoom-${ts}` })
    });
    const room = await roomRes.json() as any;
    const roomId = room._id;

    // 3. Test 3 KB Limit
    console.log('3. Testing 3 KB limit...');
    const largeContent = 'A'.repeat(3073);
    const tooLongRes = await fetch(`${API_URL}/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: largeContent })
    });
    if (tooLongRes.status !== 400) throw new Error(`Expected 400 for >3KB, got ${tooLongRes.status}`);
    console.log('✅ Correctly blocked >3KB message');

    // 4. Test Multiline & Emoji
    console.log('4. Testing multiline and emoji...');
    const multilineContent = 'Line 1\nLine 2\nEmoji: 🚀🔥';
    const multilineRes = await fetch(`${API_URL}/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: multilineContent })
    });
    const multilineMsg = await multilineRes.json() as any;
    if (multilineMsg.content !== multilineContent) throw new Error('Content mismatch');
    console.log('✅ Multiline and emoji stored correctly');

    // 5. Test Reply
    console.log('5. Testing reply functionality...');
    const replyRes = await fetch(`${API_URL}/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        content: 'Replying to multiline', 
        replyTo: multilineMsg._id 
      })
    });
    const replyMsg = await replyRes.json() as any;
    if (replyMsg.replyTo !== multilineMsg._id) throw new Error('Reply reference missing');
    console.log('✅ Reply reference stored successfully');

    // 6. Test File Upload
    console.log('6. Testing file upload...');
    const testFilePath = path.join(__dirname, 'test-upload.txt');
    fs.writeFileSync(testFilePath, 'Hello World Attachment content');
    
    const fileBuffer = fs.readFileSync(testFilePath);
    const blob = new Blob([fileBuffer], { type: 'text/plain' });
    const formData = new FormData();
    formData.append('file', blob, 'test-upload.txt');

    const uploadRes = await fetch(`${API_URL}/rooms/${roomId}/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData as any
    });
    
    if (uploadRes.status !== 201) {
       const errBody = await uploadRes.json();
       throw new Error(`Upload failed with ${uploadRes.status}: ${JSON.stringify(errBody)}`);
    }

    const uploadData = await uploadRes.json() as any;
    if (uploadData.message.type !== 'file') throw new Error('Expected message type to be file');
    console.log('✅ File uploaded and message created successfully');

    fs.unlinkSync(testFilePath);

    console.log('\n🎉 ALL MESSAGE CONTENT TESTS PASSED!');
    await mongoose.disconnect();
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

testMessageContent();
