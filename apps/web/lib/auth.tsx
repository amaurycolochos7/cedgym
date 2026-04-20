'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { authApi, tokenStore } from './api';
import type { AuthResponse, User, UserRole } from './schemas';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  hydrateFromAuthResponse: (resp: AuthResponse) => void;
  refreshMe: () => Promise<User | null>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    const token = tokenStore.getAccess();
    if (!token) {
      setUser(null);
      return null;
    }
    try {
      const { user: u } = await authApi.me();
      setUser(u);
      tokenStore.setRole(u.role ?? 'ATHLETE');
      return u;
    } catch {
      setUser(null);
      tokenStore.clear();
      return null;
    }
  }, []);

  useEffect(() => {
    // Hydrate on mount. /auth/me is best-effort: if the backend is offline
    // we still keep the token so forms can re-auth without forcing a logout.
    (async () => {
      await refreshMe();
      setLoading(false);
    })();
  }, [refreshMe]);

  const hydrateFromAuthResponse = useCallback((resp: AuthResponse) => {
    tokenStore.set({
      access: resp.access_token,
      refresh: resp.refresh_token,
    });
    tokenStore.setRole(resp.user.role ?? 'ATHLETE');
    setUser(resp.user);
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAuthenticated: !!user,
      hydrateFromAuthResponse,
      refreshMe,
      logout,
    }),
    [user, loading, hydrateFromAuthResponse, refreshMe, logout],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/* =========================================================================
 * Post-auth redirect helpers
 * =========================================================================*/

export const POST_REGISTER_REDIRECT_KEY = 'post_register_redirect';

export interface PostRegisterRedirect {
  path: string;
  productSlug?: string;
  productLabel?: string;
}

/**
 * Map a user role to the landing page they should see after login.
 * Called from login/register flows after `hydrateFromAuthResponse`.
 */
export function postLoginPathForRole(
  role: UserRole | undefined | null,
): string {
  switch (role) {
    case 'SUPERADMIN':
    case 'ADMIN':
      return '/admin/dashboard';
    case 'TRAINER':
      return '/trainer/dashboard';
    case 'RECEPTIONIST':
      return '/staff/scan';
    case 'ATHLETE':
    default:
      return '/portal/dashboard';
  }
}
