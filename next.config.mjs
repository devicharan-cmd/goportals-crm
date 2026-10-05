/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    // Next 14's default staleTime for dynamic routes is 0, so clicking back to a
    // section you just visited (e.g. Dashboard -> Tickets -> Dashboard) always
    // re-ran the whole server tree. Let the client reuse a recently-fetched
    // segment instead — mutations already call router.refresh() to bypass this.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
}

export default nextConfig
