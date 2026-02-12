/** @type {import('next').NextConfig} */
const nextConfig = {
  // ⚠️ En producción NO conviene ignorar errores.
  // Durante incident response, mantenelo solo si estás destrabando deploy.
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },

  // ✅ Hardening de imágenes
  images: {
    // Si no necesitás unoptimized, ponelo en false para volver a usar optimizer seguro + whitelist
    unoptimized: true,

    remotePatterns: [
      {
        protocol: "https",
        hostname: "fotopatagonia-assets.sfo3.digitaloceanspaces.com",
        pathname: "/**",
      },
    ],
  },

  // ✅ Reducir superficie futura (si algún dev intenta usar Server Actions)
  serverActions: false,

  // ✅ Headers de seguridad (básicos y seguros)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Evita MIME sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },

          // Evita que te embeban en iframes (clickjacking)
          { key: "X-Frame-Options", value: "DENY" },

          // Controla cuánto referrer se manda hacia terceros
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

          // Permisos
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },

          // HSTS (solo si servís SIEMPRE por HTTPS)
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
        ],
      },
    ]
  },
}

export default nextConfig
