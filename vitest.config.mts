import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(fileURLToPath(new URL(".", import.meta.url))) } },
  test: { environment: "node" }
});
