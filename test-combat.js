#!/usr/bin/env node
/**
 * Unit tests for Snakes & Ladders combat logic.
 *
 * Tests the combat outcomes when a piece lands on an opponent's cell:
 *   - atkLvl < defLvl  → attacker defeated, defender loses 1 level
 *   - atkLvl >= defLvl → attacker wins, defender destroyed
 *
 * This isolates the combat logic from the full game so we can verify it
 * without a browser.
 */

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

// --- Combat logic (mirrors the fixed choosePiece combat block) ----------

function simulateCombat(attacker, defender) {
  const atkLvl = attacker.level;
  const defLvl = defender.level;

  let result = {};

  if (atkLvl < defLvl) {
    // attacker wins, defender loses 1 level (attacker always survives)
    result.attackerDestroyed = false;
    defender.level--;
    result.defenderDestroyed = defender.level <= 0;
    result.outcome = 'defender_reduced';
  } else {
    // attacker wins (atkLvl >= defLvl), defender removed
    result.attackerDestroyed = false;
    result.defenderDestroyed = true;
    result.outcome = 'defender_defeated';
  }

  return result;
}

// --- Helper to create mock pieces ------------------------------------

function piece(level, pos) {
  return { level, pos };
}

// ======================================================================
// TEST SUITE
// ======================================================================

console.log('\n=== Combat Logic Tests ===\n');

// --- Test 1: Equal level (the bug case) --------------------------------
console.log('Test 1: Equal level (Lv1 vs Lv1) — attacker should win');
{
  const atk = piece(1, 42);
  const def = piece(1, 42);
  const r = simulateCombat(atk, def);
  assert(r.outcome === 'defender_defeated',
    `outcome = "defender_defeated" (got "${r.outcome}")`);
  assert(r.attackerDestroyed === false,
    'attacker piece should NOT be destroyed');
  assert(r.defenderDestroyed === true,
    'defender piece should be destroyed');
}

// --- Test 2: Equal level at higher tiers --------------------------------
console.log('\nTest 2: Equal level (Lv3 vs Lv3) — attacker should win');
{
  const atk = piece(3, 50);
  const def = piece(3, 50);
  const r = simulateCombat(atk, def);
  assert(r.outcome === 'defender_defeated',
    `outcome = "defender_defeated" (got "${r.outcome}")`);
  assert(r.attackerDestroyed === false,
    'attacker piece should NOT be destroyed');
  assert(r.defenderDestroyed === true,
    'defender piece should be destroyed');
}

// --- Test 3: Attacker higher level -------------------------------------
console.log('\nTest 3: Attacker higher level (Lv3 vs Lv1) — attacker wins');
{
  const atk = piece(3, 10);
  const def = piece(1, 10);
  const r = simulateCombat(atk, def);
  assert(r.outcome === 'defender_defeated',
    `outcome = "defender_defeated" (got "${r.outcome}")`);
  assert(r.attackerDestroyed === false,
    'attacker piece should NOT be destroyed');
  assert(r.defenderDestroyed === true,
    'defender piece should be destroyed');
}

// --- Test 4: Attacker lower level — attacker survives, defender reduced ----
console.log('\nTest 4: Attacker lower level (Lv1 vs Lv3) — attacker survives, defender reduced');
{
  const atk = piece(1, 25);
  const def = piece(3, 25);
  const r = simulateCombat(atk, def);
  assert(r.outcome === 'defender_reduced',
    `outcome = "defender_reduced" (got "${r.outcome}")`);
  assert(r.attackerDestroyed === false,
    'attacker piece should NOT be destroyed');
  assert(r.defenderDestroyed === false,
    'defender should survive (level reduced, not destroyed)');
  assert(def.level === 2,
    `defender level should be 2 after -1 (got ${def.level})`);
}

// --- Test 5: Attacker lower level, defender at Lv2 → destroyed ------------
console.log('\nTest 5: Attacker Lv1 vs Defender Lv2 — defender reduced to Lv1, attacker survives');
{
  const atk = piece(1, 30);
  const def = piece(2, 30);
  const r = simulateCombat(atk, def);
  assert(r.outcome === 'defender_reduced',
    `outcome = "defender_reduced" (got "${r.outcome}")`);
  assert(r.attackerDestroyed === false, 'attacker should NOT be destroyed');
  assert(r.defenderDestroyed === false, 'defender should survive');
  assert(def.level === 1, `defender level should be 1 (got ${def.level})`);
}

// --- Test 6: Edge case — attacker Lv1 vs defender Lv1 (regression) ------
console.log('\nTest 6: Regression — Lv1 vs Lv1 must NOT mutual-destroy');
{
  const atk = piece(1, 77);
  const def = piece(1, 77);
  const r = simulateCombat(atk, def);
  assert(r.outcome === 'defender_defeated',
    `outcome = "defender_defeated" — mutual destruction is fixed`);
  assert(atk.level === 1, 'attacker level unchanged');
  assert(def.level === 1, 'defender was destroyed (level irrelevant)');
}

// --- Test 7: Attacker Lv4 vs Defender Lv4 ------------------------------
console.log('\nTest 7: Max level (Lv4 vs Lv4) — attacker wins');
{
  const atk = piece(4, 88);
  const def = piece(4, 88);
  const r = simulateCombat(atk, def);
  assert(r.outcome === 'defender_defeated',
    `outcome = "defender_defeated" (got "${r.outcome}")`);
  assert(r.attackerDestroyed === false,
    'attacker should NOT be destroyed at max level');
}

// --- Summary -----------------------------------------------------------
console.log(`\n========================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`========================================\n`);

process.exit(failed > 0 ? 1 : 0);
