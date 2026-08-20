import { readFileSync } from 'node:fs';
const html = readFileSync('index.html','utf8');
const js = readFileSync('src/main.js','utf8');
for (const needle of ['#game','Next Run','drawAnt','generateTerrain','randomGenome','carve(']) {
  if (!html.includes(needle) && !js.includes(needle)) throw new Error(`Missing ${needle}`);
}
console.log('Smoke checks passed');
