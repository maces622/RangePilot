import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GtoClient } from '../gto-client.ts'
import { GtoSolveJob, type GtoSolveJobManager } from '../jobs/solve-job.ts'
import { preflightSolveStart, type SolveBudget } from '../policy/solve-approval.ts'
import { structuredError } from '../tool-errors.ts'
import type { GtoSolveOptions } from '../types.ts'
import { ERROR_SCHEMA, errorValue, parseSolveOptions, renderJson } from './shared.ts'

export interface StartSolveDeps {
  readonly client: GtoClient
  readonly manager: GtoSolveJobManager
  readonly budget: SolveBudget
  readonly pollIntervalMs: number
}

export function registerStartSolveTool(ctx: Context, deps: StartSolveDeps): void {
  ctx.tools.register(defineTool({
    name: 'gto_start_solve',
    description: 'Start an approved GTO solve as a DSH background job and return the DSH job id immediately.',
    parameters: {
      expectedRevision: {
        type: 'integer',
        required: true,
        description: 'Revision returned by gto_get_state; a mismatch is rejected with STATE_CONFLICT.',
      },
      options: {
        type: 'json',
        required: true,
        description: 'SolveOptions: maxIterations, targetExploitability, threads, algorithm, and optional printInterval/dumpRounds.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          jobId: { type: 'string' },
          state: { type: 'string' },
          error: ERROR_SCHEMA,
        },
      },
      render: (_args, value) => renderJson(value),
    },
    async execute(args, exec) {
      try {
        await deps.client.connect()
        if (exec.agent === undefined) {
          return errorValue({
            code: 'GTO_AGENT_REQUIRED',
            message: 'gto_start_solve must run inside an agent Session so the result job can be owned',
          })
        }
        if (deps.manager.activeCount() >= 1) {
          return errorValue({
            code: 'SOLVER_BUSY',
            message: 'Another GTO solve is already active',
          })
        }
        const options: GtoSolveOptions = parseSolveOptions(args.options)
        const preflight = await preflightSolveStart(
          { expectedRevision: args.expectedRevision, options },
          deps.budget,
          () => deps.client.getState(),
        )
        if (!preflight.ok) return errorValue(preflight.error)

        const job = new GtoSolveJob(deps.client, args.expectedRevision, options, {
          pollIntervalMs: deps.pollIntervalMs,
          maxRuntimeMs: deps.budget.maxRuntimeMs,
        })
        const label = `GTO solve: ${preflight.state.spot.positions.join(' vs ')} board ${preflight.state.spot.board.join(' ') || '(preflop)'}`
        const dshJobId = ctx.jobs.start({
          kind: 'gto-solve',
          label,
          owner: exec.agent.session.id,
          toolCall: { callId: exec.callId, rootCallId: exec.rootCallId },
          outputLimitBytes: 64 * 1024,
          run: handle => {
            deps.manager.register(handle.id, job)
            return job.run(handle)
          },
        })
        return { ok: true, jobId: dshJobId, state: 'running' }
      } catch (error: unknown) {
        return errorValue(structuredError(error))
      }
    },
    presentCall: args => ({
      card: 'generic',
      title: `Start GTO solve at revision ${String(args.expectedRevision)}`,
      kind: 'execute',
    }),
  }))
}
