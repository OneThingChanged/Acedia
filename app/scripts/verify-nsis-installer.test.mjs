import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { crc32 } from "node:zlib";
import { afterEach, expect, it } from "vitest";
import { verifyNsisChecksum } from "./verify-nsis-installer.mjs";

const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir())
      || !path.basename(directory).startsWith("acedia-nsis-crc-")) throw new Error("Unsafe test cleanup path.");
    fs.rmSync(directory, { recursive: true });
  }
});
function installer({ trailer = false, flags = 0, size = 2048 } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-nsis-crc-"));
  directories.push(directory);
  const bytes = Buffer.alloc(size);
  bytes.write("MZ");
  bytes.writeUInt32LE(flags, 1024);
  bytes.writeUInt32LE(0xdeadbeef, 1028);
  bytes.write("NullsoftInst", 1032);
  bytes.writeUInt32LE(100, 1044);
  bytes.writeUInt32LE(bytes.length - 1024, 1048);
  bytes.fill(0x42, 1052, bytes.length - 4);
  bytes.writeUInt32LE(crc32(bytes.subarray(512, -4)), bytes.length - 4);
  const file = path.join(directory, "installer.exe");
  fs.writeFileSync(file, trailer ? Buffer.concat([bytes, Buffer.from("signing trailer")]) : bytes);
  return file;
}

it("accepts the NSIS CRC boundary with or without a trailing signature", async () => {
  for (const trailer of [false, true]) {
    expect(await verifyNsisChecksum(installer({ trailer }))).toMatchObject({ headerOffset: 1024, crcOffset: 2044 });
  }
});
it("rejects changed compressed data even if the external manifest hash were updated", async () => {
  const file = installer(), bytes = fs.readFileSync(file);
  bytes[1800] ^= 1;
  fs.writeFileSync(file, bytes);
  await expect(verifyNsisChecksum(file)).rejects.toThrow("NSIS CRC mismatch");
});
it("rejects truncated installers and disabled integrity checking", async () => {
  const file = installer();
  fs.truncateSync(file, 2000);
  await expect(verifyNsisChecksum(file)).rejects.toThrow("truncated");
  await expect(verifyNsisChecksum(installer({ flags: 4 }))).rejects.toThrow("disabled");
});
it("rejects unrelated executables without an aligned NSIS header", async () => {
  const file = installer(), bytes = fs.readFileSync(file);
  bytes.fill(0, 1024, 1052);
  fs.writeFileSync(file, bytes);
  await expect(verifyNsisChecksum(file)).rejects.toThrow("header was not found");
});
it("checks all streamed chunks using the same CRC as zlib", async () => {
  const file = installer({ size: 256 * 1024 });
  expect(await verifyNsisChecksum(file)).toMatchObject({ crcOffset: 256 * 1024 - 4 });
  const bytes = fs.readFileSync(file);
  bytes[192 * 1024] ^= 1;
  fs.writeFileSync(file, bytes);
  await expect(verifyNsisChecksum(file)).rejects.toThrow("NSIS CRC mismatch");
});
