// Headless integration test for online multiplayer (host is authority).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3100;
const html = fs.readFileSync(__dirname + '/snake-and-ladders.html', 'utf8');
// Inject a test hook exposing script-scoped consts/functions onto window.
const hooked = html.replace(
  'generateSpecialCells(); deck=buildDeck(); discard=[]; buildNameGrid(); buildBoard(); renderAll();\n</script>',
  'generateSpecialCells(); deck=buildDeck(); discard=[]; buildNameGrid(); buildBoard(); renderAll();\nwindow.__T={Net,serializeState,doRoll,choosePiece,nextTurn,applySnapshot};window.__dbg={};\n</script>');

function makeClient(name) {
  const dom = new JSDOM(hooked, { runScripts: 'dangerously', pretendToBeVisual: true, url: `http://localhost:${PORT}/` });
  const w = dom.window;
  w.WebSocket = WebSocket;
  w.requestAnimationFrame = cb => setTimeout(cb, 0);
  return w;
}

const clients = [];
function register(name) {
  const w = makeClient(name);
  const rec = { w, name, errors: [] };
  w.addEventListener('error', e => rec.errors.push(e.error && e.error.stack || e.message));
  clients.push(rec);
  return rec;
}

function actIfMyTurn(rec) {
  const w = rec.w, T = w.__T, Net = w.__T.Net;
  const s = T.serializeState();
  if (s.gameOver) return;
  // Only the host (authority) executes engine actions. Guests may only send
  // intents for the player that is THEMSELVES the current player.
  const isCurrentPlayerHost = Net.isHost && s.current === 0;
  const isCurrentPlayerGuest = !Net.isHost && s.current === 1;
  if (!Net.isHost && !isCurrentPlayerGuest) return; // guest: only act on own turn
  if (Net.isHost && !isCurrentPlayerHost) {
    // host's turn is already handled when current===0; otherwise idle (guest will send intent)
    return;
  }
  if (Net.isHost) {
    if (s.phase === 'roll') { T.doRoll(); rec.dbgRolls = (rec.dbgRolls||0)+1; }
    else if (s.phase === 'choose') {
      const pl = s.players[s.current];
      let pick = -1;
      for (let i = 0; i < pl.pieces.length; i++) {
        const pc = pl.pieces[i];
        if (pc.pos < 100 && pc.swamp === 0) { pick = i; break; }
      }
      if (pick >= 0) { try { T.choosePiece(pick); } catch (e) {} }
      else { T.nextTurn && T.nextTurn(false); }
    }
  } else {
    if (s.phase === 'roll') { Net.intent('roll'); rec.dbgRolls = (rec.dbgRolls||0)+1; }
    else if (s.phase === 'choose') {
      const pl = s.players[s.current];
      let pick = -1;
      for (let i = 0; i < pl.pieces.length; i++) {
        const pc = pl.pieces[i];
        if (pc.pos < 100 && pc.swamp === 0) { pick = i; break; }
      }
      if (pick >= 0) Net.intent('choosePiece', { idx: pick });
    }
  }
}

let steps = 0;
let consistencyFail = 0;
let lastPhase = ['', ''];
const phaseLog = [];
const start = Date.now();

function snap(rec) {
  try { return rec.w.__T.serializeState(); } catch (e) { return null; }
}

function stableKey(s) {
  // Only compare authoritative gameplay state, not volatile animation/overlay frames.
  return JSON.stringify({
    players: s.players.map(p => ({ coins: p.coins, hand: p.hand, totalMoves: p.totalMoves, guns: p.guns, pieces: p.pieces.map(x => ({ pos: x.pos, level: x.level, moves: x.moves, hurricane: x.hurricane, swamp: x.swamp })) })),
    current: s.current, round: s.round, gameOver: s.gameOver, phase: s.phase, pendingRoll: s.pendingRoll,
  });
}

function tick() {
  for (const rec of clients) {
    const w = rec.w;
    if (w.__T && w.__T.Net && w.__T.Net.room && w.__T.Net.room.started) {
      actIfMyTurn(rec);
    }
  }
  if (clients.length >= 2) {
    const a = snap(clients[0]); const b = snap(clients[1]);
    if (a && b) {
      const ka = stableKey(a); const kb = stableKey(b);
      if (ka !== kb) { consistencyFail++; }
      const ph = a.current + ':' + a.phase;
      if (ph !== lastPhase[0]) { lastPhase[0] = ph; }
      const pg = b.current + ':' + b.phase;
      if (pg !== lastPhase[1]) { lastPhase[1] = pg; }
    }
  }
  steps++;
  if (Date.now() - start < 40000 && steps < 5000) {
    setTimeout(tick, 40);
  } else {
    finish();
  }
}

function finish() {
  const a = snap(clients[0]); const b = snap(clients[1]);
  const consistent = stableKey(a) === stableKey(b);
  const aPieces = a.players.map(p => p.pieces.map(x => x.pos));
  const bPieces = b.players.map(p => p.pieces.map(x => x.pos));
  console.log('STEPS', steps, 'consistencyMismatches', consistencyFail, 'finalConsistent', consistent);
  console.log('host current', a.current, 'phase', a.phase, 'gameOver', a.gameOver, 'round', a.round);
  console.log('host pieces', JSON.stringify(aPieces));
  console.log('guest pieces', JSON.stringify(bPieces));
  console.log('pieces identical', JSON.stringify(aPieces) === JSON.stringify(bPieces));
  console.log('total errors', clients.flatMap(c => c.errors).length);
  console.log('host rolls sent', clients[0].dbgRolls, 'guest rolls sent', clients[1].dbgRolls);
  if (phaseLog.length) console.log('phaseTrace', phaseLog.slice(0, 12).join(' | '));
  process.exit(consistent && clients.flatMap(c => c.errors).length === 0 ? 0 : 1);
}

(async () => {
  const host = register('Host');
  const guest = register('Guest');
  await new Promise(r => setTimeout(r, 400));
  host.w.document.getElementById('lobbyName').value = 'Host';
  host.w.document.getElementById('btnCreate').click();
  await new Promise(r => setTimeout(r, 400));
  const code = host.w.__T.Net.room && host.w.__T.Net.room.code;
  if (!code) { console.log('NO ROOM CODE'); process.exit(2); }
  console.log('room code', code);
  guest.w.document.getElementById('lobbyName').value = 'Guest';
  guest.w.document.getElementById('lobbyCode').value = code;
  guest.w.document.getElementById('btnJoin').click();
  await new Promise(r => setTimeout(r, 500));
  console.log('host online', host.w.__T.Net.online, 'guest online', guest.w.__T.Net.online, 'guest isHost', guest.w.__T.Net.isHost);
  host.w.document.getElementById('btnStart').click();
  await new Promise(r => setTimeout(r, 500));
  console.log('room started?', host.w.__T.Net.room && host.w.__T.Net.room.started, 'players', host.w.__T.serializeState().players.map(p => p.name));
  tick();
})();
