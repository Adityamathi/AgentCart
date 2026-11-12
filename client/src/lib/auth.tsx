import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type MeResponse, type User } from './api';

interface AuthContextValue {
  me: MeResponse | null;
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<unknown>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['me'],
    queryFn: api.me,
    retry: false,
    staleTime: 30_000,
  });

  const login = useCallback(
    async (email: string, password: string) => {
      await api.login({ email, password });
      queryClient.clear();
      await refetch();
    },
    [queryClient, refetch],
  );

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      await api.register({ email, password, name });
      queryClient.clear();
      await refetch();
    },
    [queryClient, refetch],
  );

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    queryClient.clear();
    await refetch();
  }, [queryClient, refetch]);

  const value = useMemo<AuthContextValue>(
    () => ({
      me: data ?? null,
      user: data?.user ?? null,
      loading: isLoading,
      login,
      register,
      logout,
      refresh: refetch,
    }),
    [data, isLoading, login, register, logout, refetch],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
