import { Response } from 'express';
import mongoose from 'mongoose';
import Room from '../models/Room';
import User from '../models/User';
import Message from '../models/Message';
import File from '../models/File';
import { AuthRequest } from '../middleware/authMiddleware';

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
      .populate('members', 'username')
      .sort({ createdAt: -1 });

    res.json(rooms);
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
    await File.deleteMany({ room: req.params.id });

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
        user: new mongoose.Types.ObjectId(targetUserId),
        bannedBy: userId,
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

    await Message.findByIdAndDelete(messageId);
    res.json({ message: 'Message deleted' });
  } catch (error) {
    console.error('deleteMessage error:', error);
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

    const messages = await Message.find({ room: req.params.id }).populate('sender', 'username');
    res.json(messages);
  } catch (error) {
    console.error('listMessages error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
