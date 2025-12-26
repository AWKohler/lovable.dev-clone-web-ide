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
  // Dev server control
  isDevServerRunning?: boolean;
  isInstalling?: boolean;
  isStartingServer?: boolean;
  onToggleDevServer?: () => void;
  platform?: 'web' | 'mobile';
  expUrl?: string | null;
}

const DEVICE_SIZES = {
  desktop: { name: 'Desktop', width: '100%', height: '100%', icon: Monitor },
  tablet: { name: 'Tablet', width: 768, height: 1024, icon: Tablet },
  mobile: { name: 'Mobile', width: 375, height: 667, icon: Smartphone },
};

export function Preview({ previews, activePreviewIndex, onActivePreviewChange, showHeader = true, currentPath, selectedDevice, isLandscape, reloadKey, isDevServerRunning, isInstalling, isStartingServer, onToggleDevServer, platform = 'web', expUrl }: PreviewProps) {
  const [internalDevice, setInternalDevice] = useState<keyof typeof DEVICE_SIZES>('desktop');
  const [internalLandscape, setInternalLandscape] = useState(false);
  const [isPortDropdownOpen, setIsPortDropdownOpen] = useState(false);
  const [internalPath, setInternalPath] = useState('/');
  const [iframeUrl, setIframeUrl] = useState<string>('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Scale device SVG to fit container height
  const deviceContainerRef = useRef<HTMLDivElement>(null);
  const deviceOuterRef = useRef<HTMLDivElement>(null);
  const [deviceScale, setDeviceScale] = useState(1);
  const [fitMode, setFitMode] = useState<'height' | 'width'>('height');
  const [zoom, setZoom] = useState(1);

  const activePreview = previews[activePreviewIndex];

  const reloadPreview = useCallback(() => {
    if (iframeRef.current && iframeRef.current.src) {
      // Add cache-busting timestamp to force fresh reload
      const url = new URL(iframeRef.current.src);
      url.searchParams.set('_t', Date.now().toString());
      iframeRef.current.src = url.toString();
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
        // Add cache-busting to ensure fresh content
        const url = new URL(activePreview.baseUrl + normalizedPath);
        url.searchParams.set('_t', Date.now().toString());
        setIframeUrl(url.toString());
      }
    }
  }, [activePreview]);

  // Update iframe URL when active preview or path changes
  useEffect(() => {
    const path = (currentPath ?? internalPath) || '/';
    if (activePreview) {
      // Add cache-busting to prevent stale content from being displayed
      const url = new URL(activePreview.baseUrl + path);
      url.searchParams.set('_t', Date.now().toString());
      setIframeUrl(url.toString());
    }
  }, [activePreview, currentPath, internalPath]);

  // Auto-scale the device mockup to fit available height/width with padding
  useEffect(() => {
    const outer = deviceOuterRef.current;
    if (!outer) return;
    const ro = new ResizeObserver(() => {
      const h = outer.clientHeight;
      const w = outer.clientWidth;
      const targetH = 881;
      const targetW = 427;
      const padding = 36; // account for top/bottom bars and controls
      const base = fitMode === 'height' ? (h - padding) / targetH : (w - padding) / targetW;
      const comfort = base * 0.92 * zoom; // a touch smaller to avoid edge contact
      setDeviceScale(Math.max(0.2, Math.min(comfort, 2)));
    });
    ro.observe(outer);
    return () => ro.disconnect();
  }, [fitMode, zoom]);

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
        <div className="text-center max-w-md px-6">
          <div className="text-4xl mb-3">🚀</div>
          <h3 className="text-2xl font-semibold mb-2 text-fg tracking-tight">No Preview Yet</h3>
          <p className="text-md mb-4 tracking-normal">
            Start the development server to see your app here. We’ll open the first active port automatically and keep this preview in sync.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={onToggleDevServer}
              disabled={Boolean(isInstalling) || Boolean(isStartingServer)}
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-4',
                isDevServerRunning ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
              )}
            >
              {isInstalling || isStartingServer ? (
                <>
                  <span className="inline-flex h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>{isInstalling ? 'Installing…' : 'Starting…'}</span>
                </>
              ) : isDevServerRunning ? (
                <>
                  <span>Stop Dev Server</span>
                </>
              ) : (
                <>
                  <span>Start Dev Server</span>
                </>
              )}
            </Button>
          </div>
          <p className="text-xs mt-3 text-muted">Equivalent command: <code className="bg-elevated px-1 rounded border border-border">{platform === 'mobile' ? 'pnpm exec expo start --tunnel' : 'pnpm dev'}</code></p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-surface rounded-xl border border-border">
      {/* Preview Header (optional) */}
      {showHeader && platform === 'web' && (
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
      {platform === 'mobile' ? (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 p-3 overflow-hidden">
          {/* Left: QR code + Expo Go install guidance */}
          <div className="rounded-xl border border-border bg-elevated p-5 flex flex-col items-center justify-center min-h-[320px] gap-4">
            <div className="flex items-center gap-3">
              <img src="/ExpoIcon76x76.png" alt="Expo Go" width={44} height={44} className="rounded-[22%] shadow" />
              <div className="flex flex-col">
                <div className="text-sm font-semibold text-fg">Expo Go</div>
                <div className="text-xs text-muted">Install the app to open the QR</div>
              </div>
            </div>

            {!expUrl ? (
              <div className="text-center text-sm text-muted">Start the server to generate an Expo URL</div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(expUrl)}`}
                  alt="Expo Go QR"
                  className="rounded bg-white p-2 border border-border"
                  width={220}
                  height={220}
                />
                <div className="text-xs text-muted break-all max-w-[260px] text-center">{expUrl}</div>
              </div>
            )}

            <div className="flex items-center gap-2 mt-1">
              <a
                href="https://apps.apple.com/us/app/expo-go/id982107779"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 rounded-full border border-border bg-white hover:bg-neutral-50 transition text-neutral-800"
                title="Download on the App Store"
              >
                App Store
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=host.exp.exponent&hl=en_US&pli=1"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 rounded-full border border-border bg-white hover:bg-neutral-50 transition text-neutral-800"
                title="Get it on Google Play"
              >
                Google Play
              </a>
            </div>
          </div>
          {/* Right: iPhone 15 SVG mockup with embedded iframe (auto-scale to fit) */}
          <div className="relative flex items-center justify-center overflow-hidden">
            {/* Controls overlay */}
            <div className="absolute top-2 right-2 z-10 bg-elevated/90 backdrop-blur-sm border border-border rounded-full px-2 py-1 flex items-center gap-2">
              <button
                className={cn('text-xs px-2 py-0.5 rounded-full', fitMode === 'height' ? 'bg-accent text-accent-foreground' : 'text-muted hover:text-fg')}
                onClick={() => setFitMode('height')}
                title="Fit to height"
              >
                H
              </button>
              <button
                className={cn('text-xs px-2 py-0.5 rounded-full', fitMode === 'width' ? 'bg-accent text-accent-foreground' : 'text-muted hover:text-fg')}
                onClick={() => setFitMode('width')}
                title="Fit to width"
              >
                W
              </button>
              <input
                type="range"
                min={0.8}
                max={1.2}
                step={0.02}
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-24"
                title="Zoom"
              />
            </div>
            <div ref={deviceOuterRef} className="w-full h-full flex items-center justify-center mt-52">
              <div
                ref={deviceContainerRef}
                className="relative"
                style={{ width: 427, height: 881, transform: `scale(${deviceScale})`, transformOrigin: 'top center' }}

                dangerouslySetInnerHTML={{
                  __html: `
<svg width="393" height="852" viewBox="0 0 427 881" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full" filter="url(#shadow)">
  <defs>
    <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="rgba(0,0,0,0.15)"></feDropShadow>
    </filter>
    <filter id="filter0_f_2905_1090" x="-0.166992" y="0.166504" width="427" height="880.667" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood>
      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend>
      <feGaussianBlur stdDeviation="0.5" result="effect1_foregroundBlur_2905_1090"></feGaussianBlur>
    </filter>
    <filter id="filter1_f_2905_1090" x="6.33236" y="6.33382" width="414" height="868" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood>
      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend>
      <feGaussianBlur stdDeviation="0.333333" result="effect1_foregroundBlur_2905_1090"></feGaussianBlur>
    </filter>
    <filter id="filter2_f_2905_1090" x="244.143" y="44.0955" width="6.19085" height="11.143" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood>
      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend>
      <feGaussianBlur stdDeviation="0.928572" result="effect1_foregroundBlur_2905_1090"></feGaussianBlur>
    </filter>
    <filter id="filter3_f_2905_1090" x="244.762" y="45.8098" width="4.95257" height="7.71429" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood>
      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend>
      <feGaussianBlur stdDeviation="0.928572" result="effect1_foregroundBlur_2905_1090"></feGaussianBlur>
    </filter>
    <filter id="filter4_f_2905_1090" x="245.808" y="45.7839" width="3.86682" height="6.88293" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood>
      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend>
      <feGaussianBlur stdDeviation="0.619048" result="effect1_foregroundBlur_2905_1090"></feGaussianBlur>
    </filter>
    <filter id="filter5_f_2905_1090" x="250.332" y="44.0955" width="6.19085" height="11.143" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood>
      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend>
      <feGaussianBlur stdDeviation="0.928572" result="effect1_foregroundBlur_2905_1090"></feGaussianBlur>
    </filter>
    <filter id="filter6_f_2905_1090" x="250.951" y="45.8098" width="4.95257" height="7.71429" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood>
      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend>
      <feGaussianBlur stdDeviation="0.928572" result="effect1_foregroundBlur_2905_1090"></feGaussianBlur>
    </filter>
    <filter id="filter7_f_2905_1090" x="250.991" y="45.7839" width="3.86682" height="6.88293" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood>
      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend>
      <feGaussianBlur stdDeviation="0.619048" result="effect1_foregroundBlur_2905_1090"></feGaussianBlur>
    </filter>
    <filter id="filter8_f_2905_1090" x="169.666" y="42.6468" width="7.80012" height="14.0399" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood>
      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend>
      <feGaussianBlur stdDeviation="1.17" result="effect1_foregroundBlur_2905_1090"></feGaussianBlur>
    </filter>
    <filter id="filter9_f_2905_1090" x="170.446" y="44.807" width="6.23957" height="9.72004" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood>
      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend>
      <feGaussianBlur stdDeviation="1.17" result="effect1_foregroundBlur_2905_1090"></feGaussianBlur>
    </filter>
    <filter id="filter10_f_2905_1090" x="171.276" y="45.5545" width="3.31098" height="7.11225" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood>
      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend>
      <feGaussianBlur stdDeviation="0.39" result="effect1_foregroundBlur_2905_1090"></feGaussianBlur>
    </filter>
    <filter id="filter11_f_2905_1090" x="161.865" y="42.6468" width="7.80012" height="14.0399" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood>
      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend>
      <feGaussianBlur stdDeviation="1.17" result="effect1_foregroundBlur_2905_1090"></feGaussianBlur>
    </filter>
    <filter id="filter12_f_2905_1090" x="162.645" y="44.807" width="6.23957" height="9.72004" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood>
      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend>
      <feGaussianBlur stdDeviation="1.17" result="effect1_foregroundBlur_2905_1090"></feGaussianBlur>
    </filter>
    <filter id="filter13_f_2905_1090" x="164.744" y="45.5545" width="3.31098" height="7.11225" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood>
      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend>
      <feGaussianBlur stdDeviation="0.39" result="effect1_foregroundBlur_2905_1090"></feGaussianBlur>
    </filter>
    <clipPath id="clip0_2905_1090"><rect width="426.667" height="880.667" rx="70" fill="white"></rect></clipPath>
    <clipPath id="clip1_2905_1090"><rect x="18" y="18" width="390" height="844" rx="55" fill="white"></rect></clipPath>
  </defs>
  <g clip-path="url(#clip0_2905_1090)">
    <rect width="426.667" height="880.667" rx="70" fill="black"></rect>
    <rect x="3.83268" y="3.83366" width="419" height="873" rx="66.1667" class="stroke-[#dcdcdf] dark:stroke-[#454548]" stroke-width="4.33333"></rect>
    <rect x="0.833333" y="0.833333" width="425" height="879" rx="69.1667" class="stroke-[#c1c2c4] dark:stroke-[#37373a]" stroke-width="1.66667"></rect>
    <g opacity="0.9" filter="url(#filter0_f_2905_1090)"><rect x="1.66602" y="2" width="423.333" height="877" rx="68.6667" class="stroke-[#b2b2b9] dark:stroke-[#454548]" stroke-width="1.66667"></rect></g>
    <g opacity="0.8" filter="url(#filter1_f_2905_1090)"><rect x="7.33268" y="7.33366" width="412" height="866" rx="62.6667" stroke="#646464" stroke-width="0.666667"></rect></g>
    <rect x="18" y="18" width="390" height="844" rx="55" fill="#ffffff" clip-path="url(#clip1_2905_1090)"></rect>
    <foreignObject x="18" y="18" width="390" height="844">
      <div class="size-full overflow-hidden rounded-[55.75px] object-contain" style="transform-origin: center center; background:#ffffff; padding-top:62px; padding-bottom:34px;">
        <div class="w-full h-full relative overflow-hidden">
          <iframe src="${iframeUrl || ''}" class="border-0 w-full select-none h-full" allow="geolocation; camera; microphone" style="opacity: 1;"></iframe>
          <div class="flex flex-col absolute inset-0 z-[3] pointer-events-none" style="transform-origin: center center;"></div>
        </div>
      </div>
    </foreignObject>
    <rect width="139" height="5" rx="2.5" transform="matrix(-1 0 0 1 284 849)" class="fill-[black] dark:fill-[#ffffffa2]"></rect>
    <path d="M73.7471 43.5257C76.5938 43.5257 78.966 45.522 78.966 50.0516V50.0695C78.966 54.3395 76.9876 56.8908 73.6934 56.8908C71.3032 56.8908 69.5129 55.5122 69.11 53.5607L69.0921 53.4622H71.3838L71.4106 53.5428C71.7598 54.429 72.5475 55.002 73.7023 55.002C75.7791 55.002 76.6475 53.0146 76.737 50.5708C76.7459 50.4365 76.7549 50.3022 76.7549 50.159H76.7012C76.1909 51.3407 74.9019 52.2358 73.1563 52.2358C70.6676 52.2358 68.9131 50.4455 68.9131 48.0195V48.0016C68.9131 45.3966 70.9631 43.5257 73.7471 43.5257ZM73.7471 50.4544C75.2241 50.4544 76.3521 49.416 76.3521 47.9748V47.9658C76.3521 46.5335 75.2241 45.4146 73.7739 45.4146C72.3416 45.4146 71.1868 46.5246 71.1868 47.9211V47.939C71.1868 49.4071 72.279 50.4544 73.7471 50.4544ZM81.8485 48.2165C81.1234 48.2165 80.5505 47.6436 80.5505 46.9185C80.5505 46.1934 81.1234 45.6294 81.8485 45.6294C82.5736 45.6294 83.1375 46.1934 83.1375 46.9185C83.1375 47.6436 82.5736 48.2165 81.8485 48.2165ZM81.8485 54.7871C81.1234 54.7871 80.5505 54.2142 80.5505 53.4891C80.5505 52.764 81.1234 52.2 81.8485 52.2C82.5736 52.2 83.1375 52.764 83.1375 53.4891C83.1375 54.2142 82.5736 54.7871 81.8485 54.7871ZM91.0778 56.667V54.1873H84.6325V52.2179L89.9946 43.7495H93.2799V52.2896H95.0345V54.1873H93.2799V56.667H91.0778ZM86.7093 52.3433H91.1136V45.4951H91.0599L86.7093 52.2806V52.3433ZM99.7163 56.667V45.9517H99.6626L96.3236 48.2433V46.1217L99.6984 43.7495H101.981V56.667H99.7163Z" class="fill-[black] dark:fill-[white]"></path>
    <g opacity="0.9"><rect x="297.333" y="50" width="3.33333" height="4" rx="0.333333" class="fill-[black] dark:fill-[white]"></rect><rect x="302" y="48" width="3.33333" height="6" rx="0.333333" class="fill-[black] dark:fill-[white]"></rect><rect x="307" y="45.667" width="3.33333" height="8.33333" rx="0.333333" class="fill-[black] dark:fill-[white]"></rect><rect x="311.666" y="43" width="3.33333" height="11" rx="0.333333" class="fill-[black] dark:fill-[white]"></rect></g>
    <g opacity="0.9"><path d="M341.382 45.8776C339.208 43.6888 336.196 42.3335 332.867 42.3335C329.528 42.3335 326.508 43.6969 324.333 45.8974L326.219 47.7831C327.911 46.0652 330.265 45.0002 332.867 45.0002C335.459 45.0002 337.805 46.057 339.496 47.7633L341.382 45.8776Z" class="fill-[black] dark:fill-[white]"></path><path d="M338.318 48.9418C336.928 47.5371 334.999 46.6668 332.867 46.6668C330.725 46.6668 328.788 47.5453 327.397 48.9616L329.283 50.8474C330.191 49.9136 331.462 49.3335 332.867 49.3335C334.263 49.3335 335.525 49.9053 336.432 50.8275L338.318 48.9418Z" class="fill-[black] dark:fill-[white]"></path><path d="M335.253 52.006C334.648 51.3855 333.803 51.0002 332.867 51.0002C331.922 51.0002 331.068 51.3938 330.462 52.0261L332.847 54.412L335.253 52.006Z" class="fill-[black] dark:fill-[white]"></path></g>
    <rect opacity="0.6" x="351.166" y="43.167" width="22.3333" height="10.6667" rx="2.16667" class="stroke-[black] dark:stroke-[white]"></rect>
    <rect opacity="0.9" x="352.333" y="44.3335" width="20" height="8.33333" rx="1.33333" class="fill-[black] dark:fill-[white]"></rect>
    <path opacity="0.6" d="M374.666 47V47C375.402 47 375.999 47.597 375.999 48.3333V48.6667C375.999 49.403 375.402 50 374.666 50V50V47Z" class="fill-[black] dark:fill-[white]"></path>
    <rect x="151.666" y="31.667" width="123.333" height="36" rx="18" fill="black"></rect>
  </g>
  </svg>`,
                }}
              />
            </div>
          </div>
        </div>
      ) : (
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
      )}

      {/* Device Info */}
      {platform === 'web' && (selectedDevice ?? internalDevice) !== 'desktop' && (
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
