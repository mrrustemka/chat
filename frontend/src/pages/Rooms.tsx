import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

type RoomType = 'public' | 'private';

interface RoomOwner {
  _id: string;
  username: string;
}

interface Room {
  _id: string;
  name: string;
  description?: string;
  type: RoomType;
  owner: RoomOwner;
  members: string[];
  createdAt: string;
}

export const Rooms: React.FC = () => {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [nameInput, setNameInput] = useState('');
  const [descInput, setDescInput] = useState('');
  const [typeInput, setTypeInput] = useState<RoomType>('public');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const fetchRooms = useCallback(async () => {
    const res = await api.get('/rooms');
    setRooms(res.data);
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      await api.post('/rooms', { name: nameInput, description: descInput, type: typeInput });
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

  const isMember = (room: Room) => room.members.some(m => m === user?.id || (m as unknown as RoomOwner)?._id === user?.id);
  const isOwner = (room: Room) => room.owner._id === user?.id;

  return (
    <div style={{ maxWidth: 700, margin: '50px auto', padding: 20 }}>
      <h2>Chat Rooms</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {message && <p style={{ color: 'green' }}>{message}</p>}

      {/* Create Room */}
      <div style={{ marginBottom: 28, padding: 16, border: '1px solid #ccc', borderRadius: 6 }}>
        <h3 style={{ marginTop: 0 }}>Create a Room</h3>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            placeholder="Room name *"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            required
            style={{ padding: 8, borderRadius: 4, border: '1px solid #ccc' }}
          />
          <input
            placeholder="Description (optional)"
            value={descInput}
            onChange={e => setDescInput(e.target.value)}
            style={{ padding: 8, borderRadius: 4, border: '1px solid #ccc' }}
          />
          <select value={typeInput} onChange={e => setTypeInput(e.target.value as RoomType)} style={{ padding: 8, borderRadius: 4, border: '1px solid #ccc' }}>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
          <button type="submit" style={{ padding: '9px 0', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            Create Room
          </button>
        </form>
      </div>

      {/* Room List */}
      <div style={{ padding: 16, border: '1px solid #ccc', borderRadius: 6 }}>
        <h3 style={{ marginTop: 0 }}>Available Rooms ({rooms.length})</h3>
        {rooms.length === 0 ? (
          <p style={{ color: '#6b7280' }}>No rooms yet. Create one above!</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {rooms.map(room => (
              <li key={room._id} style={{ padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <strong>{room.name}</strong>
                    <span style={{ marginLeft: 8, fontSize: '0.78em', color: room.type === 'public' ? '#3b82f6' : '#8b5cf6', border: `1px solid ${room.type === 'public' ? '#3b82f6' : '#8b5cf6'}`, padding: '1px 6px', borderRadius: 10 }}>
                      {room.type}
                    </span>
                    {room.description && <p style={{ margin: '4px 0 2px', color: '#6b7280', fontSize: '0.9em' }}>{room.description}</p>}
                    <p style={{ margin: 0, fontSize: '0.8em', color: '#9ca3af' }}>
                      Owner: {room.owner.username} · {room.members.length} member{room.members.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 12 }}>
                    {!isMember(room) && room.type === 'public' && (
                      <button onClick={() => handleJoin(room._id)} style={{ padding: '5px 12px', background: '#22c55e', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Join</button>
                    )}
                    {isMember(room) && !isOwner(room) && (
                      <button onClick={() => handleLeave(room._id)} style={{ padding: '5px 12px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Leave</button>
                    )}
                    {isOwner(room) && (
                      <button onClick={() => handleDelete(room._id)} style={{ padding: '5px 12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Delete</button>
                    )}
                    {isMember(room) && (
                      <span style={{ padding: '5px 8px', color: '#6b7280', fontSize: '0.85em' }}>✓ Joined</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
