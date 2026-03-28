import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

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

    socket.on('presenceUpdate', handlePresence);
    socket.on('presenceBatch', handlePresenceBatch);

    return () => {
      socket.off('presenceUpdate', handlePresence);
      socket.off('presenceBatch', handlePresenceBatch);
    };
  }, [socket]);

  // Fetch presence for contacts
  useEffect(() => {
    if (!socket || chats.length === 0) return;
    const contactIds = chats.flatMap(c => c.participants.map(p => p._id)).filter(id => id !== user?.id);
    socket.emit('getPresence', contactIds);
  }, [chats, socket, user?.id]);

  const StatusDot = ({ status }: { status?: 'online' | 'afk' | 'offline' }) => {
    const color = status === 'online' ? '#31a24c' : status === 'afk' ? '#f59e0b' : '#bcc0c4';
    return (
      <span style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        backgroundColor: color,
        marginRight: 8,
        flexShrink: 0
      }} title={status || 'offline'} />
    );
  };

  const accordionHeaderStyle: React.CSSProperties = {
    padding: '12px 16px',
    background: '#f7f8fa',
    borderBottom: '1px solid #ddd',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontWeight: 600,
    color: '#1c1e21',
    userSelect: 'none'
  };

  const listStyle: React.CSSProperties = {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    maxHeight: 250,
    overflowY: 'auto'
  };

  const listItemStyle: React.CSSProperties = {
    padding: '10px 16px',
    borderBottom: '1px solid #f0f2f5',
    display: 'flex',
    alignItems: 'center',
    textDecoration: 'none',
    color: '#050505'
  };

  return (
    <div style={{ width: 300, background: 'white', borderLeft: '1px solid #ddd', display: 'flex', flexDirection: 'column' }}>

      {/* ROOM MEMBERS ACCORDION (Only visible if in a room) */}
      {inRoom && (
        <div style={{ borderBottom: '1px solid #ddd' }}>
          <div style={accordionHeaderStyle} onClick={() => setMembersExpanded(!membersExpanded)}>
            <span>Room Members ({roomMembers.length})</span>
            <span>{membersExpanded ? '▲' : '▼'}</span>
          </div>
          {membersExpanded && (
            <ul style={{ ...listStyle, maxHeight: 350 }}>
              {roomMembers.map(member => (
                <li key={member._id} style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', borderBottom: '1px solid #f0f2f5' }}>
                  <StatusDot status={presence[member._id]} />
                  <span style={{ fontWeight: 500 }}>{member.username} {member._id === user?.id && '(You)'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ROOMS ACCORDION */}
      <div style={{ borderBottom: '1px solid #ddd' }}>
        <div style={accordionHeaderStyle} onClick={() => setRoomsExpanded(!roomsExpanded)}>
          <span>Rooms ({rooms.length})</span>
          <span>{roomsExpanded ? '▲' : '▼'}</span>
        </div>
        {roomsExpanded && (
          <ul style={listStyle}>
            {rooms.length === 0 ? (
              <li style={{ padding: 16, color: '#65676b', fontSize: '0.9rem' }}>No rooms found. <Link to="/rooms">Manage</Link></li>
            ) : (
              rooms.map(room => (
                <li key={room._id}>
                  <Link to={`/rooms/${room._id}`} style={{ ...listItemStyle, background: location.pathname === `/rooms/${room._id}` ? '#e7f3ff' : 'transparent' }}>
                    <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <strong># {room.name}</strong>
                    </div>
                    {room.unreadCount ? (
                      <span style={{ background: '#f02849', color: 'white', fontSize: '0.75rem', padding: '2px 6px', borderRadius: 10, fontWeight: 'bold' }}>
                        {room.unreadCount}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))
            )}
            <li style={{ padding: 8, textAlign: 'center', borderTop: '1px solid #f0f2f5' }}>
              <Link to="/rooms" style={{ fontSize: '0.85rem', color: '#1877f2', textDecoration: 'none' }}>+ View All Rooms</Link>
            </li>
          </ul>
        )}
      </div>

      {/* CONTACTS ACCORDION */}
      <div>
        <div style={accordionHeaderStyle} onClick={() => setContactsExpanded(!contactsExpanded)}>
          <span>Contacts ({chats.length})</span>
          <span>{contactsExpanded ? '▲' : '▼'}</span>
        </div>
        {contactsExpanded && (
          <ul style={{ ...listStyle, flex: 1, maxHeight: 'none' }}>
            {chats.length === 0 ? (
              <li style={{ padding: 16, color: '#65676b', fontSize: '0.9rem' }}>No contacts yet. <Link to="/friends">Find Friends</Link></li>
            ) : (
              chats.map(chat => {
                const other = chat.participants.find(p => p._id !== user?.id);
                if (!other) return null;
                return (
                  <li key={chat._id}>
                    <Link to={`/personal-chats/${chat._id}`} style={{ ...listItemStyle, background: location.pathname === `/personal-chats/${chat._id}` ? '#e7f3ff' : 'transparent' }}>
                      <StatusDot status={presence[other._id]} />
                      <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {other.username}
                      </div>
                      {chat.unreadCount ? (
                        <span style={{ background: '#f02849', color: 'white', fontSize: '0.75rem', padding: '2px 6px', borderRadius: 10, fontWeight: 'bold' }}>
                          {chat.unreadCount}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })
            )}
            <li style={{ padding: 8, textAlign: 'center', borderTop: '1px solid #f0f2f5' }}>
              <Link to="/friends" style={{ fontSize: '0.85rem', color: '#1877f2', textDecoration: 'none' }}>+ Manage Friends</Link>
            </li>
          </ul>
        )}
      </div>

    </div>
  );
};
