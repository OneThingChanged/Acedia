// Deterministic packaging variants of the existing icon; no artwork changes.
const { app, nativeImage } = require("electron");
const { mkdirSync, writeFileSync } = require("node:fs");
const { resolve, join } = require("node:path");

app.whenReady().then(() => {
  const output = process.argv[2];
  if (!output) throw new Error("Usage: electron generate-store-icons.cjs <asset-directory>");
  const icon = nativeImage.createFromPath(resolve(__dirname, "../assets/icon.ico"));
  if (icon.isEmpty()) throw new Error("Cannot load the application icon.");
  mkdirSync(output, { recursive: true });
  const sizes = [16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256];
  for (const size of sizes) {
    const png = icon.resize({ width: size, height: size, quality: "best" }).toPNG();
    for (const variant of ["", "_altform-unplated", "_altform-lightunplated"]) {
      writeFileSync(join(output, `Square44x44Logo.targetsize-${size}${variant}.png`), png);
    }
  }
  console.log(`[store-icons] generated ${sizes.length * 3} transparent icon variants`);
  app.exit(0);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
