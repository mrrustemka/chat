import axios from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';

const API_URL = 'http://localhost:5000/api';
const tmpDir = path.join(__dirname, 'tmp-test-files');

if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

async function createDummyFile(name: string, sizeMB: number) {
  const filePath = path.join(tmpDir, name);
  const buffer = Buffer.alloc(sizeMB * 1024 * 1024);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

async function testFileUploads() {
  try {
    console.log('--- FILE STORAGE AND SIZE LIMIT TESTS ---');
    
    // 1. Setup: Register/Login
    const ts = Date.now();
    const user = { email: `file-test-${ts}@test.com`, username: `fileuser${ts}`, password: 'password123' };
    await axios.post(`${API_URL}/auth/register`, user);
    const login = await axios.post(`${API_URL}/auth/login`, { email: user.email, password: user.password });
    const token = login.data.token;

    // 2. Create a room
    const roomRes = await axios.post(`${API_URL}/rooms`, { name: `FileRoom-${ts}` }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const roomId = roomRes.data._id;

    const uploadUrl = `${API_URL}/rooms/${roomId}/upload`;

    // Test Cases
    const cases = [
      { name: 'small-image.png', size: 0.1, isImage: true, expectedSuccess: true, msg: 'Small image (100KB) - Should PASS' },
      { name: 'large-image.png', size: 4, isImage: true, expectedSuccess: false, msg: 'Large image (4MB) - Should FAIL (Limit 3MB)' },
      { name: 'medium-file.txt', size: 15, isImage: false, expectedSuccess: true, msg: 'Medium file (15MB) - Should PASS (Limit 20MB)' },
      { name: 'huge-file.txt', size: 25, isImage: false, expectedSuccess: false, msg: 'Huge file (25MB) - Should FAIL (Limit 20MB)' }
    ];

    for (const c of cases) {
      console.log(`\nTesting: ${c.msg}`);
      const filePath = await createDummyFile(c.name, c.size);
      const form = new FormData();
      form.append('file', fs.createReadStream(filePath));

      try {
        const res = await axios.post(uploadUrl, form, {
          headers: { 
            ...form.getHeaders(),
            Authorization: `Bearer ${token}` 
          }
        });
        if (c.expectedSuccess) {
          console.log(`✅ SUCCESS: Uploaded ${c.name} (${c.size}MB)`);
        } else {
          console.error(`❌ FAILURE: ${c.name} should have been rejected!`);
        }
      } catch (err: any) {
        if (!c.expectedSuccess) {
          console.log(`✅ CORRECTLY REJECTED: ${err.response?.data?.message || err.message}`);
        } else {
          console.error(`❌ UNEXPECTED ERROR: Failed to upload ${c.name}`, err.response?.data || err.message);
        }
      }
    }

    console.log('\n--- CLEANUP ---');
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log('🎉 FILE STORAGE TESTS COMPLETED!');

  } catch (error) {
    console.error('File storage test failed:', error);
    process.exit(1);
  }
}

testFileUploads();
