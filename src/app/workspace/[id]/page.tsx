'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { Workspace } from '@/components/workspace';

export default function WorkspacePage() {
  const params = useParams();
  const search = useSearchParams();
  const projectId = params.id as string;
  const initialPrompt = search.get('prompt') ?? undefined;

  return <Workspace projectId={projectId} initialPrompt={initialPrompt} />;
}
