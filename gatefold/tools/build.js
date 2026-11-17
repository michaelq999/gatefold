/* Packs src/ into one self-contained file: index.html at the top of the project.
   GitHub Pages serves that file as the website, and it can also be opened
   by double-clicking.
   Stylesheets and scripts are copied into the page so the app can be opened
   by double-clicking, or uploaded to any web host as a single file.

   Run:  node tools/build.js */
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src');
const read = (rel) => fs.readFileSync(path.join(src, rel), 'utf8');

let html = read('index.html');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) =>
  `<style>\n${read(href)}\n</style>`);

html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, file) =>
  // a closing script tag inside the code would end the block early
  `<script>\n${read(file).replace(/<\/script/gi, '<\\/script')}\n</script>`);

fs.writeFileSync(path.join(__dirname, '..', 'index.html'), html);
console.log('index.html', Math.round(html.length / 1024) + ' KB');
