import test from 'node:test'
import assert from 'node:assert/strict'
import type { JobHandle, JobOutcome } from '@deepseek-ai/dsh-jobs'
import type { GtoClient } from '../src/gto-client.ts'
import { GtoSolveJob } from '../src/jobs/solve-job.ts'
import type { GtoJobStatus } from '../src/types.ts'

class FakeHandle implements JobHandle {
  readonly id = 'gto-solve-test' as JobHandle['id']
  readonly output: string[] = []
  progress = ''
  append(text: string): void { this.output.push(text) }
  updateProgress(line: string): void { this.progress = line }
}

function fakeClient(statuses: GtoJobStatus[]): { client: GtoClient; cancelled: string[] } {
  const cancelled: string[] = []
  let index = 0
  const client = {
    async startSolve() { return { jobId: 'job-1', state: 'queued' as const } },
    async getSolveStatus() {
      const status = statuses[Math.min(index, statuses.length - 1)]
      index += 1
      return status
    },
    async cancelSolve(jobId: string) {
      cancelled.push(jobId)
      return { jobId, state: 'cancelled' as const, progress: 0 }
    },
  } as GtoClient
  return { client, cancelled }
}

test('polls a GTO job and completes the DSH job with a summary', async () => {
  const { client } = fakeClient([
    { jobId: 'job-1', state: 'running', progress: 0.5, iterations: 10 },
    { jobId: 'job-1', state: 'completed', progress: 1, iterations: 20, exploitability: 0.1 },
  ])
  const job = new GtoSolveJob(
    client,
    3,
    { maxIterations: 20, targetExploitability: 0.1, threads: 1, algorithm: 'discounted_cfr' },
    { pollIntervalMs: 1, maxRuntimeMs: 5000 },
  )
  const handle = new FakeHandle()
  const hooks = job.run(handle)
  const outcome = await hooks.done
  assert.equal(outcome.status, 'completed')
  assert.equal(job.gtoJobId, 'job-1')
  assert.match(handle.output.join(''), /GTO solve job job-1 started/)
})

test('cancels the remote GTO job and settles as killed', async () => {
  const { client, cancelled } = fakeClient([
    { jobId: 'job-1', state: 'running', progress: 0.1, iterations: 1 },
  ])
  const job = new GtoSolveJob(
    client,
    3,
    { maxIterations: 20, targetExploitability: 0.1, threads: 1, algorithm: 'discounted_cfr' },
    { pollIntervalMs: 20, maxRuntimeMs: 5000 },
  )
  const handle = new FakeHandle()
  const hooks = job.run(handle)
  while (job.gtoJobId === undefined) await new Promise(resolve => setTimeout(resolve, 1))
  job.cancel('test cancel')
  const outcome: JobOutcome = await hooks.done
  assert.equal(outcome.status, 'killed')
  assert.deepEqual(cancelled, ['job-1'])
})
