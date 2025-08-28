'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  RefreshCw, 
  ExternalLink, 
  Monitor, 
  Smartphone, 
  Tablet, 
  RotateCcw, 
  ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PreviewInfo } from '@/lib/preview-store';

interface PreviewProps {
  previews: PreviewInfo[];
  activePreviewIndex: number;
  onActivePreviewChange: (index: number) => void;
  // Optional to allow headerless/controlled mode
  showHeader?: boolean;
  currentPath?: string;
  selectedDevice?: keyof typeof DEVICE_SIZES;
  isLandscape?: boolean;
  reloadKey?: number;
}

const DEVICE_SIZES = {
  desktop: { name: 'Desktop', width: '100%', height: '100%', icon: Monitor },
  tablet: { name: 'Tablet', width: 768, height: 1024, icon: Tablet },
  mobile: { name: 'Mobile', width: 375, height: 667, icon: Smartphone },
};

export function Preview({ previews, activePreviewIndex, onActivePreviewChange, showHeader = true, currentPath, selectedDevice, isLandscape, reloadKey }: PreviewProps) {
  const [internalDevice, setInternalDevice] = useState<keyof typeof DEVICE_SIZES>('desktop');
  const [internalLandscape, setInternalLandscape] = useState(false);
  const [isPortDropdownOpen, setIsPortDropdownOpen] = useState(false);
  const [internalPath, setInternalPath] = useState('/');
  const [iframeUrl, setIframeUrl] = useState<string>('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const activePreview = previews[activePreviewIndex];

  const reloadPreview = useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  }, []);

  const openInNewTab = useCallback(() => {
    if (activePreview?.baseUrl) {
      // Simple approach matching bolt.diy exactly
      window.open(activePreview.baseUrl, '_blank');
    }
  }, [activePreview]);

  const handlePathChange = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const newPath = (e.target as HTMLInputElement).value;
      const normalizedPath = newPath.startsWith('/') ? newPath : '/' + newPath;
      setInternalPath(normalizedPath);
      
      if (activePreview) {
        setIframeUrl(activePreview.baseUrl + normalizedPath);
      }
    }
  }, [activePreview]);

  // Update iframe URL when active preview or path changes
  useEffect(() => {
    const path = (currentPath ?? internalPath) || '/';
    if (activePreview) {
      const newUrl = activePreview.baseUrl + path;
      setIframeUrl(newUrl);
    }
  }, [activePreview, currentPath, internalPath]);

  // React to external reload requests
  useEffect(() => {
    if (reloadKey != null) {
      reloadPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const effectiveDevice = selectedDevice ?? internalDevice;
  const effectiveLandscape = isLandscape ?? internalLandscape;

  const getIframeStyles = useCallback(() => {
    if (effectiveDevice === 'desktop') {
      return { width: '100%', height: '100%' };
    }

    const device = DEVICE_SIZES[effectiveDevice];
    const width = effectiveLandscape ? device.height : device.width;
    const height = effectiveLandscape ? device.width : device.height;

    return { 
      width: `${width}px`, 
      height: `${height}px`,
      maxWidth: '100%',
      maxHeight: '100%'
    };
  }, [effectiveDevice, effectiveLandscape]);


  if (!activePreview) {
    return (
      <div className="h-full flex items-center justify-center bg-surface text-muted rounded-xl border border-border">
        <div className="text-center">
          <div className="text-4xl mb-4">🚀</div>
          <h3 className="text-lg font-medium mb-2">No Preview Available</h3>
          <p className="text-sm">Start a development server to see a live preview</p>
          {/* <p className="text-xs mt-2 text-muted">
            Try running: <code className="bg-elevated px-1 rounded border border-border">pnpm dev</code>
          </p> */}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-surface rounded-xl border border-border">
      {/* Preview Header (optional) */}
      {showHeader && (
      <div className="flex items-center gap-2 p-3 border-b border-border">
        {/* Controls */}
        <Button
          variant="ghost"
          size="sm"
          onClick={reloadPreview}
          className="text-muted hover:text-fg"
        >
          <RefreshCw size={16} />
        </Button>

        {/* Port Selector */}
        {previews.length > 1 && (
          <div className="relative">
            <button
              onClick={() => setIsPortDropdownOpen(!isPortDropdownOpen)}
              className="flex items-center gap-1 px-2 py-1 bg-elevated hover:bg-elevated/80 rounded text-sm text-muted border border-border"
            >
              <span>:{activePreview.port}</span>
              <ChevronDown size={14} />
            </button>
            
            {isPortDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 bg-elevated border border-border rounded shadow-lg z-50">
                {previews.map((preview, index) => (
                  <button
                    key={preview.port}
                    onClick={() => {
                      onActivePreviewChange(index);
                      setIsPortDropdownOpen(false);
                    }}
                    className={cn(
                      "block w-full px-3 py-2 text-left text-sm hover:bg-soft",
                      index === activePreviewIndex ? "text-accent" : "text-muted"
                    )}
                  >
                    Port {preview.port}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* URL Bar */}
        <div className="flex-1 flex items-center bg-elevated rounded px-3 py-1 border border-border">
          <span className="text-muted text-sm mr-2">{activePreview.baseUrl}</span>
          <input
            type="text"
            defaultValue={internalPath}
            onKeyDown={handlePathChange}
            placeholder="/"
            className="flex-1 bg-transparent text-fg text-sm outline-none"
          />
        </div>

        {/* Device Controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setInternalDevice('desktop')}
            className={cn(
              "text-muted hover:text-fg",
              internalDevice === 'desktop' && "text-accent"
            )}
            title="Desktop View"
          >
            <Monitor size={16} />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setInternalDevice('tablet')}
            className={cn(
              "text-muted hover:text-fg",
              internalDevice === 'tablet' && "text-accent"
            )}
            title="Tablet View"
          >
            <Tablet size={16} />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setInternalDevice('mobile')}
            className={cn(
              "text-muted hover:text-fg",
              internalDevice === 'mobile' && "text-accent"
            )}
            title="Mobile View"
          >
            <Smartphone size={16} />
          </Button>

          {internalDevice !== 'desktop' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setInternalLandscape(!internalLandscape)}
              className="text-muted hover:text-fg"
              title="Rotate Device"
            >
              <RotateCcw size={16} />
            </Button>
          )}
        </div>

        {/* External Link */}
        <Button
          variant="ghost"
          size="sm"
          onClick={openInNewTab}
          className="text-muted hover:text-fg"
          title="Open in New Tab"
        >
          <ExternalLink size={16} />
        </Button>
      </div>
      )}

      {/* Preview Content */}
      <div className="flex-1 flex items-center justify-center overflow-auto">
        <div 
          className={cn(
            "bg-surface overflow-hidden rounded-xl",
            (selectedDevice ?? internalDevice) !== 'desktop' && ""
          )}
          style={getIframeStyles()}
        >
          <iframe
            ref={iframeRef}
            src={iframeUrl || undefined}
            className="w-full h-full border-none"
            title="Preview"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-storage-access-by-user-activation"
            allow="cross-origin-isolated"
          />
        </div>
      </div>

      {/* Device Info */}
      {(selectedDevice ?? internalDevice) !== 'desktop' && (
        <div className="px-4 py-2 bg-soft border-t border-border text-center text-xs text-muted">
          {DEVICE_SIZES[selectedDevice ?? internalDevice].name} • {(isLandscape ?? internalLandscape) ? 'Landscape' : 'Portrait'} • {
            (isLandscape ?? internalLandscape) ? 
            `${DEVICE_SIZES[selectedDevice ?? internalDevice].height} × ${DEVICE_SIZES[selectedDevice ?? internalDevice].width}` :
            `${DEVICE_SIZES[selectedDevice ?? internalDevice].width} × ${DEVICE_SIZES[selectedDevice ?? internalDevice].height}`
          }
        </div>
      )}
    </div>
  );
}
