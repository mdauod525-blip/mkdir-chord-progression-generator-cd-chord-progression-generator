'use client';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { InvestorForm } from '@/components/InvestorForm';

export default function NewInvestor() {
  const router = useRouter();
  return (
    <div className="max-w-5xl">
      <PageHeader title="Add investor" sub="Record real people and entities only, with their permission." />
      <InvestorForm mode="staff-create" onSaved={(r) => router.push(`/investors/${r.id}`)} />
    </div>
  );
}
