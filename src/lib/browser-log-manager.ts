/**
 * BrowserLogManager - Captures and stores browser console logs from the preview iframe
 * Similar to DevServerManager but for browser-side logs
 */

export interface BrowserLogEntry {
  timestamp: number;
  level: 'log' | 'warn' | 'error';
  message: string;
  type: 'console' | 'error' | 'hmr';
}

class BrowserLogManagerImpl {
  private logs: BrowserLogEntry[] = [];
  private readonly MAX_LOGS = 2000; // Keep last 2000 log entries
  private listeners: Set<(entry: BrowserLogEntry) => void> = new Set();

  /**
   * Add a log entry to the buffer
   */
  addLog(entry: Omit<BrowserLogEntry, 'timestamp'>) {
    const fullEntry: BrowserLogEntry = {
      ...entry,
      timestamp: Date.now(),
    };

    this.logs.push(fullEntry);

    // Trim to max size (keep most recent)
    if (this.logs.length > this.MAX_LOGS) {
      this.logs = this.logs.slice(-this.MAX_LOGS);
    }

    // Notify listeners
    this.listeners.forEach(listener => {
      try {
        listener(fullEntry);
      } catch (err) {
        console.error('BrowserLogManager: Error in listener', err);
      }
    });
  }

  /**
   * Add a console log entry
   */
  addConsoleLog(level: 'log' | 'warn' | 'error', message: string) {
    this.addLog({ level, message, type: 'console' });
  }

  /**
   * Add an error entry
   */
  addError(message: string) {
    this.addLog({ level: 'error', message, type: 'error' });
  }

  /**
   * Add an HMR event entry
   */
  addHMREvent(event: string, error?: string) {
    const message = error ? `${event}: ${error}` : event;
    this.addLog({
      level: event.includes('error') ? 'error' : 'log',
      message,
      type: 'hmr',
    });
  }

  /**
   * Get recent logs
   */
  getLogs(linesBack: number = 200): { ok: boolean; message: string; logs?: BrowserLogEntry[] } {
    if (!Number.isFinite(linesBack) || linesBack <= 0) linesBack = 200;
    const count = Math.min(this.logs.length, Math.floor(linesBack));

    if (count === 0) {
      return {
        ok: false,
        message: 'No browser logs available yet. The preview may not have loaded or generated any console output.',
      };
    }

    const recentLogs = this.logs.slice(-count);
    return {
      ok: true,
      message: `Retrieved ${count} browser log entries`,
      logs: recentLogs,
    };
  }

  /**
   * Format logs as a readable string
   */
  getLogsFormatted(linesBack: number = 200): string {
    const result = this.getLogs(linesBack);

    if (!result.ok || !result.logs) {
      return result.message;
    }

    const formatted = result.logs.map(entry => {
      const date = new Date(entry.timestamp);
      const time = date.toLocaleTimeString();
      const icon = entry.level === 'error' ? '❌' :
                   entry.level === 'warn' ? '⚠️' : 'ℹ️';
      const typeLabel = entry.type === 'console' ? '' :
                        entry.type === 'error' ? '[Error] ' :
                        '[HMR] ';

      return `${time} ${icon} ${typeLabel}${entry.message}`;
    }).join('\n');

    return formatted;
  }

  /**
   * Get error-only logs
   */
  getErrors(linesBack: number = 100): BrowserLogEntry[] {
    const result = this.getLogs(linesBack);
    if (!result.ok || !result.logs) return [];

    return result.logs.filter(log => log.level === 'error');
  }

  /**
   * Check if there are any errors
   */
  hasErrors(): boolean {
    return this.logs.some(log => log.level === 'error');
  }

  /**
   * Clear all logs
   */
  clear() {
    this.logs = [];
  }

  /**
   * Subscribe to new log entries
   */
  subscribe(listener: (entry: BrowserLogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get summary statistics
   */
  getStats(): { total: number; errors: number; warnings: number; logs: number } {
    return {
      total: this.logs.length,
      errors: this.logs.filter(l => l.level === 'error').length,
      warnings: this.logs.filter(l => l.level === 'warn').length,
      logs: this.logs.filter(l => l.level === 'log').length,
    };
  }
}

// Singleton instance
const instance = new BrowserLogManagerImpl();

export const BrowserLogManager = instance;
