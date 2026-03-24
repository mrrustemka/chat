import mongoose from 'mongoose';

async function runTests() {
  const API_URL = 'http://localhost:5000/api';
  try {
    const ts = Date.now();
    const email = `test-page-${ts}@example.com`;
    const username = `userPage${ts}`;
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
    const { token } = await loginRes.json() as any;
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    console.log('\n3. Creating a room...');
    const roomRes = await fetch(`${API_URL}/rooms`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: `PaginationRoom ${ts}`, visibility: 'public' })
    });
    const { _id: roomId } = await roomRes.json() as any;

    console.log('\n4. Sending 60 test messages...');
    for (let i = 1; i <= 60; i++) {
        await fetch(`${API_URL}/rooms/${roomId}/messages`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ content: `Message ${i}` })
        });
        // Brief delay to ensure distinct timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    console.log('✅ Sent 60 messages');

    console.log('\n5. Fetching latest 50 messages...');
    const res1 = await fetch(`${API_URL}/rooms/${roomId}/messages?limit=50`, { headers });
    const batch1 = await res1.json() as any[];
    console.log(`- Batch 1 size: ${batch1.length}`);
    if (batch1.length !== 50) throw new Error(`Expected 50 messages, got ${batch1.length}`);
    
    // Verify batch 1 is most recent first
    if (batch1[0].content !== 'Message 60') throw new Error(`Expected Message 60 at first position, got ${batch1[0].content}`);
    if (batch1[49].content !== 'Message 11') throw new Error(`Expected Message 11 at 50th position, got ${batch1[49].content}`);
    console.log('✅ Batch 1 ordering and limit verified');

    console.log('\n6. Fetching remaining 10 messages before batch 1...');
    const oldestInBatch1 = batch1[49];
    const res2 = await fetch(`${API_URL}/rooms/${roomId}/messages?limit=50&before=${oldestInBatch1.createdAt}`, { headers });
    const batch2 = await res2.json() as any[];
    console.log(`- Batch 2 size: ${batch2.length}`);
    if (batch2.length !== 10) throw new Error(`Expected 10 messages, got ${batch2.length}`);
    
    if (batch2[0].content !== 'Message 10') throw new Error(`Expected Message 10 at first position of Batch 2, got ${batch2[0].content}`);
    if (batch2[9].content !== 'Message 1') throw new Error(`Expected Message 1 at last position of Batch 2, got ${batch2[9].content}`);
    console.log('✅ Batch 2 ordering and pagination verified');

    console.log('\n🎉 ALL PAGINATION TESTS PASSED!');
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

runTests();
