import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { TokenService } from '../token.service'

/**
 * Step-up guard: requires a short-lived action token (minted after a re-OTP)
 * for the given action, proving the actor re-confirmed their identity moments
 * ago before a sensitive operation (money release, account deletion, etc.).
 *
 * Usage: @UseGuards(JwtAuthGuard, ActionVerifiedGuard('release_payout'))
 */
export function ActionVerifiedGuard(action: string) {
  @Injectable()
  class ActionVerifiedGuardImpl implements CanActivate {
    constructor(public readonly tokens: TokenService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const req = context.switchToHttp().getRequest()
      const token = req.headers['x-action-token']
      if (!token || typeof token !== 'string') {
        throw new UnauthorizedException('Action verification required (x-action-token)')
      }
      const payload = await this.tokens.verifyActionToken(token, action)
      // The action token must belong to the same user as the access token.
      if (req.user?.id && payload.sub !== req.user.id) {
        throw new UnauthorizedException('Action token belongs to a different user')
      }
      return true
    }
  }
  return ActionVerifiedGuardImpl
}
