import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Axios instance with credentials
const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// Response interceptor — auto-refresh the access token on 401.
// This keeps users logged in while they're actively using the app
// (within the 7-day refresh window), and lets the frontend idle-logout
// handle explicit inactivity timeout (10 min).
let _refreshingPromise = null;
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !original.url?.includes('/api/auth/login') &&
      !original.url?.includes('/api/auth/refresh') &&
      !original.url?.includes('/api/auth/me')
    ) {
      original._retry = true;
      try {
        // Share the refresh promise across concurrent 401s
        if (!_refreshingPromise) {
          _refreshingPromise = api.post('/api/auth/refresh').finally(() => {
            _refreshingPromise = null;
          });
        }
        await _refreshingPromise;
        return api(original);
      } catch {
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

// Error formatter for FastAPI validation errors
function formatApiErrorDetail(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = not authenticated
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const { data } = await api.get('/api/auth/me');
      setUser(data);
      setPermissions(data.permissions || {});
    } catch (error) {
      setUser(false);
      setPermissions({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email, password) => {
    try {
      const { data } = await api.post('/api/auth/login', { email, password });
      setUser(data);
      setPermissions(data.permissions || {});
      return { success: true, data };
    } catch (error) {
      const detail = error.response?.data?.detail;
      const message = detail ? formatApiErrorDetail(detail) : (error.message || "Cannot reach server. Check if backend is running.");
      return { success: false, error: message };
    }
  };

  const register = async (email, password, name, role) => {
    try {
      const { data } = await api.post('/api/auth/register', { email, password, name, role });
      setUser(data);
      setPermissions(data.permissions || {});
      return { success: true, data };
    } catch (error) {
      const message = formatApiErrorDetail(error.response?.data?.detail) || error.message;
      return { success: false, error: message };
    }
  };

  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    }
    setUser(false);
    setPermissions({});
  };

  const refreshToken = async () => {
    try {
      await api.post('/api/auth/refresh');
      return true;
    } catch (error) {
      setUser(false);
      setPermissions({});
      return false;
    }
  };

  // Helper to check if user has permission for a module/action
  const hasPermission = (module, action = 'view') => {
    if (!permissions || !module) return false;
    const modulePerms = permissions[module];
    if (!modulePerms) return false;
    return modulePerms.includes(action);
  };

  // ============================================================================
  // IDLE LOGOUT — auto-logs out after N minutes of inactivity.
  // Resets on any mousemove / keydown / scroll / click / touchstart.
  // ============================================================================
  const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
  useEffect(() => {
    if (!user) return; // Only run when authenticated

    let timer = null;
    const idleLogout = async () => {
      try {
        await api.post('/api/auth/logout');
      } catch { /* noop */ }
      setUser(false);
      setPermissions({});
      // Surface a clear notice so the user knows WHY they were logged out
      try {
        const { toast } = await import('sonner');
        toast.warning('Session timed out after 10 minutes of inactivity. Please sign in again.', { duration: 6000 });
      } catch { /* noop */ }
    };
    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(idleLogout, IDLE_TIMEOUT_MS);
    };
    const events = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'];
    events.forEach(evt => window.addEventListener(evt, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      if (timer) clearTimeout(timer);
      events.forEach(evt => window.removeEventListener(evt, resetTimer));
    };
  }, [user]);

  const value = {
    user,
    permissions,
    loading,
    login,
    register,
    logout,
    refreshToken,
    hasPermission,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export { api, formatApiErrorDetail };
