import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5274,
    // Wildcard-subdomain dev: any *.localhost host is allowed so
    // brand.localhost:5274 works the same way brand.saleis.live will in
    // production — the tenant router reads the Host header the same way.
    allowedHosts: true,
  },
});
