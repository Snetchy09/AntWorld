import { readFileSync } from 'node:fs';
const html = readFileSync('index.html','utf8');
const js = readFileSync('src/main.js','utf8');
const css = readFileSync('src/styles.css','utf8');
for (const needle of ['<link rel="stylesheet" href="./src/styles.css"', '<script type="module" src="./src/main.js"', '#game', 'Next Run', 'drawAnt', 'generateTerrain', 'randomGenome', 'carve(', 'Choose Colony Mode', 'Normal Ant Colony', 'Evolution Experiment']) {
  if (!html.includes(needle) && !js.includes(needle) && !css.includes(needle)) throw new Error(`Missing ${needle}`);
}
for (const forbidden of ['src="/src/', 'href="/src/', "import './styles.css'", 'scripts/dev-server.mjs']) {
  if (html.includes(forbidden) || js.includes(forbidden)) throw new Error(`Found non Pages-compatible reference ${forbidden}`);
}
console.log('Static GitHub Pages smoke checks passed');
