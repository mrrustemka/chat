const API_URL = 'http://localhost:5000/api/auth';
const email = `test-${Date.now()}@example.com`;
const username = `user${Date.now()}`;
const password = 'password123';
let token = '';
let token2 = ''; 

async function post(endpoint: string, data: any, authToken?: string) {
  const headers: any = { 'Content-Type': 'application/json' };
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
    } catch (err: any) {
      if (err.status === 401) {
        console.log('✅ Session 1 correctly denied access with 401');
      } else {
        console.error('❌ Unexpected error', err);
      }
    }

    console.log('\n8. Verifying Session Isolation (Session 2 should still be valid)...');
    const meRes2 = await get('/me', token2);
    console.log(`✅ Session 2 is still valid! User: ${meRes2.data.username}`);

    console.log('\n🎉 ALL TESTS PASSED!');
  } catch (error: any) {
    console.error('❌ Test failed:', error.data || error);
  }
}

runTests();
