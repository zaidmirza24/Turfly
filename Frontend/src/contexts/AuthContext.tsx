import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { User, UserRole } from '@/types';
import { apiPost, clearStoredSession } from '@/lib/api';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (input: SignupInput) => Promise<boolean>;
  logout: () => void;
}

/** What /auth/login and /auth/register return in their `data` field. */
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

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await apiPost<AuthPayload>('/auth/login', { email, password });
      const { user, token } = res.data;
      
      setUser(user);
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      return true;
    } catch (error) {
      return false;
    }
  }, []);

  const signup = useCallback(async (input: SignupInput) => {
    try {
      const res = await apiPost<AuthPayload>('/auth/register', input);
      const { user, token } = res.data;
      
      setUser(user);
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      return true;
    } catch (error) {
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    clearStoredSession();
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
