import { createContext, useContext } from "react";
import type { User } from "./api";

export interface UserCtx {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
}

export const UserContext = createContext<UserCtx>({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
});

export function useUser(): UserCtx {
  return useContext(UserContext);
}

const TOKEN_KEY = "ki-bundestag-token";

export function loadStoredToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function saveToken(token: string): void {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
}

export function clearToken(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}
