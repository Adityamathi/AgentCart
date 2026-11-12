import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { Button, Field, Input, Notice } from '../components/ui';
import { Wordmark } from '../components/Shell';

export default function Login() {
  const { user, login, register } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>(params.get('mode') === 'register' ? 'register' : 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={params.get('next') ?? '/app'} replace />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'register') await register(email, password, name || email.split('@')[0]);
      else await login(email, password);
      navigate(params.get('next') ?? '/app', { replace: true });
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : 'The server did not answer. Check that the API is running on port 4000.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function useDemo() {
    setError(null);
    setBusy(true);
    try {
      await login('demo@agentcart.dev', 'demo12345');
      navigate('/app', { replace: true });
    } catch (demoError) {
      setError(demoError instanceof ApiError ? demoError.message : 'Could not sign in with the demo account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-paper lg:grid-cols-[1fr_1.1fr]">
      <div className="hidden flex-col border-r border-line bg-surface p-10 lg:flex">
        <Wordmark />
        <div className="flex flex-1 flex-col justify-center py-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">Purchasing agent</p>
          <h1 className="mt-5 max-w-[20ch] font-display text-[42px] leading-[1.06] tracking-[-0.02em] text-ink">
            One request. A cart you approved.
          </h1>
          <p className="mt-5 max-w-[42ch] text-[14px] leading-7 text-ink-2">
            Your account holds the purchasing policy, the cart and the approval record. The agent can read and write
            the cart, never the payment.
          </p>
          <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-line pt-5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3">
            <div>
              <dt>Policy</dt>
              <dd className="mt-1 text-ink">Server enforced</dd>
            </div>
            <div>
              <dt>Payment</dt>
              <dd className="mt-1 text-ink">PayPal sandbox</dd>
            </div>
            <div>
              <dt>Memory</dt>
              <dd className="mt-1 text-ink">Yours to clear</dd>
            </div>
          </dl>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
          AgentCart · PayPal AI Hackathon 2026
        </p>
        <div className="receipt-edge mt-0 w-full" aria-hidden />
      </div>

      <div className="flex flex-col p-6 sm:p-10">
        <div className="flex items-center justify-between lg:justify-end">
          <div className="lg:hidden">
            <Wordmark />
          </div>
          <Link to="/" className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
            <ArrowLeft size={14} strokeWidth={1.5} /> Back to home
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
            {mode === 'login' ? 'Sign in' : 'Create an account'}
          </p>
          <h2 className="mt-2 text-[26px] leading-tight tracking-[-0.01em] text-ink">
            {mode === 'login' ? 'Continue to your workspace' : 'Open a purchasing account'}
          </h2>
          <p className="mt-2 text-[13.5px] leading-6 text-ink-2">
            {mode === 'login'
              ? 'Your cart, policies and agent runs are tied to this account.'
              : 'You get a $1,000 policy, a cart and an agent run log from the start.'}
          </p>

          <form onSubmit={submit} className="mt-7 flex flex-col gap-4">
            {mode === 'register' ? (
              <Field label="Name">
                <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Sam Rivera" autoComplete="name" />
              </Field>
            ) : null}
            <Field label="Email">
              <Input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </Field>
            <Field label="Password" hint={mode === 'register' ? 'At least 8 characters' : undefined}>
              <Input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </Field>

            {error ? <Notice tone="bad">{error}</Notice> : null}

            <Button type="submit" loading={busy} className="mt-1 w-full">
              {mode === 'login' ? 'Sign in' : 'Create account'}
              <ArrowRight size={15} strokeWidth={1.5} />
            </Button>
          </form>

          <div className="mt-4 flex items-center justify-between text-[12.5px] text-ink-2">
            <button
              type="button"
              className="transition-colors hover:text-ink"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'login' ? 'Create an account' : 'I already have an account'}
            </button>
            <button type="button" onClick={useDemo} className="text-ink-3 transition-colors hover:text-ink">
              Use the demo account
            </button>
          </div>

          <div className="mt-8 border-t border-line pt-4">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3">Demo account</p>
            <p className="mt-1.5 font-mono text-[11.5px] text-ink-2">demo@agentcart.dev · demo12345</p>
            <p className="mt-2 text-[12px] leading-5 text-ink-3">
              Seeded by the server. Change DEMO_EMAIL and DEMO_PASSWORD before deploying.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
