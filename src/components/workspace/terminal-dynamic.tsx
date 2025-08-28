'use client';

import dynamic from 'next/dynamic';
import { ComponentProps } from 'react';

const Terminal = dynamic(() => import('./terminal').then(mod => ({ default: mod.Terminal })), {
  ssr: false,
  loading: () => (
    <div className="h-full flex flex-col bg-elevated">
      <div className="h-8 bg-soft border-b border-border flex items-center px-3">
        {/* <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-400"></div>
          <div className="w-3 h-3 rounded-full bg-amber-400"></div>
          <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
        </div> */}
        <span className="ml-4 text-sm text-muted">Termina</span>
      </div>
      <div className="flex-1 flex items-center justify-center text-muted">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-muted border-t-transparent rounded-full animate-spin"></div>
          Loading terminal...
        </div>
      </div>
    </div>
  ),
});

export function TerminalDynamic(props: ComponentProps<typeof Terminal>) {
  return <Terminal {...props} />;
}
