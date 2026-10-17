import type { GtoSolveOptions, GtoStateSnapshot, StructuredToolError } from '../types.ts'

export interface SolveBudget {
  readonly maxIterations: number
  readonly maxThreads: number
  readonly maxRuntimeMs: number
  readonly minTargetExploitability: number
}

export interface SolveStartInput {
  readonly expectedRevision: number
  readonly options: GtoSolveOptions
}

export type SolvePreflight =
  | {
    readonly ok: true
    readonly state: GtoStateSnapshot
    readonly approvalReason: string
  }
  | {
    readonly ok: false
    readonly error: StructuredToolError
  }

function budgetError(code: string, message: string): SolvePreflight {
  return { ok: false, error: { code, message } }
}

export async function preflightSolveStart(
  input: SolveStartInput,
  budget: SolveBudget,
  getState: () => Promise<GtoStateSnapshot>,
): Promise<SolvePreflight> {
  const options = input.options
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
    return budgetError('INVALID_REVISION', 'expectedRevision must be a non-negative integer')
  }
  if (!Number.isSafeInteger(options.maxIterations) || options.maxIterations < 1) {
    return budgetError('INVALID_SOLVE_OPTIONS', 'maxIterations must be a positive integer')
  }
  if (options.maxIterations > budget.maxIterations) {
    return budgetError('SOLVE_BUDGET_EXCEEDED', `maxIterations exceeds the configured limit of ${budget.maxIterations}`)
  }
  if (!Number.isSafeInteger(options.threads) || options.threads < 1) {
    return budgetError('INVALID_SOLVE_OPTIONS', 'threads must be a positive integer')
  }
  if (options.threads > budget.maxThreads) {
    return budgetError('SOLVE_BUDGET_EXCEEDED', `threads exceeds the configured limit of ${budget.maxThreads}`)
  }
  if (!Number.isFinite(options.targetExploitability) || options.targetExploitability < budget.minTargetExploitability) {
    return budgetError(
      'SOLVE_BUDGET_EXCEEDED',
      `targetExploitability must be at least ${budget.minTargetExploitability}`,
    )
  }

  let state: GtoStateSnapshot
  try {
    state = await getState()
  } catch {
    return budgetError('GTO_UNAVAILABLE', 'Cannot read current GTO state; solve was not started')
  }
  if (state.revision !== input.expectedRevision) {
    return budgetError(
      'STATE_CONFLICT',
      `State revision conflict: expected ${input.expectedRevision}, actual ${state.revision}`,
    )
  }

  const spot = state.spot
  const positions = spot.positions.join(' vs ')
  const board = spot.board.length > 0 ? spot.board.join(' ') : '(preflop)'
  const approvalReason = [
    `Start GTO solve for ${positions}; board ${board}; pot ${spot.pot ?? 0}; effective stack ${spot.effectiveStackBb}bb.`,
    `Budget: maxIterations=${options.maxIterations}, threads=${options.threads}, targetExploitability=${options.targetExploitability}, algorithm=${options.algorithm}, maxRuntimeMs=${budget.maxRuntimeMs}.`,
    'This approval applies only to this solve request.',
  ].join(' ')
  return { ok: true, state, approvalReason }
}
