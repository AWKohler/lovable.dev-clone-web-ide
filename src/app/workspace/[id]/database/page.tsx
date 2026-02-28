import { ConvexDashboard } from '@/components/convex/ConvexDashboard';

export default async function DatabasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="w-screen h-screen">
      <ConvexDashboard projectId={id} />
    </div>
  );
}
