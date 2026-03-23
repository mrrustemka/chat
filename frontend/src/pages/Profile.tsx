import React, { useState, useEffect } from 'react';
import { UAParser } from 'ua-parser-js';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

interface SessionData {
  id: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  expiresAt: string;
  isCurrentSession: boolean;
}

export const Profile: React.FC = () => {
  const { user, logout } = useAuth();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [sessions, setSessions] = useState<SessionData[]>([]);

  const fetchSessions = async () => {
    try {
      const res = await api.get('/auth/sessions');
      setSessions(res.data);
    } catch (err) {
      console.error('Failed to fetch sessions', err);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleLogoutSession = async (id: string, isCurrent: boolean) => {
    try {
      await api.delete(`/auth/sessions/${id}`);
      if (isCurrent) {
        logout();
      } else {
        fetchSessions();
      }
    } catch (err) {
      console.error('Failed to log out session', err);
    }
  };

  const getDeviceName = (uaString: string) => {
    if (!uaString) return 'Unknown Device';
    const parser = new UAParser(uaString);
    const result = parser.getResult();
    const browser = result.browser.name ? `${result.browser.name} ${result.browser.version || ''}` : 'Unknown Browser';
    const os = result.os.name ? `${result.os.name} ${result.os.version || ''}` : 'Unknown OS';
    return `${browser} on ${os}`;
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      await api.post('/auth/change-password', { oldPassword, newPassword });
      setMessage('Password updated successfully');
      setOldPassword('');
      setNewPassword('');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message || 'Failed to change password');
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '50px auto', padding: 20 }}>
      <h2>Profile Overview</h2>
      <div style={{ marginBottom: 20, padding: 10, border: '1px solid #ccc' }}>
        <p><strong>Username:</strong> {user?.username}</p>
        <p><strong>Email:</strong> {user?.email}</p>
      </div>

      <div style={{ marginBottom: 20, padding: 10, border: '1px solid #ccc' }}>
        <h3>Change Password</h3>
        {message && <p style={{ color: 'green' }}>{message}</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="password"
            placeholder="Current Password"
            value={oldPassword}
            onChange={e => setOldPassword(e.target.value)}
            required
            style={{ padding: 10 }}
          />
          <input
            type="password"
            placeholder="New Password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            required
            style={{ padding: 10 }}
          />
          <button type="submit" style={{ padding: 10, cursor: 'pointer' }}>Change Password</button>
        </form>
      </div>
      <div style={{ marginBottom: 20, padding: 10, border: '1px solid #ccc' }}>
        <h3>Active Sessions</h3>
        {sessions.length === 0 ? (
          <p>Loading sessions...</p>
        ) : (
          <ul style={{ listStyleType: 'none', padding: 0 }}>
            {sessions.map(session => (
              <li key={session.id} style={{ marginBottom: 15, padding: 10, border: '1px solid #eee', borderRadius: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{getDeviceName(session.userAgent)}</strong>
                    {session.isCurrentSession && <span style={{ marginLeft: 10, color: 'green', fontSize: '0.8em', border: '1px solid green', padding: '2px 4px', borderRadius: 3 }}>Current</span>}
                    <div style={{ fontSize: '0.9em', color: '#666', marginTop: 5 }}>
                      IP: {session.ipAddress || 'Unknown'} <br />
                      Last Active: {new Date(session.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={() => handleLogoutSession(session.id, session.isCurrentSession)}
                    style={{ padding: '8px 12px', cursor: 'pointer', backgroundColor: session.isCurrentSession ? '#ffcccb' : '#ff9999', color: 'darkred', border: 'none', borderRadius: 4 }}
                  >
                    {session.isCurrentSession ? 'Log Out' : 'Revoke'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button onClick={logout} style={{ padding: '10px 20px', cursor: 'pointer', backgroundColor: 'red', color: 'white', border: 'none' }}>
        Logout
      </button>
    </div>
  );
};
