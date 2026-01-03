import { WebContainer } from '@webcontainer/api';

export interface PreviewInfo {
  port: number;
  ready: boolean;
  baseUrl: string;
}

export class PreviewStore {
  private availablePreviews = new Map<number, PreviewInfo>();
  private webcontainer: WebContainer | null = null;
  private listeners: ((previews: PreviewInfo[]) => void)[] = [];
  // Ensure we attach webcontainer event listeners only once
  private listenersBound = false;

  // Compile-time flag to control noisy debug logs in the browser
  private static readonly DEBUG = process.env.NEXT_PUBLIC_DEBUG_PREVIEW === '1';

  setWebContainer(container: WebContainer) {
    this.webcontainer = container;
    this.initializeListeners();
  }

  private initializeListeners() {
    if (!this.webcontainer) return;
    // Avoid attaching duplicate listeners across remounts/initializations
    if (this.listenersBound) return;

    // Listen for server ready events
    this.webcontainer.on('server-ready', (port: number, url: string) => {
      if (PreviewStore.DEBUG) {
        console.log('[Preview] Server ready on port:', port, url);
      }
      this.updatePreview(port, url, true);
    });

    // Listen for port events
    this.webcontainer.on('port', (port: number, type: 'open' | 'close', url?: string) => {
      if (PreviewStore.DEBUG) {
        console.log('[Preview] Port event:', { port, type, url });
      }

      if (type === 'close') {
        this.removePreview(port);
        return;
      }

      this.updatePreview(port, url as string, type === 'open');
    });

    this.listenersBound = true;
  }

  private updatePreview(port: number, url: string, ready: boolean) {
    const prev = this.availablePreviews.get(port);
    const next: PreviewInfo = { port, ready, baseUrl: url };
    // Dedupe updates to avoid unnecessary re-renders
    if (!prev || prev.ready !== next.ready || prev.baseUrl !== next.baseUrl) {
      this.availablePreviews.set(port, next);
      this.notifyListeners();
    }
  }

  private removePreview(port: number) {
    this.availablePreviews.delete(port);
    this.notifyListeners();
  }

  private notifyListeners() {
    const previews = Array.from(this.availablePreviews.values()).sort((a, b) => a.port - b.port);
    this.listeners.forEach(listener => listener(previews));
  }

  subscribe(listener: (previews: PreviewInfo[]) => void) {
    this.listeners.push(listener);
    
    // Immediately call with current state
    const previews = Array.from(this.availablePreviews.values()).sort((a, b) => a.port - b.port);
    listener(previews);

    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  getPreviews(): PreviewInfo[] {
    return Array.from(this.availablePreviews.values()).sort((a, b) => a.port - b.port);
  }
}

// Singleton instance
let previewStore: PreviewStore | null = null;

export function getPreviewStore(): PreviewStore {
  if (!previewStore) {
    previewStore = new PreviewStore();
  }
  return previewStore;
}
