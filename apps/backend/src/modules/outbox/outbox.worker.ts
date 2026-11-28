import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import {
  createCertificateOutboxHandlers,
  type OutboxEventHandler,
  type OutboxHandlerRegistry,
} from "./outbox.handlers.js";
import { outboxService, OutboxService } from "./outbox.service.js";
import type { CertificateOutboxEventType } from "./outbox.types.js";

export interface OutboxWorkerOptions {
  workerId?: string;
  pollIntervalMs?: number;
  batchSize?: number;
  leaseDurationMs?: number;
  maxAttempts?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  handlers?: Partial<OutboxHandlerRegistry>;
  service?: OutboxService;
  now?: () => Date;
}

export interface OutboxRunResult {
  claimed: number;
  processed: number;
  retried: number;
  deadLettered: number;
  released: number;
}

function isSupportedEventType(
  value: string,
  handlers: Record<string, OutboxEventHandler>
): value is CertificateOutboxEventType {
  return Object.prototype.hasOwnProperty.call(handlers, value);
}

export class OutboxWorker {
  readonly workerId: string;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly leaseDurationMs: number;
  private readonly maxAttempts: number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;
  private readonly handlers: OutboxHandlerRegistry;
  private readonly service: OutboxService;
  private readonly now: () => Date;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private stopping = false;
  private activeCyclePromise: Promise<OutboxRunResult> | null = null;

  constructor(options: OutboxWorkerOptions = {}) {
    this.workerId = options.workerId ?? `outbox-${randomUUID()}`;
    this.pollIntervalMs =
      options.pollIntervalMs ?? env.OUTBOX_POLL_INTERVAL_MS;
    this.batchSize = options.batchSize ?? env.OUTBOX_BATCH_SIZE;
    this.leaseDurationMs =
      options.leaseDurationMs ?? env.OUTBOX_LEASE_DURATION_MS;
    this.maxAttempts = options.maxAttempts ?? env.OUTBOX_MAX_ATTEMPTS;
    this.backoffBaseMs = options.backoffBaseMs ?? env.OUTBOX_BACKOFF_BASE_MS;
    this.backoffMaxMs = options.backoffMaxMs ?? env.OUTBOX_BACKOFF_MAX_MS;
    this.handlers = {
      ...createCertificateOutboxHandlers(),
      ...(options.handlers ?? {}),
    };
    this.service = options.service ?? outboxService;
    this.now = options.now ?? (() => new Date());
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.stopping = false;
    this.scheduleNextPoll(0);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.running = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.activeCyclePromise) {
      await this.activeCyclePromise;
    }
  }

  private scheduleNextPoll(delayMs: number): void {
    if (!this.running || this.stopping) {
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runOnce()
        .catch((error) => {
          console.error("Outbox worker poll error:", error);
        })
        .finally(() => {
          if (this.running && !this.stopping) {
            this.scheduleNextPoll(this.pollIntervalMs);
          }
        });
    }, delayMs);
  }

  async runOnce(): Promise<OutboxRunResult> {
    if (this.activeCyclePromise) {
      return this.activeCyclePromise;
    }

    const cycle = this.executeCycle().finally(() => {
      this.activeCyclePromise = null;
    });
    this.activeCyclePromise = cycle;
    return cycle;
  }

  private async executeCycle(): Promise<OutboxRunResult> {
    const result: OutboxRunResult = {
      claimed: 0,
      processed: 0,
      retried: 0,
      deadLettered: 0,
      released: 0,
    };

    if (this.stopping) {
      return result;
    }

    const claimed = await this.service.claimBatch(
      this.workerId,
      this.batchSize,
      this.leaseDurationMs,
      this.now()
    );
    result.claimed = claimed.length;

    for (const event of claimed) {
      if (this.stopping) {
        const released = await this.service.releaseUnstartedLease(
          event.id,
          this.workerId,
          this.now()
        );
        if (released) {
          result.released += 1;
        }
        continue;
      }

      try {
        if (!isSupportedEventType(event.eventType, this.handlers)) {
          throw new Error(`Unsupported outbox event type: ${event.eventType}`);
        }

        await this.handlers[event.eventType](event);

        const marked = await this.service.markProcessed(
          event.id,
          this.workerId,
          this.now()
        );
        if (marked) {
          result.processed += 1;
        }
      } catch (error) {
        const outcome = await this.service.markFailed(
          event.id,
          this.workerId,
          event.attempts,
          error,
          {
            maxAttempts: this.maxAttempts,
            backoffBaseMs: this.backoffBaseMs,
            backoffMaxMs: this.backoffMaxMs,
            now: this.now(),
          }
        );
        if (outcome === "DEAD_LETTERED") {
          result.deadLettered += 1;
        } else if (outcome === "RETRIED") {
          result.retried += 1;
        }
      }
    }

    return result;
  }
}
