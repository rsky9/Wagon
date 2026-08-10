import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import type { User } from '@prisma/client'

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): User => {
    const request = context.switchToHttp().getRequest()
    return request.user as User
  },
)
