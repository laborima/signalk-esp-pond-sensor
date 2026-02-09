/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: process.env.NODE_ENV === 'production' ? '/signalk-poi-lab' : '',
  assetPrefix: process.env.NODE_ENV === 'production' ? '/signalk-poi-lab' : '',
  trailingSlash: true,
  images: {
    unoptimized: true
  }
};

export default nextConfig;
