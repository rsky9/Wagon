import { Module } from '@nestjs/common'
import { GlobalController } from './global.controller'
import { GlobalService } from './global.service'
import { OrgAccessModule } from '../org-access/org-access.module'

@Module({
  imports: [OrgAccessModule],
  controllers: [GlobalController],
  providers: [GlobalService],
  exports: [GlobalService],
})
export class GlobalModule {}
