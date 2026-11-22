'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useApi } from '@/lib/hooks';
import { qs } from '@/lib/api';
import { compactUsd, label, pct } from '@/lib/format';
import { Badge, Button, DemoBadge, Empty, ErrorBox, Input, PageHeader, Select, Table, Td, Th } from '@/components/ui';

export default function Investors() {
  const [f, setF] = useState({ q: '', stage: '', investor_type: '', verified: '', demo: '' });
  const { data, error } = useApi(`/investors${qs(f)}`);
  const set = (k: string) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });
  return (
    <div>
      <PageHeader title="Investor database" sub="Profiles, preferences, verification and consent." actions={<Link href="/investors/new"><Button><Plus size={15} /> Add investor</Button></Link>} />
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5">
        <Input placeholder="Name, email, entity" value={f.q} onChange={set('q')} />
        <Select value={f.investor_type} onChange={set('investor_type')}><option value="">All types</option>{['individual', 'investment_group', 'private_lender', 'hard_money_lender', 'investment_company', 'jv_partner', 'wholesaler', 'contractor_investor'].map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>
        <Select value={f.stage} onChange={set('stage')}><option value="">All stages</option>{['new', 'contacted', 'qualified', 'opportunity_presented', 'interested', 'due_diligence', 'negotiation', 'funded_closed', 'not_interested'].map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>
        <Select value={f.verified} onChange={set('verified')}><option value="">Any verification</option><option value="true">Verified</option><option value="false">Not verified</option></Select>
        <Select value={f.demo} onChange={set('demo')}><option value="">Real + demo</option><option value="false">Real only</option><option value="true">Demo only</option></Select>
      </div>
      <ErrorBox error={error} />
      {data?.length === 0 && <Empty>No investors yet.</Empty>}
      {data?.length > 0 && (
        <Table>
          <thead><tr><Th>Investor</Th><Th>Type</Th><Th>Capital</Th><Th>Min ROI</Th><Th>Strategies</Th><Th>Risk</Th><Th>Stage</Th><Th>Verification</Th><Th>Consent</Th></tr></thead>
          <tbody>{data.map((i: any) => (
            <tr key={i.id} className="hover:bg-surface-2">
              <Td><Link href={`/investors/${i.id}`} className="font-medium hover:text-accent">{i.name}</Link> <DemoBadge show={i.is_demo} /><div className="text-xs text-muted">{i.entity_name ?? i.email}</div></Td>
              <Td className="text-xs">{label(i.investor_type)}</Td>
              <Td className="tabular">{compactUsd(i.available_capital)}</Td>
              <Td className="tabular">{pct(i.min_roi_pct, 0)}</Td>
              <Td className="text-xs">{i.strategies.map(label).join(', ')}</Td>
              <Td className="text-xs">{i.risk_tolerance}</Td>
              <Td><Badge>{label(i.pipeline_stage)}</Badge></Td>
              <Td><Badge tone={i.verification_status === 'verified' ? 'good' : i.verification_status === 'rejected' ? 'bad' : 'warn'}>{i.verification_status}</Badge></Td>
              <Td className="text-xs">{i.unsubscribed ? 'unsubscribed' : [i.email_consent && 'email', i.sms_consent && 'sms'].filter(Boolean).join(' + ') || 'none'}</Td>
            </tr>))}</tbody>
        </Table>
      )}
    </div>
  );
}
