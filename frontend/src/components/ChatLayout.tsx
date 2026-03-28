import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { RightSidebar } from './RightSidebar';
import { useAuth } from '../context/AuthContext';
import './ChatLayout.css';

export const ChatLayout: React.FC = () => {
  const { logout } = useAuth();

  return (
    <div className="chat-layout-root">

      {/* Optional: A very thin left nav for global icons like Profile, Logout */}
      <div className="chat-layout-sidebar">
        <Link to="/" title="Home" className="chat-sidebar-link">🏠</Link>
        <Link to="/profile" title="Profile" className="chat-sidebar-link">👤</Link>
        <Link to="/friends" title="Friends" className="chat-sidebar-link">👥</Link>
        <Link to="/rooms" title="Rooms" className="chat-sidebar-link">💬</Link>
        <div className="chat-sidebar-spacer" />
        <button onClick={logout} title="Logout" className="chat-sidebar-logout">🚪</button>
      </div>

      {/* Main Content Area (Active Chat, or other pages) */}
      <div className="chat-layout-main">
        <Outlet />
      </div>

      {/* Right Sidebar */}
      <RightSidebar />

    </div>
  );
};
