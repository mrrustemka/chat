import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './RightSidebar.css';

interface Room {
  _id: string;
  name: string;
  visibility: string;
  unreadCount?: number;
}

interface PersonalChat {
  _id: string;
  participants: { _id: string; username: string }[];
  unreadCount?: number;
}

interface Member {
  _id: string;
  username: string;
}

export const RightSidebar: React.FC = () => {
  const { user, socket } = useAuth();
  const location = useLocation();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [chats, setChats] = useState<PersonalChat[]>([]);
  const [roomMembers, setRoomMembers] = useState<Member[]>([]);
  const [presence, setPresence] = useState<Record<string, 'online' | 'afk' | 'offline'>>({});

  // Accordion states
  const inRoom = location.pathname.startsWith('/rooms/') && location.pathname.length > 7;
  const inPersonalChat = location.pathname.startsWith('/personal-chats/') && location.pathname.length > 16;

  // If in a room, default rooms accordion to closed. Otherwise open.
  const [roomsExpanded, setRoomsExpanded] = useState(!inRoom);
  const [contactsExpanded, setContactsExpanded] = useState(!inRoom && !inPersonalChat);
  const [membersExpanded, setMembersExpanded] = useState(inRoom);

  useEffect(() => {
    setRoomsExpanded(!inRoom);
    setContactsExpanded(!inRoom && !inPersonalChat);
    setMembersExpanded(inRoom);
  }, [inRoom, inPersonalChat]);

  // Fetch Rooms
  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const res = await api.get('/rooms');
        // Only show rooms we are a member of or public ones
        // Actually, just show all returned rooms since listRooms already filters
        setRooms(res.data);
      } catch (err) {
        console.error('Failed to fetch rooms', err);
      }
    };
    fetchRooms();
  }, [location.pathname]);

  // Fetch Contacts (Personal Chats)
  useEffect(() => {
    const fetchChats = async () => {
      try {
        const res = await api.get('/personal-chats');
        setChats(res.data);
      } catch (err) {
        console.error('Failed to fetch chats', err);
      }
    };
    fetchChats();
  }, [location.pathname]);

  // Fetch Room Members if in room
  useEffect(() => {
    const fetchMembers = async () => {
      if (inRoom) {
        try {
          const roomId = location.pathname.split('/')[2];
          const res = await api.get(`/rooms/${roomId}`);
          setRoomMembers(res.data.members);

          // Request presence for these members
          if (socket) {
            socket.emit('getPresence', res.data.members.map((m: any) => m._id));
          }
        } catch (err) {
          console.error('Failed to fetch room members', err);
        }
      } else {
        setRoomMembers([]);
      }
    };
    fetchMembers();
  }, [inRoom, location.pathname, socket]);

  // Socket listeners for presence & unread
  useEffect(() => {
    if (!socket) return;

    const handlePresence = (data: { userId: string, status: 'online' | 'afk' | 'offline' }) => {
      setPresence(prev => ({ ...prev, [data.userId]: data.status }));
    };

    const handlePresenceBatch = (data: Record<string, 'online' | 'afk' | 'offline'>) => {
      setPresence(prev => ({ ...prev, ...data }));
    };

    const handleMessage = (data: { room?: string, personalChat?: string, message: any }) => {
      // If we are currently in this room/chat, ignore (markAsRead will handle it)
      if (data.room && location.pathname === `/rooms/${data.room}`) return;
      if (data.personalChat && location.pathname === `/personal-chats/${data.personalChat}`) return;

      // Update unread count for the room/chat in state
      if (data.room) {
        setRooms(prev => prev.map(r => r._id === data.room ? { ...r, unreadCount: (r.unreadCount || 0) + 1 } : r));
      }
      if (data.personalChat) {
        setChats(prev => prev.map(c => c._id === data.personalChat ? { ...c, unreadCount: (c.unreadCount || 0) + 1 } : c));
      }
    };

    socket.on('presenceUpdate', handlePresence);
    socket.on('presenceBatch', handlePresenceBatch);
    socket.on('newMessage', handleMessage);

    return () => {
      socket.off('presenceUpdate', handlePresence);
      socket.off('presenceBatch', handlePresenceBatch);
      socket.off('newMessage', handleMessage);
    };
  }, [socket, location.pathname]);

  // Fetch presence for contacts
  useEffect(() => {
    if (!socket || chats.length === 0) return;
    const contactIds = chats.flatMap(c => c.participants.map(p => p._id)).filter(id => id !== user?.id);
    socket.emit('getPresence', contactIds);
  }, [chats, socket, user?.id]);

  const StatusDot = ({ status }: { status?: 'online' | 'afk' | 'offline' }) => {
    return (
      <span className={`status-dot status-dot-${status || 'offline'}`} title={status || 'offline'} />
    );
  };

  return (
    <div className="right-sidebar-root">

      {/* ROOM MEMBERS ACCORDION (Only visible if in a room) */}
      {inRoom && (
        <div className="right-sidebar-section">
          <div className="right-sidebar-header" onClick={() => setMembersExpanded(!membersExpanded)}>
            <span>Room Members ({roomMembers.length})</span>
            <span>{membersExpanded ? '▲' : '▼'}</span>
          </div>
          {membersExpanded && (
            <ul className="right-sidebar-list expanded">
              {roomMembers.map(member => (
                <li key={member._id} className="right-sidebar-member">
                  <StatusDot status={presence[member._id]} />
                  <span className="right-sidebar-member-name">{member.username} {member._id === user?.id && '(You)'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ROOMS ACCORDION */}
      <div className="right-sidebar-section">
        <div className="right-sidebar-header" onClick={() => setRoomsExpanded(!roomsExpanded)}>
          <span>Rooms ({rooms.length})</span>
          <span>{roomsExpanded ? '▲' : '▼'}</span>
        </div>
        {roomsExpanded && (
          <ul className="right-sidebar-list">
            {rooms.length === 0 ? (
              <li className="right-sidebar-empty">No rooms found. <Link to="/rooms">Manage</Link></li>
            ) : (
              rooms.map(room => (
                <li key={room._id}>
                  <Link to={`/rooms/${room._id}`} className={`right-sidebar-item ${location.pathname === `/rooms/${room._id}` ? 'active' : 'inactive'}`}>
                    <div className="right-sidebar-item-text">
                      <strong># {room.name}</strong>
                    </div>
                    {room.unreadCount ? (
                      <span className="right-sidebar-badge">
                        {room.unreadCount}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))
            )}
            <li className="right-sidebar-footer">
              <Link to="/rooms" className="right-sidebar-link">+ View All Rooms</Link>
            </li>
          </ul>
        )}
      </div>

      {/* CONTACTS ACCORDION */}
      <div>
        <div className="right-sidebar-header" onClick={() => setContactsExpanded(!contactsExpanded)}>
          <span>Contacts ({chats.length})</span>
          <span>{contactsExpanded ? '▲' : '▼'}</span>
        </div>
        {contactsExpanded && (
          <ul className="right-sidebar-list full">
            {chats.length === 0 ? (
              <li className="right-sidebar-empty">No contacts yet. <Link to="/friends">Find Friends</Link></li>
            ) : (
              chats.map(chat => {
                const other = chat.participants.find(p => p._id !== user?.id);
                if (!other) return null;
                return (
                  <li key={chat._id}>
                    <Link to={`/personal-chats/${chat._id}`} className={`right-sidebar-item ${location.pathname === `/personal-chats/${chat._id}` ? 'active' : 'inactive'}`}>
                      <StatusDot status={presence[other._id]} />
                      <div className="right-sidebar-item-text">
                        {other.username}
                      </div>
                      {chat.unreadCount ? (
                        <span className="right-sidebar-badge">
                          {chat.unreadCount}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })
            )}
            <li className="right-sidebar-footer">
              <Link to="/friends" className="right-sidebar-link">+ Manage Friends</Link>
            </li>
          </ul>
        )}
      </div>

    </div>
  );
};
