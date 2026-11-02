import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const execute = promisify(execFile);
const table = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});

// NSIS exehead/fileform.c: exclude the first 512 bytes, and stop before the
// embedded CRC, even when Authenticode or other data follows the NSIS image.
export async function verifyNsisChecksum(file) {
  const fd = fs.openSync(file, "r");
  let headerOffset, crcOffset, expected, size;
  try {
    size = fs.fstatSync(fd).size;
    const header = Buffer.alloc(28);
    fs.readSync(fd, header, 0, 2, 0);
    if (header.toString("ascii", 0, 2) !== "MZ") throw new Error("Not a Windows installer.");
    for (let offset = 512; offset + 28 <= Math.min(size, 16 * 1024 * 1024); offset += 512) {
      if (fs.readSync(fd, header, 0, 28, offset) !== 28) break;
      const flags = header.readUInt32LE(0);
      if ((flags & ~15) || header.readUInt32LE(4) !== 0xdeadbeef
        || header.toString("ascii", 8, 20) !== "NullsoftInst") continue;
      if ((flags & 4) && !(flags & 8)) throw new Error("NSIS integrity checking is disabled.");
      headerOffset = offset;
      crcOffset = offset + header.readUInt32LE(24) - 4;
      if (header.readUInt32LE(20) === 0 || crcOffset < offset + 28 || crcOffset + 4 > size) {
        throw new Error("NSIS installer is truncated or has an invalid data length.");
      }
      fs.readSync(fd, header, 0, 4, crcOffset);
      expected = header.readUInt32LE(0);
      break;
    }
  } finally { fs.closeSync(fd); }
  if (headerOffset === undefined) throw new Error("NSIS installer header was not found.");
  let crc = 0xffffffff;
  for await (const bytes of fs.createReadStream(file, { start: 512, end: crcOffset - 1 })) {
    for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  }
  const actual = (crc ^ 0xffffffff) >>> 0;
  if (actual !== expected) throw new Error(`NSIS CRC mismatch: expected ${expected.toString(16)}, got ${actual.toString(16)}.`);
  return { size, headerOffset, crcOffset, crc32: actual.toString(16).padStart(8, "0") };
}

export async function verifyNsisInstaller(file) {
  const checksum = await verifyNsisChecksum(file);
  const { getPath7za } = require("app-builder-lib/out/toolsets/7zip.js");
  // Test every compressed payload member; matching transport SHA-256 alone
  // cannot detect an installer that was already corrupt before publication.
  await execute(await getPath7za(), ["t", "-bd", "-bb0", path.resolve(file)], {
    windowsHide: true, timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
  });
  let nativeStartup = false;
  if (process.platform === "win32") {
    // preInit quits with a dedicated code before multi-user setup, registry
    // writes, app shutdown or installation. /S also hides NSIS verification UI.
    try {
      await execute(path.resolve(file), ["/S", "/ACEDIA_VERIFY_INSTALLER"], {
        windowsHide: true, timeout: 30_000,
      });
      throw new Error("Installer did not acknowledge verification mode.");
    } catch (error) {
      if (error.code !== 73) throw error;
      nativeStartup = true;
    }
  }
  return { ...checksum, payload: "verified", nativeStartup };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error("Usage: node verify-nsis-installer.mjs <installer.exe>");
  console.log(`[installer-integrity] ${JSON.stringify(await verifyNsisInstaller(process.argv[2]))}`);
}
