import type { NextConfig } from 'next';

// The browser talks only to this Next.js origin; /api/* is proxied to FastAPI so the
// session cookie stays first-party (httpOnly, SameSite=Lax).
const backend = process.env.DEALBRIDGE_API_URL ?? 'http://localhost:8000';

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${backend}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
