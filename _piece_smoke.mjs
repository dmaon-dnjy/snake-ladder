// Smoke: full random play with 2 pieces per player — ensure no errors & game advances.
import fs from 'fs';
import { JSDOM } from 'jsdom';
const html = fs.readFileSync('./snake-and-ladders.html', 'utf8');
const hook = `
window.__T = {
  get players(){ return players; }, get current(){ return current; },
  get gameOver(){ return gameOver; }, get phase(){ return phase; }, get movePickMode(){ return movePickMode; },
  get hand(){ return players[current].hand; },
  get cardOverlayOpen(){ return document.getElementById('cardOverlay').style.display==='grid'; },
  get mergeOverlayOpen(){ return document.getElementById('mergeOverlay').style.display==='grid'; },
  get selectableSlot(){ const s=[...document.querySelectorAll('.piece-slot.selectable')]; return s.length? s[0] : null; },
  get drawBtn(){ return document.getElementById('cardDraw'); },
  get confirmBtn(){ return document.getElementById('cardConfirm'); },
  get takeCoinBtn(){ return document.getElementById('cardTakeCoin'); },
  get mergeKeepBtn(){ return document.getElementById('mergeKeep'); },
  get mergeUpBtn(){ return document.getElementById('mergeLevelUp'); },
  startGame,
};`;
const idx = html.lastIndexOf('</script>');
const temp = html.slice(0, idx) + hook + html.slice(idx);
fs.writeFileSync('./_piece_smoke.html', temp);
const errors = [];
const dom = new JSDOM(temp, { runScripts:'dangerously', pretendToBeVisual:true });
const { window } = dom; const doc = window.document;
window.addEventListener('error', e => errors.push(e.message));
await new Promise(r=>setTimeout(r,300));
const G = window.__T;
const sleep = ms=>new Promise(r=>setTimeout(r,ms));

// start with 2 pieces each
window.eval("document.querySelector('[data-pieces=\\\"2\\\"]').click()");
window.eval("document.querySelector('[data-players=\\\"4\\\"]').click()");
G.startGame();
await sleep(150);
console.log('Setup: 4 players, pieces each =', G.players[0].pieces.length);

let safety = 250;
let turns = 0;
async function waitPhaseChange(fromPhase, maxMs=6000){
  const start=Date.now();
  while(Date.now()-start < maxMs && G.phase===fromPhase){ await sleep(100); }
}
while(safety-- > 0 && !G.gameOver && turns < 60){
  if(G.cardOverlayOpen){
    const revealVisible = doc.getElementById('cardRevealActions').style.display !== 'none';
    if(revealVisible && G.confirmBtn){ G.confirmBtn.click(); await sleep(300); }
    else if(G.drawBtn && Math.random()<0.5){ G.drawBtn.click(); await sleep(700); }
    else if(G.takeCoinBtn){ G.takeCoinBtn.click(); await sleep(300); }
    await sleep(150);
  }
  else if(G.mergeOverlayOpen){
    if(Math.random()<0.5 && G.mergeUpBtn) G.mergeUpBtn.click(); else if(G.mergeKeepBtn) G.mergeKeepBtn.click();
    await sleep(300);
  }
  else if(G.movePickMode){
    const targets=[...doc.querySelectorAll('.move-pick-target')];
    if(targets.length){ targets[0].click(); await sleep(350); }
  }
  else if(G.phase==='roll'){
    const dice=doc.getElementById('dice'); if(dice) dice.click();
    // The roll animation takes ~560ms (plus a 700ms pause when no piece can
    // move) before the phase settles on 'choose' (pick a piece) or 'roll'
    // (next player's turn). Poll for the phase to LEAVE 'animating' rather
    // than racing a fixed sleep / specific value.
    await waitPhaseChange('animating');
    turns++;
  }
  else if(G.phase==='animating'){
    // A piece is mid-move (170ms per step + elevator/combat pauses).
    // Wait for it to settle before deciding what to click next.
    await waitPhaseChange('animating');
  }
  else {
    const slot=G.selectableSlot; if(slot) slot.click();
    await waitPhaseChange('choose', 3000);
    if(G.phase==='choose'){ /* click didn't register — loop will retry */ }
    else await sleep(200);
  }
}
await sleep(300);
console.log('Turns played:', turns, '| gameOver:', G.gameOver, '| current:', G.current);
console.log('Piece counts now:', G.players.map(p=>p.pieces.length).join(','));
console.log('Runtime errors:', errors.length, errors.slice(0,4).join(' | '));
process.exit(0);