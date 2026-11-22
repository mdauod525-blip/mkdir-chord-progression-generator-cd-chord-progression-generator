'use client';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { PropertyForm } from '@/components/PropertyForm';

export default function NewProperty() {
  const router = useRouter();
  return (
    <div className="max-w-5xl">
      <PageHeader title="Add property" sub="Manual entry for opportunities from agents, wholesalers, auctions or your own sourcing." />
      <PropertyForm staff onCreated={(id) => router.push(`/properties/${id}`)} />
    </div>
  );
}
