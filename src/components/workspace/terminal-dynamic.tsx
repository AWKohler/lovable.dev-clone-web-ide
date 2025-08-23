'use client';

import dynamic from 'next/dynamic';
import { ComponentProps } from 'react';

const Terminal = dynamic(() => import('./terminal').then(mod => ({ default: mod.Terminal })), {
  ssr: false,
  loading: () => (
    <div className="h-full flex flex-col bg-slate-900">
      <div className="h-8 bg-slate-800 border-b border-slate-700 flex items-center px-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
        </div>
        <span className="ml-4 text-sm text-slate-400">Terminal</span>
      </div>
      <div className="flex-1 flex items-center justify-center text-slate-400">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
          Loading terminal...
        </div>
      </div>
    </div>
  ),
});

export function TerminalDynamic(props: ComponentProps<typeof Terminal>) {
  return <Terminal {...props} />;
}