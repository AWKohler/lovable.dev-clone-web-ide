/**
 * Snapshot capture utilities for capturing project previews.
 *
 * Since WebContainer iframes are cross-origin, we use multiple strategies:
 * 1. For HTML: Fetch from the preview URL using client-side fetch
 * 2. For images: Use html2canvas to render a hidden container with the HTML
 */

import html2canvas from 'html2canvas';

export interface SnapshotResult {
  thumbnailBlob: Blob | null;
  htmlContent: string | null;
  error?: string;
}

/**
 * Fetches the HTML content from a preview URL.
 * This works because we're fetching from the client side where the WebContainer
 * server is accessible.
 */
export async function fetchPreviewHtml(previewUrl: string): Promise<string | null> {
  try {
    // Ensure we're fetching the root path
    const url = new URL(previewUrl);
    url.pathname = '/';

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'text/html',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch preview HTML:', response.status);
      return null;
    }

    const html = await response.text();
    return html;
  } catch (error) {
    console.error('Error fetching preview HTML:', error);
    return null;
  }
}

/**
 * Captures a screenshot of an iframe element.
 * Due to cross-origin restrictions, this uses html2canvas on the HTML content
 * rendered in a hidden container.
 */
export async function captureScreenshot(
  htmlContent: string,
  width: number = 1280,
  height: number = 720
): Promise<Blob | null> {
  try {
    // Create a hidden container to render the HTML
    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed;
      left: -9999px;
      top: -9999px;
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background: white;
    `;

    // Create an iframe to render the HTML with proper isolation
    const iframe = document.createElement('iframe');
    iframe.style.cssText = `
      width: ${width}px;
      height: ${height}px;
      border: none;
    `;
    iframe.sandbox.add('allow-same-origin');

    container.appendChild(iframe);
    document.body.appendChild(container);

    // Write the HTML content to the iframe
    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve();
      iframe.srcdoc = htmlContent;
    });

    // Wait a bit for styles and images to load
    await new Promise(resolve => setTimeout(resolve, 500));

    // Capture the iframe content using html2canvas
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc?.body) {
      document.body.removeChild(container);
      return null;
    }

    const canvas = await html2canvas(iframeDoc.body, {
      width,
      height,
      useCORS: true,
      allowTaint: true,
      logging: false,
      background: '#ffffff',
    } as Parameters<typeof html2canvas>[1]);

    // Convert canvas to blob
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png', 0.9);
    });

    // Clean up
    document.body.removeChild(container);

    return blob;
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    return null;
  }
}

/**
 * Alternative: Capture screenshot directly from an iframe element.
 * This only works if the iframe is same-origin or has appropriate CORS headers.
 */
export async function captureIframeScreenshot(
  iframeRef: HTMLIFrameElement,
  width: number = 1280,
  height: number = 720
): Promise<Blob | null> {
  try {
    // Create a canvas and draw the iframe
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!ctx) return null;

    // Try to use html2canvas on the iframe element's parent
    const container = iframeRef.parentElement;
    if (!container) return null;

    const capturedCanvas = await html2canvas(container, {
      width,
      height,
      useCORS: true,
      allowTaint: true,
      logging: false,
      background: '#ffffff',
      ignoreElements: () => {
        // Don't ignore anything
        return false;
      },
    } as Parameters<typeof html2canvas>[1]);

    const blob = await new Promise<Blob | null>((resolve) => {
      capturedCanvas.toBlob((blob) => resolve(blob), 'image/png', 0.9);
    });

    return blob;
  } catch (error) {
    console.error('Error capturing iframe screenshot:', error);
    return null;
  }
}

/**
 * Main function to capture a screenshot from the preview URL using server-side rendering.
 * This uses Puppeteer on the server to screenshot the WebContainer preview.
 */
export async function captureProjectSnapshot(
  previewUrl: string
): Promise<SnapshotResult> {
  console.log('📸 Requesting server-side screenshot for:', previewUrl);

  try {
    // Call our server-side screenshot API
    const response = await fetch('/api/screenshot', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: previewUrl, captureHtml: true }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Screenshot API error:', error);
      return {
        thumbnailBlob: null,
        htmlContent: null,
        error: `Screenshot failed: ${error}`,
      };
    }

    // Get the JSON response with both screenshot and HTML
    const data = await response.json();

    // Convert base64 screenshot back to blob
    const base64Data = data.screenshot;
    const binaryData = atob(base64Data);
    const bytes = new Uint8Array(binaryData.length);
    for (let i = 0; i < binaryData.length; i++) {
      bytes[i] = binaryData.charCodeAt(i);
    }
    const thumbnailBlob = new Blob([bytes], { type: 'image/png' });

    console.log('✅ Screenshot received, size:', thumbnailBlob.size, 'bytes');
    console.log('✅ HTML received, length:', data.html?.length || 0);

    return {
      thumbnailBlob,
      htmlContent: data.html || null,
    };
  } catch (error) {
    console.error('❌ Screenshot capture error:', error);
    return {
      thumbnailBlob: null,
      htmlContent: null,
      error: String(error),
    };
  }
}

/**
 * Uploads a thumbnail snapshot to the server.
 * The server will handle uploading to UploadThing and updating the database.
 * Returns the URLs of the uploaded thumbnail and HTML.
 */
export async function uploadProjectSnapshot(
  projectId: string,
  snapshot: SnapshotResult
): Promise<{ thumbnailUrl?: string; htmlSnapshotUrl?: string; error?: string }> {
  try {
    if (!snapshot.thumbnailBlob && !snapshot.htmlContent) {
      return { error: 'No snapshot content to upload' };
    }

    const formData = new FormData();
    formData.append('projectId', projectId);

    if (snapshot.thumbnailBlob) {
      formData.append('thumbnail', snapshot.thumbnailBlob, 'thumbnail.png');
      console.log('📤 Uploading thumbnail for project:', projectId, 'size:', snapshot.thumbnailBlob.size);
    }

    if (snapshot.htmlContent) {
      formData.append('html', snapshot.htmlContent);
      console.log('📤 Uploading HTML for project:', projectId, 'length:', snapshot.htmlContent.length);
    }

    const response = await fetch('/api/projects/snapshot', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Upload failed:', error);
      return { error: `Failed to upload snapshot: ${error}` };
    }

    const result = await response.json();
    console.log('✅ Upload success:', result);
    return result;
  } catch (error) {
    console.error('❌ Error uploading snapshot:', error);
    return { error: String(error) };
  }
}
