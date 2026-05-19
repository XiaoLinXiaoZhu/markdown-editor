import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3002,
    forwardConsole: {
      unhandledErrors: true,
      logLevels: ['error', 'warn', 'log'],
    },
    warmup: {
      clientFiles: ['./src/App.vue', './src/main.ts'],
    },
  },
  root: ".",
});
