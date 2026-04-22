import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { Eye, EyeOff, Factory, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const { login, isAuthenticated, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1D3557]"></div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const result = await login(email, password);
    
    if (!result.success) {
      setError(result.error);
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Image */}
      <div 
        className="hidden lg:flex lg:w-1/2 bg-cover bg-center relative"
        style={{ 
          backgroundImage: 'url(https://images.unsplash.com/photo-1755377205428-ec47fcc8b9d2?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzN8MHwxfHNlYXJjaHwzfHxpbmR1c3RyaWFsJTIwbWFjaGluZXJ5JTIwbWFudWZhY3R1cmluZyUyMGNsZWFufGVufDB8fHx8MTc3NTg1MzU4NHww&ixlib=rb-4.1.0&q=85)'
        }}
      >
        <div className="absolute inset-0 bg-[#1D3557]/80"></div>
        <div className="relative z-10 flex flex-col justify-center px-12 text-white">
          <div className="flex items-center space-x-3 mb-6">
            <Factory className="w-10 h-10" />
            <span className="text-2xl font-bold font-[Chivo]">MecSmart ERP</span>
          </div>
          <h1 className="text-4xl font-bold font-[Chivo] mb-4">
            Manufacturing Excellence
          </h1>
          <p className="text-lg text-white/80 max-w-md">
            Streamline your production with advanced BOM management, MRP planning, and quality control.
          </p>
        </div>
      </div>

      {/* Right side - Login form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center justify-center space-x-3 mb-8">
            <Factory className="w-8 h-8 text-[#1D3557]" />
            <span className="text-xl font-bold font-[Chivo] text-[#1D3557]">MecSmart ERP</span>
          </div>

          <h2 className="text-2xl font-bold font-[Chivo] text-[#111827] mb-2">
            Sign in to your account
          </h2>
          <p className="text-[#4B5563] mb-8">
            Enter your credentials to access the ERP system
          </p>

          {error && (
            <div className="alert-danger flex items-center space-x-2 mb-6" data-testid="login-error">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-[#111827] mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="admin@erp.com"
                required
                data-testid="login-email-input"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#111827] mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pr-10"
                  placeholder="Enter your password"
                  required
                  data-testid="login-password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#4B5563]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn-primary py-2.5"
              data-testid="login-submit-btn"
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
