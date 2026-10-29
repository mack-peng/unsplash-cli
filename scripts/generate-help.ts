import fs from 'node:fs';
import path from 'node:path';
import { generateHelpJSON } from '../src/config/helpGenerator';

const help = generateHelpJSON();
const outPath = path.join(__dirname, '..', 'dist', 'help.json');
fs.writeFileSync(outPath, JSON.stringify(help, null, 2) + '\n');
console.log(`Wrote ${outPath}`);
