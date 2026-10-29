import { requireUser } from "@/server/auth";
import { getFinancialContext } from "@/server/services/financial";
import { tatumHealth } from "@/server/services/tatum";
import { memoryConfig, memoryHealth, userNamespace } from "@/server/services/memory";
import { getConsents } from "@/server/services/community";
import { ratesHealth } from "@/server/services/rates";
import { SettingsView } from "@/components/SettingsView";
import { aiConfig } from "@/server/services/explain";

export default async function SettingsPage() {
  const user = await requireUser();
  const [context, tatum, walrus, consents, rates] = await Promise.all([
    getFinancialContext(user.id),
    tatumHealth(),
    memoryHealth(),
    getConsents(user.id),
    ratesHealth(),
  ]);
  const config = memoryConfig();

  return (
    <SettingsView
      user={{
        name: user.name,
        email: user.email,
        preferredCurrency: user.preferredCurrency,
        safetyBufferMinor: user.safetyBufferMinor,
        riskPosture: user.riskPosture,
        mainObjective: user.mainObjective,
        isDemo: user.isDemo,
      }}
      accounts={context.accounts.map((account) => ({
        id: account.id,
        name: account.name,
        accountType: account.accountType,
        currency: account.currency,
        balanceMinor: account.balanceMinor,
        isLiquid: account.isLiquid,
        includeInSafeToMove: account.includeInSafeToMove,
        verificationStatus: account.verificationStatus,
        balanceSource: account.balanceSource,
        isSynthetic: account.isSynthetic,
        walletAddress: account.walletAddress,
        lastSyncedAt: account.lastSyncedAt,
      }))}
      commitments={context.commitments.map((commitment) => ({
        id: commitment.id,
        name: commitment.name,
        amountMinor: commitment.amountMinor,
        currency: commitment.currency,
        dueDate: commitment.dueDate,
        recurrence: commitment.recurrence,
        priority: commitment.priority,
        status: commitment.status,
        isSynthetic: commitment.isSynthetic,
      }))}
      goals={context.savingsGoals.map((goal) => ({
        id: goal.id,
        name: goal.name,
        targetMinor: goal.targetMinor,
        currentMinor: goal.currentMinor,
        currency: goal.currency,
        monthlyContributionMinor: goal.monthlyContributionMinor,
        priority: goal.priority,
        status: goal.status,
        targetDate: goal.targetDate,
      }))}
      routes={context.routes.map((route) => ({
        id: route.id,
        name: route.name,
        providerOrMethod: route.providerOrMethod,
        originCurrency: route.originCurrency,
        destinationCurrency: route.destinationCurrency,
        payoutMethod: route.payoutMethod,
        routeType: route.routeType,
        isActive: route.isActive,
        isSynthetic: route.isSynthetic,
        quotes: route.quotes.map((quote) => ({
          id: quote.id,
          sendAmountMinor: quote.sendAmountMinor,
          feeMinor: quote.feeMinor,
          networkFeeMinor: quote.networkFeeMinor,
          expectedReceivedMinor: quote.expectedReceivedMinor,
          estimatedDeliveryHours: quote.estimatedDeliveryHours,
          source: quote.source,
          evidenceQuality: quote.evidenceQuality,
          quotedAt: quote.quotedAt,
        })),
      }))}
      integrations={{
        rates,
        tatum: {
          configured: tatum.configured,
          reachable: tatum.reachable,
          status: tatum.configured ? (tatum.reachable ? "reachable" : "error") : "not_configured",
          error: tatum.error,
          serverUrl: tatum.rpcUrl,
          network: tatum.network,
          checkpoint: tatum.checkpoint,
        },
        walrus: {
          configured: walrus.configured,
          reachable: walrus.reachable,
          status: walrus.status,
          error: walrus.error,
          serverUrl: walrus.serverUrl,
          missing: config.missing,
          accountId: config.accountId,
          version: walrus.version,
          writeReady: walrus.writeReady,
        },
        ai: {
          configured: aiConfig().configured,
          note: "Optional. LANDED's arithmetic, ranking, and memory rules never depend on the AI layer.",
        },
      }}
      consents={consents.map((consent) => ({ consentType: consent.consentType, granted: consent.granted }))}
      memoryNamespace={userNamespace(user.email)}
    />
  );
}
