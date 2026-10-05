const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'dist');
const port = Number(process.env.PORT || 4173);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const sendFile = (res, filePath) => {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': path.basename(filePath) === 'index.html'
        ? 'no-cache'
        : 'public, max-age=31536000, immutable',
    });
    fs.createReadStream(filePath).pipe(res);
  });
};

http.createServer((req, res) => {
  const rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const safePath = path.normalize(rawPath).replace(/^(..[/\\])+/, '');
  const candidate = path.join(root, safePath);

  fs.stat(candidate, (err, stat) => {
    if (!err && stat.isFile()) return sendFile(res, candidate);
    if (!err && stat.isDirectory()) {
      const indexPath = path.join(candidate, 'index.html');
      if (fs.existsSync(indexPath)) return sendFile(res, indexPath);
    }

    // SPA fallback: React Router owns application routes such as /listen,
    // /listen/profile and /creator-studio/*.
    return sendFile(res, path.join(root, 'index.html'));
  });
}).listen(port, '0.0.0.0', () => {
  console.log(`Echoo preview frontend listening on ${port}`);
});
