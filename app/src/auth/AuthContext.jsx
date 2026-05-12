import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ClerkProvider,
  useAuth as useClerkAuth,
  useOrganization,
  useUser,
} from '@clerk/clerk-react';
import { setAuthTokenGetter } from '../api/client';
import { clerkAppearance } from './clerkAppearance';

const API_BASE =
  import.meta.env.PUBLIC_API_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:8000';
const DEV_TOKEN_KEY = 'usdwatch_dev_token';
const CLERK_KEY =
  import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY ||
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
  '';
const CLERK_TEMPLATE =
  import.meta.env.PUBLIC_CLERK_JWT_TEMPLATE ||
  import.meta.env.VITE_CLERK_JWT_TEMPLATE ||
  undefined;
const DEV_AUTH_ENABLED =
  import.meta.env.PUBLIC_ALLOW_DEV_AUTH === 'true' ||
  import.meta.env.VITE_ALLOW_DEV_AUTH === 'true';

export const clerkEnabled = Boolean(CLERK_KEY);

const AuthContext = createContext(null);

async function fetchWorkspace(token) {
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/api/workspace`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function ClerkBackedAuth({ children }) {
  const { getToken, isLoaded, isSignedIn, signOut } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const { organization } = useOrganization();
  const [workspaceState, setWorkspaceState] = useState(null);

  useEffect(() => {
    setAuthTokenGetter(async () => {
      if (!isSignedIn) return null;
      return getToken({ template: CLERK_TEMPLATE }).catch(() => null);
    });
    return () => setAuthTokenGetter(null);
  }, [getToken, isSignedIn]);

  useEffect(() => {
    let cancelled = false;
    async function loadWorkspace() {
      if (!isSignedIn) {
        setWorkspaceState(null);
        return;
      }
      const token = await getToken({ template: CLERK_TEMPLATE }).catch(() => null);
      const data = await fetchWorkspace(token);
      if (!cancelled) setWorkspaceState(data);
    }
    if (isLoaded) loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn, organization?.id]);

  const logout = useCallback(() => signOut({ redirectUrl: '/' }), [signOut]);

  const value = useMemo(() => ({
    loading: !isLoaded,
    isAuthenticated: Boolean(isSignedIn),
    clerkEnabled: true,
    user: workspaceState?.user || {
      id: clerkUser?.id,
      email: clerkUser?.primaryEmailAddress?.emailAddress || '',
    },
    workspace: workspaceState?.workspace || null,
    entitlements: workspaceState?.entitlements || null,
    login: async () => {},
    logout,
  }), [clerkUser?.id, clerkUser?.primaryEmailAddress?.emailAddress, isLoaded, isSignedIn, logout, workspaceState]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function DevAuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(DEV_TOKEN_KEY));
  const [workspaceState, setWorkspaceState] = useState(null);

  useEffect(() => {
    setAuthTokenGetter(async () => token || null);
    return () => setAuthTokenGetter(null);
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    async function loadWorkspace() {
      if (!token) {
        setWorkspaceState(null);
        return;
      }
      const data = await fetchWorkspace(token);
      if (!cancelled) setWorkspaceState(data);
    }
    loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const login = useCallback(async (email) => {
    if (!DEV_AUTH_ENABLED) {
      throw new Error('Clerk is not configured for this environment.');
    }
    const nextToken = `dev:${email || 'dev@example.com'}`;
    localStorage.setItem(DEV_TOKEN_KEY, nextToken);
    setToken(nextToken);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(DEV_TOKEN_KEY);
    setToken(null);
  }, []);

  const value = useMemo(() => ({
    loading: false,
    isAuthenticated: Boolean(token),
    clerkEnabled: false,
    user: workspaceState?.user || (token ? { email: token.replace('dev:', '') } : null),
    workspace: workspaceState?.workspace || null,
    entitlements: workspaceState?.entitlements || null,
    login,
    logout,
  }), [login, logout, token, workspaceState]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }) {
  if (!clerkEnabled) {
    return <DevAuthProvider>{children}</DevAuthProvider>;
  }

  return (
    <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/" appearance={clerkAppearance}>
      <ClerkBackedAuth>{children}</ClerkBackedAuth>
    </ClerkProvider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
