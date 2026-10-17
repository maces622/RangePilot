import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GtoClient } from '../gto-client.ts'
import { structuredError } from '../tool-errors.ts'
import { ERROR_SCHEMA, errorValue, renderJson } from './shared.ts'

export function registerGetStateTool(ctx: Context, client: GtoClient): void {
  ctx.tools.register(defineTool({
    name: 'gto_get_state',
    description: 'Read the current GTO Solver spot, revision, tree summary, solve status, and selected result node.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          state: { type: 'json' },
          error: ERROR_SCHEMA,
        },
      },
      render: (_args, value) => renderJson(value),
    },
    async execute() {
      try {
        await client.connect()
        return { ok: true, state: await client.getState() }
      } catch (error: unknown) {
        return errorValue(structuredError(error))
      }
    },
    presentCall: () => ({ card: 'generic', title: 'Read GTO state', kind: 'read' }),
  }))
}
