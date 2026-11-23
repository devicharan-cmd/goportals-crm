/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  images: {
    // Avatar and client images are signed Supabase Storage URLs. Optimizing
    // them avoids downloading full-size originals for small UI thumbnails.
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 31536000,
    remotePatterns: [
      ...(process.env.NEXT_PUBLIC_SUPABASE_URL
        ? [{
            protocol: 'https',
            hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,
            pathname: '/storage/v1/object/**',
          }]
        : []),
    ],
  },
}

export default nextConfig
