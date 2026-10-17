export type JsonPrimitive = null | boolean | number | string
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export interface GtoApiErrorData {
  readonly code?: string
  readonly [key: string]: JsonValue | undefined
}

export interface GtoDiscovery {
  readonly pid: number
  readonly protocol: string
  readonly port: number
  readonly token: string
  readonly serverVersion?: string
  readonly startedAt?: string
}

export interface GtoSpot {
  readonly gameType: string
  readonly mode: string
  readonly positions: readonly string[]
  readonly effectiveStackBb: number
  readonly blinds?: readonly number[]
  readonly pot?: number
  readonly board: readonly string[]
  readonly ranges: { readonly [position: string]: string }
  readonly betSizing?: JsonValue
  readonly allinThreshold?: number
  readonly useIsomorphism?: boolean
  readonly useHalfFloats?: boolean
}

export interface GtoStateSnapshot {
  readonly revision: number
  readonly sessionId: string
  readonly screen: string
  readonly spot: GtoSpot
  readonly tree: null | { readonly rootNodeId: string; readonly nodeCount: number }
  readonly solve: null | {
    readonly jobId?: string
    readonly state: string
    readonly progress: number
    readonly iterations?: number
    readonly exploitability?: number
  }
  readonly selection: null | { readonly nodeId: string }
}

export interface GtoSolveOptions {
  readonly maxIterations: number
  readonly targetExploitability: number
  readonly threads: number
  readonly algorithm: string
  readonly printInterval?: number
  readonly dumpRounds?: number
}

export interface GtoJobStatus {
  readonly jobId: string
  readonly state: 'queued' | 'running' | 'completed' | 'failed' | 'cancelling' | 'cancelled'
  readonly progress: number
  readonly iterations?: number
  readonly exploitability?: number
  readonly elapsedMs?: number
  readonly error?: { readonly code: string; readonly message: string }
}

export interface GtoStartSolveResult {
  readonly jobId: string
  readonly state: 'queued'
}

export interface GtoSetSpotResult {
  readonly revision: number
  readonly normalizedSpot: GtoSpot
}

export interface GtoNodeStrategy {
  readonly nodeId: string
  readonly actions: JsonValue[]
  readonly comboCount?: number
  readonly exploitability?: number
  readonly artifactRef?: string
}

export interface StructuredToolError {
  readonly code: string
  readonly message: string
  readonly details?: JsonValue
}
