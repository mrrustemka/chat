import axios from 'axios';
import mongoose from 'mongoose';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

// Import models to check DB directly
import User from './src/models/User';
import Room from './src/models/Room';
import Message from './src/models/Message';
import FileModel from './src/models/File';

const API_URL = 'http://localhost:5000/api';
const MONGO_URI = 'mongodb://localhost:27017/chat';

async function runTests() {
  try {
    console.log('🚀 Starting Reliability Tests...');
    
    // Connect to MongoDB
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const ts = Date.now();
    
    // Helper to register and login users
    const setupUser = async (suffix: string) => {
      const email = `rel-${suffix}-${ts}@example.com`;
      const username = `user${suffix}${ts}`;
      const password = 'Password123!';
      
      await axios.post(`${API_URL}/auth/register`, { email, username, password });
      const loginRes = await axios.post(`${API_URL}/auth/login`, { email, password });
      
      return {
        id: loginRes.data.user.id,
        username,
        token: loginRes.data.token,
        headers: { Authorization: `Bearer ${loginRes.data.token}` }
      };
    };

    console.log('\n--- Setting up test users ---');
    const userA = await setupUser('A'); // Owner
    const userB = await setupUser('B'); // Member / Admin
    const userC = await setupUser('C'); // Banned
    const userD = await setupUser('D'); // Non-member
    console.log('✅ Test users created');

    // 1. Membership & Permissions Consistency
    console.log('\n--- 1. Membership & Permissions Consistency ---');
    const roomRes = await axios.post(`${API_URL}/rooms`, { 
      name: `RelRoom ${ts}`, 
      visibility: 'public' 
    }, { headers: userA.headers });
    const roomId = roomRes.data._id;
    console.log(`✅ Room created: ${roomId}`);

    await axios.post(`${API_URL}/rooms/${roomId}/join`, {}, { headers: userB.headers });
    console.log('✅ User B joined');

    await axios.post(`${API_URL}/rooms/${roomId}/admins`, { username: userB.username }, { headers: userA.headers });
    console.log('✅ User B promoted to admin');

    // Verify initial state in DB
    let roomDoc = await Room.findById(roomId);
    if (!roomDoc?.members.map(m => m.toString()).includes(userB.id)) throw new Error('User B not in members');
    if (!roomDoc?.admins.map(a => a.toString()).includes(userB.id)) throw new Error('User B not in admins');
    console.log('✅ Initial membership verified in DB');

    // Delete User B and check consistency
    console.log('🗑️ Deleting User B...');
    await axios.delete(`${API_URL}/auth/account`, { headers: userB.headers });
    
    roomDoc = await Room.findById(roomId);
    if (roomDoc?.members.map(m => m.toString()).includes(userB.id)) throw new Error('User B still in members after deletion');
    if (roomDoc?.admins.map(a => a.toString()).includes(userB.id)) throw new Error('User B still in admins after deletion');
    console.log('✅ User B removed from room members and admins automatically');

    // 2. Room Bans Consistency
    console.log('\n--- 2. Room Bans Consistency ---');
    await axios.post(`${API_URL}/rooms/${roomId}/ban`, { username: userC.username }, { headers: userA.headers });
    console.log('✅ User C banned from room');

    try {
      await axios.post(`${API_URL}/rooms/${roomId}/join`, {}, { headers: userC.headers });
      throw new Error('User C allowed to join while banned');
    } catch (err: any) {
      if (err.response?.status === 403) console.log('✅ User C correctly blocked from joining (403)');
      else throw err;
    }

    try {
      await axios.get(`${API_URL}/rooms/${roomId}/messages`, { headers: userC.headers });
      throw new Error('User C allowed to list messages while banned');
    } catch (err: any) {
      if (err.response?.status === 403) console.log('✅ User C correctly blocked from listing messages (403)');
      else throw err;
    }

    // 3. File Access Rights
    console.log('\n--- 3. File Access Rights ---');
    // Create a private room
    const privRoomRes = await axios.post(`${API_URL}/rooms`, { 
      name: `PrivRoom ${ts}`, 
      visibility: 'private' 
    }, { headers: userA.headers });
    const privRoomId = privRoomRes.data._id;
    
    // User B is gone, lets use User A to invite User D (who we'll later kick)
    await axios.post(`${API_URL}/rooms/${privRoomId}/invite`, { username: userD.username }, { headers: userA.headers });
    console.log('✅ User D invited to private room');

    // Upload file
    const testFilePath = path.join(__dirname, 'test-file.txt');
    fs.writeFileSync(testFilePath, 'Reliability test file content');
    
    const form = new FormData();
    form.append('file', fs.createReadStream(testFilePath));
    form.append('comment', 'Testing access control');
    
    const uploadRes = await axios.post(`${API_URL}/rooms/${privRoomId}/upload`, form, {
      headers: { ...userA.headers, ...form.getHeaders() }
    });
    const fileId = uploadRes.data.file._id;
    console.log(`✅ File uploaded: ${fileId}`);

    // Verify User D can download
    const downD = await axios.get(`${API_URL}/files/${fileId}`, { headers: userD.headers });
    if (downD.status === 200) console.log('✅ User D (member) can download the file');

    // User C (not a member) cannot download
    try {
      await axios.get(`${API_URL}/files/${fileId}`, { headers: userC.headers });
      throw new Error('User C (non-member) allowed to download file');
    } catch (err: any) {
      if (err.response?.status === 403) console.log('✅ User C (non-member) correctly blocked (403)');
      else throw err;
    }

    // Kick User D and check access
    console.log('👢 Kicking User D...');
    await axios.post(`${API_URL}/rooms/${privRoomId}/ban`, { username: userD.username }, { headers: userA.headers });
    
    try {
      await axios.get(`${API_URL}/files/${fileId}`, { headers: userD.headers });
      throw new Error('User D allowed to download file after being kicked');
    } catch (err: any) {
      if (err.response?.status === 403) console.log('✅ User D (kicked) correctly blocked (403)');
      else throw err;
    }

    // 4. Message History Consistency (Room Deletion)
    console.log('\n--- 4. Message History Consistency (Room Deletion) ---');
    await axios.delete(`${API_URL}/rooms/${privRoomId}`, { headers: userA.headers });
    console.log('✅ Private room deleted');

    const msgCount = await Message.countDocuments({ room: privRoomId });
    if (msgCount !== 0) throw new Error(`Messages still exist for deleted room: ${msgCount}`);
    
    const fileCount = await FileModel.countDocuments({ room: privRoomId });
    if (fileCount !== 0) throw new Error(`Files still exist for deleted room: ${fileCount}`);
    console.log('✅ Room messages and files documents cleaned up successfully');

    // 5. Admin/Owner Permissions
    console.log('\n--- 5. Admin/Owner Permissions ---');
    // Re-setup User B for fresh tests
    const userB2 = await setupUser('B2');
    await axios.post(`${API_URL}/rooms/${roomId}/join`, {}, { headers: userB2.headers });
    
    // Regular member cannot ban
    try {
      await axios.post(`${API_URL}/rooms/${roomId}/ban`, { username: userA.username }, { headers: userB2.headers });
      throw new Error('Regular member allowed to ban');
    } catch (err: any) {
      if (err.response?.status === 403) console.log('✅ Regular member blocked from banning (403)');
      else throw err;
    }

    // Admin cannot delete room
    await axios.post(`${API_URL}/rooms/${roomId}/admins`, { username: userB2.username }, { headers: userA.headers });
    console.log('✅ User B promoted to admin');
    
    try {
      await axios.delete(`${API_URL}/rooms/${roomId}`, { headers: userB2.headers });
      throw new Error('Admin allowed to delete room');
    } catch (err: any) {
      if (err.response?.status === 403) console.log('✅ Admin blocked from deleting room (403)');
      else throw err;
    }

    console.log('\n🎉 ALL RELIABILITY TESTS PASSED!');
    
    // Cleanup
    if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
    
  } catch (error: any) {
    console.error('\n❌ Test failed!');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

runTests();
