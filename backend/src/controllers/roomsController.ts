import { Response } from 'express';
import mongoose from 'mongoose';
import fs from 'fs';
import Room from '../models/Room';
import User from '../models/User';
import Message from '../models/Message';
import FileModel from '../models/File';
import LastRead from '../models/LastRead';
import { AuthRequest } from '../middleware/authMiddleware';
import { emitToUsers } from '../socketManager';

// POST /rooms  { name, description?, type? }
export const createRoom = async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, visibility } = req.body;
    const userId = req.user!._id;

    if (!name?.trim()) return res.status(400).json({ message: 'Room name is required' });

    const existing = await Room.findOne({ name: name.trim() });
    if (existing) return res.status(409).json({ message: 'A room with that name already exists' });

    const room = new Room({
      name: name.trim(),
      description: description?.trim(),
      visibility: visibility === 'private' ? 'private' : 'public',
      owner: userId,
      members: [userId],
      admins: [userId],
      bannedUsers: []
    });
    await room.save();

    res.status(201).json(room);
  } catch (error) {
    console.error('createRoom error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /rooms  — list all public rooms + private rooms the user is a member of
export const listRooms = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const { search } = req.query;
    
    let query: any = {
      $or: [{ visibility: 'public' }, { members: userId }]
    };

    if (search) {
      const searchRegex = new RegExp(search.toString(), 'i');
      query = {
        $and: [
          query,
          { $or: [{ name: searchRegex }, { description: searchRegex }] }
        ]
      };
    }

    const rooms = await Room.find(query)
      .populate('owner', 'username')
      .sort({ createdAt: -1 });

    const roomIds = rooms.map(r => r._id);
    const lastReads = await LastRead.find({ user: userId, room: { $in: roomIds } });
    const lastReadMap = new Map(lastReads.map(lr => [lr.room!.toString(), lr.lastReadAt]));

    const orConditions = rooms.map(r => ({
      room: r._id,
      createdAt: { $gt: lastReadMap.get(r._id.toString()) || new Date(0) },
      sender: { $ne: userId }
    })).filter(cond => cond.room); // Ensure room is present

    const unreadCountMap = new Map<string, number>();
    if (orConditions.length > 0) {
      const counts = await Message.aggregate([
        { $match: { $or: orConditions, sender: { $ne: userId } } },
        { $group: { _id: "$room", count: { $sum: 1 } } }
      ]);
      counts.forEach(c => unreadCountMap.set(c._id.toString(), c.count));
    }

    const roomsWithUnread = rooms.map(room => {
      const roomIdStr = room._id.toString();
      return {
        ...room.toObject(),
        unreadCount: unreadCountMap.get(roomIdStr) || 0
      };
    });

    res.json(roomsWithUnread);
  } catch (error) {
    console.error('listRooms error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /rooms/:id
export const getRoom = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const room = await Room.findById(req.params.id).populate('owner', 'username').populate('members', 'username');

    if (!room) return res.status(404).json({ message: 'Room not found' });

    // Private rooms only accessible to members
    if (room.visibility === 'private' && !room.members.some(m => m._id.toString() === userId.toString())) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(room);
  } catch (error) {
    console.error('getRoom error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /rooms/:id  — only the owner can delete
export const deleteRoom = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const room = await Room.findById(req.params.id);

    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (room.owner.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Only the room owner can delete it' });
    }

    // Delete associated messages and files
    await Message.deleteMany({ room: req.params.id });
    await FileModel.deleteMany({ room: req.params.id });

    await Room.findByIdAndDelete(req.params.id);
    res.json({ message: 'Room deleted and all associated data cleared' });
  } catch (error) {
    console.error('deleteRoom error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /rooms/:id/join
export const joinRoom = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const room = await Room.findById(req.params.id);

    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (room.visibility === 'private' && !room.members.some(m => m.toString() === userId.toString())) {
      return res.status(403).json({ message: 'Cannot join a private room directly' });
    }
    if (room.members.some(m => m.toString() === userId.toString())) {
      return res.status(400).json({ message: 'Already a member' });
    }
    if (room.bannedUsers.some(b => b.user.toString() === userId.toString())) {
      return res.status(403).json({ message: 'You are banned from this room' });
    }

    room.members.push(userId);
    await room.save();
    res.json({ message: 'Joined room successfully' });
  } catch (error) {
    console.error('joinRoom error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /rooms/:id/leave
export const leaveRoom = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const room = await Room.findById(req.params.id);

    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (room.owner.toString() === userId.toString()) {
      return res.status(400).json({ message: 'Owner cannot leave. Delete the room instead.' });
    }

    room.members = room.members.filter(m => m.toString() !== userId.toString());
    await room.save();
    res.json({ message: 'Left room successfully' });
  } catch (error) {
    console.error('leaveRoom error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /rooms/:id/invite  { username }
export const inviteToRoom = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const { username } = req.body;
    const room = await Room.findById(req.params.id);

    if (!room) return res.status(404).json({ message: 'Room not found' });
    
    // Only owner or admins can invite
    const isOwner = room.owner.toString() === userId.toString();
    const isAdmin = room.admins.some(adminId => adminId.toString() === userId.toString());
    
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Only room owner or admins can invite users' });
    }

    const userToInvite = await User.findOne({ username: username.trim() });
    if (!userToInvite) return res.status(404).json({ message: 'User not found' });

    if (room.members.some(m => m.toString() === userToInvite._id.toString())) {
      return res.status(400).json({ message: 'User is already a member' });
    }

    room.members.push(userToInvite._id as any);
    await room.save();

    res.json({ message: `User ${username} invited and added successfully` });
  } catch (error) {
    console.error('inviteToRoom error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /rooms/:id/ban  { username }
export const banUser = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const { username } = req.body;
    const room = await Room.findById(req.params.id);

    if (!room) return res.status(404).json({ message: 'Room not found' });

    // Only owner or admins can ban
    const isOwner = room.owner.toString() === userId.toString();
    const isAdmin = room.admins.some(adminId => adminId.toString() === userId.toString());
    
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Only room owner or admins can ban users' });
    }

    const userToBan = await User.findOne({ username: username.trim() });
    if (!userToBan) return res.status(404).json({ message: 'User not found' });

    // Owner cannot be banned
    if (room.owner.toString() === userToBan._id.toString()) {
      return res.status(400).json({ message: 'The room owner cannot be banned' });
    }

    // Remove from members and admins
    room.members = room.members.filter(m => m.toString() !== userToBan._id.toString());
    room.admins = room.admins.filter(a => a.toString() !== userToBan._id.toString());
    
    // Add to banned list
    if (!room.bannedUsers.some(b => b.user.toString() === userToBan._id.toString())) {
      room.bannedUsers.push({
        user: userToBan._id as any,
        bannedBy: userId,
        bannedAt: new Date()
      });
    }

    await room.save();
    res.json({ message: `User ${username} banned successfully` });
  } catch (error) {
    console.error('banUser error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /rooms/:id/unban  { username }
export const unbanUser = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const { username } = req.body;
    const room = await Room.findById(req.params.id);

    if (!room) return res.status(404).json({ message: 'Room not found' });

    // Only owner or admins can unban
    const isOwner = room.owner.toString() === userId.toString();
    const isAdmin = room.admins.some(adminId => adminId.toString() === userId.toString());
    
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Only room owner or admins can unban users' });
    }

    const userToUnban = await User.findOne({ username: username.trim() });
    if (!userToUnban) return res.status(404).json({ message: 'User not found' });

    room.bannedUsers = room.bannedUsers.filter(b => b.user.toString() !== userToUnban._id.toString());
    await room.save();

    res.json({ message: `User ${username} unbanned successfully` });
  } catch (error) {
    console.error('unbanUser error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const removeMember = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const targetUserId = req.params.userId;
    const room = await Room.findById(req.params.id);

    if (!room) return res.status(404).json({ message: 'Room not found' });

    const isOwner = room.owner.toString() === userId.toString();
    const isAdmin = room.admins.some(a => a.toString() === userId.toString());

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Only admins can remove members' });
    }

    if (room.owner.toString() === targetUserId) {
      return res.status(400).json({ message: 'Cannot remove the room owner' });
    }

    room.members = room.members.filter(m => m.toString() !== targetUserId);
    room.admins = room.admins.filter(a => a.toString() !== targetUserId);
    
    // Treat removal as a ban
    if (!room.bannedUsers.some(b => b.user.toString() === targetUserId)) {
      room.bannedUsers.push({
        user: new mongoose.Types.ObjectId(targetUserId as string),
        bannedBy: userId as any,
        bannedAt: new Date()
      });
    }

    await room.save();
    res.json({ message: 'Member removed and banned from room' });
  } catch (error) {
    console.error('removeMember error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const addAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const { username } = req.body;
    const room = await Room.findById(req.params.id);

    if (!room) return res.status(404).json({ message: 'Room not found' });

    if (room.owner.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Only the owner can add admins' });
    }

    const userToPromote = await User.findOne({ username: username.trim() });
    if (!userToPromote) return res.status(404).json({ message: 'User not found' });

    if (!room.members.some(m => m.toString() === userToPromote._id.toString())) {
      return res.status(400).json({ message: 'User must be a member first' });
    }

    if (!room.admins.some(a => a.toString() === userToPromote._id.toString())) {
      room.admins.push(userToPromote._id as any);
      await room.save();
    }

    res.json({ message: `User ${username} is now an admin` });
  } catch (error) {
    console.error('addAdmin error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const removeAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const targetAdminId = req.params.adminId;
    const room = await Room.findById(req.params.id);

    if (!room) return res.status(404).json({ message: 'Room not found' });

    if (room.owner.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Only the owner can remove admins' });
    }

    if (room.owner.toString() === targetAdminId) {
      return res.status(400).json({ message: 'Cannot remove admin status from the owner' });
    }

    room.admins = room.admins.filter(a => a.toString() !== targetAdminId);
    await room.save();

    res.json({ message: 'Admin status removed' });
  } catch (error) {
    console.error('removeAdmin error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteMessage = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const { id: roomId, messageId } = req.params;
    
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    const isOwner = room.owner.toString() === userId.toString();
    const isAdmin = room.admins.some(a => a.toString() === userId.toString());
    const isSender = message.sender.toString() === userId.toString();

    if (!isOwner && !isAdmin && !isSender) {
      return res.status(403).json({ message: 'Not authorized to delete this message' });
    }

    message.isDeleted = true;
    message.content = '[This message was deleted]';
    await message.save();
    
    res.json({ message: 'Message deleted' });
  } catch (error) {
    console.error('deleteMessage error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// PATCH /rooms/:id/messages/:messageId
export const editMessage = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const { id: roomId, messageId } = req.params;
    const { content } = req.body;

    if (!content) return res.status(400).json({ message: 'Content is required' });
    
    // Max 3 KB
    if (Buffer.byteLength(content, 'utf8') > 3072) {
      return res.status(400).json({ message: 'Message exceeds 3 KB size limit' });
    }

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    if (message.sender.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Only the sender can edit this message' });
    }

    if (message.isDeleted) {
      return res.status(400).json({ message: 'Cannot edit a deleted message' });
    }

    message.content = content;
    message.isEdited = true;
    await message.save();

    res.json(message);
  } catch (error) {
    console.error('editMessage error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /rooms/:id/messages
export const listMessages = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const isMember = room.members.some(m => m.toString() === userId.toString());
    const isBanned = room.bannedUsers.some(b => b.user.toString() === userId.toString());

    // Permission check
    if (room.visibility === 'private' && !isMember) {
      return res.status(403).json({ message: 'Access denied to private room' });
    }
    if (isBanned) {
      return res.status(403).json({ message: 'You are banned from this room' });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const before = req.query.before as string;

    const query: any = { room: req.params.id };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('sender', 'username')
      .populate({
        path: 'replyTo',
        populate: { path: 'sender', select: 'username' }
      });

    res.json(messages);
  } catch (error) {
    console.error('listMessages error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /rooms/:id/messages
export const sendMessage = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const { id: roomId } = req.params;
    const { content, type, replyTo } = req.body;

    if (!content) return res.status(400).json({ message: 'Content is required' });

    // Max 3 KB (approx 3072 characters)
    if (Buffer.byteLength(content, 'utf8') > 3072) {
      return res.status(400).json({ message: 'Message exceeds 3 KB size limit' });
    }

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const isMember = room.members.some(m => m.toString() === userId.toString());
    const isBanned = room.bannedUsers.some(b => b.user.toString() === userId.toString());

    if (room.visibility === 'private' && !isMember) {
      return res.status(403).json({ message: 'Join the room first' });
    }
    if (isBanned) {
      return res.status(403).json({ message: 'You are banned from this room' });
    }

    const message = new Message({
      room: roomId,
      sender: userId,
      content,
      type: type || 'text',
      replyTo: replyTo || undefined
    });

    await message.save();
    const populatedMessage = await message.populate('sender', 'username');
    
    // Emit to all members
    emitToUsers(room.members.map(m => m.toString()), 'newMessage', {
      room: roomId,
      message: populatedMessage
    });

    res.status(201).json(populatedMessage);
  } catch (error) {
    console.error('sendMessage error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /rooms/:id/upload
export const uploadFile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const { id: roomId } = req.params;
    const { comment } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ message: 'No file uploaded' });

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const isMember = room.members.some(m => m.toString() === userId.toString());
    const isBanned = room.bannedUsers.some(b => b.user.toString() === userId.toString());

    if (room.visibility === 'private' && !isMember) {
      return res.status(403).json({ message: 'Join the room first' });
    }
    if (isBanned) {
      return res.status(403).json({ message: 'You are banned from this room' });
    }

    const isImage = file.mimetype.startsWith('image/');
    
    // Image size limit: 3 MB
    if (isImage && file.size > 3 * 1024 * 1024) {
      fs.unlinkSync(file.path);
      return res.status(400).json({ message: 'Image exceeds 3 MB size limit' });
    }
    
    // 1. Create File record
    const fileDoc = new FileModel({
      originalName: file.originalname,
      filename: file.filename,
      path: file.path,
      room: roomId as any,
      uploader: userId as any,
      size: file.size,
      mimetype: file.mimetype
    });
    await fileDoc.save();

    // 2. Create Message record
    const message = new Message({
      room: roomId,
      sender: userId,
      content: comment || file.originalname,
      type: isImage ? 'image' : 'file',
      file: fileDoc._id
    });
    await message.save();
    const populatedMessage = await message.populate('sender', 'username');

    // Emit to all members
    emitToUsers(room.members.map(m => m.toString()), 'newMessage', {
      room: roomId,
      message: populatedMessage
    });

    res.status(201).json({ message: populatedMessage, file: fileDoc });
  } catch (error) {
    console.error('uploadFile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const markAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const { id: roomId } = req.params;

    await LastRead.findOneAndUpdate(
      { user: userId, room: roomId },
      { lastReadAt: new Date() },
      { upsert: true, new: true }
    );

    res.json({ message: 'Marked as read' });
  } catch (error) {
    console.error('markAsRead error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
