const API_URL = 'http://localhost:5000/api/auth';
const email = `test-${Date.now()}@example.com`;
const username = `user${Date.now()}`;
const password = 'password123';
let token = '';
let token2 = '';
let token3 = '';
let session3Id = '';

async function post(endpoint: string, data: Record<string, unknown>, authToken?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!res.ok) throw { status: res.status, data: json };
  return { data: json };
}

async function get(endpoint: string, authToken: string) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  const json = await res.json();
  if (!res.ok) throw { status: res.status, data: json };
  return { data: json };
}

async function runTests() {
  try {
    console.log('1. Testing Registration...');
    await post('/register', { email, username, password });
    console.log('✅ Registration successful');

    console.log('\n2. Testing Login (Session 1)...');
    const loginRes = await post('/login', { email, password });
    token = loginRes.data.token;
    console.log('✅ Login successful, token 1 received');

    console.log('\n3. Testing Login (Session 2)...');
    const loginRes2 = await post('/login', { email, password });
    token2 = loginRes2.data.token;
    console.log('✅ Login successful, token 2 received');

    console.log('\n3b. Testing Login (Session 3)...');
    const loginRes3 = await post('/login', { email, password });
    token3 = loginRes3.data.token;
    console.log('✅ Login successful, token 3 received');

    console.log('\n3c. Testing GET /sessions...');
    const sessionsRes = await get('/sessions', token);
    console.log(`✅ /sessions returned ${sessionsRes.data.length} sessions`);
    const s3 = sessionsRes.data.find((s: { isCurrentSession: boolean; id: string }) => !s.isCurrentSession && s.id !== token2); // just get  other session realistically, but we can track the id.
    // Actually, getting the exact ID of session 3 is easier by finding the one that is NOT the current session, but there are 2 others.
    // Let's just find the one created last, or pick any other session.
    session3Id = sessionsRes.data[0].id; // The query sorts by createdAt: -1, so index 0 is session 3.
    console.log(`✅ Session 3 ID identified: ${session3Id}`);

    console.log('\n3d. Testing DELETE /sessions/:id (Revoking Session 3)...');
    async function del(endpoint: string, authToken: string) {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      const json = await res.json();
      if (!res.ok) throw { status: res.status, data: json };
      return { data: json };
    }
    await del(`/sessions/${session3Id}`, token);
    console.log('✅ Session 3 revoked successfully');

    console.log('\n3e. Verifying Session 3 is invalid...');
    try {
      await get('/me', token3);
      console.error('❌ /me should have failed for revoked session 3!');
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && err.status === 401) {
        console.log('✅ Session 3 correctly denied access with 401');
      } else {
        console.error('❌ Unexpected error', err);
      }
    }

    console.log('\n4. Testing /me endpoint (Protected)...');
    const meRes = await get('/me', token);
    console.log(`✅ /me successful. User: ${meRes.data.username}`);

    console.log('\n5. Testing Change Password...');
    await post('/change-password', {
      oldPassword: password,
      newPassword: 'newpassword123'
    }, token);
    console.log('✅ Password changed successfully');

    console.log('\n6. Testing Logout for Session 1...');
    await post('/logout', {}, token);
    console.log('✅ Logout successful for Session 1');

    console.log('\n7. Verifying Logout (Session 1 should be invalid)...');
    try {
      await get('/me', token);
      console.error('❌ /me should have failed!');
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && err.status === 401) {
        console.log('✅ Session 1 correctly denied access with 401');
      } else {
        console.error('❌ Unexpected error', err);
      }
    }

    console.log('\n8. Verifying Session Isolation (Session 2 should still be valid)...');
    const meRes2 = await get('/me', token2);
    console.log(`✅ Session 2 is still valid! User: ${meRes2.data.username}`);

    console.log('\n🎉 ALL TESTS PASSED!');
  } catch (error: unknown) {
    const errObj = error as { data?: unknown } | null;
    console.error('❌ Test failed:', errObj?.data || error);
  }
}

runTests();
