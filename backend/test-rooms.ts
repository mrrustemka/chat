async function runTests() {
  const API_URL = 'http://localhost:5000/api';
  try {
    const ts = Date.now();
    const email = `test-room-${ts}@example.com`;
    const username = `userRoom${ts}`;
    const password = 'password123';

    console.log('1. Registering user...');
    const regRes = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username, password })
    });
    if (!regRes.ok) throw new Error(`Registration failed: ${regRes.statusText}`);
    
    console.log('2. Logging in...');
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.statusText}`);
    const loginData: any = await loginRes.json();
    const token = loginData.token;
    const userId = loginData.user.id;

    const headers = { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    console.log('\n3. Creating a room...');
    const roomName = `Room ${ts}`;
    const roomRes = await fetch(`${API_URL}/rooms`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: roomName,
        description: 'A test room',
        visibility: 'public'
      })
    });
    if (!roomRes.ok) throw new Error(`Room creation failed: ${roomRes.statusText} ${await roomRes.text()}`);
    const room: any = await roomRes.json();
    console.log('✅ Room created:', room.name);
    
    console.log('\n4. Verifying room properties...');
    if (room.visibility !== 'public') throw new Error(`Expected visibility 'public', got ${room.visibility}`);
    if (room.owner.toString() !== userId.toString()) throw new Error(`Expected owner ${userId}, got ${room.owner}`);
    if (!room.admins.includes(userId)) throw new Error(`Expected owner to be an admin`);
    if (!room.members.includes(userId)) throw new Error(`Expected owner to be a member`);
    if (!Array.isArray(room.bannedUsers)) throw new Error(`Expected bannedUsers to be an array`);
    console.log('✅ Room properties verified');

    console.log('\n5. Testing room name uniqueness...');
    const duplicateRes = await fetch(`${API_URL}/rooms`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: roomName,
        visibility: 'public'
      })
    });
    if (duplicateRes.status === 409) {
      console.log('✅ Duplicate room name correctly handled (409)');
    } else {
      throw new Error(`Should have failed with 409, got ${duplicateRes.status}`);
    }

    console.log('\n6. Testing room search...');
    // Create another room with unique name/desc
    const searchName = `SearchableRoom ${ts}`;
    const searchDesc = `Special keyword ${ts}`;
    await fetch(`${API_URL}/rooms`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: searchName,
        description: searchDesc,
        visibility: 'public'
      })
    });

    console.log(`- Searching for "${searchName}"...`);
    const searchRes1 = await fetch(`${API_URL}/rooms?search=${encodeURIComponent(searchName)}`, { headers });
    const searchData1: any = await searchRes1.json();
    if (searchData1.length !== 1 || searchData1[0].name !== searchName) {
      throw new Error(`Search by name failed. Expected 1 room, got ${searchData1.length}`);
    }

    console.log(`- Searching for keyword in description...`);
    const searchRes2 = await fetch(`${API_URL}/rooms?search=${encodeURIComponent(`keyword ${ts}`)}`, { headers });
    const searchData2: any = await searchRes2.json();
    if (searchData2.length !== 1 || !searchData2[0].description.includes(`keyword ${ts}`)) {
      throw new Error(`Search by description failed. Expected 1 room, got ${searchData2.length}`);
    }

    console.log('- Searching for non-existent room...');
    const searchRes3 = await fetch(`${API_URL}/rooms?search=NonExistentRoomXYZ`, { headers });
    const searchData3: any = await searchRes3.json();
    if (searchData3.length !== 0) {
      throw new Error(`Search for non-existent room failed. Expected 0 rooms, got ${searchData3.length}`);
    }
    console.log('✅ Room search verified');

    console.log('\n🎉 ALL ROOM TESTS PASSED!');
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

runTests();
