const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

console.log('Compiling TypeScript...');
execSync('npx tsc', { stdio: 'inherit' });

console.log('Generating help.json...');
execSync('npx tsx scripts/generate-help.ts', { stdio: 'inherit' });

const distDir = path.join(__dirname, '..', 'dist');
function walkSync(dir, base = '') {
  const files = [];
  for (const entry of fs.readdirSync(path.join(dir, base))) {
    const full = base ? path.join(base, entry) : entry;
    if (fs.statSync(path.join(dir, full)).isDirectory()) files.push(...walkSync(dir, full));
    else files.push(full);
  }
  return files;
}

for (const entry of walkSync(distDir)) {
  if (entry.endsWith('.js.map')) fs.unlinkSync(path.join(distDir, entry));
}
console.log('Build complete.');
