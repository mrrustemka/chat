import mongoose from 'mongoose';

const API_URL = 'http://localhost:5000/api';
const MONGODB_URI = 'mongodb://localhost:27017/chat';

async function testPersonalMessaging() {
  try {
    console.log('--- PERSONAL MESSAGING TESTS ---');
    await mongoose.connect(MONGODB_URI);
    const ts = Date.now();

    // 1. Register Users A, B, C
    const userA = { email: `ma-${ts}@test.com`, username: `muserA-${ts}`, password: 'password123' };
    const userB = { email: `mb-${ts}@test.com`, username: `muserB-${ts}`, password: 'password123' };
    const userC = { email: `mc-${ts}@test.com`, username: `muserC-${ts}`, password: 'password123' };

    console.log('1. Registering users...');
    await Promise.all([userA, userB, userC].map(u => 
      fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(u)
      })
    ));

    // 2. Login
    console.log('2. Logging in...');
    const tokens = await Promise.all([userA, userB, userC].map(async u => {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: u.email, password: u.password })
      });
      return (await res.json() as any).token;
    }));

    const [tokenA, tokenB, tokenC] = tokens;
    const headersA = { 'Authorization': `Bearer ${tokenA}`, 'Content-Type': 'application/json' };
    const headersB = { 'Authorization': `Bearer ${tokenB}`, 'Content-Type': 'application/json' };
    const headersC = { 'Authorization': `Bearer ${tokenC}`, 'Content-Type': 'application/json' };

    // 3. Create Friendship A-B
    console.log('3. Establishing friendship A-B...');
    const reqRes = await fetch(`${API_URL}/friends/request`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({ username: userB.username })
    });
    const friendshipId = (await reqRes.json() as any).id;
    await fetch(`${API_URL}/friends/accept/${friendshipId}`, { method: 'POST', headers: headersB });

    // 4. Get/Create Chat A-B
    const chatRes = await fetch(`${API_URL}/personal-chats/get-or-create/${userB.username}`, {
      method: 'POST',
      headers: headersA
    });
    const chat = await chatRes.json() as any;
    const chatId = chat._id;

    // 5. Test Sending Message (Success)
    console.log('5. Testing successful message exchange (A -> B)...');
    const msgRes = await fetch(`${API_URL}/personal-chats/${chatId}/messages`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({ content: 'Hello friend!' })
    });
    if (!msgRes.ok) throw new Error(`Send failed: ${await msgRes.text()}`);
    console.log('✅ Message sent successfully');

    // 6. Test Sending Message (Fail: Not Friends A-C)
    console.log('6. Testing message block if not friends (A -> C)...');
    const chatResAC = await fetch(`${API_URL}/personal-chats/get-or-create/${userC.username}`, {
      method: 'POST',
      headers: headersA
    });
    const chatIdAC = (await chatResAC.json() as any)._id;
    const msgResAC = await fetch(`${API_URL}/personal-chats/${chatIdAC}/messages`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({ content: 'Hello stranger!' })
    });
    if (msgResAC.status !== 403) throw new Error(`Expected 403 for non-friends, got ${msgResAC.status}`);
    console.log('✅ Correctly blocked (not friends)');

    // 7. Test Sending Message (Fail: Banned A-B)
    console.log('7. Testing message block if banned (A bans B)...');
    await fetch(`${API_URL}/friends/ban/${userB.username}`, { method: 'POST', headers: headersA });
    const msgResAB2 = await fetch(`${API_URL}/personal-chats/${chatId}/messages`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({ content: 'I banned you but I send?' })
    });
    if (msgResAB2.status !== 403) throw new Error(`Expected 403 for ban, got ${msgResAB2.status}`);
    console.log('✅ Correctly blocked (banned)');

    console.log('\n🎉 ALL PERSONAL MESSAGING TESTS PASSED!');
    await mongoose.disconnect();
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

testPersonalMessaging();
