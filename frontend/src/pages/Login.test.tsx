import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Login } from './Login';
import { AuthProvider } from '../context/AuthContext';
import { vi } from 'vitest';

// mock api
vi.mock('../services/api', () => {
  return {
    default: {
      post: vi.fn(),
      get: vi.fn().mockResolvedValue({ data: { id: '1', username: 'already_logged_in', email: 'a@a.com' } }) // for AuthProvider init
    }
  };
});

import api from '../services/api';

describe('Login Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login form', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </BrowserRouter>
    );
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
  });

  it('submits form correctly', async () => {
    (api.post as any).mockResolvedValueOnce({
      data: { token: 'fake-token', user: { id: '1', username: 'testuser', email: 't@t.com' } }
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </BrowserRouter>
    );

    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/auth/login', { email: 'test@example.com', password: 'password123' });
    });
  });
});
