import fs from 'node:fs/promises';
import path from 'node:path';
// Stable location independent of the executable version or portable extraction folder.
// Only initialize missing directories; never replace a player's existing files.
export async function initializeData(home, version) {
  const root = path.join(home, 'campaign');
  await fs.mkdir(path.join(root, 'characters'), { recursive: true });
  await fs.mkdir(path.join(root, 'data', 'maps'), { recursive: true });
  await fs.mkdir(path.join(root, 'data', 'images'), { recursive: true });
  const marker = path.join(root, 'desktop.json');
  let previous;
  try { previous = JSON.parse(await fs.readFile(marker, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previous && previous.schemaVersion !== 1) throw new Error('存档格式比当前程序新，请使用新版程序。');
  await fs.writeFile(marker, JSON.stringify({ schemaVersion: 1, appVersion: version }, null, 2));
  return root;
}
