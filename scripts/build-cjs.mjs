import { build } from "esbuild";

await build({
  entryPoints: ["dist/monkeysjs.esm.js"],
  outfile: "dist/monkeysjs.cjs",
  format: "cjs",
  platform: "browser",
  target: ["es2018"],
  bundle: false
});
