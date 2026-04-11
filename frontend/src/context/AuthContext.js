import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Axios instance with credentials
const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

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
      const message = formatApiErrorDetail(error.response?.data?.detail) || error.message;
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
