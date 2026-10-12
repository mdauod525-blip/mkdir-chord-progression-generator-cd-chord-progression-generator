import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  // This app lives in a subfolder of a repo that has its own lockfile.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
