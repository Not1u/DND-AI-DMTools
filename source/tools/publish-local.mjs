#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const sourceRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = path.dirname(sourceRoot);
const pkg = JSON.parse(await fs.readFile(path.join(sourceRoot, 'package.json'), 'utf8'));
const artifact = path.join(sourceRoot, 'dist', `SoloTRPG-${pkg.version}-Windows-x64.exe`);
const destination = path.join(workspaceRoot, 'SoloTRPG.exe');
const bytes = await fs.readFile(artifact);
await fs.copyFile(artifact, destination);
const hash = createHash('sha256').update(bytes).digest('hex').toUpperCase();
await fs.writeFile(path.join(sourceRoot, 'dist', `SoloTRPG-${pkg.version}.sha256.txt`), `${hash}  SoloTRPG-${pkg.version}-Windows-x64.exe\n`);
console.log(`Published ${pkg.version} to ${destination}`);
console.log(`SHA256 ${hash}`);
