import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@webcontainer/api'],
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };
    return config;
  },
  headers: async () => {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
        ],
      },
    ];
  },
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
    externalResolver: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/chat',
        destination: '/api/chat',
        has: [],
        basePath: false,
        timeout: 300000, // 300 seconds in milliseconds
      },
      {
        source: '/api/agent',
        destination: '/api/agent',
        has: [],
        basePath: false,
        timeout: 300000, // 300 seconds in milliseconds
      },
    ];
  },
};

export default nextConfig;
