import { useEffect, useState } from "react";
import { API_BASE_URL, AUTH_STORAGE_KEY, fetchJson } from "../lib/api.js";

export function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem(AUTH_STORAGE_KEY) ?? "");
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    async function restoreSession() {
      if (!token) {
        setIsAuthLoading(false);
        return;
      }
      try {
        const data = await fetchJson(`${API_BASE_URL}/auth/me`, { token });
        setCurrentUser(data.user);
      } catch {
        clearSession();
      } finally {
        setIsAuthLoading(false);
      }
    }
    restoreSession();
  }, []);

  function persistSession(nextToken, user) {
    localStorage.setItem(AUTH_STORAGE_KEY, nextToken);
    setToken(nextToken);
    setCurrentUser(user);
  }

  function clearSession() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setToken("");
    setCurrentUser(null);
  }

  return { token, currentUser, isAuthLoading, persistSession, clearSession };
}
