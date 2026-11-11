const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Derive the Windows installer page from the canonical license without editing
// that tracked file (electron-builder can otherwise add a BOM to license files).
function prepareLicenseArtifact({ root = path.resolve(__dirname, '../..'), output = path.join(root, '.build-tools/licenses') } = {}) {
  const license = path.join(root, 'LICENSE');
  const text = fs.readFileSync(license, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!text.startsWith('Acedia Personal Use and Organization Permission License 1.0\n')) throw Error('Unexpected Acedia license');
  const sha256 = createHash('sha256').update(text).digest('hex');
  const escaped = text.replace(/[\\{}]/g, char => '\\' + char)
    .replace(/[\u0080-\uFFFF]/g, char => '\\u' + (char.charCodeAt(0) > 32767 ? char.charCodeAt(0) - 65536 : char.charCodeAt(0)) + '?')
    .replace(/\n/g, '\\par\n');
  const rtf = '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Segoe UI;}}\\viewkind4\\uc1\\pard\\f0\\fs18\n' + escaped + '\n}';
  fs.mkdirSync(output, { recursive: true });
  const file = path.join(output, `acedia-license-${sha256.slice(0, 16)}.rtf`);
  fs.writeFileSync(file, rtf, 'utf8');
  return { file, license, sha256 };
}
module.exports = { prepareLicenseArtifact };
