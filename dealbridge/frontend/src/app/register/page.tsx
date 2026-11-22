'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Brand } from '@/components/Shell';
import { Button, Card, ErrorBox, Field, Input, Select } from '@/components/ui';

export default function RegisterPage() {
  const [f, setF] = useState({ full_name: '', email: '', password: '', role: 'investor', agree_terms: false, email_consent: false });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ user: { role: string } }>('/auth/register', { body: f });
      window.location.href = r.user.role === 'investor' ? '/portal/profile' : '/submit';
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }
  return (
    <div className="grid min-h-screen place-items-center px-4 py-8">
      <Card className="w-full max-w-md p-6">
        <div className="mb-5"><Brand /></div>
        <h1 className="mb-1 text-lg font-semibold">Create an account</h1>
        <p className="mb-4 text-sm text-ink-2">Accounts are reviewed before marketplace access is granted.</p>
        <form onSubmit={submit} className="space-y-3">
          <ErrorBox error={error} />
          <Field label="Full name"><Input required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Password" hint="At least 10 characters."><Input type="password" minLength={10} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          <Field label="I am a">
            <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              <option value="investor">Investor / lender</option>
              <option value="wholesaler">Wholesaler submitting deals</option>
            </Select>
          </Field>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={f.email_consent} onChange={(e) => setF({ ...f, email_consent: e.target.checked })} />
            <span>Email me opportunities that match my preferences. I can unsubscribe at any time.</span></label>
          <label className="flex gap-2 text-sm"><input type="checkbox" required checked={f.agree_terms} onChange={(e) => setF({ ...f, agree_terms: e.target.checked })} />
            <span>I understand that all figures are estimates, matches are not commitments, and nothing here is an offer of securities or investment advice.</span></label>
          <Button className="w-full" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</Button>
        </form>
        <p className="mt-4 text-center text-sm text-ink-2">Have an account? <Link className="text-accent hover:underline" href="/login">Sign in</Link></p>
      </Card>
    </div>
  );
}
