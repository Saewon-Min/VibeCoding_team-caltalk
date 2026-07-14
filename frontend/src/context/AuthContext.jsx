import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getToken, setToken, setUnauthorizedHandler } from '../api/apiClient';

const USER_STORAGE_KEY = 'caltalk_user';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const [token, setTokenState] = useState(() => getToken());

  useEffect(() => {
    // 서버 401이 최종 신뢰 기준이며, 여기서는 그 결과를 받아 로그아웃 처리하는 UX 보조만 담당한다.
    setUnauthorizedHandler(() => logout());
  }, []);

  function login(newToken, newUser) {
    setToken(newToken);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(newUser));
    setTokenState(newToken);
    setUser(newUser);
  }

  function logout() {
    setToken(null);
    localStorage.removeItem(USER_STORAGE_KEY);
    setTokenState(null);
    setUser(null);
  }

  const value = useMemo(
    () => ({ user, token, isAuthenticated: Boolean(token), login, logout }),
    [user, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth는 AuthProvider 내부에서만 사용할 수 있습니다');
  }
  return ctx;
}
