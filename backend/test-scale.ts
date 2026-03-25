import mongoose from 'mongoose';
import User from './src/models/User';
import Room from './src/models/Room';
import Message from './src/models/Message';
import LastRead from './src/models/LastRead';

const MONGODB_URI = 'mongodb://localhost:27017/chat';

async function testScale() {
  try {
    console.log('--- CAPACITY AND SCALE TESTS ---');
    await mongoose.connect(MONGODB_URI);

    const ts = Date.now();
    const USER_COUNT = 300;
    const TOTAL_USERS_NEEDED = 1000;

    console.log(`1. Ensuring ${TOTAL_USERS_NEEDED} users exist...`);
    const existingCount = await User.countDocuments();
    if (existingCount < TOTAL_USERS_NEEDED) {
      const needed = TOTAL_USERS_NEEDED - existingCount;
      const users = [];
      for (let i = 0; i < needed; i++) {
        users.push({
          email: `scale-${ts}-${i}@test.com`,
          username: `scaleuser-${ts}-${i}`,
          passwordHash: 'dummy'
        });
      }
      await User.insertMany(users);
      console.log(`   Created ${needed} new users.`);
    }

    const allUsers = await User.find().limit(TOTAL_USERS_NEEDED);
    const userIds = allUsers.map(u => u._id);

    console.log(`2. Creating a room with ${userIds.length} participants...`);
    const room = new Room({
      name: `ScaleRoom-${ts}`,
      owner: userIds[0],
      members: userIds,
      visibility: 'public'
    });
    await room.save();

    console.log('3. Sending a message to the large room...');
    const msg = new Message({
      room: room._id,
      sender: userIds[1],
      content: 'Scale test message',
      type: 'text'
    });
    await msg.save();

    console.log('4. Measuring listRooms performance with bulk unread counts...');
    const testUserId = userIds[0];

    const start = Date.now();
    // Simulate what listRooms does
    const rooms = await Room.find({ $or: [{ visibility: 'public' }, { members: testUserId }] })
      .populate('owner', 'username')
      .sort({ createdAt: -1 })
      .limit(50); // Typical page size

    const roomIds = rooms.map(r => r._id);
    const lastReads = await LastRead.find({ user: testUserId, room: { $in: roomIds } });
    const lastReadMap = new Map(lastReads.map(lr => [lr.room!.toString(), lr.lastReadAt]));

    const orConditions = rooms.map(r => ({
      room: r._id,
      createdAt: { $gt: lastReadMap.get(r._id.toString()) || new Date(0) },
      sender: { $ne: testUserId }
    }));

    const unreadCountMap = new Map<string, number>();
    if (orConditions.length > 0) {
      const counts = await Message.aggregate([
        { $match: { $or: orConditions, sender: { $ne: testUserId } } },
        { $group: { _id: "$room", count: { $sum: 1 } } }
      ]);
      counts.forEach(c => unreadCountMap.set(c._id.toString(), c.count));
    }

    const end = Date.now();
    console.log(`   Fetched ${rooms.length} rooms (one with 1000 members) in ${end - start}ms`);

    if (end - start > 500) {
      console.warn('⚠️ Performance is slower than expected (>500ms)');
    } else {
      console.log('✅ Performance is excellent!');
    }

    // Cleanup test room and message
    await Message.deleteOne({ _id: msg._id });
    await Room.deleteOne({ _id: room._id });

    console.log('\n🎉 SCALE TESTS COMPLETED!');
    await mongoose.disconnect();
  } catch (error) {
    console.error('Scale test failed:', error);
    process.exit(1);
  }
}

testScale();
