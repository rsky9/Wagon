import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { TokenService } from '../token.service'
import type { UserRole } from '@prisma/client'
import { ROLES_KEY } from './roles.decorator'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const auth = request.headers.authorization as string | undefined
    if (!auth?.startsWith('Bearer ')) {
      return false
    }
    const payload = await this.tokens.verifyAccess(auth.slice(7))
    const user = await this.tokens.userFromPayload(payload)
    request.user = user

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (requiredRoles && requiredRoles.length > 0) {
      // Match against the primary role OR the capability set, so dual-capability
      // users (e.g. supplier + transporter) can call role-gated endpoints on either side.
      const caps = (user.capabilities ?? []) as string[]
      return requiredRoles.some((r) => r === user.role || caps.includes(r))
    }
    return true
  }
}
