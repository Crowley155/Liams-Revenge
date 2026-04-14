import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const TOKEN_KEY = 'usdwatch_token';

const AuthContext = createContext(null);

function decodePayload(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function isTokenExpired(token) {
  const payload = decodePayload(token);
  if (!payload?.exp) return true;
  return Date.now() / 1000 > payload.exp;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored && !isTokenExpired(stored)) return stored;
    localStorage.removeItem(TOKEN_KEY);
    return null;
  });

  const user = token ? decodePayload(token) : null;
  const isAuthenticated = !!token && !isTokenExpired(token);

  useEffect(() => {
    if (token && isTokenExpired(token)) {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
    }
  }, [token]);

  const login = useCallback(async (email, password) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Login failed');
    }

    const { access_token } = await res.json();
    localStorage.setItem(TOKEN_KEY, access_token);
    setToken(access_token);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
