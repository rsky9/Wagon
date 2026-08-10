import { Controller, Get } from '@nestjs/common'

@Controller()
export class AppController {
  @Get()
  root() {
    return {
      name: 'Wagon API',
      version: '0.1.0',
      docs: 'See PRODUCT_PLAN.md §6',
    }
  }
}
