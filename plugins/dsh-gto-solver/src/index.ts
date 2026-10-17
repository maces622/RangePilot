import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defaultDiscoveryFilePath } from './discovery.ts'
import { GtoClient } from './gto-client.ts'
import { GtoSolveJobManager } from './jobs/solve-job.ts'
import { preflightSolveStart } from './policy/solve-approval.ts'
import { structuredError } from './tool-errors.ts'
import { registerGetSolveStatusTool } from './tools/get-solve-status.ts'
import { registerGetStateTool } from './tools/get-state.ts'
import { registerQueryStrategyTool } from './tools/query-strategy.ts'
import { registerSetSpotTool } from './tools/set-spot.ts'
import { registerStartSolveTool } from './tools/start-solve.ts'
import { parseSolveOptions } from './tools/shared.ts'

export const name = 'dsh-gto-solver'
export const inject = ['tools', 'jobs']

export interface Config {
  /** Discovery file written by TexasSolverGui. Defaults to RangePilot's per-user path. */
  readonly discoveryFile?: string
  /** Timeout for one local JSON-RPC request. */
  readonly requestTimeoutMs?: number
  /** Reconnect delay after the local WebSocket closes unexpectedly. */
  readonly reconnectDelayMs?: number
  /** Poll period for an active GTO solve. */
  readonly pollIntervalMs?: number
  /** Hard per-solve iteration ceiling. */
  readonly maxIterations?: number
  /** Hard per-solve thread ceiling. */
  readonly maxThreads?: number
  /** Hard per-solve wall-clock budget; the job cancels the remote solve on expiry. */
  readonly maxRuntimeMs?: number
  /** Lower targets cost more compute; reject values below this floor. */
  readonly minTargetExploitability?: number
}

export const Config: z<Config> = z.object({
  discoveryFile: z.string(),
  requestTimeoutMs: z.number().min(1000).default(15_000),
  reconnectDelayMs: z.number().min(100).default(1_000),
  pollIntervalMs: z.number().min(100).default(500),
  maxIterations: z.number().min(1).default(500),
  maxThreads: z.number().min(1).default(16),
  maxRuntimeMs: z.number().min(1_000).default(600_000),
  minTargetExploitability: z.number().min(0).default(0.05),
})

interface StartArgs {
  readonly expectedRevision: number
  readonly options: unknown
}

function parseStartArgs(value: unknown): StartArgs {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('gto_start_solve arguments must be an object')
  }
  const record = value as Record<string, unknown>
  const expectedRevision = record.expectedRevision
  if (typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error('expectedRevision must be a non-negative integer')
  }
  return { expectedRevision, options: record.options }
}

export function apply(ctx: Context, config: Config): void {
  const maxIterations = config.maxIterations ?? 500
  const maxThreads = config.maxThreads ?? 16
  const maxRuntimeMs = config.maxRuntimeMs ?? 600_000
  const minTargetExploitability = config.minTargetExploitability ?? 0.05
  const pollIntervalMs = config.pollIntervalMs ?? 500
  const client = new GtoClient({
    discoveryFile: config.discoveryFile ?? defaultDiscoveryFilePath(),
    requestTimeoutMs: config.requestTimeoutMs ?? 15_000,
    reconnectDelayMs: config.reconnectDelayMs ?? 1_000,
  })
  const manager = new GtoSolveJobManager()
  const budget = {
    maxIterations,
    maxThreads,
    maxRuntimeMs,
    minTargetExploitability,
  }

  ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec.name !== 'gto_start_solve') return next()
    try {
      const args = parseStartArgs(exec.arguments)
      const options = parseSolveOptions(args.options)
      if (manager.activeCount() >= 1) {
        return {
          kind: 'deny',
          reason: 'Another GTO solve is already active. Stop or wait for it before starting a new solve.',
          info: { name: 'GtoToolError', code: 'SOLVER_BUSY' },
        }
      }
      await client.connect()
      const preflight = await preflightSolveStart(
        { expectedRevision: args.expectedRevision, options },
        budget,
        () => client.getState(),
      )
      if (!preflight.ok) {
        return {
          kind: 'deny',
          reason: `${preflight.error.code}: ${preflight.error.message}`,
          info: {
            name: 'GtoToolError',
            code: preflight.error.code,
            reason: preflight.error.message,
          },
        }
      }
      return { kind: 'ask', reason: preflight.approvalReason }
    } catch (error: unknown) {
      const structured = structuredError(error)
      return {
        kind: 'deny',
        reason: `${structured.code}: ${structured.message}`,
        info: { name: 'GtoToolError', code: structured.code, reason: structured.message },
      }
    }
  })

  registerGetStateTool(ctx, client)
  registerSetSpotTool(ctx, client)
  registerStartSolveTool(ctx, { client, manager, budget, pollIntervalMs })
  registerGetSolveStatusTool(ctx, client, manager)
  registerQueryStrategyTool(ctx, client, manager)

  ctx.effect(() => () => {
    manager.cancelAll()
    client.close()
  }, 'dsh-gto-solver cleanup')
}
