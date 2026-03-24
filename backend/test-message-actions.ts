import mongoose from 'mongoose';

async function runTests() {
  const API_URL = 'http://localhost:5000/api';
  try {
    const ts = Date.now();
    const email = `test-msg-${ts}@example.com`;
    const username = `userMsg${ts}`;
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

    console.log('\n3. Creating a room...');
    const roomRes = await fetch(`${API_URL}/rooms`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: `Room ${ts}`, visibility: 'public' })
    });
    const room = await roomRes.json() as any;
    const roomId = room._id;

    console.log('\n4. Sending a message...');
    const msgRes = await fetch(`${API_URL}/rooms/${roomId}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: 'Original Message' })
    });
    const originalMsg = await msgRes.json() as any;
    console.log('✅ Message sent:', originalMsg.content);

    console.log('\n5. Editing the message...');
    const editRes = await fetch(`${API_URL}/rooms/${roomId}/messages/${originalMsg._id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ content: 'Edited Message' })
    });
    const editedMsg = await editRes.json() as any;
    if (editedMsg.content !== 'Edited Message' || !editedMsg.isEdited) {
      throw new Error(`Edit failed. Content: ${editedMsg.content}, isEdited: ${editedMsg.isEdited}`);
    }
    console.log('✅ Message edited:', editedMsg.content, '(isEdited:', editedMsg.isEdited, ')');

    console.log('\n6. Replying to the edited message...');
    const replyRes = await fetch(`${API_URL}/rooms/${roomId}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: 'I am a reply', replyTo: originalMsg._id })
    });
    const replyMsg = await replyRes.json() as any;
    console.log('✅ Reply sent');

    console.log('\n7. Verifying message list population...');
    const listRes = await fetch(`${API_URL}/rooms/${roomId}/messages`, { headers });
    const messages = await listRes.json() as any[];
    const replyInList = messages.find(m => m._id === replyMsg._id);
    if (!replyInList?.replyTo || replyInList.replyTo.content !== 'Edited Message') {
      throw new Error('Reply population failed or showed wrong content');
    }
    if (!replyInList.replyTo.sender?.username) {
      throw new Error('Reply sender population failed');
    }
    console.log('✅ Reply population verified (Replying to:', replyInList.replyTo.sender.username, ')');

    console.log('\n8. Deleting the message (soft delete)...');
    const delRes = await fetch(`${API_URL}/rooms/${roomId}/messages/${originalMsg._id}`, {
      method: 'DELETE',
      headers
    });
    if (!delRes.ok) throw new Error(`Delete failed: ${await delRes.text()}`);

    console.log('\n9. Verifying soft delete in list...');
    const listRes2 = await fetch(`${API_URL}/rooms/${roomId}/messages`, { headers });
    const messages2 = await listRes2.json() as any[];
    const deletedInList = messages2.find(m => m._id === originalMsg._id);
    if (!deletedInList?.isDeleted || !deletedInList.content.includes('deleted')) {
      throw new Error('Soft delete failed in list');
    }
    console.log('✅ Soft delete verified:', deletedInList.content);

    console.log('\n🎉 ALL MESSAGE ACTION TESTS PASSED!');
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

runTests();
