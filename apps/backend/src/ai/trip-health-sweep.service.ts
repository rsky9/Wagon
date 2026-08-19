import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import Redis from 'ioredis'
import { REDIS } from '../redis/redis.module'
import { Inject } from '@nestjs/common'
import { TripHealthService } from './trip-health.service'

const SWEEP_INTERVAL_MS = 120_000

/**
 * Background trip-health sweep: periodically evaluates in-transit trips and
 * surfaces at-risk ones. Deduped per trip so ops/transporters aren't spammed
 * every sweep — one alert per risk episode, refreshed by the next episode.
 */
@Injectable()
export class TripHealthSweep implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TripHealthSweep.name)
  private running = false

  constructor(
    private readonly health: TripHealthService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  onModuleInit() {
    this.running = true
    void this.loop()
  }

  onModuleDestroy() {
    this.running = false
  }

  private async loop() {
    while (this.running) {
      try {
        const flagged = await this.health.sweep()
        if (flagged > 0) this.logger.log(`[trip-health] sweep flagged ${flagged} trip(s)`)
      } catch (e) {
        this.logger.warn(`[trip-health] sweep loop error: ${e instanceof Error ? e.message : e}`)
      }
      await new Promise((r) => {
        const t = setTimeout(r, SWEEP_INTERVAL_MS)
        t.unref()
      })
    }
  }
}