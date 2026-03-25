import mongoose from 'mongoose';

const API_URL = 'http://localhost:5000/api';
const MONGODB_URI = 'mongodb://localhost:27017/chat';

async function testUnreadIndicators() {
  try {
    console.log('--- UNREAD INDICATORS TESTS ---');
    await mongoose.connect(MONGODB_URI);
    const ts = Date.now();

    // 1. Register User A and User B
    const userA = { email: `ua-${ts}@test.com`, username: `userA-${ts}`, password: 'password123' };
    const userB = { email: `ub-${ts}@test.com`, username: `userB-${ts}`, password: 'password123' };

    console.log('1. Registering users...');
    await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userA)
    });
    await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userB)
    });

    // 2. Login
    console.log('2. Logging in...');
    const loginA = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userA.email, password: userA.password })
    });
    const tokenA = (await loginA.json() as any).token;
    const headersA = { 'Authorization': `Bearer ${tokenA}`, 'Content-Type': 'application/json' };

    const loginB = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userB.email, password: userB.password })
    });
    const tokenB = (await loginB.json() as any).token;
    const headersB = { 'Authorization': `Bearer ${tokenB}`, 'Content-Type': 'application/json' };

    // 3. Create a Room, Friendship, and a Personal Chat
    console.log('3. Setting up chats and friendship...');
    const roomRes = await fetch(`${API_URL}/rooms`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({ name: `Room-${ts}`, visibility: 'public' })
    });
    const room = await roomRes.json() as any;

    const joinRes = await fetch(`${API_URL}/rooms/${room._id}/join`, { method: 'POST', headers: headersB });
    if (joinRes.status !== 200) throw new Error(`Join room failed: ${joinRes.status}`);

    // Create Friendship
    console.log('   Creating friendship...');
    const reqRes = await fetch(`${API_URL}/friends/request`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({ username: userB.username })
    });
    if (reqRes.status !== 201) throw new Error(`Friend request failed: ${reqRes.status}`);

    const listReqRes = await fetch(`${API_URL}/friends/pending`, { headers: headersB });
    const pending = await listReqRes.json() as any[];
    const myReq = pending.find(p => p.from?.username === userA.username);
    if (!myReq) throw new Error('Pending friend request not found');

    const acceptRes = await fetch(`${API_URL}/friends/accept/${myReq.id}`, {
      method: 'POST',
      headers: headersB
    });
    if (acceptRes.status !== 200) throw new Error(`Accept friendship failed: ${acceptRes.status}`);

    const chatRes = await fetch(`${API_URL}/personal-chats/get-or-create/${userB.username}`, {
      method: 'POST',
      headers: headersA
    });
    const chat = await chatRes.json() as any;
    if (!chat._id) throw new Error('Personal chat creation failed');

    // 4. Verification: Initial unreadCount should be 0
    console.log('4. Verifying initial unread counts (should be 0)...');
    const roomsB_initial_res = await fetch(`${API_URL}/rooms`, { headers: headersB });
    const roomsB_initial = await roomsB_initial_res.json() as any[];
    const roomB_initial = roomsB_initial.find(r => r._id === room._id);
    console.log(`   Room unreadCount: ${roomB_initial.unreadCount}`);
    if (roomB_initial.unreadCount !== 0) throw new Error('Initial room unreadCount should be 0');

    const chatsB_initial_res = await fetch(`${API_URL}/personal-chats`, { headers: headersB });
    const chatsB_initial = await chatsB_initial_res.json() as any[];
    const chatB_initial = chatsB_initial.find(c => c._id === chat._id);
    console.log(`   Personal chat unreadCount: ${chatB_initial.unreadCount}`);
    if (chatB_initial.unreadCount !== 0) throw new Error('Initial personal chat unreadCount should be 0');

    // 5. User A sends messages
    console.log('5. User A sending messages...');
    const msgRoomRes = await fetch(`${API_URL}/rooms/${room._id}/messages`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({ content: 'Hello Room!' })
    });
    if (msgRoomRes.status !== 201) throw new Error(`Room message failed: ${msgRoomRes.status}`);

    const msgChatRes = await fetch(`${API_URL}/personal-chats/${chat._id}/messages`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({ content: 'Hello Personal!' })
    });
    if (msgChatRes.status !== 201) throw new Error(`Personal message failed: ${msgChatRes.status}`);

    // 6. Verification: User B should have unreadCount: 1
    console.log('6. Verifying unread counts after messages (should be 1)...');
    const roomsB_after = await (await fetch(`${API_URL}/rooms`, { headers: headersB })).json() as any[];
    const roomB_after = roomsB_after.find(r => r._id === room._id);
    console.log(`   Room unreadCount: ${roomB_after.unreadCount}`);
    if (roomB_after.unreadCount !== 1) throw new Error('Room unreadCount should be 1');

    const chatsB_after = await (await fetch(`${API_URL}/personal-chats`, { headers: headersB })).json() as any[];
    const chatB_after = chatsB_after.find(c => c._id === chat._id);
    console.log(`   Personal chat unreadCount: ${chatB_after.unreadCount}`);
    if (chatB_after.unreadCount !== 1) throw new Error('Personal chat unreadCount should be 1');

    // 7. User B marks as read
    console.log('7. User B marking as read...');
    await fetch(`${API_URL}/rooms/${room._id}/read`, { method: 'POST', headers: headersB });
    await fetch(`${API_URL}/personal-chats/${chat._id}/read`, { method: 'POST', headers: headersB });

    // 8. Verification: unreadCount should be 0 again
    console.log('8. Verifying unread counts after marking as read (should be 0)...');
    const roomsB_final = await (await fetch(`${API_URL}/rooms`, { headers: headersB })).json() as any[];
    const roomB_final = roomsB_final.find(r => r._id === room._id);
    console.log(`   Room unreadCount: ${roomB_final.unreadCount}`);
    if (roomB_final.unreadCount !== 0) throw new Error('Final room unreadCount should be 0');

    const chatsB_final = await (await fetch(`${API_URL}/personal-chats`, { headers: headersB })).json() as any[];
    const chatB_final = chatsB_final.find(c => c._id === chat._id);
    console.log(`   Personal chat unreadCount: ${chatB_final.unreadCount}`);
    if (chatB_final.unreadCount !== 0) throw new Error('Final personal chat unreadCount should be 0');

    console.log('\n🎉 ALL UNREAD INDICATOR TESTS PASSED!');
    await mongoose.disconnect();
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

testUnreadIndicators();
