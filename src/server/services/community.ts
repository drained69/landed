import { prisma, jsonString, parseJson } from "@/server/db";

export async function setConsent(userId: string, consentType: string, granted: boolean) {
  return prisma.consent.upsert({
    where: { userId_consentType: { userId, consentType } },
    create: { userId, consentType, granted },
    update: { granted },
  });
}

export async function getConsents(userId: string) {
  const rows = await prisma.consent.findMany({ where: { userId } });
  const types = ["decision_journal", "community_route_intelligence", "anonymous_research", "product_updates"];
  return types.map((type) => ({
    consentType: type,
    granted: rows.find((r) => r.consentType === type)?.granted ?? false,
    updatedAt: rows.find((r) => r.consentType === type)?.updatedAt ?? null,
  }));
}

export async function aggregateCommunityRoutes() {
  const observations = await prisma.routeObservation.findMany({
    where: { consentToAggregate: true },
    include: { route: true },
    take: 5000,
  });

  const groups = new Map<string, typeof observations>();
  for (const obs of observations) {
    const key = `${obs.corridor}|${obs.payoutMethod}|${obs.route.providerOrMethod}`;
    const list = groups.get(key) ?? [];
    list.push(obs);
    groups.set(key, list);
  }

  const results = [];
  for (const [key, list] of groups) {
    const contributors = new Set(list.map((o) => o.contributorHash));
    if (contributors.size < 3 || list.length < 5) continue;

    // Cap each contributor at 3 observations so one user cannot dominate.
    const capped: typeof list = [];
    const counts = new Map<string, number>();
    for (const obs of list) {
      const n = counts.get(obs.contributorHash) ?? 0;
      if (n >= 3) continue;
      counts.set(obs.contributorHash, n + 1);
      capped.push(obs);
    }

    const costErrors = capped.map((o) => (o.actualCostMinor - o.expectedCostMinor) / Math.max(1, o.expectedCostMinor));
    const deliveryErrors = capped.map((o) => (o.actualDeliveryHours - o.expectedDeliveryHours) / Math.max(1, o.expectedDeliveryHours));
    const meanCostError = costErrors.reduce((a, b) => a + b, 0) / costErrors.length;
    const variance = costErrors.reduce((a, b) => a + (b - meanCostError) ** 2, 0) / costErrors.length;
    const meanDeliveryError = deliveryErrors.reduce((a, b) => a + b, 0) / deliveryErrors.length;
    const confidence = Math.max(0.1, Math.min(0.85, 1 - Math.min(0.8, Math.sqrt(variance)) * 0.7 + Math.min(0.2, contributors.size * 0.02)));

    const stat = await prisma.communityRouteStatistic.upsert({
      where: { routeGroupKey: key },
      create: {
        routeGroupKey: key,
        observationCount: capped.length,
        contributorCount: contributors.size,
        observedCostStatistics: jsonString({ meanError: meanCostError, samples: capped.length }),
        observedDeliveryStatistics: jsonString({ meanError: meanDeliveryError, samples: capped.length }),
        confidence,
      },
      update: {
        observationCount: capped.length,
        contributorCount: contributors.size,
        observedCostStatistics: jsonString({ meanError: meanCostError, samples: capped.length }),
        observedDeliveryStatistics: jsonString({ meanError: meanDeliveryError, samples: capped.length }),
        confidence,
        lastCalculatedAt: new Date(),
      },
    });
    results.push(stat);
  }

  return {
    groupsEvaluated: groups.size,
    groupsPublished: results.length,
    minimumContributors: 3,
    minimumObservations: 5,
    results,
    note: results.length === 0
      ? "Insufficient community history. No network statistic is published below 3 independent contributors and 5 consented observations."
      : "Only consented, aggregated observations are included. Individual transactions are never exposed. Reports are not all independently verified.",
  };
}

export async function getCommunityStats(userId: string) {
  const consent = await prisma.consent.findUnique({
    where: { userId_consentType: { userId, consentType: "community_route_intelligence" } },
  });
  const stats = await prisma.communityRouteStatistic.findMany({
    where: { contributorCount: { gte: 3 } },
    orderBy: { contributorCount: "desc" },
  });
  return {
    optedIn: consent?.granted ?? false,
    stats: stats.map((s) => ({
      routeGroupKey: s.routeGroupKey,
      observationCount: s.observationCount,
      contributorCount: s.contributorCount,
      confidence: s.confidence,
      cost: parseJson<unknown>(s.observedCostStatistics, null),
      delivery: parseJson<unknown>(s.observedDeliveryStatistics, null),
      lastCalculatedAt: s.lastCalculatedAt,
    })),
    note: stats.length === 0
      ? "Insufficient community history. LANDED does not manufacture confidence scores."
      : "Aggregated from consenting contributors. Minimum group size enforced; individual records are never exposed.",
  };
}
