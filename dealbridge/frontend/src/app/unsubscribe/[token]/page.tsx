'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button, Card, ErrorBox } from '@/components/ui';

export default function Unsubscribe() {
  const { token } = useParams<{ token: string }>();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <Card className="max-w-sm p-6 text-center">
        {done ? <p className="text-sm">You are unsubscribed from all DealBridge AI emails and texts.</p> : <>
          <p className="mb-4 text-sm">Stop all DealBridge AI emails and text messages?</p>
          <Button onClick={async () => { try { await api(`/unsubscribe/${token}`, { method: 'POST' }); setDone(true); } catch (e) { setErr(e); } }}>Unsubscribe</Button>
          <div className="mt-3"><ErrorBox error={err} /></div></>}
      </Card>
    </div>
  );
}
