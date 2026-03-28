import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { RightSidebar } from './RightSidebar';
import { useAuth } from '../context/AuthContext';

export const ChatLayout: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: '#f0f2f5' }}>

      {/* Optional: A very thin left nav for global icons like Profile, Logout */}
      <div style={{ width: 60, background: '#1c1e21', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0', gap: 20 }}>
        <Link to="/" title="Home" style={{ color: 'white', textDecoration: 'none', fontSize: '1.5rem' }}>🏠</Link>
        <Link to="/profile" title="Profile" style={{ color: 'white', textDecoration: 'none', fontSize: '1.5rem' }}>👤</Link>
        <Link to="/friends" title="Friends" style={{ color: 'white', textDecoration: 'none', fontSize: '1.5rem' }}>👥</Link>
        <Link to="/rooms" title="Rooms" style={{ color: 'white', textDecoration: 'none', fontSize: '1.5rem' }}>💬</Link>
        <div style={{ flex: 1 }} />
        <button onClick={logout} title="Logout" style={{ background: 'none', border: 'none', color: '#f02849', cursor: 'pointer', fontSize: '1.5rem' }}>🚪</button>
      </div>

      {/* Main Content Area (Active Chat, or other pages) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        <Outlet />
      </div>

      {/* Right Sidebar */}
      <RightSidebar />

    </div>
  );
};
