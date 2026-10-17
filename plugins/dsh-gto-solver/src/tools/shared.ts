import type { GtoSolveOptions, GtoSpot, JsonValue, StructuredToolError } from '../types.ts'

export const ERROR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    code: { type: 'string', required: true },
    message: { type: 'string', required: true },
    details: { type: 'json' },
  },
} as const

export function renderJson(value: JsonValue): [{ type: 'text'; text: string }] {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
}

export function errorValue(error: StructuredToolError): JsonValue {
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...error.details === undefined ? {} : { details: error.details },
    },
  }
}


export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).every(isJsonValue)
  }
  return false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
    throw new Error(`${field} must be an array of strings`)
  }
  return value
}

export function parseSpot(value: unknown): GtoSpot {
  if (!isRecord(value)) throw new Error('spot must be an object')
  const gameType = value.gameType
  const mode = value.mode
  const effectiveStackBb = value.effectiveStackBb
  const rangesValue = value.ranges
  if (typeof gameType !== 'string' || gameType.length === 0) throw new Error('spot.gameType must be a string')
  if (typeof mode !== 'string' || mode.length === 0) throw new Error('spot.mode must be a string')
  if (typeof effectiveStackBb !== 'number' || !Number.isFinite(effectiveStackBb)) {
    throw new Error('spot.effectiveStackBb must be a number')
  }
  if (!isRecord(rangesValue)) throw new Error('spot.ranges must be an object')
  const ranges: { [position: string]: string } = {}
  for (const [position, range] of Object.entries(rangesValue)) {
    if (typeof range !== 'string') throw new Error(`spot.ranges.${position} must be a string`)
    ranges[position] = range
  }

  const spot: GtoSpot = {
    gameType,
    mode,
    positions: readStringArray(value.positions, 'spot.positions'),
    effectiveStackBb,
    board: readStringArray(value.board, 'spot.board'),
    ranges,
  }
  if (value.blinds !== undefined) {
    if (!Array.isArray(value.blinds)
      || !value.blinds.every(item => typeof item === 'number' && Number.isFinite(item))) {
      throw new Error('spot.blinds must be an array of numbers')
    }
    Object.assign(spot, { blinds: value.blinds })
  }
  for (const [field, target] of [
    ['pot', 'pot'],
    ['allinThreshold', 'allinThreshold'],
  ] as const) {
    const fieldValue = value[field]
    if (fieldValue === undefined) continue
    if (typeof fieldValue !== 'number' || !Number.isFinite(fieldValue)) {
      throw new Error(`spot.${field} must be a number`)
    }
    Object.assign(spot, { [target]: fieldValue })
  }
  if (value.betSizing !== undefined) {
    if (!isJsonValue(value.betSizing)) throw new Error('spot.betSizing must be JSON')
    Object.assign(spot, { betSizing: value.betSizing })
  }
  for (const field of ['useIsomorphism', 'useHalfFloats'] as const) {
    const fieldValue = value[field]
    if (fieldValue === undefined) continue
    if (typeof fieldValue !== 'boolean') throw new Error(`spot.${field} must be a boolean`)
    Object.assign(spot, { [field]: fieldValue })
  }
  return spot
}


export function parseSolveOptions(value: unknown): GtoSolveOptions {
  if (!isRecord(value)) throw new Error('options must be an object')
  const maxIterations = value.maxIterations
  const targetExploitability = value.targetExploitability
  const threads = value.threads
  const algorithm = value.algorithm
  if (typeof maxIterations !== 'number' || !Number.isSafeInteger(maxIterations) || maxIterations < 1) {
    throw new Error('options.maxIterations must be a positive integer')
  }
  if (typeof targetExploitability !== 'number' || !Number.isFinite(targetExploitability) || targetExploitability < 0) {
    throw new Error('options.targetExploitability must be a non-negative number')
  }
  if (typeof threads !== 'number' || !Number.isSafeInteger(threads) || threads < 1) {
    throw new Error('options.threads must be a positive integer')
  }
  if (typeof algorithm !== 'string' || algorithm.length === 0) {
    throw new Error('options.algorithm must be a non-empty string')
  }
  const options: GtoSolveOptions = { maxIterations, targetExploitability, threads, algorithm }
  for (const field of ['printInterval', 'dumpRounds'] as const) {
    const fieldValue = value[field]
    if (fieldValue === undefined) continue
    if (typeof fieldValue !== 'number' || !Number.isSafeInteger(fieldValue) || fieldValue < 0) {
      throw new Error(`options.${field} must be a non-negative integer`)
    }
    Object.assign(options, { [field]: fieldValue })
  }
  return options
}
