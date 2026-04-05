/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Fix for ws module in Next.js
    config.externals.push({
      'ws': 'commonjs ws',
      'bufferutil': 'commonjs bufferutil',
      'utf-8-validate': 'commonjs utf-8-validate',
    });
    return config;
  },
  // Allow serving artifacts as static files
  async rewrites() {
    return [
      {
        source: '/artifacts/:path*',
        destination: '/api/artifacts/:path*',
      },
    ];
  },
};

export default nextConfig;
