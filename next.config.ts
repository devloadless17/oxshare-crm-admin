import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Three sibling repos each have a lockfile; pin the root so Next doesn't guess.
  turbopack: { root: __dirname },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/:path*',
      },
    ];
  },
};

export default nextConfig;
