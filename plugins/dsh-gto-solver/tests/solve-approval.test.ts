import test from 'node:test'
import assert from 'node:assert/strict'
import { preflightSolveStart } from '../src/policy/solve-approval.ts'
import type { GtoStateSnapshot } from '../src/types.ts'

const budget = {
  maxIterations: 100,
  maxThreads: 4,
  maxRuntimeMs: 60_000,
  minTargetExploitability: 0.05,
}

const state: GtoStateSnapshot = {
  revision: 7,
  sessionId: 's1',
  screen: 'main',
  spot: {
    gameType: 'NLHE',
    mode: 'holdem',
    positions: ['OOP', 'IP'],
    effectiveStackBb: 100,
    board: ['Ah', 'Kd', '7c'],
    ranges: { OOP: 'AA', IP: 'KK' },
    pot: 50,
  },
  tree: null,
  solve: null,
  selection: null,
}

test('accepts a revision-matched solve inside budget', async () => {
  const result = await preflightSolveStart({
    expectedRevision: 7,
    options: { maxIterations: 20, targetExploitability: 0.2, threads: 2, algorithm: 'discounted_cfr' },
  }, budget, async () => state)
  assert.equal(result.ok, true)
  if (result.ok) assert.match(result.approvalReason, /maxIterations=20/)
})

test('rejects revision conflicts before approval', async () => {
  const result = await preflightSolveStart({
    expectedRevision: 6,
    options: { maxIterations: 20, targetExploitability: 0.2, threads: 2, algorithm: 'discounted_cfr' },
  }, budget, async () => state)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error.code, 'STATE_CONFLICT')
})

test('rejects hard budget overruns', async () => {
  const result = await preflightSolveStart({
    expectedRevision: 7,
    options: { maxIterations: 101, targetExploitability: 0.2, threads: 2, algorithm: 'discounted_cfr' },
  }, budget, async () => state)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error.code, 'SOLVE_BUDGET_EXCEEDED')
})
