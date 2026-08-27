import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // El PDF y sus dependencias se cargan solo cuando alguien pulsa
        // `Descargar PDF`. Precachearlos multiplicaria por tres lo que se baja
        // al instalar la aplicacion, y eso lo pagaria cada movil aunque no
        // genere ningun PDF nunca.
        globIgnores: ['**/jspdf*', '**/html2canvas*', '**/index.es-*', '**/purify.es-*'],
      },
      manifest: {
        name: 'La Libreta de Marcos',
        short_name: 'Libreta',
        description: 'Gestión de compras fiadas de la tienda',
        theme_color: '#002446',
        background_color: '#faf9f5',
        display: 'standalone',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
