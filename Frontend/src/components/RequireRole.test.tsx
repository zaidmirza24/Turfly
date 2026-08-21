import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireRole } from './RequireRole';
import * as AuthContext from '@/contexts/AuthContext';
import { User } from '@/types';

vi.mock('@/contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/contexts/AuthContext')>('@/contexts/AuthContext');
  return { ...actual, useAuth: vi.fn() };
});

const mockUseAuth = AuthContext.useAuth as unknown as ReturnType<typeof vi.fn>;

const asUser = (overrides: Partial<User> = {}): User => ({
  _id: 'u1',
  name: 'Test',
  email: 't@example.com',
  phone: '9876543210',
  role: 'USER',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const renderAt = (path: string, guard: React.ReactNode) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/protected" element={guard} />
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/dashboard" element={<div>User dashboard</div>} />
        <Route path="/owner" element={<div>Owner home</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('RequireRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a loading state instead of the protected content while auth is resolving', () => {
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false, isLoading: true });
    renderAt('/protected', <RequireRole><div>Secret content</div></RequireRole>);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Secret content')).not.toBeInTheDocument();
  });

  it('redirects an unauthenticated visitor to /login', () => {
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false });
    renderAt('/protected', <RequireRole><div>Secret content</div></RequireRole>);
    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Secret content')).not.toBeInTheDocument();
  });

  it('renders the protected content for an authenticated user with no role restriction', () => {
    mockUseAuth.mockReturnValue({ user: asUser(), isAuthenticated: true, isLoading: false });
    renderAt('/protected', <RequireRole><div>Secret content</div></RequireRole>);
    expect(screen.getByText('Secret content')).toBeInTheDocument();
  });

  it('redirects a signed-in user with the wrong role to their own home, not /login', () => {
    mockUseAuth.mockReturnValue({ user: asUser({ role: 'USER' }), isAuthenticated: true, isLoading: false });
    renderAt('/protected', <RequireRole roles={['OWNER']}><div>Owner secret</div></RequireRole>);
    expect(screen.getByText('User dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Owner secret')).not.toBeInTheDocument();
  });

  it('renders the protected content when the user has an allowed role', () => {
    mockUseAuth.mockReturnValue({ user: asUser({ role: 'OWNER' }), isAuthenticated: true, isLoading: false });
    renderAt('/protected', <RequireRole roles={['OWNER']}><div>Owner secret</div></RequireRole>);
    expect(screen.getByText('Owner secret')).toBeInTheDocument();
  });
});
