import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'

export const REDIS = Symbol('REDIS')

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return new Redis(config.get('REDIS_URL') ?? 'redis://localhost:6380', {
          maxRetriesPerRequest: 2,
          lazyConnect: false,
        })
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
