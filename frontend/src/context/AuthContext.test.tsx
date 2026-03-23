import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import { vi } from 'vitest';

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}));

import api from '../services/api';

const TestComponent = () => {
  const { user, isLoading, login, logout } = useAuth();

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <div data-testid="user">{user ? user.username : 'No User'}</div>
      <button onClick={() => login('new-token', { id: '2', username: 'newuser', email: 'n@n.com' })}>LoginBtn</button>
      <button onClick={logout}>LogoutBtn</button>
    </div>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('initializes with no user if no token', async () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    expect(screen.getByTestId('user')).toHaveTextContent('No User');
  });

  it('initializes and fetches user if token exists', async () => {
    localStorage.setItem('token', 'valid-token');
    (api.get as any).mockResolvedValueOnce({ data: { id: '1', username: 'existinguser', email: 'e@e.com' } });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('existinguser');
    });
    expect(api.get).toHaveBeenCalledWith('/auth/me');
  });
});
