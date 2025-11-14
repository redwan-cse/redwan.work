/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { 
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: '**.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: '**.blogger.com',
      },
      {
        protocol: 'https',
        hostname: '**.blogspot.com',
      },
    ],
  },
};

module.exports = nextConfig;
