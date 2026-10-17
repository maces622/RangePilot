import type { JsonValue, StructuredToolError } from './types.ts'

export class GtoApiError extends Error {
  readonly code: string
  readonly data: JsonValue | undefined

  constructor(code: string, message: string, data?: JsonValue) {
    super(message)
    this.name = 'GtoApiError'
    this.code = code
    this.data = data
  }
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function structuredError(error: unknown): StructuredToolError {
  if (error instanceof GtoApiError) {
    return {
      code: error.code,
      message: error.message,
      ...error.data === undefined ? {} : { details: error.data },
    }
  }
  if (error instanceof Error) {
    return { code: 'GTO_CLIENT_ERROR', message: error.message }
  }
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>
    const code = readString(record, 'code') ?? 'GTO_CLIENT_ERROR'
    const message = readString(record, 'message') ?? 'GTO operation failed'
    return { code, message }
  }
  return { code: 'GTO_CLIENT_ERROR', message: String(error) }
}
