/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  images: {
    // Keep the existing image format/cache settings for local and optimized
    // images; remote avatars bypass the optimizer to avoid server fetch timeouts.
    formats: ['image/avif', 'image/webp'],
    // Avatar images currently request quality=90; keep that existing quality
    // explicit so it remains supported by Next 16+.
    qualities: [90],
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
