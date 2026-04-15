import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) navigate(from, { replace: true });
  }, [isAuthenticated, from, navigate]);

  if (isAuthenticated) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex items-center justify-center min-h-[60vh]">
      <img
        src="/images/login-bg.png"
        alt=""
        className="absolute inset-0 w-full h-full object-cover opacity-[0.06] pointer-events-none"
      />
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 bg-surface border border-border rounded-xl p-8"
      >
        <div className="text-center space-y-1">
          <h2 className="text-lg font-bold text-text tracking-tight">Sign In</h2>
          <p className="text-xs text-text-dim">Case Command Center</p>
        </div>

        {error && (
          <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label htmlFor="email" className="block text-xs font-medium text-text-dim mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-text placeholder:text-text-dim/50 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-medium text-text-dim mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-text placeholder:text-text-dim/50 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 text-sm font-medium rounded-md bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
