import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(process.cwd()),
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_BASE_URL ?? 'http://localhost:3001'}/:path*`,
      },
    ];
  },
};

export default nextConfig;
