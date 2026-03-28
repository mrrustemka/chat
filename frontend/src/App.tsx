import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute, PublicRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Profile } from './pages/Profile';
import { Friends } from './pages/Friends';
import { Rooms } from './pages/Rooms';
import { ChatRoom } from './pages/ChatRoom';
import { PersonalChat } from './pages/PersonalChat';
import { ChatLayout } from './components/ChatLayout';
import './App.css';

const Home: React.FC = () => {
  const { user } = useAuth();
  return (
    <div style={{ padding: 20 }}>
      <h1>Welcome to Chat App</h1>
      <p>Hello, {user?.username}!</p>
      <nav>
        <Link to="/profile">Profile</Link>{' | '}
        <Link to="/friends">Friends</Link>{' | '}
        <Link to="/rooms">Rooms</Link>
      </nav>
    </div>
  );
};

const AppContent: React.FC = () => {
  return (
    <Routes>
      <Route element={<PublicRoute />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<ChatLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/rooms" element={<Rooms />} />
          <Route path="/rooms/:id" element={<ChatRoom />} />
          <Route path="/personal-chats/:id" element={<PersonalChat />} />
        </Route>
      </Route>
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
