import { SignInButton } from '@clerk/clerk-react';
import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { clerkEnabled, useAuth } from '../auth/AuthContext';
import { ActionButton } from './caseShared';

export default function Login() {
  const { isAuthenticated, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('dev@example.com');
  const [error, setError] = useState('');
  const redirectTo = location.state?.from?.pathname || '/cases';

  if (isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  const handleDevLogin = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await login(email);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="max-w-md mx-auto py-14 space-y-8 animate-fade-up">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-accent font-semibold">Free draft case workspace</p>
        <h2 className="text-3xl font-bold tracking-tight">Sign in to USDWatch</h2>
        <p className="text-sm leading-relaxed text-text-dim">
          New sign-ups are temporarily closed while the private case workflow is being reviewed.
        </p>
      </div>

      {clerkEnabled ? (
        <div className="bg-surface border border-border rounded-md p-5 space-y-3">
          <SignInButton mode="modal" forceRedirectUrl="/cases">
            <button className="min-h-11 w-full rounded-md bg-accent px-4 py-3 font-semibold text-background transition-colors hover:bg-accent-hover">
              Sign In
            </button>
          </SignInButton>
        </div>
      ) : (
        <form onSubmit={handleDevLogin} className="bg-surface border border-border rounded-md p-5 space-y-4">
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-dim">Development email</span>
            <input
              className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
            />
          </label>
          {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <ActionButton type="submit" variant="primary" className="w-full px-4">
            Continue
          </ActionButton>
        </form>
      )}
    </div>
  );
}
