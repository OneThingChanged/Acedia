import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const target = path.resolve(process.argv[2] || path.join(root, '.acedia/usage-server'));
if (fs.existsSync(target)) throw Error('Choose a new output directory');
fs.mkdirSync(path.join(target, 'runtime'), { recursive: true });
for (const file of ['start.mjs', 'start-lan.cmd', 'admin.mjs', 'package.json', 'README.md']) fs.copyFileSync(path.join(root, 'usage-server', file), path.join(target, file));
for (const file of ['server.mjs', 'protocol.mjs', 'metadata.mjs', 'credentials.mjs', 'dashboard.html', 'dashboard.js', 'periods.mjs', 'pricing.mjs']) fs.copyFileSync(path.join(root, 'app/electron/usage-collector', file), path.join(target, 'runtime', file));
const client = path.join(target, 'client');
fs.cpSync(path.join(root, 'usage-server/client'), client, { recursive: true });
const collector = path.join(root, 'app/electron/usage-collector');
const packageJson = JSON.parse(fs.readFileSync(path.join(collector, 'package.json'), 'utf8'));
fs.mkdirSync(path.join(client, 'runtime'), { recursive: true });
for (const file of [...packageJson.files, 'package.json']) fs.cpSync(path.join(collector, file), path.join(client, 'runtime', file), { recursive: true });
const zip = (source, destination) => {
  // ZipFile includes dot-directories such as .codex-plugin; Compress-Archive skips hidden files.
  if (process.platform !== 'win32') throw Error('Distribution ZIP packaging currently requires Windows PowerShell');
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    '$ErrorActionPreference="Stop"; Add-Type -AssemblyName System.IO.Compression; Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[System.IO.Compression.ZipFile]::Open($env:ACEDIA_ZIP_DESTINATION,[System.IO.Compression.ZipArchiveMode]::Create); try { foreach($f in [System.IO.Directory]::GetFiles($env:ACEDIA_ZIP_SOURCE,"*",[System.IO.SearchOption]::AllDirectories)) { $n=$f.Substring($env:ACEDIA_ZIP_SOURCE.Length+1).Replace([char]92,[char]47); [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($z,$f,$n) | Out-Null } } finally { $z.Dispose() }'],
    { windowsHide: true, env: { ...process.env, ACEDIA_ZIP_SOURCE: source, ACEDIA_ZIP_DESTINATION: destination } });
};
fs.mkdirSync(path.join(target, 'downloads'));
zip(client, path.join(target, 'downloads/acedia-usage-client.zip'));
zip(target, target + '.zip');
console.log(JSON.stringify({ target, archive: target + '.zip', client: 'downloads/acedia-usage-client.zip', start: 'node start.mjs', lan: 'start-lan.cmd', dependencies: 'Node.js 22.13+ on server and clients; no npm install required' }));
