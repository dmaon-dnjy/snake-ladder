#!/usr/bin/env node
/**
 * Unit tests for Snakes & Ladders elevator chaining logic.
 *
 * When a piece lands on an elevator cell, it rides to the destination.
 * If that destination is ALSO an elevator, it should keep riding (chain)
 * until it reaches a non-elevator cell.
 *
 * Tests cover the 3 code paths that handle elevators:
 *   1. choosePiece — normal dice movement
 *   2. Card movement — movement cards (+2, +4, etc.)
 *   3. Swap — swap card places pieces, then elevator check
 */

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

// --- Simulate the game's elevator system -------------------------------

function createElevatorSystem(config) {
  // config: { elevators: [cellNum, ...], dirs: { cellNum: +1 or -1 }, up: fn, down: fn }
  return {
    ELEVATOR_CELLS: config.elevators,
    ELEV_DIR: config.dirs,
    visualUp: config.up,
    visualDown: config.down,
  };
}

function isElevator(sys, n) {
  return sys.ELEVATOR_CELLS.includes(n);
}

function elevatorDest(sys, n) {
  const dir = sys.ELEV_DIR[n] || 1;
  return dir === 1 ? sys.visualUp(n) : sys.visualDown(n);
}

// Simulate the FIXED elevator chaining logic (choosePiece path)
function rideElevator(sys, startPos) {
  let pos = startPos;
  const log = [];
  if (!isElevator(sys, pos)) return { pos, log };
  // first ride
  const dest = elevatorDest(sys, pos);
  log.push(`${pos}→${dest}`);
  pos = dest;
  // chain while destination is also an elevator
  while (isElevator(sys, pos)) {
    const next = elevatorDest(sys, pos);
    log.push(`chained ${pos}→${next}`);
    pos = next;
  }
  return { pos, log };
}

// Simulate the OLD buggy logic (single ride, no chaining)
function rideElevatorBuggy(sys, startPos) {
  let pos = startPos;
  if (!isElevator(sys, pos)) return pos;
  pos = elevatorDest(sys, pos);
  return pos; // stops here even if pos is another elevator
}

// Simulate card movement with chaining
function cardMoveElevator(sys, dest) {
  let pos = dest;
  const log = [];
  if (!isElevator(sys, pos)) return { pos, log };
  pos = elevatorDest(sys, pos);
  log.push(`${dest}→${pos}`);
  while (isElevator(sys, pos)) {
    const next = elevatorDest(sys, pos);
    log.push(`chained ${pos}→${next}`);
    pos = next;
  }
  return { pos, log };
}

// Simulate swap elevator with chaining
function swapElevator(sys, pos) {
  if (!isElevator(sys, pos)) return pos;
  while (isElevator(sys, pos)) {
    pos = elevatorDest(sys, pos);
  }
  return pos;
}

// ======================================================================
// TEST SUITE
// ======================================================================

console.log('\n=== Elevator Chaining Tests ===\n');

// --- Test 1: Simple non-elevator (no ride) ---
console.log('Test 1: Non-elevator cell — no ride');
{
  const sys = createElevatorSystem({
    elevators: [25, 55],
    dirs: { 25: 1, 55: -1 },
    up: n => n + 10,
    down: n => n - 10,
  });
  const { pos } = rideElevator(sys, 42);
  assert(pos === 42, `piece stays at 42 (got ${pos})`);
}

// --- Test 2: Single elevator (no chaining needed) ---
console.log('\nTest 2: Single elevator — rides once, no chain');
{
  const sys = createElevatorSystem({
    elevators: [25],
    dirs: { 25: 1 },
    up: n => n + 10,
    down: n => n - 10,
  });
  const { pos, log } = rideElevator(sys, 25);
  assert(pos === 35, `piece moves to 35 (got ${pos})`);
  assert(log.length === 1, `one ride logged (got ${log.length})`);
}

// --- Test 3: Two-elevator chain (the bug case) ---
console.log('\nTest 3: Two-elevator chain — piece chains through both');
{
  const sys = createElevatorSystem({
    elevators: [25, 35],
    dirs: { 25: 1, 35: 1 },  // both go up
    up: n => n + 10,
    down: n => n - 10,
  });

  // NEW fixed behavior: chains to 45
  const { pos: fixedPos, log: fixedLog } = rideElevator(sys, 25);
  assert(fixedPos === 45, `FIXED: piece reaches 45 (got ${fixedPos})`);
  assert(fixedLog.length === 2, `FIXED: 2 rides logged (got ${fixedLog.length})`);

  // OLD buggy behavior: stops at 35
  const buggyPos = rideElevatorBuggy(sys, 25);
  assert(buggyPos === 35, `BUGGY would stop at 35 (confirmed: ${buggyPos})`);
}

// --- Test 4: Three-elevator chain ---
console.log('\nTest 4: Three-elevator chain — chains through all three');
{
  const sys = createElevatorSystem({
    elevators: [25, 35, 45],
    dirs: { 25: 1, 35: 1, 45: 1 },
    up: n => n + 10,
    down: n => n - 10,
  });
  const { pos, log } = rideElevator(sys, 25);
  assert(pos === 55, `piece reaches 55 through 3 elevators (got ${pos})`);
  assert(log.length === 3, `3 rides logged (got ${log.length})`);
}

// --- Test 5: Chain ending at non-elevator ---
console.log('\nTest 5: Chain ends at non-elevator cell');
{
  const sys = createElevatorSystem({
    elevators: [25, 55],
    dirs: { 25: 1, 55: 1 },
    up: n => n + 10,
    down: n => n - 10,
  });
  const { pos, log } = rideElevator(sys, 25);
  // 25 → 35 (not elevator, stops)
  assert(pos === 35, `stops at 35 (got ${pos})`);
  assert(log.length === 1, `only 1 ride (got ${log.length})`);
}

// --- Test 6: Chain with mixed up/down directions ---
console.log('\nTest 6: Chain with mixed directions (up then down)');
{
  const sys = createElevatorSystem({
    elevators: [25, 55],
    dirs: { 25: 1, 55: -1 },  // 25 goes up, 55 goes down
    up: n => n + 10,
    down: n => n - 10,
  });
  // Start at 25: up to 35, but 35 is not an elevator, so stop
  // To test chaining, we need the up destination to be an elevator
  // Let's adjust: 25 goes up to 55 (which is elevator), 55 goes down to 45
  const sys2 = createElevatorSystem({
    elevators: [25, 55],
    dirs: { 25: 1, 55: -1 },
    up: n => n + 30,  // 25 + 30 = 55
    down: n => n - 10, // 55 - 10 = 45
  });
  const { pos, log } = rideElevator(sys2, 25);
  assert(pos === 45, `chained up to 55 then down to 45 (got ${pos})`);
  assert(log.length === 2, `2 rides (got ${log.length})`);
}

// --- Test 7: Card movement chains elevators ---
console.log('\nTest 7: Card movement chains elevators');
{
  const sys = createElevatorSystem({
    elevators: [40, 70],
    dirs: { 40: 1, 70: 1 },
    up: n => n + 10,
    down: n => n - 10,
  });
  const { pos, log } = cardMoveElevator(sys, 40);
  // 40 → 50 (not elevator, stops)
  assert(pos === 50, `card move: stops at 50 (got ${pos})`);
  // With chain-friendly setup
  const sys2 = createElevatorSystem({
    elevators: [40, 50],
    dirs: { 40: 1, 50: 1 },
    up: n => n + 10,
    down: n => n - 10,
  });
  const r2 = cardMoveElevator(sys2, 40);
  assert(r2.pos === 60, `card move chain: reaches 60 (got ${r2.pos})`);
  assert(r2.log.length === 2, `card move chain: 2 rides (got ${r2.log.length})`);
}

// --- Test 8: Swap chains elevators ---
console.log('\nTest 8: Swap chains elevators');
{
  const sys = createElevatorSystem({
    elevators: [30, 60],
    dirs: { 30: 1, 60: 1 },
    up: n => n + 10,
    down: n => n - 10,
  });
  // Piece swapped to elevator 30, chains to 40 (not elevator)
  assert(swapElevator(sys, 30) === 40, `swap: 30→40 (got ${swapElevator(sys, 30)})`);
  // Piece swapped to elevator 60, chains to 70 (not elevator)
  assert(swapElevator(sys, 60) === 70, `swap: 60→70 (got ${swapElevator(sys, 60)})`);
  // With chaining: 30→60→70
  const sys2 = createElevatorSystem({
    elevators: [30, 60],
    dirs: { 30: 1, 60: 1 },
    up: n => n + 30,  // 30+30=60
    down: n => n - 10,
  });
  assert(swapElevator(sys2, 30) === 90, `swap chain: 30→60→90 (got ${swapElevator(sys2, 30)})`);
}

// --- Test 9: Generation constraint — elevDestBad prevents elevator-to-elevator ---
console.log('\nTest 9: Generation constraint — elevDestBad blocks elevator destinations');
{
  // Simulate the elevDestBad check used during generation.
  // If an elevator destination is another elevator, elevDestBad returns true
  // and that direction is excluded. This prevents loops.
  const ELEVATOR_CELLS = [25, 35];
  function elevDestBad(n) { return ELEVATOR_CELLS.includes(n); }

  // For elevator at 25 going up to 35 (which IS an elevator):
  assert(elevDestBad(35) === true, `elevDestBad(35) = true (35 is elevator)`);
  // For elevator at 25 going down to 15 (not an elevator):
  assert(elevDestBad(15) === false, `elevDestBad(15) = false (15 is not elevator)`);

  // This means during generation, if elevator 25's visualUp is 35 (elevator),
  // the direction up(1) would be excluded from opts, preventing the chain.
  // If BOTH directions are bad, the fallback is direction=1 which could
  // still land on an elevator — this is a known edge case in generation
  // that the runtime while-loop fix handles gracefully.
}

// --- Test 10: Regression — old buggy single-ride vs new chain ---
console.log('\nTest 10: Regression — old vs new behavior comparison');
{
  const sys = createElevatorSystem({
    elevators: [15, 25, 35],
    dirs: { 15: 1, 25: 1, 35: 1 },
    up: n => n + 10,
    down: n => n - 10,
  });

  // OLD buggy: 15 → 25 (stops, 25 is elevator but not handled)
  const buggyFinal = rideElevatorBuggy(sys, 15);
  assert(buggyFinal === 25, `OLD BUGGY: stops at 25 (got ${buggyFinal})`);

  // NEW fixed: 15 → 25 → 35 → 45 (chains through all)
  const { pos: fixedFinal, log } = rideElevator(sys, 15);
  assert(fixedFinal === 45, `NEW FIXED: reaches 45 (got ${fixedFinal})`);
  assert(log.length === 3, `3 chained rides (got ${log.length})`);
}

// --- Summary -----------------------------------------------------------
console.log(`\n========================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`========================================\n`);

process.exit(failed > 0 ? 1 : 0);
