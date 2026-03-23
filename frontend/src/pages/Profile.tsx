import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export const Profile: React.FC = () => {
  const { user, logout } = useAuth();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      await api.post('/auth/change-password', { oldPassword, newPassword });
      setMessage('Password updated successfully');
      setOldPassword('');
      setNewPassword('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to change password');
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

      <button onClick={logout} style={{ padding: '10px 20px', cursor: 'pointer', backgroundColor: 'red', color: 'white', border: 'none' }}>
        Logout
      </button>
    </div>
  );
};
