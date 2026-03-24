import Message from './src/models/Message';
import File from './src/models/File';
import mongoose from 'mongoose';

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

    console.log('\n7. Testing Private Rooms and Invitations...');
    // Create User B
    const emailB = `userB-${ts}@example.com`, usernameB = `userB${ts}`, pwB = 'password123';
    await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailB, username: usernameB, password: pwB })
    });
    const loginResB = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailB, password: pwB })
    });
    const tokenB = (await loginResB.json() as any).token;
    const headersB = { 'Authorization': `Bearer ${tokenB}`, 'Content-Type': 'application/json' };

    // User A creates a private room
    const privateRoomName = `PrivateRoom ${ts}`;
    const createPrivRes = await fetch(`${API_URL}/rooms`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: privateRoomName, visibility: 'private' })
    });
    const privRoom = await createPrivRes.json() as any;
    console.log(`- User A created private room: ${privateRoomName}`);

    // User B checks catalog (should not see it)
    const catalogB = await fetch(`${API_URL}/rooms`, { headers: headersB });
    const catalogDataB = await catalogB.json() as any[];
    if (catalogDataB.some(r => r.name === privateRoomName)) {
      throw new Error('Private room should NOT be visible to non-members in catalog');
    }
    console.log('✅ Private room is invisible to non-members');

    // User B tries to join (should fail)
    const joinResB = await fetch(`${API_URL}/rooms/${privRoom._id}/join`, { method: 'POST', headers: headersB });
    if (joinResB.status !== 403) {
      throw new Error(`User B should be forbidden from joining private room directly, got ${joinResB.status}`);
    }
    console.log('✅ Direct join to private room correctly forbidden');

    // User A invites User B
    const inviteRes = await fetch(`${API_URL}/rooms/${privRoom._id}/invite`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ username: usernameB })
    });
    if (!inviteRes.ok) throw new Error(`Invitation failed: ${await inviteRes.text()}`);
    console.log(`- User A invited User B`);

    // User B checks catalog (should now see it)
    const catalogB2 = await fetch(`${API_URL}/rooms`, { headers: headersB });
    const catalogDataB2 = await catalogB2.json() as any[];
    if (!catalogDataB2.some(r => r.name === privateRoomName)) {
      throw new Error('Private room SHOULD be visible to member User B');
    }
    console.log('✅ Private room is now visible to invited member');

    console.log('\n8. Testing Leaving Rooms...');
    // User B leaves
    const leaveResB = await fetch(`${API_URL}/rooms/${privRoom._id}/leave`, { method: 'POST', headers: headersB });
    if (!leaveResB.ok) throw new Error(`User B failed to leave room: ${await leaveResB.text()}`);
    console.log('✅ User B left successfully');

    // User A (owner) tries to leave (should fail)
    const leaveResA = await fetch(`${API_URL}/rooms/${privRoom._id}/leave`, { method: 'POST', headers });
    if (leaveResA.status !== 400) {
      throw new Error(`Owner should be forbidden from leaving, got ${leaveResA.status}`);
    }
    console.log('✅ Owner correctly prevented from leaving');

    console.log('\n9. Testing Banning Logic...');
    // User A bans User B
    const banRes = await fetch(`${API_URL}/rooms/${privRoom._id}/ban`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ username: usernameB })
    });
    if (!banRes.ok) throw new Error(`Banning failed: ${await banRes.text()}`);
    console.log(`✅ User A banned User B`);

    // User B tries to join public room while banned
    // (We need a public room for this, let's use the one from test 3)
    const publicRoomId = room._id;
    await fetch(`${API_URL}/rooms/${publicRoomId}/ban`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ username: usernameB })
    });
    console.log(`- User B banned from public room ${room.name}`);

    const joinResB2 = await fetch(`${API_URL}/rooms/${publicRoomId}/join`, { method: 'POST', headers: headersB });
    if (joinResB2.status !== 403) {
      throw new Error(`Banned user should be forbidden from joining public room, got ${joinResB2.status}`);
    }
    console.log('✅ Banned user correctly blocked from joining public room');

    // User A tries to ban themselves (should fail)
    const banSelfRes = await fetch(`${API_URL}/rooms/${privRoom._id}/ban`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ username: username })
    });
    if (banSelfRes.status !== 400) {
      throw new Error(`Owner should not be able to ban themselves, got ${banSelfRes.status}`);
    }
    console.log('✅ Owner correctly prevented from banning themselves');

    console.log('\n10. Testing Room Deletion Cleanup...');
    // Connect to DB directly for verification
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect('mongodb://localhost:27017/chat');
    }

    // Create a room to delete
    const cleanupRoomRes = await fetch(`${API_URL}/rooms`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: `CleanupRoom ${ts}`, visibility: 'public' })
    });
    const cleanupRoom = await cleanupRoomRes.json() as any;
    const roomId = cleanupRoom._id;

    // Create dummy message and file
    await Message.create({
      room: roomId,
      sender: userId,
      content: 'Cleanup test message',
      type: 'text'
    });
    await File.create({
      room: roomId,
      uploader: userId,
      filename: 'test.txt',
      originalName: 'test.txt',
      path: '/tmp/test.txt',
      mimetype: 'text/plain',
      size: 100
    });
    console.log(`- Created dummy data for room ${roomId}`);

    // Delete the room
    await fetch(`${API_URL}/rooms/${roomId}`, { method: 'DELETE', headers });
    console.log(`- Deleted room ${roomId}`);

    // Verify cleanup
    const msgCount = await Message.countDocuments({ room: roomId });
    const fileCount = await File.countDocuments({ room: roomId });
    
    if (msgCount !== 0) throw new Error(`Messages not cleaned up! Found ${msgCount}`);
    if (fileCount !== 0) throw new Error(`Files not cleaned up! Found ${fileCount}`);
    
    console.log('✅ All messages and files correctly deleted with the room');

    console.log('\n11. Testing Administrative Roles and Permissions...');
    // Create User C (to be promoted to admin)
    const emailC = `userC-${ts}@example.com`, usernameC = `userC${ts}`, pwC = 'password123';
    await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailC, username: usernameC, password: pwC })
    });
    const loginResC = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailC, password: pwC })
    });
    const loginDataC = await loginResC.json() as any;
    const tokenC = loginDataC.token;
    const userC_Id = loginDataC.user.id;
    const headersC = { 'Authorization': `Bearer ${tokenC}`, 'Content-Type': 'application/json' };

    // User C joins the public room
    await fetch(`${API_URL}/rooms/${publicRoomId}/join`, { method: 'POST', headers: headersC });
    console.log('- User C joined public room');

    // Owner (User A) makes User C an admin
    const promoteRes = await fetch(`${API_URL}/rooms/${publicRoomId}/admins`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ username: usernameC })
    });
    if (!promoteRes.ok) throw new Error(`Promotion failed: ${await promoteRes.text()}`);
    console.log('✅ Owner promoted User C to admin');

    // Admin (User C) bans User B from this room (should work)
    const banRes2 = await fetch(`${API_URL}/rooms/${publicRoomId}/ban`, {
      method: 'POST',
      headers: headersC,
      body: JSON.stringify({ username: usernameB })
    });
    if (!banRes2.ok) throw new Error(`Admin failed to ban user: ${await banRes2.text()}`);
    console.log('✅ Admin (User C) successfully banned User B');

    // Admin (User C) tries to remove Owner (User A) from admins (should fail)
    const loginResA = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const userA_Id = (await loginResA.json() as any).user.id;

    const demoteOwnerRes = await fetch(`${API_URL}/rooms/${publicRoomId}/admins/${userA_Id}`, {
      method: 'DELETE',
      headers: headersC
    });
    if (demoteOwnerRes.status !== 403) {
      throw new Error(`Admin should be forbidden from demoting owner, got ${demoteOwnerRes.status}`);
    }
    console.log('✅ Admin correctly prevented from demoting owner');

    // Message Deletion Permissions
    const msg = await Message.create({
      room: publicRoomId,
      sender: userId, // User A (Owner)
      content: 'Hello from owner',
      type: 'text'
    });
    
    // Admin (User C) deletes Owner's message (should work)
    const delMsgRes = await fetch(`${API_URL}/rooms/${publicRoomId}/messages/${msg._id}`, {
      method: 'DELETE',
      headers: headersC
    });
    if (!delMsgRes.ok) throw new Error(`Admin failed to delete owner's message: ${await delMsgRes.text()}`);
    console.log('✅ Admin successfully deleted owner\'s message');

    console.log('\n12. Testing Removal as Ban and Access Control...');
    // Owner (User A) removes Admin (User C) - should ban them
    const removeRes = await fetch(`${API_URL}/rooms/${publicRoomId}/members/${userC_Id}`, {
      method: 'DELETE',
      headers
    });
    if (!removeRes.ok) throw new Error(`Failed to remove member: ${await removeRes.text()}`);
    console.log('✅ Owner removed and banned User C');

    // User C tries to join again (should fail)
    const rejoinResC = await fetch(`${API_URL}/rooms/${publicRoomId}/join`, { method: 'POST', headers: headersC });
    if (rejoinResC.status !== 403) {
      throw new Error(`Kicked user should be banned and unable to rejoin, got ${rejoinResC.status}`);
    }
    console.log('✅ Kicked user correctly blocked from re-joining (treated as ban)');

    // User C tries to list messages (should fail)
    const listMsgResC = await fetch(`${API_URL}/rooms/${publicRoomId}/messages`, { headers: headersC });
    if (listMsgResC.status !== 403) {
      throw new Error(`Banned user should be unable to list messages, got ${listMsgResC.status}`);
    }
    console.log('✅ Banned user correctly denied access to messages');

    console.log('\n🎉 ALL ROOM TESTS PASSED!');
    await mongoose.disconnect();
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

runTests();
