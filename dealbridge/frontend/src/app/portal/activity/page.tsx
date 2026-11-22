'use client';
import Link from 'next/link';
import { useApi } from '@/lib/hooks';
import { date, label, usd } from '@/lib/format';
import { Badge, Empty, ErrorBox, PageHeader, Table, Td, Th } from '@/components/ui';

export default function Activity() {
  const { data, error } = useApi('/portal/activity');
  return (
    <div>
      <PageHeader title="My activity" sub="Opportunities you saved, asked about or expressed interest in." />
      <ErrorBox error={error} />
      {data?.interests.length === 0 && <Empty>No activity yet.</Empty>}
      {data?.interests.length > 0 && <Table><thead><tr><Th>Opportunity</Th><Th>Action</Th><Th>Indication</Th><Th>Opportunity status</Th><Th>Date</Th></tr></thead>
        <tbody>{data.interests.map((x: any) => <tr key={x.id}><Td><Link className="hover:text-accent" href={`/portal/opportunities/${x.opportunity_id}`}>{x.title}</Link></Td><Td><Badge>{label(x.kind)}</Badge></Td><Td className="tabular">{x.indicated_amount ? `${usd(x.indicated_amount)} (nonbinding)` : '—'}</Td><Td>{label(x.opportunity_status)}</Td><Td className="text-xs">{date(x.created_at)}</Td></tr>)}</tbody></Table>}
    </div>
  );
}
