import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { GtoDiscovery } from './types.ts'

export const GTO_PROTOCOL = 'gto-api/1.0'

export interface DiscoveryDependencies {
  readonly readFile: (path: string, encoding: 'utf8') => Promise<string>
  readonly isProcessAlive: (pid: number) => boolean
}

export function defaultDiscoveryFilePath(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  const localAppData = env.LOCALAPPDATA
  if (localAppData !== undefined && localAppData.length > 0) {
    return join(localAppData, 'RangePilot', 'gto-gui', 'api.json')
  }
  return join(home, '.local', 'share', 'RangePilot', 'gto-gui', 'api.json')
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error: unknown) {
    return typeof error === 'object' && error !== null
      && 'code' in error && error.code === 'EPERM'
  }
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function parseDiscovery(raw: string): GtoDiscovery {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('GTO discovery file is not valid JSON')
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('GTO discovery file must contain a JSON object')
  }
  const record = value as Record<string, unknown>
  const pid = readNumber(record.pid)
  const port = readNumber(record.port)
  const protocol = readString(record.protocol)
  const token = readString(record.token)
  if (pid === undefined || pid <= 0) throw new Error('GTO discovery file has an invalid pid')
  if (port === undefined || port <= 0 || port > 65535) throw new Error('GTO discovery file has an invalid port')
  if (protocol !== GTO_PROTOCOL) throw new Error(`GTO discovery protocol must be ${GTO_PROTOCOL}`)
  if (token === undefined) throw new Error('GTO discovery file has no token')
  const serverVersion = readString(record.serverVersion)
  const startedAt = readString(record.startedAt)
  return {
    pid,
    protocol,
    port,
    token,
    ...serverVersion === undefined ? {} : { serverVersion },
    ...startedAt === undefined ? {} : { startedAt },
  }
}

export async function readDiscovery(
  path: string,
  deps: Partial<DiscoveryDependencies> = {},
): Promise<GtoDiscovery> {
  const load = deps.readFile ?? ((file, encoding) => readFile(file, encoding))
  const alive = deps.isProcessAlive ?? isProcessAlive
  const raw = await load(path, 'utf8')
  const discovery = parseDiscovery(raw)
  if (!alive(discovery.pid)) {
    throw new Error(`GTO API process ${discovery.pid} is not running`)
  }
  return discovery
}
