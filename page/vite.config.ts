import {defineConfig} from "vite";

export default defineConfig({
  base: '/type-buddy',
  build: {
    emptyOutDir: true,
    outDir: '../docs',
  }
})
