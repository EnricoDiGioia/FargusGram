import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' deixa o app funcionar em qualquer endereço
// (ex.: https://seu-usuario.github.io/FargusGram/)
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: ['es2020', 'safari15'],
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // bibliotecas separadas: atualizações do app baixam menos
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('react')) return 'react';
        },
      },
    },
  },
  server: { host: true },
});
