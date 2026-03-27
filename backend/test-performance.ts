import axios from 'axios';
import io, { Socket } from 'socket.io-client';
import mongoose from 'mongoose';
import Message from './src/models/Message';
import Room from './src/models/Room';
import User from './src/models/User';

const API_URL = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';
const MONGODB_URI = 'mongodb://localhost:27017/chat';

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testPerformance() {
  try {
    console.log('--- PERFORMANCE AND LATENCY TESTS ---');
    await mongoose.connect(MONGODB_URI);

    const ts = Date.now();
    const userA = { email: `perf-a-${ts}@test.com`, username: `perfa-${ts}`, password: 'password123' };
    const userB = { email: `perf-b-${ts}@test.com`, username: `perfb-${ts}`, password: 'password123' };

    console.log('1. Creating test users...');
    await axios.post(`${API_URL}/auth/register`, userA);
    await axios.post(`${API_URL}/auth/register`, userB);

    const loginA = await axios.post(`${API_URL}/auth/login`, { email: userA.email, password: userA.password });
    const loginB = await axios.post(`${API_URL}/auth/login`, { email: userB.email, password: userB.password });
    const tokenA = loginA.data.token;
    const tokenB = loginB.data.token;
    const idA = loginA.data.user.id;
    const idB = loginB.data.user.id;

    console.log('2. Creating a test room...');
    const roomRes = await axios.post(`${API_URL}/rooms`, { name: `PerfRoom-${ts}`, visibility: 'public' }, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const roomId = roomRes.data._id;
    await axios.post(`${API_URL}/rooms/${roomId}/join`, {}, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });

    console.log('3. Connecting sockets and authenticating...');
    const socketA = io(SOCKET_URL);
    const socketB = io(SOCKET_URL);

    await new Promise<void>((resolve) => {
      let count = 0;
      const check = () => { if (++count === 2) resolve(); };
      socketA.on('connect', () => { socketA.emit('authenticate', tokenA); check(); });
      socketB.on('connect', () => { socketB.emit('authenticate', tokenB); check(); });
    });
    await delay(500); // Wait for auth to settle

    console.log('\n4. Measuring Message Delivery Latency...');
    return new Promise<void>(async (resolve, reject) => {
      const start = Date.now();
      
      socketB.once('newMessage', (data: any) => {
        const end = Date.now();
        const latency = end - start;
        console.log(`   Message received by User B. Latency: ${latency}ms`);
        if (latency < 3000) {
          console.log('   ✅ Requirement met (< 3s)');
        } else {
          console.warn('   ❌ Requirement NOT met (> 3s)');
        }
        testStatus();
      });

      try {
        await axios.post(`${API_URL}/rooms/${roomId}/messages`, { content: 'Performance test message', type: 'text' }, {
          headers: { Authorization: `Bearer ${tokenA}` }
        });
      } catch (err) {
        reject(err);
      }

      async function testStatus() {
        console.log('\n5. Measuring Status Propagation Latency...');
        const statusStart = Date.now();
        
        const onPresenceUpdate = (data: any) => {
          if (data.userId === idA && data.status === 'afk') {
            const statusEnd = Date.now();
            const statusLatency = statusEnd - statusStart;
            console.log(`   Status update (AFK) received by User B. Latency: ${statusLatency}ms`);
            if (statusLatency < 2000) {
              console.log('   ✅ Requirement met (< 2s)');
            } else {
              console.warn('   ❌ Requirement NOT met (> 2s)');
            }
            socketB.off('presenceUpdate', onPresenceUpdate);
            seedHistory();
          }
        };

        socketB.on('presenceUpdate', onPresenceUpdate);
        socketA.emit('afk');
      }


      async function seedHistory() {
        console.log(`\n6. Seeding 10,000 messages into room ${roomId}...`);
        console.log('   (This may take a minute using bulk insert)');
        
        const messages = [];
        const now = new Date();
        for (let i = 0; i < 10000; i++) {
          messages.push({
            room: roomId,
            sender: idA,
            content: `History message #${i}`,
            type: 'text',
            createdAt: new Date(now.getTime() - (10000 - i) * 1000) // Spread over time
          });
        }

        const startSeed = Date.now();
        await Message.insertMany(messages);
        const endSeed = Date.now();
        console.log(`   Successfully seeded 10k messages in ${endSeed - startSeed}ms`);
        
        console.log('\n🎉 PERFORMANCE TESTS AND SEEDING COMPLETED!');
        socketA.disconnect();
        socketB.disconnect();
        await mongoose.disconnect();
        resolve();
      }
    });

  } catch (error) {
    console.error('Performance test failed:', error);
    process.exit(1);
  }
}

testPerformance();
