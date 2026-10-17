import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultDiscoveryFilePath, parseDiscovery, readDiscovery } from '../src/discovery.ts'

test('parses a valid discovery file', () => {
  const discovery = parseDiscovery(JSON.stringify({
    pid: 42,
    protocol: 'gto-api/1.0',
    port: 51423,
    token: 'secret-token',
  }))
  assert.equal(discovery.port, 51423)
  assert.equal(discovery.token, 'secret-token')
})

test('rejects stale or malformed discovery files', async () => {
  assert.throws(() => parseDiscovery('{bad json'), /valid JSON/)
  await assert.rejects(
    readDiscovery('/tmp/api.json', {
      readFile: async () => JSON.stringify({ pid: 7, protocol: 'gto-api/1.0', port: 1, token: 'x' }),
      isProcessAlive: () => false,
    }),
    /not running/,
  )
})

test('uses LOCALAPPDATA for the default discovery path', () => {
  const path = defaultDiscoveryFilePath({ LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, 'C:\\Users\\me')
  assert.match(path, /RangePilot[\\/]gto-gui[\\/]api.json$/)
})
