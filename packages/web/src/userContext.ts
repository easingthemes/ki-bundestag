import { createContext, useContext } from "react";
import type { User } from "./api";

export interface UserCtx {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  updateUser: (user: User) => void;
}

export const UserContext = createContext<UserCtx>({
  user: null,
  login: () => {},
  logout: () => {},
  updateUser: () => {},
});

export function useUser(): UserCtx {
  return useContext(UserContext);
}
