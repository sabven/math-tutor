import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    // Integration tests build + start a real Next server per file; give them room.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Integration tests spawn a shared server on a fixed port, so they can't
    // run as separate files concurrently without colliding.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
