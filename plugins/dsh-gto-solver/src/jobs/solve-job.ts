import type { JobHandle, JobHooks, JobOutcome } from '@deepseek-ai/dsh-jobs'
import type { GtoClient } from '../gto-client.ts'
import { structuredError } from '../tool-errors.ts'
import type { GtoJobStatus, GtoSolveOptions } from '../types.ts'

export interface GtoSolveJobConfig {
  readonly pollIntervalMs: number
  readonly maxRuntimeMs: number
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('aborted'))
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(new Error('aborted'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function statusLine(status: GtoJobStatus): string {
  const progress = Number.isFinite(status.progress)
    ? `${Math.round(status.progress * 100)}%`
    : 'unknown progress'
  const iterations = status.iterations === undefined ? '' : `, iterations=${status.iterations}`
  const exploitability = status.exploitability === undefined ? '' : `, exploitability=${status.exploitability}`
  return `${status.state} (${progress}${iterations}${exploitability})`
}

export class GtoSolveJob {
  readonly done: Promise<JobOutcome>
  private resolveDone: ((outcome: JobOutcome) => void) | undefined
  private readonly abortController = new AbortController()
  private cancelRequested = false
  private cancellationSent = false
  private cancelReason: string | undefined
  private gtoJobIdValue: string | undefined
  private latestStatus: GtoJobStatus | undefined
  private settled = false
  private readonly client: GtoClient
  private readonly expectedRevision: number
  private readonly options: GtoSolveOptions
  private readonly config: GtoSolveJobConfig

  constructor(
    client: GtoClient,
    expectedRevision: number,
    options: GtoSolveOptions,
    config: GtoSolveJobConfig,
  ) {
    this.client = client
    this.expectedRevision = expectedRevision
    this.options = options
    this.config = config
    this.done = new Promise<JobOutcome>((resolve) => { this.resolveDone = resolve })
  }

  get gtoJobId(): string | undefined {
    return this.gtoJobIdValue
  }

  get status(): GtoJobStatus | undefined {
    return this.latestStatus
  }

  get isSettled(): boolean {
    return this.settled
  }

  run(handle: JobHandle): JobHooks {
    void this.execute(handle)
    return {
      cancel: reason => { this.cancel(reason) },
      done: this.done,
    }
  }

  cancel(reason?: string): void {
    if (this.settled || this.cancelRequested) return
    this.cancelRequested = true
    this.cancelReason = reason ?? 'cancelled by user'
    this.abortController.abort()
    void this.requestRemoteCancel()
  }

  private async execute(handle: JobHandle): Promise<void> {
    const startedAt = Date.now()
    handle.append('Starting GTO solve...\n')
    handle.updateProgress('starting GTO solve')

    try {
      // Do not abort the start request: a response can arrive after the user
      // cancels, and we need its GTO job id in order to cancel the remote job.
      const started = await this.client.startSolve(
        this.expectedRevision,
        this.options,
      )
      this.gtoJobIdValue = started.jobId
      handle.append(`GTO solve job ${started.jobId} started\n`)
      handle.updateProgress(`GTO ${started.jobId}: queued`)

      while (!this.settled) {
        if (this.cancelRequested) {
          await this.requestRemoteCancel()
          this.finish({ status: 'killed', detail: this.cancelReason ?? 'cancelled' })
          return
        }
        if (Date.now() - startedAt > this.config.maxRuntimeMs) {
          await this.requestRemoteCancel()
          this.finish({
            status: 'failed',
            detail: `solve runtime budget exceeded (${this.config.maxRuntimeMs}ms)`,
          })
          return
        }

        await delay(this.config.pollIntervalMs, this.abortController.signal)
        const status = await this.client.getSolveStatus(
          started.jobId,
          this.abortController.signal,
        )
        this.latestStatus = status
        handle.updateProgress(`GTO ${started.jobId}: ${statusLine(status)}`)

        if (status.state === 'completed') {
          handle.append(`GTO solve completed: ${statusLine(status)}\n`)
          this.finish({
            status: 'completed',
            detail: statusLine(status),
            result: JSON.stringify(status),
          })
          return
        }
        if (status.state === 'failed') {
          this.finish({
            status: 'failed',
            detail: status.error === undefined
              ? statusLine(status)
              : `${status.error.code}: ${status.error.message}`,
          })
          return
        }
        if (status.state === 'cancelled') {
          this.finish({ status: 'killed', detail: this.cancelReason ?? 'GTO solve cancelled' })
          return
        }
      }
    } catch (error: unknown) {
      if (this.cancelRequested) {
        await this.requestRemoteCancel()
        this.finish({ status: 'killed', detail: this.cancelReason ?? 'cancelled' })
        return
      }
      const structured = structuredError(error)
      handle.append(`GTO solve failed: ${structured.code}: ${structured.message}\n`)
      this.finish({ status: 'failed', detail: `${structured.code}: ${structured.message}` })
    }
  }

  private async requestRemoteCancel(): Promise<void> {
    if (this.gtoJobIdValue === undefined || this.cancellationSent) return
    this.cancellationSent = true
    try {
      await this.client.cancelSolve(this.gtoJobIdValue)
    } catch {
      // The DSH job still settles as killed; the GTO solver timeout/cancel
      // remains observable in GTO status if the cancellation could not land.
    }
  }


  private finish(outcome: JobOutcome): void {
    if (this.settled) return
    this.settled = true
    this.abortController.abort()
    this.resolveDone?.(outcome)
    this.resolveDone = undefined
  }
}

export class GtoSolveJobManager {
  private readonly jobs = new Map<string, GtoSolveJob>()

  register(dshJobId: string, job: GtoSolveJob): void {
    this.jobs.set(dshJobId, job)
  }

  get(dshJobId: string): GtoSolveJob | undefined {
    return this.jobs.get(dshJobId)
  }

  activeCount(): number {
    let count = 0
    for (const job of this.jobs.values()) {
      if (!job.isSettled) count += 1
    }
    return count
  }

  cancelAll(): void {
    for (const job of this.jobs.values()) job.cancel('DSH plugin shutting down')
  }
}
