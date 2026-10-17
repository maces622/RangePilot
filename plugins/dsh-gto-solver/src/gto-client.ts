import { readDiscovery as readDiscoveryFile } from './discovery.ts'
import type { GtoDiscovery } from './discovery.ts'
import { GtoApiError } from './tool-errors.ts'
import type {
  GtoJobStatus,
  GtoNodeStrategy,
  GtoSetSpotResult,
  GtoSolveOptions,
  GtoSpot,
  GtoStartSolveResult,
  GtoStateSnapshot,
  JsonValue,
} from './types.ts'

export interface GtoSocket {
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  addEventListener(
    type: 'open' | 'message' | 'close' | 'error',
    listener: (event?: { readonly data?: unknown }) => void,
  ): void
}

export type GtoSocketFactory = (url: string) => GtoSocket
export type GtoEventListener = (method: string, params: JsonValue) => void

export interface GtoClientOptions {
  readonly discoveryFile: string
  readonly requestTimeoutMs: number
  readonly reconnect?: boolean
  readonly reconnectDelayMs?: number
  readonly socketFactory?: GtoSocketFactory
  readonly discoveryReader?: (path: string) => Promise<GtoDiscovery>
}

interface PendingRequest {
  readonly resolve: (value: JsonValue) => void
  readonly reject: (error: Error) => void
  readonly timer: ReturnType<typeof setTimeout>
  readonly removeAbort: () => void
}

interface NativeWebSocket {
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  addEventListener(
    type: string,
    listener: (event?: { readonly data?: unknown }) => void,
  ): void
}

type NativeWebSocketConstructor = new (url: string) => NativeWebSocket

function defaultSocketFactory(url: string): GtoSocket {
  const scope = globalThis as { WebSocket?: NativeWebSocketConstructor }
  if (scope.WebSocket === undefined) {
    throw new Error('This Node runtime does not provide a global WebSocket')
  }
  const socket = new scope.WebSocket(url)
  return {
    get readyState() { return socket.readyState },
    send: data => socket.send(data),
    close: (code, reason) => socket.close(code, reason),
    addEventListener: (type, listener) => {
      socket.addEventListener(type, event => {
        if (type === 'message' && event !== undefined && 'data' in event) {
          listener({ data: event.data })
        } else {
          listener()
        }
      })
    },
  }
}

function messageText(data: unknown): string | undefined {
  if (typeof data === 'string') return data
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data)
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
  }
  return undefined
}

function readRecord(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, JsonValue>
    : undefined
}

export class GtoClient {
  private readonly options: GtoClientOptions
  private socket: GtoSocket | undefined
  private connected = false
  private keepAlive = true
  private nextRequestId = 1
  private readonly pending = new Map<number, PendingRequest>()
  private readonly listeners = new Set<GtoEventListener>()
  private lastEventSequence = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private reconnectAttempts = 0
  private connecting: Promise<void> | undefined
  private lastKnownState: GtoStateSnapshot | undefined

  constructor(options: GtoClientOptions) {
    this.options = options
  }

  get isConnected(): boolean {
    return this.connected
  }

  get state(): GtoStateSnapshot | undefined {
    return this.lastKnownState
  }

  subscribe(listener: GtoEventListener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  async connect(): Promise<void> {
    this.keepAlive = true
    if (this.connected) return
    if (this.connecting !== undefined) return this.connecting
    this.connecting = this.openOnce().finally(() => { this.connecting = undefined })
    return this.connecting
  }

  close(): void {
    this.keepAlive = false
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
    const socket = this.socket
    this.socket = undefined
    this.connected = false
    this.rejectPending(new GtoApiError('GTO_DISCONNECTED', 'GTO client closed'))
    socket?.close(1000, 'client closed')
  }

  async getState(signal?: AbortSignal): Promise<GtoStateSnapshot> {
    const state = await this.request<GtoStateSnapshot>('state.get', {}, signal)
    this.lastKnownState = state
    return state
  }

  async setSpot(expectedRevision: number, spot: GtoSpot, signal?: AbortSignal): Promise<GtoSetSpotResult> {
    return this.request<GtoSetSpotResult>('spot.set', { expectedRevision, spot }, signal)
  }

  async startSolve(
    expectedRevision: number,
    options: GtoSolveOptions,
    signal?: AbortSignal,
  ): Promise<GtoStartSolveResult> {
    return this.request<GtoStartSolveResult>('solve.start', { expectedRevision, options }, signal)
  }

  async getSolveStatus(jobId: string, signal?: AbortSignal): Promise<GtoJobStatus> {
    return this.request<GtoJobStatus>('solve.getStatus', { jobId }, signal)
  }

  async cancelSolve(jobId: string, signal?: AbortSignal): Promise<GtoJobStatus> {
    return this.request<GtoJobStatus>('solve.cancel', { jobId }, signal)
  }

  async queryStrategy(
    jobId: string,
    nodeId: string,
    actions: readonly string[] = [],
    limit = 100,
    signal?: AbortSignal,
  ): Promise<GtoNodeStrategy> {
    return this.request<GtoNodeStrategy>('result.getNodeStrategy', {
      jobId,
      nodeId,
      actions,
      limit,
    }, signal)
  }

  private async openOnce(): Promise<void> {
    const discovery = await (this.options.discoveryReader
      ?? (path => readDiscoveryFile(path)))(this.options.discoveryFile)
    const factory = this.options.socketFactory ?? defaultSocketFactory
    const socket = factory(`ws://127.0.0.1:${discovery.port}/rpc`)
    this.socket = socket

    await new Promise<void>((resolve, reject) => {
      let settled = false
      socket.addEventListener('open', () => {
        if (settled) return
        settled = true
        resolve()
      })
      socket.addEventListener('error', () => {
        if (settled) return
        settled = true
        reject(new GtoApiError('GTO_CONNECT_FAILED', 'Cannot connect to the local GTO API'))
      })
      socket.addEventListener('close', () => {
        if (settled) return
        settled = true
        reject(new GtoApiError('GTO_CONNECT_FAILED', 'GTO API connection closed before opening'))
      })
    })

    socket.addEventListener('message', event => {
      const text = messageText(event?.data)
      if (text !== undefined) this.handleMessage(text)
    })
    socket.addEventListener('close', () => { this.handleClose(socket) })
    socket.addEventListener('error', () => {
      // The close event owns pending rejection and reconnect scheduling.
    })

    await this.request<JsonValue>('system.hello', {
      protocol: 'gto-api/1.0',
      token: discovery.token,
      client: { name: 'dsh-gto-solver', version: '0.1.0' },
    })
    this.connected = true
    this.reconnectAttempts = 0
    try {
      this.lastKnownState = await this.getState()
    } catch {
      // The transport handshake succeeded; state recovery remains available
      // through the tools and the next reconnect attempt.
    }
  }

  private request<T>(method: string, params: Record<string, JsonValue>, signal?: AbortSignal): Promise<T> {
    const socket = this.socket
    if (socket === undefined) {
      return Promise.reject(new GtoApiError('GTO_DISCONNECTED', 'GTO API is not connected'))
    }
    if (signal?.aborted) {
      return Promise.reject(new GtoApiError('GTO_ABORTED', 'GTO request was cancelled'))
    }

    const id = this.nextRequestId++
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = this.pending.get(id)
        if (pending === undefined) return
        this.pending.delete(id)
        pending.removeAbort()
        pending.reject(new GtoApiError('GTO_TIMEOUT', `GTO request timed out: ${method}`))
      }, this.options.requestTimeoutMs)

      const onAbort = () => {
        const pending = this.pending.get(id)
        if (pending === undefined) return
        this.pending.delete(id)
        clearTimeout(pending.timer)
        pending.removeAbort()
        pending.reject(new GtoApiError('GTO_ABORTED', `GTO request was cancelled: ${method}`))
      }
      const removeAbort = () => signal?.removeEventListener('abort', onAbort)
      signal?.addEventListener('abort', onAbort, { once: true })

      this.pending.set(id, {
        resolve: value => resolve(value as T),
        reject,
        timer,
        removeAbort,
      })
      try {
        socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
      } catch {
        const pending = this.pending.get(id)
        if (pending !== undefined) {
          this.pending.delete(id)
          clearTimeout(pending.timer)
          pending.removeAbort()
          pending.reject(new GtoApiError('GTO_SEND_FAILED', `Cannot send GTO request: ${method}`))
        }
      }
    })
  }

  private handleMessage(text: string): void {
    let value: unknown
    try {
      value = JSON.parse(text)
    } catch {
      return
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return
    const record = value as Record<string, unknown>

    if (typeof record.method === 'string' && record.id === undefined) {
      const method = record.method
      const params = record.params as JsonValue | undefined
      if (params !== undefined) {
        const paramsRecord = readRecord(params)
        const sequence = paramsRecord?.sequence
        if (typeof sequence === 'number' && sequence <= this.lastEventSequence) return
        if (typeof sequence === 'number') this.lastEventSequence = sequence
      }
      for (const listener of this.listeners) listener(method, params ?? null)
      return
    }

    const id = record.id
    if (typeof id !== 'number') return
    const pending = this.pending.get(id)
    if (pending === undefined) return
    this.pending.delete(id)
    clearTimeout(pending.timer)
    pending.removeAbort()

    if (record.error !== undefined && typeof record.error === 'object' && record.error !== null) {
      const error = record.error as Record<string, unknown>
      const data = error.data as JsonValue | undefined
      const dataRecord = readRecord(data)
      const code = typeof dataRecord?.code === 'string'
        ? dataRecord.code
        : typeof error.code === 'number' ? `RPC_${error.code}` : 'GTO_RPC_ERROR'
      const message = typeof error.message === 'string' ? error.message : 'GTO JSON-RPC request failed'
      pending.reject(new GtoApiError(code, message, data))
      return
    }
    pending.resolve(record.result as JsonValue | undefined ?? null)
  }

  private handleClose(socket: GtoSocket): void {
    if (this.socket !== socket) return
    this.socket = undefined
    this.connected = false
    this.rejectPending(new GtoApiError('GTO_DISCONNECTED', 'GTO API connection was lost'))
    if (!this.keepAlive || this.options.reconnect === false) return
    if (this.reconnectTimer !== undefined) return
    const delay = this.options.reconnectDelayMs ?? 1000
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      this.reconnectAttempts += 1
      void this.connect().catch(() => {
        if (this.keepAlive) this.handleReconnectFailure()
      })
    }, delay)
  }

  private handleReconnectFailure(): void {
    if (this.reconnectTimer !== undefined) return
    const delay = this.options.reconnectDelayMs ?? 1000
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      void this.connect().catch(() => { this.handleReconnectFailure() })
    }, delay)
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.removeAbort()
      pending.reject(error)
    }
    this.pending.clear()
  }
}
