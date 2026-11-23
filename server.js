/* TrackFlow server: express, а если он не установлен — встроенный http-фолбэк */
'use strict';
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { return null; }
}
function writeDB(state) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(state));
    return true;
  } catch (e) { console.error('DB write error:', e.message); return false; }
}
function handleApi(req, res, url, body) {
  if (url === '/api/health') { res.json({ ok: true, time: Date.now() }); return true; }
  if (url === '/api/state' && req.method === 'GET') { res.json({ state: readDB() }); return true; }
  if (url === '/api/state' && req.method === 'PUT') {
    let s = null;
    try { s = JSON.parse(body).state; } catch {}
    if (!s || !Array.isArray(s.orders)) { res.status(400).json({ ok: false }); return true; }
    writeDB(s); res.json({ ok: true }); return true;
  }
  if (url === '/api/state' && req.method === 'DELETE') {
    try { fs.unlinkSync(DB_FILE); } catch {}
    res.json({ ok: true }); return true;
  }
  return false;
}

let started = false;
try {
  const express = require('express');
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(express.static(PUBLIC, { etag: true, maxAge: '5m' }));
  app.get('/api/health', (_q, r) => r.json({ ok: true, time: Date.now() }));
  app.get('/api/state', (_q, r) => r.json({ state: readDB() }));
  app.put('/api/state', (q, r) => {
    const s = q.body && q.body.state;
    if (!s || !Array.isArray(s.orders)) return r.status(400).json({ ok: false });
    writeDB(s); r.json({ ok: true });
  });
  app.delete('/api/state', (_q, r) => { try { fs.unlinkSync(DB_FILE); } catch {} r.json({ ok: true }); });
  app.get('*', (_q, r) => r.sendFile(path.join(PUBLIC, 'index.html')));
  app.listen(PORT, '0.0.0.0', () => console.log(`◉ TrackFlow (express) → http://localhost:${PORT}`));
  started = true;
} catch (e) { /* express не установлен — фолбэк ниже */ }

if (!started) {
  const http = require('http');
  const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
  http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    res.json = obj => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
    res.status = code => { res.statusCode = code; return res; };
    let body = '';
    req.on('data', c => { body += c; if (body.length > 2e6) req.destroy(); });
    req.on('end', () => {
      if (url.startsWith('/api/') && handleApi(req, res, url, body)) return;
      let file = path.normalize(path.join(PUBLIC, url === '/' ? 'index.html' : url));
      if (!file.startsWith(PUBLIC)) file = path.join(PUBLIC, 'index.html');
      fs.readFile(file, (err, data) => {
        if (err) { file = path.join(PUBLIC, 'index.html'); data = fs.readFileSync(file); }
        res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
        res.end(data);
      });
    });
  }).listen(PORT, '0.0.0.0', () => console.log(`◉ TrackFlow (builtin) → http://localhost:${PORT}`));
}
