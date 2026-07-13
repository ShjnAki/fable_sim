import { defineConfig } from "vite";

export default defineConfig({
  server: { host: true }, // WSL2 : accessible depuis le navigateur Windows
});
