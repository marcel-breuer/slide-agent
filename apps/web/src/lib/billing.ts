import { prisma } from "@slide-agent/database";

export const BILLING_PLAN_CODES = ["free", "pro", "team"] as const;
export type BillingPlanCode = (typeof BILLING_PLAN_CODES)[number];

export const BILLING_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];

export const PLAN_ENTITLEMENTS: Record<
  BillingPlanCode,
  {
    label: string;
    maxPresentations: number;
    maxStorageBytes: number;
    maxExportsPerPeriod: number;
    maxGenerationsPerPeriod: number;
    maxMembers: number;
  }
> = {
  free: {
    label: "Free",
    maxPresentations: 3,
    maxStorageBytes: 100 * 1024 * 1024,
    maxExportsPerPeriod: 10,
    maxGenerationsPerPeriod: 20,
    maxMembers: 1,
  },
  pro: {
    label: "Pro",
    maxPresentations: 50,
    maxStorageBytes: 5 * 1024 * 1024 * 1024,
    maxExportsPerPeriod: 100,
    maxGenerationsPerPeriod: 500,
    maxMembers: 5,
  },
  team: {
    label: "Team",
    maxPresentations: 500,
    maxStorageBytes: 50 * 1024 * 1024 * 1024,
    maxExportsPerPeriod: 1000,
    maxGenerationsPerPeriod: 5000,
    maxMembers: 25,
  },
};

export type BillingQuotaMetric =
  | "presentations"
  | "storageBytes"
  | "exports"
  | "generations"
  | "members";

export type BillingSnapshot = {
  plan: BillingPlanCode;
  planLabel: string;
  status: BillingStatus;
  access: "active" | "grace" | "limited";
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  graceUntil: string | null;
  usage: Record<BillingQuotaMetric, number>;
  limits: Record<BillingQuotaMetric, number>;
  remaining: Record<BillingQuotaMetric, number>;
};

type BillingSettingsRecord = {
  billingCancelAtPeriodEnd: boolean;
  billingGraceUntil: Date | null;
  billingPeriodEnd: Date | null;
  billingPeriodStart: Date | null;
  billingPlanCode: string;
  billingStatus: string;
};

export class BillingQuotaError extends Error {
  constructor(
    public readonly metric: BillingQuotaMetric,
    public readonly snapshot: BillingSnapshot,
    message: string,
  ) {
    super(message);
    this.name = "BillingQuotaError";
  }
}

export function billingQuotaErrorDetails(error: BillingQuotaError): [string, string, number] {
  if (error.snapshot.access === "limited") {
    return [
      "BILLING_ACCESS_LIMITED",
      "Your subscription is not active. Update billing to continue using this feature.",
      402,
    ];
  }
  return [
    `BILLING_${error.metric.toUpperCase()}_QUOTA_REACHED`,
    `Your ${error.metric} quota has been reached. Upgrade your plan to continue.`,
    402,
  ];
}

export function planCode(value: string | null | undefined): BillingPlanCode {
  return BILLING_PLAN_CODES.includes(value as BillingPlanCode) ? (value as BillingPlanCode) : "free";
}

export function billingStatus(value: string | null | undefined): BillingStatus {
  return BILLING_STATUSES.includes(value as BillingStatus)
    ? (value as BillingStatus)
    : "active";
}

export function billingAccess(
  status: BillingStatus,
  graceUntil: Date | null | undefined,
  now = new Date(),
): BillingSnapshot["access"] {
  if (status === "active" || status === "trialing") return "active";
  if ((status === "past_due" || status === "canceled") && graceUntil && graceUntil > now) {
    return "grace";
  }
  return "limited";
}

export function evaluateQuota(
  metric: BillingQuotaMetric,
  current: number,
  limit: number,
  increment: number,
): { allowed: boolean; remaining: number } {
  void metric;
  const remaining = Math.max(0, limit - current);
  return { allowed: increment >= 0 && current + increment <= limit, remaining };
}

export async function loadBillingSnapshot(userId: string, now = new Date()): Promise<BillingSnapshot> {
  const { periodStart, periodEnd } = billingPeriod(now);
  const settings = await loadBillingSettings(userId);
  const [presentations, exports, generations, collaborators, imports, storedExports] =
    await Promise.all([
      prisma.presentation.count({ where: { archivedAt: null, ownerId: userId } }),
      prisma.export.count({ where: { createdAt: { gte: periodStart, lt: periodEnd }, ownerId: userId } }),
      prisma.aiOperation.count({
        where: { createdAt: { gte: periodStart, lt: periodEnd }, ownerId: userId, status: "SUCCEEDED" },
      }),
      prisma.presentationCollaboratorSession.findMany({
        where: { presentation: { ownerId: userId } },
        distinct: ["userId"],
        select: { userId: true },
      }),
      prisma.importReport.findMany({ where: { ownerId: userId }, select: { report: true } }),
      prisma.export.findMany({ where: { ownerId: userId }, select: { report: true } }),
    ]);
  return buildBillingSnapshot(settings, {
    exports,
    generations,
    members: Math.max(1, collaborators.length),
    presentations,
    storageBytes: [...imports, ...storedExports].reduce(
      (total, record) => total + reportByteSize(record.report),
      0,
    ),
  }, periodStart, periodEnd, now);
}

export async function assertBillingQuota(
  userId: string,
  metric: BillingQuotaMetric,
  increment = 1,
): Promise<BillingSnapshot> {
  const now = new Date();
  const { periodStart, periodEnd } = billingPeriod(now);
  const settings = await loadBillingSettings(userId);
  const usage = await loadQuotaMetricUsage(userId, metric, periodStart, periodEnd);
  const snapshot = buildBillingSnapshot(settings, usage, periodStart, periodEnd, now);
  if (snapshot.access === "limited") {
    throw new BillingQuotaError(metric, snapshot, "Billing access is limited until the subscription is active.");
  }
  if (!evaluateQuota(metric, snapshot.usage[metric], snapshot.limits[metric], increment).allowed) {
    throw new BillingQuotaError(metric, snapshot, `The ${metric} quota has been reached.`);
  }
  return snapshot;
}

async function loadBillingSettings(userId: string): Promise<BillingSettingsRecord> {
  return prisma.userSettings.upsert({
    where: { userId },
    update: {},
    create: { userId },
    select: {
      billingCancelAtPeriodEnd: true,
      billingGraceUntil: true,
      billingPeriodEnd: true,
      billingPeriodStart: true,
      billingPlanCode: true,
      billingStatus: true,
    },
  });
}

async function loadQuotaMetricUsage(
  userId: string,
  metric: BillingQuotaMetric,
  periodStart: Date,
  periodEnd: Date,
): Promise<Record<BillingQuotaMetric, number>> {
  const usage = { exports: 0, generations: 0, members: 1, presentations: 0, storageBytes: 0 };
  if (metric === "presentations") {
    usage.presentations = await prisma.presentation.count({ where: { archivedAt: null, ownerId: userId } });
  } else if (metric === "exports") {
    usage.exports = await prisma.export.count({ where: { createdAt: { gte: periodStart, lt: periodEnd }, ownerId: userId } });
  } else if (metric === "generations") {
    usage.generations = await prisma.aiOperation.count({
      where: { createdAt: { gte: periodStart, lt: periodEnd }, ownerId: userId, status: "SUCCEEDED" },
    });
  } else if (metric === "members") {
    const collaborators = await prisma.presentationCollaboratorSession.findMany({
      where: { presentation: { ownerId: userId } },
      distinct: ["userId"],
      select: { userId: true },
    });
    usage.members = Math.max(1, collaborators.length);
  } else {
    const [imports, storedExports] = await Promise.all([
      prisma.importReport.findMany({ where: { ownerId: userId }, select: { report: true } }),
      prisma.export.findMany({ where: { ownerId: userId }, select: { report: true } }),
    ]);
    usage.storageBytes = [...imports, ...storedExports].reduce(
      (total, record) => total + reportByteSize(record.report),
      0,
    );
  }
  return usage;
}

function buildBillingSnapshot(
  settings: BillingSettingsRecord,
  usage: Record<BillingQuotaMetric, number>,
  periodStart: Date,
  periodEnd: Date,
  now: Date,
): BillingSnapshot {
  const plan = planCode(settings.billingPlanCode);
  const entitlement = PLAN_ENTITLEMENTS[plan];
  const limits = {
    exports: entitlement.maxExportsPerPeriod,
    generations: entitlement.maxGenerationsPerPeriod,
    members: entitlement.maxMembers,
    presentations: entitlement.maxPresentations,
    storageBytes: entitlement.maxStorageBytes,
  } satisfies Record<BillingQuotaMetric, number>;
  const remaining = Object.fromEntries(
    (Object.keys(limits) as BillingQuotaMetric[]).map((metric) => [
      metric,
      Math.max(0, limits[metric] - usage[metric]),
    ]),
  ) as Record<BillingQuotaMetric, number>;
  const status = billingStatus(settings.billingStatus);
  const currentPeriodStart = settings.billingPeriodStart ?? periodStart;
  const currentPeriodEnd = settings.billingPeriodEnd ?? periodEnd;
  return {
    access: billingAccess(status, settings.billingGraceUntil, now),
    cancelAtPeriodEnd: settings.billingCancelAtPeriodEnd,
    currentPeriodEnd: currentPeriodEnd.toISOString(),
    currentPeriodStart: currentPeriodStart.toISOString(),
    graceUntil: settings.billingGraceUntil?.toISOString() ?? null,
    limits,
    plan,
    planLabel: entitlement.label,
    remaining,
    status,
    usage,
  };
}

export function billingPeriod(now: Date): { periodStart: Date; periodEnd: Date } {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { periodStart, periodEnd: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) };
}

function reportByteSize(report: unknown): number {
  if (!report || typeof report !== "object" || Array.isArray(report)) return 0;
  const value = (report as Record<string, unknown>).byteSize;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
