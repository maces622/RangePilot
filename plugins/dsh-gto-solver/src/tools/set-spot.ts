import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GtoClient } from '../gto-client.ts'
import { structuredError } from '../tool-errors.ts'
import { ERROR_SCHEMA, errorValue, parseSpot, renderJson } from './shared.ts'

export function registerSetSpotTool(ctx: Context, client: GtoClient): void {
  ctx.tools.register(defineTool({
    name: 'gto_set_spot',
    description: 'Set the current GTO Solver spot using the exact revision read from gto_get_state.',
    parameters: {
      expectedRevision: {
        type: 'integer',
        required: true,
        description: 'Revision returned by gto_get_state; a mismatch is rejected with STATE_CONFLICT.',
      },
      spot: {
        type: 'json',
        required: true,
        description: 'Complete SpotSpec object accepted by the GTO local API.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          revision: { type: 'integer' },
          normalizedSpot: { type: 'json' },
          error: ERROR_SCHEMA,
        },
      },
      render: (_args, value) => renderJson(value),
    },
    async execute(args, exec) {
      try {
        await client.connect()
        const spot = parseSpot(args.spot)
        const result = await client.setSpot(args.expectedRevision, spot, exec.signal)
        return { ok: true, revision: result.revision, normalizedSpot: result.normalizedSpot }
      } catch (error: unknown) {
        return errorValue(structuredError(error))
      }
    },
    presentCall: args => ({
      card: 'generic',
      title: `Set GTO spot at revision ${String(args.expectedRevision)}`,
      kind: 'edit',
    }),
  }))
}
