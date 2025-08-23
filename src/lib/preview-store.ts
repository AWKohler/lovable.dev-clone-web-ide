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

  setWebContainer(container: WebContainer) {
    this.webcontainer = container;
    this.initializeListeners();
  }

  private initializeListeners() {
    if (!this.webcontainer) return;

    // Listen for server ready events
    this.webcontainer.on('server-ready', (port, url) => {
      console.log('[Preview] Server ready on port:', port, url);
      this.updatePreview(port, url, true);
    });

    // Listen for port events
    this.webcontainer.on('port', (port, type, url) => {
      console.log('[Preview] Port event:', { port, type, url });
      
      if (type === 'close') {
        this.removePreview(port);
        return;
      }

      this.updatePreview(port, url, type === 'open');
    });
  }

  private updatePreview(port: number, url: string, ready: boolean) {
    const previewInfo: PreviewInfo = { port, ready, baseUrl: url };
    this.availablePreviews.set(port, previewInfo);
    this.notifyListeners();
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