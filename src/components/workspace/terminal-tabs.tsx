'use client';

import { useState, useRef, useCallback } from 'react';
import { WebContainer } from '@webcontainer/api';
import { TerminalDynamic } from './terminal-dynamic';
import { Button } from '@/components/ui/button';
import { Plus, X, Terminal as TerminalIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TerminalTabsProps {
  webcontainer: WebContainer | null;
  className?: string;
}

const MAX_TERMINALS = 3;

export function TerminalTabs({ webcontainer, className }: TerminalTabsProps) {
  const [activeTerminal, setActiveTerminal] = useState(0);
  const [terminalCount, setTerminalCount] = useState(1);
  const terminalRefs = useRef<Array<any>>([]);

  const addTerminal = useCallback(() => {
    if (terminalCount < MAX_TERMINALS) {
      setTerminalCount(prev => prev + 1);
      setActiveTerminal(terminalCount);
    }
  }, [terminalCount]);

  const closeTerminal = useCallback((index: number) => {
    if (index === 0 || terminalCount === 1) {
      return; // Can't close the first terminal or the last terminal
    }

    setTerminalCount(prev => prev - 1);
    
    if (activeTerminal === index) {
      setActiveTerminal(Math.max(0, index - 1));
    } else if (activeTerminal > index) {
      setActiveTerminal(prev => prev - 1);
    }
  }, [activeTerminal, terminalCount]);

  return (
    <div className={cn("h-full flex flex-col bg-slate-900", className)}>
      {/* Terminal Tabs Header */}
      <div className="flex items-center bg-slate-800 border-b border-slate-700 px-2 py-1 gap-1">
        {Array.from({ length: terminalCount }, (_, index) => (
          <button
            key={index}
            onClick={() => setActiveTerminal(index)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-all",
              activeTerminal === index
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-700/50"
            )}
          >
            <TerminalIcon size={14} />
            Terminal {index > 0 ? index + 1 : ''}
            {index > 0 && terminalCount > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTerminal(index);
                }}
                className="text-slate-500 hover:text-red-400 p-0.5 rounded"
              >
                <X size={12} />
              </button>
            )}
          </button>
        ))}
        
        {terminalCount < MAX_TERMINALS && (
          <Button
            variant="ghost"
            size="sm"
            onClick={addTerminal}
            className="text-slate-400 hover:text-white h-auto py-1"
          >
            <Plus size={14} />
          </Button>
        )}
      </div>

      {/* Terminal Content */}
      <div className="flex-1 relative">
        {Array.from({ length: terminalCount }, (_, index) => (
          <div
            key={index}
            className={cn(
              "absolute inset-0",
              activeTerminal === index ? "block" : "hidden"
            )}
          >
            <TerminalDynamic 
              webcontainer={webcontainer}
              key={`terminal-${index}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}