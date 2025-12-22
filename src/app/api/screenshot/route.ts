import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import { createCanvas } from 'canvas';

export const maxDuration = 30; // 30 seconds timeout

// Detect if we're running in production (Vercel) or local
const isProduction = process.env.NODE_ENV === 'production' && process.env.VERCEL;

// For local development, you need Chrome/Chromium installed
// Common paths where Chrome might be installed
const localChromePaths = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // macOS
  '/Applications/Chromium.app/Contents/MacOS/Chromium', // macOS Chromium
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // Windows
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', // Windows x86
  '/usr/bin/google-chrome', // Linux
  '/usr/bin/chromium-browser', // Linux
];

async function findLocalChrome(): Promise<string | null> {
  for (const path of localChromePaths) {
    try {
      if (fs.existsSync(path)) {
        return path;
      }
    } catch {
      // Continue to next path
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const { url, captureHtml = true } = await request.json();

    if (!url) {
      return new NextResponse('URL is required', { status: 400 });
    }

    console.log('📸 Starting screenshot capture for URL:', url);
    console.log('Environment:', isProduction ? 'production' : 'development');

    // Fetch HTML if requested - simple server-side fetch, no CORS issues
    let htmlContent: string | null = null;
    if (captureHtml) {
      try {
        console.log('📄 Fetching HTML...');
        const htmlResponse = await fetch(url);
        if (htmlResponse.ok) {
          htmlContent = await htmlResponse.text();
          console.log('✅ HTML fetched, length:', htmlContent.length);
        } else {
          console.warn('⚠️ HTML fetch failed:', htmlResponse.status);
        }
      } catch (error) {
        console.warn('⚠️ HTML fetch error:', error);
      }
    }

    // Launch browser
    let browser;

    if (isProduction) {
      // Production: Use @sparticuz/chromium for Vercel
      console.log('Using @sparticuz/chromium for production');
      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: {
          width: 1280,
          height: 720,
        },
        executablePath: await chromium.executablePath(),
        headless: true,
      });
    } else {
      // Development: Use local Chrome/Chromium
      const chromePath = await findLocalChrome();
      if (!chromePath) {
        console.warn('⚠️ Chrome/Chromium not found. Creating placeholder image.');
        // Create a simple placeholder image for development
        const canvasEl = createCanvas(1280, 720);
        const ctx = canvasEl.getContext('2d');

        // Draw placeholder
        ctx.fillStyle = '#f3f4f6';
        ctx.fillRect(0, 0, 1280, 720);

        ctx.fillStyle = '#6b7280';
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Screenshot Preview', 640, 300);

        ctx.font = '24px Arial';
        ctx.fillText('Install Chrome to capture real screenshots', 640, 360);
        ctx.fillText(url.substring(0, 80), 640, 420);

        const screenshot = canvasEl.toBuffer('image/png');

        // Return placeholder as base64 in same format as real screenshot
        return NextResponse.json({
          screenshot: screenshot.toString('base64'),
          html: htmlContent,
        });
      }
      console.log('Using local Chrome at:', chromePath);
      browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }

    const page = await browser.newPage();

    // Set viewport
    await page.setViewport({ width: 1280, height: 720 });

    console.log('🌐 Navigating to URL...');
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 15000,
    });

    // Wait a bit for any dynamic content to render
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('📷 Taking screenshot...');
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: false,
    });

    await browser.close();

    console.log('✅ Screenshot captured, size:', screenshot.length, 'bytes');

    // Return both screenshot and HTML as JSON
    return NextResponse.json({
      screenshot: Buffer.from(screenshot).toString('base64'),
      html: htmlContent,
    });

  } catch (error) {
    console.error('❌ Screenshot error:', error);
    return new NextResponse(`Screenshot failed: ${String(error)}`, { status: 500 });
  }
}
