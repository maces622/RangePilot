import test from 'node:test'
import assert from 'node:assert/strict'
import { GtoClient, type GtoSocket } from '../src/gto-client.ts'
import type { GtoDiscovery } from '../src/types.ts'

type Listener = (event?: { readonly data?: unknown }) => void

class FakeSocket implements GtoSocket {
  readyState = 0
  readonly sent: string[] = []
  readonly listeners = new Map<string, Set<Listener>>()
  onSend: ((message: Record<string, unknown>) => void) | undefined

  addEventListener(type: 'open' | 'message' | 'close' | 'error', listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  send(data: string): void {
    this.sent.push(data)
    const message = JSON.parse(data) as Record<string, unknown>
    this.onSend?.(message)
  }

  close(): void {
    this.emit('close')
  }

  emit(type: 'open' | 'message' | 'close' | 'error', event?: { data?: unknown }): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

function discovery(): GtoDiscovery {
  return { pid: 1, protocol: 'gto-api/1.0', port: 43210, token: 'token' }
}

function respond(socket: FakeSocket, message: Record<string, unknown>, body: Record<string, unknown>): void {
  const payload = { jsonrpc: '2.0', id: message.id, ...body }
  socket.emit('message', { data: JSON.stringify(payload) })
}

test('handshakes and calls state.get through JSON-RPC', async () => {
  const socket = new FakeSocket()
  socket.onSend = message => {
    if (message.method === 'system.hello') {
      respond(socket, message, {
        result: { protocol: 'gto-api/1.0', sessionId: 's1', server: {}, capabilities: [] },
      })
    } else if (message.method === 'state.get') {
      respond(socket, message, {
        result: {
          revision: 3,
          sessionId: 's1',
          screen: 'main',
          spot: { gameType: 'NLHE', mode: 'holdem', positions: [], effectiveStackBb: 100, board: [], ranges: {} },
          tree: null,
          solve: null,
          selection: null,
        },
      })
    }
  }

  const client = new GtoClient({
    discoveryFile: 'ignored',
    requestTimeoutMs: 1000,
    discoveryReader: async () => discovery(),
    socketFactory: () => {
      queueMicrotask(() => socket.emit('open'))
      return socket
    },
  })
  await client.connect()
  assert.equal(client.isConnected, true)
  const state = await client.getState()
  assert.equal(state.revision, 3)
  const hello = socket.sent.map(text => JSON.parse(text) as Record<string, unknown>)
    .find(message => message.method === 'system.hello')
  assert.deepEqual((hello?.params as Record<string, unknown>).token, 'token')
})

test('maps JSON-RPC errors to structured GTO errors and routes events', async () => {
  const socket = new FakeSocket()
  socket.onSend = message => {
    if (message.method === 'system.hello') {
      respond(socket, message, { result: { protocol: 'gto-api/1.0', sessionId: 's1', server: {}, capabilities: [] } })
    } else if (message.method === 'state.get') {
      respond(socket, message, {
        error: { code: -32010, message: 'conflict', data: { code: 'STATE_CONFLICT', actualRevision: 4 } },
      })
    }
  }
  const client = new GtoClient({
    discoveryFile: 'ignored',
    requestTimeoutMs: 1000,
    discoveryReader: async () => discovery(),
    socketFactory: () => {
      queueMicrotask(() => socket.emit('open'))
      return socket
    },
  })
  const events: string[] = []
  const dispose = client.subscribe(method => events.push(method))
  await client.connect()
  await assert.rejects(client.getState(), (error: unknown) => {
    assert.equal((error as { code?: string }).code, 'STATE_CONFLICT')
    return true
  })
  socket.emit('message', {
    data: JSON.stringify({
      jsonrpc: '2.0',
      method: 'event.solve_progress',
      params: { sequence: 1, jobId: 'job-1', progress: 0.5 },
    }),
  })
  assert.deepEqual(events, ['event.solve_progress'])
  dispose()
})
