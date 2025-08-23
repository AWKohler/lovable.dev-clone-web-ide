'use client';

import { useParams } from 'next/navigation';
import { Workspace } from '@/components/workspace';

export default function WorkspacePage() {
  const params = useParams();
  const projectId = params.id as string;

  return <Workspace projectId={projectId} />;
}