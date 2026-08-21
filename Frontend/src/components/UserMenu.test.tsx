import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UserMenu } from './UserMenu';
import { AuthProvider } from '@/contexts/AuthContext';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const OWNER = {
  _id: 'u1',
  name: 'Ravi Kumar',
  email: 'ravi@turfowner.com',
  phone: '9876543210',
  role: 'OWNER' as const,
  createdAt: '2026-01-01',
};

const renderMenu = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <UserMenu />
      </AuthProvider>
    </MemoryRouter>
  );

/** Radix opens its menu on pointerdown, not click. */
const openMenu = (trigger: HTMLElement) => {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
};

describe('UserMenu', () => {
  beforeEach(() => {
    navigate.mockClear();
    localStorage.clear();
    localStorage.setItem('token', 'fake-token');
    localStorage.setItem('user', JSON.stringify(OWNER));
  });

  it('renders nothing when signed out', () => {
    localStorage.clear();
    const { container } = renderMenu();
    expect(container).toBeEmptyDOMElement();
  });

  it('exposes the avatar as a labelled button', async () => {
    renderMenu();
    // The regression this guards: the mobile header used to hold a plain <div>
    // with an icon in it — not focusable, not clickable, no accessible name.
    const trigger = await screen.findByRole('button', { name: /account menu for ravi kumar/i });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('opens a menu with the account details and actions', async () => {
    renderMenu();
    const trigger = await screen.findByRole('button', { name: /account menu/i });
    openMenu(trigger);

    await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
    expect(screen.getByText('ravi@turfowner.com')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /owner dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /browse turfs/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /log out/i })).toBeInTheDocument();
  });

  it('logs out: clears the stored session and leaves the guarded area', async () => {
    renderMenu();
    const trigger = await screen.findByRole('button', { name: /account menu/i });
    openMenu(trigger);

    const logout = await screen.findByRole('menuitem', { name: /log out/i });
    fireEvent.click(logout);

    await waitFor(() => {
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
    });
    // Staying put would just bounce through the route guard to /login.
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('sends each role to its own landing page', async () => {
    localStorage.setItem('user', JSON.stringify({ ...OWNER, role: 'ADMIN' }));
    renderMenu();
    const trigger = await screen.findByRole('button', { name: /account menu/i });
    openMenu(trigger);

    fireEvent.click(await screen.findByRole('menuitem', { name: /admin panel/i }));
    expect(navigate).toHaveBeenCalledWith('/admin');
  });
});
