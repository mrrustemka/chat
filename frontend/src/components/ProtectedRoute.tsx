import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const ProtectedRoute: React.FC = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>; // Could be a nicer spinner later
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />; // Route renders child routes if authorized
};

export const PublicRoute: React.FC = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (user) {
    // Redirect authenticated users away from public routes like login/register
    return <Navigate to="/" replace />; 
  }

  return <Outlet />;
};
