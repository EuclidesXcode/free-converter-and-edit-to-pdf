/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Prevent Next.js from bundling these server-side packages so they
    // can load their own asset files (AFM fonts, etc.) at runtime.
    serverComponentsExternalPackages: ['pdfkit', 'mammoth', 'xlsx', 'cheerio', 'pdf-parse', 'pdfjs-dist'],
    // pdfjs-dist (legacy build) lazily requires ./pdf.worker.js even when the
    // worker is disabled. Because the package is marked external above, Next's
    // file tracer doesn't follow that dynamic require, so the worker file is
    // missing from the serverless function on Vercel. Force-include it.
    outputFileTracingIncludes: {
      '/api/parse-pdf': ['./node_modules/pdfjs-dist/legacy/build/pdf.worker.js'],
    },
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
