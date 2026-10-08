import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The same "@/" alias as tsconfig, so tests can import modules that use it.
export default defineConfig({ resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } } });
