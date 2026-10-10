// Online multiplayer server for Snakes & Ladders (Cards & Shooters Edition).
// - Serves snake-and-ladders.html statically.
// - WebSocket rooms: a host CREATEs a room (gets a 4-letter code), guests JOIN with the code.
// - The HOST is the game authority. When the host starts the game, play begins and
//   the host broadcasts game state to everyone. Guests send only intents; the host runs
//   the real logic and pushes snapshots back.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3100;
const ROOT = __dirname;
const HTML = path.join(ROOT, 'snake-and-ladders.html');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const server = http.createServer((req, res) => {
  // Let the WebSocket server handle upgrade requests (don't answer them over HTTP).
  if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') return;
  // Only serve the game page + this file; nothing else.
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/' || urlPath === '/index.html') urlPath = '/snake-and-ladders.html';
  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

// ---- Room model ----------------------------------------------------------
// rooms: code -> { code, host, clients: Map<ws, {id,name,isHost}>, started }
const rooms = new Map();
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars

function genCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  } while (rooms.has(code));
  return code;
}

function send(ws, type, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type, payload }));
}
function broadcast(room, type, payload, exceptWs) {
  for (const ws of room.clients.keys()) {
    if (ws !== exceptWs) send(ws, type, payload);
  }
}
function roomInfo(room) {
  return {
    code: room.code,
    started: room.started,
    hostId: room.host ? room.host.id : null,
    players: [...room.clients.values()].map(c => ({ id: c.id, name: c.name, isHost: c.isHost })),
  };
}
function wsId(ws) { return ws._pid; }

wss.on('connection', (ws) => {
  ws._pid = 'p' + Math.random().toString(36).slice(2, 9);
  ws._room = null;
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    const { type, payload } = msg || {};
    switch (type) {
      case 'create': return handleCreate(ws, payload);
      case 'join': return handleJoin(ws, payload);
      case 'start': return handleStart(ws, payload);
      case 'setName': return handleSetName(ws, payload);
      case 'leave': return handleLeave(ws);
      case 'intent': return handleIntent(ws, payload);
      case 'snapshot': return handleSnapshot(ws, payload); // host -> server -> guests
      default: return;
    }
  });
  ws.on('close', () => handleLeave(ws));
  ws.on('error', () => {});
});

function handleCreate(ws, payload) {
  if (ws._room) return;
  const code = genCode();
  const room = { code, host: ws, clients: new Map(), started: false };
  room.clients.set(ws, { id: ws._pid, name: (payload && payload.name) || 'Host', isHost: true });
  rooms.set(code, room);
  ws._room = room;
  send(ws, 'created', { ...roomInfo(room), you: ws._pid });
}

function handleJoin(ws, payload) {
  if (ws._room) return;
  const code = (payload && payload.code || '').toUpperCase();
  const room = rooms.get(code);
  if (!room) return send(ws, 'error', { message: 'Room not found. Check the code.' });
  if (room.started) return send(ws, 'error', { message: 'Game already started.' });
  if (room.clients.size >= 4) return send(ws, 'error', { message: 'Room is full (4 players max).' });
  room.clients.set(ws, { id: ws._pid, name: (payload && payload.name) || 'Guest', isHost: false });
  ws._room = room;
  send(ws, 'joined', { ...roomInfo(room), you: ws._pid });
  broadcast(room, 'room', roomInfo(room), ws);
}

function handleStart(ws, payload) {
  const room = ws._room;
  if (!room || room.host !== ws) return;
  if (room.clients.size < 2) return send(ws, 'error', { message: 'Need at least 2 players to start.' });
  room.started = true;
  broadcast(room, 'started', roomInfo(room));
}

function handleSetName(ws, payload) {
  const room = ws._room;
  if (!room) return;
  const c = room.clients.get(ws);
  if (!c) return;
  c.name = (payload && payload.name) || c.name;
  broadcast(room, 'room', roomInfo(room));
}

function handleIntent(ws, payload) {
  const room = ws._room;
  if (!room || !room.started || !room.host) return;
  // relay guest intent to the host, tagging the sender
  send(room.host, 'intent', { from: ws._pid, intent: payload });
}

function handleSnapshot(ws, payload) {
  const room = ws._room;
  if (!room || room.host !== ws || !room.started) return;
  // host broadcasts authoritative state to all guests (NOT back to host — host is authority)
  broadcast(room, 'snapshot', payload, ws);
}

function handleLeave(ws) {
  const room = ws._room;
  if (!room) return;
  room.clients.delete(ws);
  ws._room = null;
  if (room.clients.size === 0) { rooms.delete(room.code); return; }
  // If host left, promote the next client as host.
  if (room.host === ws) {
    room.host = [...room.clients.keys()][0];
    const hc = room.clients.get(room.host);
    if (hc) hc.isHost = true;
  }
  room.started = false; // a disconnect resets the lobby so state stays consistent
  broadcast(room, 'room', roomInfo(room));
  broadcast(room, 'lobbyReset', { message: 'A player left — back to lobby.' });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try a different port:`);
    console.error(`  PORT=3101 node server.js`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`Snakes & Ladders online server running at http://localhost:${PORT}`);
});
