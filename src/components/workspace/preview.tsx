'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { 
  RefreshCw, 
  ExternalLink, 
  Monitor, 
  Smartphone, 
  Tablet, 
  RotateCcw, 
  ChevronDown,
  Maximize
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PreviewInfo } from '@/lib/preview-store';

interface PreviewProps {
  previews: PreviewInfo[];
  activePreviewIndex: number;
  onActivePreviewChange: (index: number) => void;
}

const DEVICE_SIZES = {
  desktop: { name: 'Desktop', width: '100%', height: '100%', icon: Monitor },
  tablet: { name: 'Tablet', width: 768, height: 1024, icon: Tablet },
  mobile: { name: 'Mobile', width: 375, height: 667, icon: Smartphone },
};

export function Preview({ previews, activePreviewIndex, onActivePreviewChange }: PreviewProps) {
  const [selectedDevice, setSelectedDevice] = useState<keyof typeof DEVICE_SIZES>('desktop');
  const [isLandscape, setIsLandscape] = useState(false);
  const [isPortDropdownOpen, setIsPortDropdownOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState('/');
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
      // Extract the preview ID from the WebContainer URL
      const match = activePreview.baseUrl.match(/^https?:\/\/([^.]+)\.local-credentialless\.webcontainer-api\.io/);
      
      if (match) {
        // Open directly to the WebContainer URL with current path
        const fullUrl = currentPath === '/' ? activePreview.baseUrl : activePreview.baseUrl + currentPath;
        
        // Create a new window with specific parameters to avoid the editor connection issue
        const newWindow = window.open(
          fullUrl,
          '_blank',
          'menubar=no,toolbar=no,location=yes,status=no,scrollbars=yes,resizable=yes,width=1280,height=720'
        );
        
        if (newWindow) {
          newWindow.focus();
        }
      } else {
        console.warn('Invalid WebContainer URL:', activePreview.baseUrl);
      }
    }
  }, [activePreview, currentPath]);

  const handlePathChange = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const newPath = (e.target as HTMLInputElement).value;
      const normalizedPath = newPath.startsWith('/') ? newPath : '/' + newPath;
      setCurrentPath(normalizedPath);
      
      if (activePreview) {
        setIframeUrl(activePreview.baseUrl + normalizedPath);
      }
    }
  }, [activePreview]);

  // Update iframe URL when active preview or path changes
  React.useEffect(() => {
    if (activePreview) {
      const newUrl = activePreview.baseUrl + currentPath;
      setIframeUrl(newUrl);
    }
  }, [activePreview, currentPath]);

  const getIframeStyles = useCallback(() => {
    if (selectedDevice === 'desktop') {
      return { width: '100%', height: '100%' };
    }

    const device = DEVICE_SIZES[selectedDevice];
    const width = isLandscape ? device.height : device.width;
    const height = isLandscape ? device.width : device.height;

    return { 
      width: `${width}px`, 
      height: `${height}px`,
      maxWidth: '100%',
      maxHeight: '100%'
    };
  }, [selectedDevice, isLandscape]);

  const DeviceIcon = DEVICE_SIZES[selectedDevice].icon;

  if (!activePreview) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-900 text-slate-400">
        <div className="text-center">
          <div className="text-4xl mb-4">🚀</div>
          <h3 className="text-lg font-medium mb-2">No Preview Available</h3>
          <p className="text-sm">Start a development server to see a live preview</p>
          <p className="text-xs mt-2 text-slate-500">
            Try running: <code className="bg-slate-800 px-1 rounded">npm run dev</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-900">
      {/* Preview Header */}
      <div className="flex items-center gap-2 p-3 bg-slate-800 border-b border-slate-700">
        {/* Controls */}
        <Button
          variant="ghost"
          size="sm"
          onClick={reloadPreview}
          className="text-slate-400 hover:text-white"
        >
          <RefreshCw size={16} />
        </Button>

        {/* Port Selector */}
        {previews.length > 1 && (
          <div className="relative">
            <button
              onClick={() => setIsPortDropdownOpen(!isPortDropdownOpen)}
              className="flex items-center gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-300"
            >
              <span>:{activePreview.port}</span>
              <ChevronDown size={14} />
            </button>
            
            {isPortDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 bg-slate-800 border border-slate-700 rounded shadow-lg z-50">
                {previews.map((preview, index) => (
                  <button
                    key={preview.port}
                    onClick={() => {
                      onActivePreviewChange(index);
                      setIsPortDropdownOpen(false);
                    }}
                    className={cn(
                      "block w-full px-3 py-2 text-left text-sm hover:bg-slate-700",
                      index === activePreviewIndex ? "text-blue-400" : "text-slate-300"
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
        <div className="flex-1 flex items-center bg-slate-700 rounded px-3 py-1">
          <span className="text-slate-400 text-sm mr-2">{activePreview.baseUrl}</span>
          <input
            type="text"
            defaultValue={currentPath}
            onKeyDown={handlePathChange}
            placeholder="/"
            className="flex-1 bg-transparent text-slate-200 text-sm outline-none"
          />
        </div>

        {/* Device Controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedDevice('desktop')}
            className={cn(
              "text-slate-400 hover:text-white",
              selectedDevice === 'desktop' && "text-blue-400"
            )}
            title="Desktop View"
          >
            <Monitor size={16} />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedDevice('tablet')}
            className={cn(
              "text-slate-400 hover:text-white",
              selectedDevice === 'tablet' && "text-blue-400"
            )}
            title="Tablet View"
          >
            <Tablet size={16} />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedDevice('mobile')}
            className={cn(
              "text-slate-400 hover:text-white",
              selectedDevice === 'mobile' && "text-blue-400"
            )}
            title="Mobile View"
          >
            <Smartphone size={16} />
          </Button>

          {selectedDevice !== 'desktop' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsLandscape(!isLandscape)}
              className="text-slate-400 hover:text-white"
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
          className="text-slate-400 hover:text-white"
          title="Open in New Tab"
        >
          <ExternalLink size={16} />
        </Button>
      </div>

      {/* Preview Content */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-auto bg-slate-900">
        <div 
          className={cn(
            "bg-white rounded-lg overflow-hidden shadow-2xl",
            selectedDevice !== 'desktop' && "border-8 border-slate-800"
          )}
          style={getIframeStyles()}
        >
          <iframe
            ref={iframeRef}
            src={iframeUrl}
            className="w-full h-full border-none"
            title="Preview"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-storage-access-by-user-activation"
            allow="cross-origin-isolated"
          />
        </div>
      </div>

      {/* Device Info */}
      {selectedDevice !== 'desktop' && (
        <div className="px-4 py-2 bg-slate-800 border-t border-slate-700 text-center text-xs text-slate-400">
          {DEVICE_SIZES[selectedDevice].name} • {isLandscape ? 'Landscape' : 'Portrait'} • {
            isLandscape ? 
            `${DEVICE_SIZES[selectedDevice].height} × ${DEVICE_SIZES[selectedDevice].width}` :
            `${DEVICE_SIZES[selectedDevice].width} × ${DEVICE_SIZES[selectedDevice].height}`
          }
        </div>
      )}
    </div>
  );
}