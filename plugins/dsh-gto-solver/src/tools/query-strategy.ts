import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GtoClient } from '../gto-client.ts'
import type { GtoSolveJobManager } from '../jobs/solve-job.ts'
import { structuredError } from '../tool-errors.ts'
import { ERROR_SCHEMA, errorValue, renderJson } from './shared.ts'

function isNonEmptyString(value: string): boolean {
  return value.length > 0
}

export function registerQueryStrategyTool(
  ctx: Context,
  client: GtoClient,
  manager: GtoSolveJobManager,
): void {
  ctx.tools.register(defineTool({
    name: 'gto_query_strategy',
    description: 'Query one action node strategy summary for a completed DSH GTO solve job. Large matrices stay in artifacts.',
    parameters: {
      jobId: {
        type: 'string',
        required: true,
        description: 'DSH job id returned by gto_start_solve.',
      },
      nodeId: {
        type: 'string',
        required: true,
        description: 'Deterministic node id such as root, root/a0, or root/a0/cAh/a1.',
      },
      actions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional action-name filter.',
      },
      limit: {
        type: 'integer',
        description: 'Maximum action summaries (1-100, default 100).',
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
          nodeId: { type: 'string' },
          actions: { type: 'array', items: { type: 'json' } },
          comboCount: { type: 'integer' },
          exploitability: { type: 'number' },
          artifactRef: { type: 'string' },
          error: ERROR_SCHEMA,
        },
      },
      render: (_args, value) => renderJson(value),
    },
    async execute(args, exec) {
      try {
        await client.connect()
        if (!isNonEmptyString(args.nodeId)) {
          return errorValue({ code: 'INVALID_NODE_ID', message: 'nodeId must be a non-empty string' })
        }
        const solveJob = manager.get(args.jobId)
        if (solveJob === undefined) {
          return errorValue({
            code: 'GTO_JOB_NOT_FOUND',
            message: `No GTO solve job is associated with DSH job ${args.jobId}`,
          })
        }
        const gtoJobId = solveJob.gtoJobId
        if (gtoJobId === undefined) {
          return errorValue({
            code: 'RESULT_NOT_READY',
            message: 'The GTO solve has not started yet',
          })
        }
        const result = await client.queryStrategy(
          gtoJobId,
          args.nodeId,
          args.actions ?? [],
          args.limit ?? 100,
          exec.signal,
        )
        return {
          ok: true,
          jobId: args.jobId,
          gtoJobId,
          nodeId: result.nodeId,
          actions: result.actions,
          ...result.comboCount === undefined ? {} : { comboCount: result.comboCount },
          ...result.exploitability === undefined ? {} : { exploitability: result.exploitability },
          ...result.artifactRef === undefined ? {} : { artifactRef: result.artifactRef },
        }
      } catch (error: unknown) {
        return errorValue(structuredError(error))
      }
    },
    presentCall: args => ({
      card: 'generic',
      title: `Query GTO strategy ${args.nodeId}`,
      kind: 'read',
    }),
  }))
}
