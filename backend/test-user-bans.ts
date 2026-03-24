import mongoose from 'mongoose';

const API_URL = 'http://localhost:5000/api';
const MONGODB_URI = 'mongodb://localhost:27017/chat';

async function testUserBans() {
  try {
    console.log('--- USER-TO-USER BAN TESTS ---');
    await mongoose.connect(MONGODB_URI);
    const ts = Date.now();

    // 1. Register User A and User B
    const userA = { email: `a-${ts}@test.com`, username: `userA-${ts}`, password: 'password123' };
    const userB = { email: `b-${ts}@test.com`, username: `userB-${ts}`, password: 'password123' };

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

    // 3. Create Friendship
    console.log('3. Creating friendship...');
    const reqRes = await fetch(`${API_URL}/friends/request`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({ username: userB.username })
    });
    const friendshipId = (await reqRes.json() as any).id;

    await fetch(`${API_URL}/friends/accept/${friendshipId}`, { method: 'POST', headers: headersB });
    
    const friendsList = await fetch(`${API_URL}/friends`, { headers: headersA });
    const friends = await friendsList.json() as any[];
    if (friends.length === 0) throw new Error('Friendship not established');
    console.log('✅ Friendship established');

    // 4. User A bans User B
    console.log('4. User A banning User B...');
    const banRes = await fetch(`${API_URL}/friends/ban/${userB.username}`, {
      method: 'POST',
      headers: headersA
    });
    if (!banRes.ok) throw new Error(`Ban failed: ${await banRes.text()}`);
    console.log('✅ User B banned and friendship terminated');

    // 5. Verify friendship is gone
    const friendsList2 = await fetch(`${API_URL}/friends`, { headers: headersA });
    const friends2 = await friendsList2.json() as any[];
    if (friends2.length > 0) throw new Error('Friendship still exists after ban');
    console.log('✅ Friendship successfully deleted');

    // 6. User B tries to send request to User A (blocked)
    console.log('6. User B trying to send friend request to User A (should be blocked)...');
    const reqResB = await fetch(`${API_URL}/friends/request`, {
      method: 'POST',
      headers: headersB,
      body: JSON.stringify({ username: userA.username })
    });
    if (reqResB.status !== 403) throw new Error(`User B should be blocked, got ${reqResB.status}`);
    console.log('✅ User B correctly blocked');

    // 7. User A tries to send request to User B (blocked)
    console.log('7. User A trying to send friend request to User B (should be blocked)...');
    const reqResA = await fetch(`${API_URL}/friends/request`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({ username: userB.username })
    });
    if (reqResA.status !== 403) throw new Error(`User A should be blocked by own ban, got ${reqResA.status}`);
    console.log('✅ User A correctly blocked');

    // 8. User A unbans User B
    console.log('8. User A unbanning User B...');
    await fetch(`${API_URL}/friends/unban/${userB.username}`, { method: 'POST', headers: headersA });
    
    // 9. User A sends request again (should work)
    console.log('9. User A sending friend request again...');
    const reqResA2 = await fetch(`${API_URL}/friends/request`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({ username: userB.username })
    });
    if (!reqResA2.ok) throw new Error(`Request failed after unban: ${await reqResA2.text()}`);
    console.log('✅ Request successful after unban');

    console.log('\n🎉 ALL USER BAN TESTS PASSED!');
    await mongoose.disconnect();
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

testUserBans();
