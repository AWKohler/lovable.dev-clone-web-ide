'use client';

import { use, useEffect, useState, useRef, useCallback } from 'react';

interface Props {
  params: Promise<{ id: string }>;
}

const PREVIEW_CHANNEL = 'preview-updates';

export default function WebContainerPreview({ params }: Props) {
  const { id: previewId } = use(params);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Handle preview refresh
  const handleRefresh = useCallback(() => {
    if (iframeRef.current && previewUrl) {
      setIsLoading(true);
      // Force a clean reload
      iframeRef.current.src = '';
      requestAnimationFrame(() => {
        if (iframeRef.current) {
          iframeRef.current.src = previewUrl;
        }
      });
    }
  }, [previewUrl]);

  // Open in new tab
  const openInNewTab = useCallback(() => {
    if (previewUrl) {
      window.open(previewUrl, '_blank');
    }
  }, [previewUrl]);

  // Notify other tabs that this preview is ready
  const notifyPreviewReady = useCallback(() => {
    if (broadcastChannelRef.current && previewUrl) {
      broadcastChannelRef.current.postMessage({
        type: 'preview-ready',
        previewId,
        url: previewUrl,
        timestamp: Date.now(),
      });
    }
  }, [previewId, previewUrl]);

  useEffect(() => {
    // Initialize broadcast channel
    broadcastChannelRef.current = new BroadcastChannel(PREVIEW_CHANNEL);

    // Listen for preview updates
    broadcastChannelRef.current.onmessage = (event) => {
      if (event.data.previewId === previewId) {
        if (event.data.type === 'refresh-preview' || event.data.type === 'file-change') {
          handleRefresh();
        }
      }
    };

    // Construct the WebContainer preview URL
    const url = `https://${previewId}.local-credentialless.webcontainer-api.io`;
    setPreviewUrl(url);

    // Set the iframe src
    if (iframeRef.current) {
      iframeRef.current.src = url;
    }

    // Notify other tabs that this preview is ready
    notifyPreviewReady();

    // Cleanup
    return () => {
      broadcastChannelRef.current?.close();
    };
  }, [previewId, handleRefresh, notifyPreviewReady]);

  const hideLoading = useCallback(() => {
    setIsLoading(false);
    notifyPreviewReady();
  }, [notifyPreviewReady]);

  const showError = useCallback(() => {
    setIsLoading(false);
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', margin: 0, padding: 0, fontFamily: 'system-ui' }}>
      {/* Header */}
      <div style={{
        height: '50px',
        background: '#1e293b',
        borderBottom: '1px solid #334155',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        color: '#e2e8f0'
      }}>
        <div style={{ fontSize: '14px', fontWeight: '500' }}>WebContainer Preview</div>
        <div style={{
          flex: 1,
          maxWidth: '600px',
          margin: '0 20px',
          background: '#334155',
          border: '1px solid #475569',
          borderRadius: '6px',
          padding: '8px 12px',
          color: '#e2e8f0',
          fontSize: '14px'
        }}>
          {previewUrl}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleRefresh}
            style={{
              background: '#374151',
              border: '1px solid #4b5563',
              borderRadius: '6px',
              padding: '6px 12px',
              color: '#e2e8f0',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            ↻ Refresh
          </button>
          <button
            onClick={openInNewTab}
            style={{
              background: '#374151',
              border: '1px solid #4b5563',
              borderRadius: '6px',
              padding: '6px 12px',
              color: '#e2e8f0',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            ↗ New Tab
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ 
        height: 'calc(100vh - 50px)', 
        width: '100%', 
        position: 'relative',
        background: '#0f172a'
      }}>
        {isLoading && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            zIndex: 10,
            color: '#e2e8f0'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '3px solid #334155',
              borderTop: '3px solid #3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 20px'
            }}></div>
            <h3>Loading Preview</h3>
            <p>Starting development server...</p>
          </div>
        )}
        
        <iframe
          ref={iframeRef}
          title="WebContainer Preview"
          style={{ 
            width: '100%', 
            height: '100%', 
            border: 'none',
            background: 'white'
          }}
          sandbox="allow-scripts allow-forms allow-popups allow-modals allow-storage-access-by-user-activation allow-same-origin"
          allow="cross-origin-isolated"
          onLoad={hideLoading}
          onError={showError}
        />
      </div>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        button:hover {
          background: #4b5563 !important;
        }
      `}</style>
    </div>
  );
}