export default function manifest() {
  return {
    name: 'Sonora Music Hub',
    short_name: 'Sonora',
    description: 'Your private, offline-ready music hub.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0b0c',
    theme_color: '#0b0b0c',
    icons: [
      { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
    ]
  };
}
