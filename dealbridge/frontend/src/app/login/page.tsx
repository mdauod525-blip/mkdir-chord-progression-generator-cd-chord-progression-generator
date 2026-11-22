'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Brand } from '@/components/Shell';
import { Button, Card, ErrorBox, Field, Input } from '@/components/ui';

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ user: { role: string } }>('/auth/login', { body: { email, password } });
      const next = params.get('next');
      const home = r.user.role === 'investor' ? '/portal' : r.user.role === 'wholesaler' ? '/submit' : '/';
      window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : home;
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <ErrorBox error={error} />
      <Field label="Email"><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Password"><Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      <Button className="w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5"><Brand /></div>
        <h1 className="mb-4 text-lg font-semibold">Sign in</h1>
        <Suspense><LoginForm /></Suspense>
        <p className="mt-4 text-center text-sm text-ink-2">
          Investor or wholesaler? <Link className="text-accent hover:underline" href="/register">Create an account</Link>
        </p>
      </Card>
    </div>
  );
}
