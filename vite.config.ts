import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'La Libreta de Marcos',
        short_name: 'Libreta',
        description: 'Gestión de compras fiadas de la tienda',
        theme_color: '#002446',
        background_color: '#faf9f5',
        display: 'standalone',
        icons: [],
      },
    }),
  ],
})