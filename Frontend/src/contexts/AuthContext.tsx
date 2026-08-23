import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { User, UserRole } from '@/types';
import { apiPost, clearStoredSession } from '@/lib/api';

/** Outcome of a login attempt — distinguishes "wrong password" from "right
 * password, but this account still needs to verify its email" so the UI can
 * route to the OTP screen instead of showing a generic error. */
export type LoginResult = 'success' | 'invalid' | 'unverified';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  signup: (input: SignupInput) => Promise<boolean>;
  verifyOtp: (email: string, otp: string) => Promise<boolean>;
  resendOtp: (email: string) => Promise<void>;
  logout: () => void;
}

/** What /auth/login and /auth/verify-otp return in their `data` field. */
interface AuthPayload {
  user: User;
  token: string;
}

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  /** Optional at signup; owners need it to reach customers about a booking. */
  phone?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize auth from localStorage
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (savedUser && token) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        // Malformed entry (hand-edited, or written by an older version):
        // an uncaught throw here happens during the provider's first effect
        // and takes down the entire app with a blank screen.
        clearStoredSession();
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    try {
      const res = await apiPost<AuthPayload>('/auth/login', { email, password });
      const { user, token } = res.data;

      setUser(user);
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      return 'success';
    } catch (error) {
      // Sentinel set by the backend (auth.service.js loginUser) for a correct
      // password on an account that hasn't verified its email yet — every
      // other rejection reason (wrong password, banned, deleted) uses a
      // normal human-readable message instead.
      if (error instanceof Error && error.message === 'EMAIL_NOT_VERIFIED') {
        return 'unverified';
      }
      return 'invalid';
    }
  }, []);

  const signup = useCallback(async (input: SignupInput) => {
    try {
      // Registration no longer logs the caller in directly — the backend
      // creates the account unverified and emails an OTP; onboarding only
      // finishes once verifyOtp succeeds, making verification a mandatory
      // step rather than one a user could skip.
      await apiPost<{ email: string }>('/auth/register', input);
      return true;
    } catch (error) {
      return false;
    }
  }, []);

  const verifyOtp = useCallback(async (email: string, otp: string) => {
    try {
      const res = await apiPost<AuthPayload>('/auth/verify-otp', { email, otp });
      const { user, token } = res.data;

      setUser(user);
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      return true;
    } catch (error) {
      return false;
    }
  }, []);

  const resendOtp = useCallback(async (email: string) => {
    // Errors (rate limit, network) are surfaced to the caller as a rejected
    // promise — the page decides how to show that; there's nothing generic
    // to swallow here the way login/signup swallow theirs.
    await apiPost('/auth/resend-otp', { email });
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    clearStoredSession();
  }, []);

  // AuthProvider wraps the entire app above the router, so an unmemoized
  // value object here would force every useAuth() consumer app-wide to
  // re-render on every provider render, not just when the auth state itself
  // changes.
  const value = useMemo(
    () => ({ user, isAuthenticated: !!user, isLoading, login, signup, verifyOtp, resendOtp, logout }),
    [user, isLoading, login, signup, verifyOtp, resendOtp, logout]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
