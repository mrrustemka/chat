import React, { useState, useEffect } from 'react';
import { UAParser } from 'ua-parser-js';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import './Profile.css';

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

  const handleDeleteAccount = async () => {
    const confirmation = window.confirm(
      'Are you sure you want to delete your account? This action is permanent and will delete all your owned rooms, messages, and files.'
    );
    if (!confirmation) return;

    const secondConfirmation = window.prompt('Type "DELETE" to confirm account deletion:');
    if (secondConfirmation !== 'DELETE') return;

    try {
      await api.delete('/auth/account');
      alert('Your account has been deleted.');
      logout();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      alert(error.response?.data?.message || 'Failed to delete account');
    }
  };

  return (
    <div className="profile-container">
      <h2>Profile Overview</h2>
      <div className="profile-card">
        <p><strong>Username:</strong> {user?.username}</p>
        <p><strong>Email:</strong> {user?.email}</p>
      </div>

      <div className="profile-card">
        <h3>Change Password</h3>
        {message && <p className="auth-success">{message}</p>}
        {error && <p className="auth-error">{error}</p>}
        <form onSubmit={handlePasswordChange} className="auth-form">
          <input
            type="password"
            placeholder="Current Password"
            value={oldPassword}
            onChange={e => setOldPassword(e.target.value)}
            required
            className="auth-input"
          />
          <input
            type="password"
            placeholder="New Password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            required
            className="auth-input"
          />
          <button type="submit" className="auth-btn btn-primary">Change Password</button>
        </form>
      </div>
      <div className="profile-card">
        <h3>Active Sessions</h3>
        {sessions.length === 0 ? (
          <p>Loading sessions...</p>
        ) : (
          <ul className="profile-session-list">
            {sessions.map(session => (
              <li key={session.id} className="profile-session-item">
                <div className="profile-session-row">
                  <div>
                    <strong>{getDeviceName(session.userAgent)}</strong>
                    {session.isCurrentSession && <span className="profile-session-current-badge">Current</span>}
                    <div className="profile-session-details">
                      IP: {session.ipAddress || 'Unknown'} <br />
                      Last Active: {new Date(session.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={() => handleLogoutSession(session.id, session.isCurrentSession)}
                    className={`profile-btn-session ${session.isCurrentSession ? 'profile-btn-session-current' : 'profile-btn-session-revoke'}`}
                  >
                    {session.isCurrentSession ? 'Log Out' : 'Revoke'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="profile-actions-row">
        <button onClick={logout} className="profile-btn-logout">
          Logout
        </button>

        <button onClick={handleDeleteAccount} className="profile-btn-delete">
          Delete Account
        </button>
      </div>
    </div>
  );
};
