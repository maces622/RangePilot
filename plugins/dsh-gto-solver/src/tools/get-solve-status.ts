import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GtoClient } from '../gto-client.ts'
import type { GtoSolveJobManager } from '../jobs/solve-job.ts'
import { structuredError } from '../tool-errors.ts'
import { ERROR_SCHEMA, errorValue, renderJson } from './shared.ts'

export function registerGetSolveStatusTool(
  ctx: Context,
  client: GtoClient,
  manager: GtoSolveJobManager,
): void {
  ctx.tools.register(defineTool({
    name: 'gto_get_solve_status',
    description: 'Read progress, iterations, exploitability, and terminal status for a DSH GTO solve job.',
    parameters: {
      jobId: {
        type: 'string',
        required: true,
        description: 'DSH job id returned by gto_start_solve.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          jobId: { type: 'string' },
          gtoJobId: { type: 'string' },
          state: { type: 'string' },
          progress: { type: 'number' },
          iterations: { type: 'integer' },
          exploitability: { type: 'number' },
          elapsedMs: { type: 'number' },
          error: ERROR_SCHEMA,
        },
      },
      render: (_args, value) => renderJson(value),
    },
    async execute(args, exec) {
      try {
        await client.connect()
        const solveJob = manager.get(args.jobId)
        if (solveJob === undefined) {
          return errorValue({
            code: 'GTO_JOB_NOT_FOUND',
            message: `No GTO solve job is associated with DSH job ${args.jobId}`,
          })
        }
        const gtoJobId = solveJob.gtoJobId
        if (gtoJobId === undefined) {
          return { ok: true, jobId: args.jobId, state: 'starting', progress: 0 }
        }
        const status = await client.getSolveStatus(gtoJobId, exec.signal)
        return {
          ok: true,
          jobId: args.jobId,
          gtoJobId,
          state: status.state,
          progress: status.progress,
          ...status.iterations === undefined ? {} : { iterations: status.iterations },
          ...status.exploitability === undefined ? {} : { exploitability: status.exploitability },
          ...status.elapsedMs === undefined ? {} : { elapsedMs: status.elapsedMs },
        }
      } catch (error: unknown) {
        return errorValue(structuredError(error))
      }
    },
    presentCall: args => ({
      card: 'generic',
      title: `Read GTO solve ${args.jobId}`,
      kind: 'read',
    }),
  }))
}
