const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');

app.use(express.static(PUBLIC, { maxAge: '1h', etag: true }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'trackflow', time: Date.now() });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(PUBLIC, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`◉ TrackFlow → http://localhost:${PORT}`);
});