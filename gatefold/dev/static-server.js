/* DEVELOPMENT ONLY. Serves the built app over http://127.0.0.1 so tests can
   run it the way a web host would serve it (as opposed to opening the file). */
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = Number(process.env.PORT) || 8790;
const file = path.join(__dirname, '..', 'index.html');
http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  if (p === '/' || p === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(fs.readFileSync(file));
  }
  res.writeHead(404); res.end('not found');
}).listen(PORT, '127.0.0.1', () => console.log('Serving index.html on http://127.0.0.1:' + PORT));
