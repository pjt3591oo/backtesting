import { readFile, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { transform } from "lightningcss";

try {
  execSync('npx prettier --write "app/**/*.{ts,tsx}" "components/**/*.{ts,tsx}" "lib/**/*.ts" "tests/**/*.{js,mjs,ts}"', {
    stdio: "inherit",
  });
} catch (e) {
  console.error("Formatting failed:", e);
}

const cssFile = "app/globals.css";
const cssSource = await readFile(cssFile);
const cssResult = transform({
  filename: cssFile,
  code: cssSource,
  minify: false,
  drafts: { customMedia: true },
});

await writeFile(cssFile, cssResult.code);
