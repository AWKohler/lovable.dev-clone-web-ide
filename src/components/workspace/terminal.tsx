'use client';

import { useEffect, useRef, useState } from 'react';
import { WebContainer } from '@webcontainer/api';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  webcontainer: WebContainer | null;
}

export function Terminal({ webcontainer }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm.js
    const terminal = new XTerm({
      theme: {
        background: getComputedStyle(document.documentElement).getPropertyValue('--sand-elevated').trim() || '#2b2722',
        foreground: getComputedStyle(document.documentElement).getPropertyValue('--sand-text').trim() || '#ede6db',
        cursor: '#c07a4c',
        selectionBackground: '#c07a4c40',
      },
      fontSize: 14,
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
      cursorBlink: true,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Resize handler
    const handleResize = () => {
      fitAddon.fit();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      terminal.dispose();
    };
  }, []);

  useEffect(() => {
    if (!webcontainer || !xtermRef.current || isReady) return;

    const initializeTerminal = async () => {
      try {
        const terminal = xtermRef.current!;
        
        // Spawn shell process
        const shellProcess = await webcontainer.spawn('jsh', {
          terminal: {
            cols: terminal.cols,
            rows: terminal.rows,
          },
        });

        // Connect terminal output
        shellProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              terminal.write(data);
            },
          })
        );

        // Connect terminal input
        const input = shellProcess.input.getWriter();
        terminal.onData((data) => {
          input.write(data);
        });

        // Handle terminal resize
        terminal.onResize(({ cols, rows }) => {
          shellProcess.resize({ cols, rows });
        });

        // Initial welcome message
        terminal.writeln('Welcome to WebContainer Terminal!');
        terminal.writeln('You can run Node.js, pnpm, and other commands here.');
        terminal.writeln('');

        setIsReady(true);
      } catch (error) {
        console.error('Failed to initialize terminal:', error);
        if (xtermRef.current) {
          xtermRef.current.writeln('Failed to initialize terminal');
        }
      }
    };

    initializeTerminal();
  }, [webcontainer, isReady]);

  // Fit terminal when container size changes
  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className="h-full flex flex-col bg-elevated">
      <div className="h-8 bg-soft border-b border-border flex items-center px-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-400"></div>
          <div className="w-3 h-3 rounded-full bg-amber-400"></div>
          <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
        </div>
        <span className="ml-4 text-sm text-muted">Terminal</span>
      </div>
      <div
        ref={terminalRef}
        className="flex-1 p-2"
        style={{ minHeight: 0 }}
      />
    </div>
  );
}
