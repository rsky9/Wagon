import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { AppController } from './app.controller'
import { PrismaModule } from './prisma/prisma.module'
import { HealthModule } from './health/health.module'
import { AuthModule } from './auth/auth.module'
import { HomeModule } from './home/home.module'
import { BiddingModule } from './bidding/bidding.module'
import { ExceptionsModule } from './exceptions/exceptions.module'
import { FavoritesModule } from './favorites/favorites.module'
import { ChatModule } from './chat/chat.module'
import { LoadsModule } from './loads/loads.module'
import { TripsModule } from './trips/trips.module'
import { NotificationsModule } from './notifications/notifications.module'
import { AdminModule } from './admin/admin.module'
import { FcmModule } from './fcm/fcm.module'
import { ReferenceModule } from './reference/reference.module'
import { PaymentsModule } from './payments/payments.module'
import { RatingsModule } from './ratings/ratings.module'
import { DisputesModule } from './disputes/disputes.module'
import { TrackingModule } from './tracking/tracking.module'
import { AlertsModule } from './alerts/alerts.module'
import { AuditModule } from './audit/audit.module'
import { UploadsModule } from './uploads/uploads.module'
import { KycModule } from './kyc/kyc.module'
import { PushModule } from './push/push.module'
import { EwbModule } from './ewb/ewb.module'
import { RedisModule } from './redis/redis.module'
import { TrucksModule } from './trucks/trucks.module'
import { DriversModule } from './drivers/drivers.module'
import { SupportModule } from './support/support.module'
import { OnboardingModule } from './onboarding/onboarding.module'
import { NotifPrefsModule } from './notif-prefs/notif-prefs.module'
import { TrustModule } from './trust/trust.module'
import { DriverModule } from './driver/driver.module'
import { GamificationModule } from './gamification/gamification.module'
import { FoundationModule } from './foundation/foundation.module'
import { OutboxModule } from './outbox/outbox.module'
import { StorageModule } from './storage/storage.module'
import { ForwardingModule } from './forwarding/forwarding.module'
import { PlanningModule } from './planning/planning.module'
import { IntegrationsModule } from './integrations/integrations.module'
import { FinanceModule } from './finance/finance.module'
import { AiModule } from './ai/ai.module'
import { GlobalModule } from './global/global.module'
import { OrgAccessModule } from './org-access/org-access.module'
import { MarketModule } from './market/market.module'
import { ProgrammaticMarketModule } from './market/programmatic/programmatic-market.module'
import { ContractsModule } from './contracts/contracts.module'
import { InvoicingModule } from './invoicing/invoicing.module'
import { ContainersModule } from './containers/containers.module'
import { ReturnsModule } from './returns/returns.module'
import { HandoversModule } from './handovers/handovers.module'
import { CustomsModule } from './customs/customs.module'
import { YardModule } from './yard/yard.module'
import { TradeDocumentsModule } from './trade-documents/trade-documents.module'
import { KybModule } from './kyb/kyb.module'
import { EdiModule } from './edi/edi.module'
import { VisibilityModule } from './visibility/visibility.module'
import { AnalyticsModule } from './analytics/analytics.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global rate limit: 100 req / minute per IP (10s window × 10 bursts).
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 10_000,
        limit: 100,
      },
    ]),
    PrismaModule,
    HealthModule,
    AuthModule,
    HomeModule,
    BiddingModule,
    ExceptionsModule,
    FavoritesModule,
    ChatModule,
    LoadsModule,
    TripsModule,
    NotificationsModule,
    AdminModule,
    FcmModule,
    ReferenceModule,
    PaymentsModule,
    RatingsModule,
    DisputesModule,
    TrackingModule,
    AlertsModule,
    AuditModule,
    UploadsModule,
    KycModule,
    PushModule,
    EwbModule,
    RedisModule,
    TrucksModule,
    DriversModule,
    SupportModule,
    OnboardingModule,
    NotifPrefsModule,
    TrustModule,
    DriverModule,
    GamificationModule,
    FoundationModule,
    OutboxModule,
    StorageModule,
    ForwardingModule,
    PlanningModule,
    IntegrationsModule,
    FinanceModule,
    AiModule,
    GlobalModule,
    OrgAccessModule,
    MarketModule,
    ProgrammaticMarketModule,
    ContractsModule,
    InvoicingModule,
    ContainersModule,
    ReturnsModule,
    HandoversModule,
    CustomsModule,
    YardModule,
    TradeDocumentsModule,
    KybModule,
    EdiModule,
    VisibilityModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [
    // Global rate limit: 100 req / 10s per IP; override per-route (e.g. OTP).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
