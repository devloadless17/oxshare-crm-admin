import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Three sibling repos each have a lockfile; pin the root so Next doesn't guess.
  turbopack: { root: __dirname },
  // /roles was a strict subset of the /settings Roles tab — six byte-identical
  // blocks, two sidebar entries, one feature, and already drifting (only
  // /settings gained delete and reassignment). One page owns roles now.
  async redirects() {
    return [{ source: '/roles', destination: '/settings', permanent: false }];
  },
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
