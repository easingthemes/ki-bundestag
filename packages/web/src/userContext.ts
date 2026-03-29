import { createContext, useContext } from "react";
import type { User } from "./api";

export interface UserCtx {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  updateUser: (user: User) => void;
}

export const UserContext = createContext<UserCtx>({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
  updateUser: () => {},
});

export function useUser(): UserCtx {
  return useContext(UserContext);
}

// Legacy token storage — kept for migration path but OAuth uses session cookies
const TOKEN_KEY = "ki-bundestag-token";
const COOKIE_NAME = "ki-bundestag-token";

export function loadStoredToken(): string | null {
  try {
    const ls = localStorage.getItem(TOKEN_KEY);
    if (ls) return ls;
  } catch { /* ignore */ }
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`));
    if (match) return decodeURIComponent(match[1]);
  } catch { /* ignore */ }
  return null;
}

export function saveToken(token: string): void {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
  try {
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; path=/; max-age=31536000; SameSite=Lax`;
  } catch { /* ignore */ }
}

export function clearToken(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  try {
    document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
  } catch { /* ignore */ }
}
