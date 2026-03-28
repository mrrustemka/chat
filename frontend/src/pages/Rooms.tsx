import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Rooms.css';

type RoomType = 'public' | 'private';

interface RoomOwner {
  _id: string;
  username: string;
}

interface RoomMember {
  _id: string;
  username: string;
}

interface Room {
  _id: string;
  name: string;
  description?: string;
  visibility: RoomType;
  owner: RoomOwner;
  admins: string[];
  members: (string | RoomMember)[];
  bannedUsers: string[];
  unreadCount?: number;
  createdAt: string;
}

export const Rooms: React.FC = () => {
  const { user, socket } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [nameInput, setNameInput] = useState('');
  const [descInput, setDescInput] = useState('');
  const [typeInput, setTypeInput] = useState<RoomType>('public');
  const [searchInput, setSearchInput] = useState('');
  const [inviteInputs, setInviteInputs] = useState<Record<string, string>>({});
  const [banInputs, setBanInputs] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const fetchRooms = useCallback(async (search = '') => {
    const res = await api.get(`/rooms${search ? `?search=${encodeURIComponent(search)}` : ''}`);
    setRooms(res.data);
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  useEffect(() => {
    if (!socket) return;
    const handleNewMessage = (data: any) => {
      if (data.room) {
        setRooms(prev => prev.map(r =>
          r._id === data.room ? { ...r, unreadCount: (r.unreadCount || 0) + 1 } : r
        ));
      }
    };
    socket.on('newMessage', handleNewMessage);
    return () => {
      socket.off('newMessage', handleNewMessage);
    };
  }, [socket]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      await api.post('/rooms', { name: nameInput, description: descInput, visibility: typeInput });
      setMessage(`Room "${nameInput}" created!`);
      setNameInput('');
      setDescInput('');
      setTypeInput('public');
      fetchRooms();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to create room');
    }
  };

  const handleJoin = async (id: string) => {
    try {
      await api.post(`/rooms/${id}/join`);
      fetchRooms();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to join room');
    }
  };

  const handleLeave = async (id: string) => {
    try {
      await api.post(`/rooms/${id}/leave`);
      fetchRooms();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to leave room');
    }
  };

  const handleBan = async (id: string) => {
    const username = banInputs[id];
    if (!username?.trim()) return;
    try {
      await api.post(`/rooms/${id}/ban`, { username: username.trim() });
      setMessage(`User ${username} banned!`);
      setBanInputs(prev => ({ ...prev, [id]: '' }));
      fetchRooms(searchInput);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to ban user');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this room?')) return;
    try {
      await api.delete(`/rooms/${id}`);
      fetchRooms();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to delete room');
    }
  };

  const handleInvite = async (id: string) => {
    const username = inviteInputs[id];
    if (!username?.trim()) return;
    try {
      await api.post(`/rooms/${id}/invite`, { username: username.trim() });
      setMessage(`Invited ${username} to room!`);
      setInviteInputs(prev => ({ ...prev, [id]: '' }));
      fetchRooms(searchInput);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to invite user');
    }
  };

  const isMember = (room: Room) => room.members.some(m => m === user?.id || (m as unknown as RoomOwner)?._id === user?.id);
  const isOwner = (room: Room) => room.owner._id === user?.id;

  return (
    <div className="rooms-container">
      <div className="rooms-content">
        <h2>Chat Rooms</h2>
        {error && <p className="auth-error">{error}</p>}
        {message && <p className="auth-success">{message}</p>}

        {/* Create Room */}
        <div className="rooms-card">
          <h3 className="rooms-card-header">Create a Room</h3>
          <form onSubmit={handleCreate} className="rooms-form">
            <input
              placeholder="Room name *"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              required
              className="rooms-input"
            />
            <input
              placeholder="Description (optional)"
              value={descInput}
              onChange={e => setDescInput(e.target.value)}
              className="rooms-input"
            />
            <select value={typeInput} onChange={e => setTypeInput(e.target.value as RoomType)} className="rooms-input">
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
            <button type="submit" className="rooms-btn-primary">
              Create Room
            </button>
          </form>
        </div>

        {/* Room Lists */}
        <div className="rooms-layout-col">
          {/* My Rooms */}
          <div className="rooms-list-card">
            <h3 className="rooms-card-header">My Rooms ({rooms.filter(isMember).length})</h3>
            {rooms.filter(isMember).length === 0 ? (
              <p className="rooms-empty-text">You haven't joined any rooms yet.</p>
            ) : (
              <ul className="rooms-list">
                {rooms.filter(isMember).map(room => (
                  <li key={room._id} className="rooms-list-item">
                    <div className="rooms-item-row">
                      <div>
                        <Link to={`/rooms/${room._id}`} className="rooms-item-title">
                          <strong>{room.name}</strong>
                        </Link>
                        <span className={`rooms-visibility-badge rooms-visibility-${room.visibility}`}>
                          {room.visibility}
                        </span>
                        {room.unreadCount !== undefined && room.unreadCount > 0 && (
                          <span className="rooms-unread-badge">
                            {room.unreadCount} unread
                          </span>
                        )}
                        {room.description && <p className="rooms-item-desc">{room.description}</p>}
                        <p className="rooms-item-meta">
                          Owner: {room.owner.username} · {room.members.length} member{room.members.length !== 1 ? 's' : ''}
                        </p>

                        {/* Invite section if owner/admin */}
                        {(isOwner(room) || room.admins.includes(user?.id || '')) && (
                          <div className="rooms-action-input-row">
                            <input
                              placeholder="Invite username"
                              value={inviteInputs[room._id] || ''}
                              onChange={e => setInviteInputs(prev => ({ ...prev, [room._id]: e.target.value }))}
                              className="rooms-action-input"
                            />
                            <button onClick={() => handleInvite(room._id)} className="rooms-btn-invite">
                              Invite
                            </button>
                          </div>
                        )}

                        {/* Ban section if owner/admin */}
                        {(isOwner(room) || room.admins.includes(user?.id || '')) && (
                          <div className="rooms-action-input-row-sm">
                            <input
                              placeholder="Ban username"
                              value={banInputs[room._id] || ''}
                              onChange={e => setBanInputs(prev => ({ ...prev, [room._id]: e.target.value }))}
                              className="rooms-action-input"
                            />
                            <button onClick={() => handleBan(room._id)} className="rooms-btn-ban">
                              Ban
                            </button>
                          </div>
                        )}

                        {/* Banned Users list (if any) */}
                        {(isOwner(room) || room.admins.includes(user?.id || '')) && room.bannedUsers.length > 0 && (
                          <div className="rooms-banned-text">
                            <strong>Banned:</strong> {room.bannedUsers.length} user(s).
                            {/* Note: username lookup for bannedUsers would require population or another call, 
                              for now just showing count or placeholder. Simple unban would need the username. */}
                          </div>
                        )}
                      </div>
                      <div className="rooms-item-actions">
                        {isOwner(room) ? (
                          <button onClick={() => handleDelete(room._id)} className="rooms-btn-delete">Delete</button>
                        ) : (
                          <button onClick={() => handleLeave(room._id)} className="rooms-btn-leave">Leave</button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Public Catalog */}
          <div className="rooms-list-card">
            <div className="rooms-search-row">
              <h3 className="rooms-search-header">Public Catalog ({rooms.filter(r => !isMember(r) && r.visibility === 'public').length})</h3>
              <input
                placeholder="Search public rooms..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="rooms-search-input"
              />
            </div>
            {rooms.filter(r => !isMember(r) && r.visibility === 'public').length === 0 ? (
              <p className="rooms-empty-text">No other public rooms found.</p>
            ) : (
              <ul className="rooms-list">
                {rooms.filter(r => !isMember(r) && r.visibility === 'public').map(room => (
                  <li key={room._id} className="rooms-list-item">
                    <div className="rooms-item-row">
                      <div>
                        <Link to={`/rooms/${room._id}`} className="rooms-item-title">
                          <strong>{room.name}</strong>
                        </Link>
                        <span className="rooms-visibility-badge rooms-visibility-public">
                          public
                        </span>
                        {room.description && <p className="rooms-item-desc">{room.description}</p>}
                        <p className="rooms-item-meta">
                          Owner: {room.owner.username} · {room.members.length} member{room.members.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="rooms-item-actions">
                        <button onClick={() => handleJoin(room._id)} className="rooms-btn-join">Join</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
