/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Prevent Next.js from bundling these server-side packages so they
    // can load their own asset files (AFM fonts, etc.) at runtime.
    serverComponentsExternalPackages: ['pdfkit', 'mammoth', 'xlsx', 'cheerio'],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
        encoding: false,
      }
    }
    return config
  },
}

export default nextConfig
