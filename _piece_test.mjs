// Verify dynamic pieces-per-player in snake-and-ladders.html
import fs from 'fs';
import { JSDOM } from 'jsdom';
const html = fs.readFileSync('./snake-and-ladders.html', 'utf8');
const hook = `
window.__T = {
  get players(){ return players; },
  get piecesPerPlayer(){ return piecesPerPlayer; },
  set piecesPerPlayer(v){ piecesPerPlayer = v; },
  getClamped(){ return currentPiecesPerPlayer(); },
  buildPiecesForPlayer,
  buildNameGrid, startGame,
  get setupOpen(){ return document.getElementById('setupOverlay').style.display; },
  get piecesBtns(){ return [...document.querySelectorAll('[data-pieces]')]; },
};`;
const idx = html.lastIndexOf('</script>');
const temp = html.slice(0, idx) + hook + html.slice(idx);
fs.writeFileSync('./_piece_test.html', temp);
const errors = [];
const dom = new JSDOM(temp, { runScripts:'dangerously', pretendToBeVisual:true });
const { window } = dom; const doc = window.document;
window.addEventListener('error', e => errors.push(e.message));
await new Promise(r=>setTimeout(r,300));
const G = window.__T;
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const pass=(n,c,x='')=>console.log((c?'PASS':'FAIL')+' — '+n+(x?' :: '+x:''));

// ---- clamp logic ----
pass('clamp: 5 -> 4', G.buildPiecesForPlayer('X','#fff',5).pieces.length===4, 'len='+G.buildPiecesForPlayer('X','#fff',5).pieces.length);
pass('clamp: 0 -> 1', G.buildPiecesForPlayer('X','#fff',0).pieces.length===1);
pass('clamp: -3 -> 1', G.buildPiecesForPlayer('X','#fff',-3).pieces.length===1);
pass('clamp: 2 stays 2', G.buildPiecesForPlayer('X','#fff',2).pieces.length===2);
pass('clamp: 4 stays 4', G.buildPiecesForPlayer('X','#fff',4).pieces.length===4);
pass('currentPiecesPerPlayer default 4', G.getClamped()===4);

// ---- click the pieces=2 button in the setup overlay ----
const b2 = G.piecesBtns.find(b=>b.dataset.pieces==='2');
if(b2){
  b2.click();
  await sleep(50);
  pass('pieces var set to 2 via button', G.piecesPerPlayer===2, 'piecesPerPlayer='+G.piecesPerPlayer);
} else pass('pieces=2 button exists', false);

// ---- start game with 2 pieces each, 3 players ----
doc.querySelector('[data-players="3"]').click();
await sleep(50);
G.startGame();
await sleep(100);
pass('3 players created', G.players.length===3);
pass('each player has 2 pieces', G.players.every(p=>p.pieces.length===2), G.players.map(p=>p.pieces.length).join(','));
pass('setup overlay closed', G.setupOpen==='none');

// ---- play again keeps the same piece count ----
doc.getElementById('playAgain').click();
await sleep(100);
pass('playAgain keeps 2 pieces each', G.players.every(p=>p.pieces.length===2), G.players.map(p=>p.pieces.length).join(','));

// ---- 1 piece (min) ----
G.piecesPerPlayer = 1;
const p1 = G.buildPiecesForPlayer('Solo','#fff',1);
pass('1 piece player', p1.pieces.length===1);

// ---- 4 pieces (max) ----
G.piecesPerPlayer = 4;
const p4 = G.buildPiecesForPlayer('Full','#fff');
pass('4 pieces player', p4.pieces.length===4);

console.log('Runtime errors:', errors.length, errors.slice(0,3).join(' | '));