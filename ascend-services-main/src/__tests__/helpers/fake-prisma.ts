/**
 * In-memory stand-in for the Prisma client used by the request flows.
 *
 * It honours `select`, so a test that asserts `street_address` is absent from a
 * public payload is really asserting that the production code never asked the
 * database for the column — not just that it forgot to print it.
 */
export interface FakeRequestRow {
  id: string;
  requester_name: string;
  requester_email: string | null;
  service_type: string;
  neighborhood: string;
  street_address: string;
  prayer_request: string | null;
  prayer_private: boolean;
  status: string;
  assignedToId: string | null;
  assignedAt: Date | null;
  tracking_token: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FakeMemberRow {
  id: string;
  name: string;
  email: string;
  role: string;
  services_provided: string[];
  bio: string | null;
  /** Bearer credential: present on the row so tests can prove it is unselected. */
  onboarding_token?: string | null;
  createdAt: Date;
}

export interface FakeSystemSettingsRow {
  id: string;
  unassigned_alert_hours: number;
  stalled_contact_alert_hours: number;
  stalled_progress_days: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FakeAuditLogRow {
  id: string;
  actorId: string | null;
  requestId: string | null;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export type Selection = Record<string, boolean>;

/** A `select` that also pulls a relation, e.g. `assignedTo: { select: {...} }`. */
export type RelationSelection<TRelation extends string> = Selection & {
  [key in TRelation]?: { select: Selection };
};

export class FakeUniqueConstraintError extends Error {
  readonly code = "P2002";
  readonly meta: { target: string[] };

  constructor(field: string) {
    super(`Unique constraint failed on the fields: (\`${field}\`)`);
    this.name = "PrismaClientKnownRequestError";
    this.meta = { target: [field] };
  }
}

/** Prisma string filter shapes the request flows actually use. */
type StringFilter = string | { in?: string[] };

/** Prisma date comparison, as the SLA monitor's overdue lookups use it. */
type DateFilter = { lt?: Date; gte?: Date };

interface RequestWhere {
  id?: string;
  status?: StringFilter;
  service_type?: StringFilter;
  assignedToId?: string;
  createdAt?: DateFilter;
  assignedAt?: DateFilter;
  updatedAt?: DateFilter;
}

interface AuditLogWhere {
  action?: StringFilter;
  requestId?: StringFilter;
}

/** Column the flows under test sort by, on either table. */
type OrderBy = Partial<
  Record<"createdAt" | "assignedAt" | "updatedAt" | "name", "asc" | "desc">
>;

export interface FakePrisma {
  client: unknown;
  requests: FakeRequestRow[];
  users: FakeMemberRow[];
  auditLogs: FakeAuditLogRow[];
  systemSettings: FakeSystemSettingsRow[];
  /** Forces the next N `request.create` calls to hit a token collision. */
  failNextCreatesWithTokenCollision(count: number): void;
  /** Forces the next `auditLog.create` call to fail. */
  failNextAuditCreate(error: Error): void;
}

export function createFakePrisma(users: FakeMemberRow[] = []): FakePrisma {
  const requests: FakeRequestRow[] = [];
  const auditLogs: FakeAuditLogRow[] = [];
  const systemSettings: FakeSystemSettingsRow[] = [];
  let forcedCollisions = 0;
  let auditCreateFailure: Error | null = null;
  let sequence = 0;

  const nextId = (prefix: string) => `${prefix}-${++sequence}`;

  const client = {
    request: {
      async create({
        data,
        select,
      }: {
        data: Partial<FakeRequestRow>;
        select?: Selection;
      }) {
        if (forcedCollisions > 0) {
          forcedCollisions -= 1;
          throw new FakeUniqueConstraintError("tracking_token");
        }
        if (requests.some((row) => row.tracking_token === data.tracking_token)) {
          throw new FakeUniqueConstraintError("tracking_token");
        }

        const now = new Date();
        const row: FakeRequestRow = {
          id: nextId("req"),
          requester_name: "",
          requester_email: null,
          service_type: "",
          neighborhood: "",
          street_address: "",
          prayer_request: null,
          prayer_private: true,
          status: "NEW",
          assignedToId: null,
          assignedAt: null,
          tracking_token: "",
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        requests.push(row);
        return project(row, select);
      },

      async findUnique({
        where,
        select,
      }: {
        where: { id?: string; tracking_token?: string };
        select?: Selection;
      }) {
        const row = requests.find(
          (candidate) =>
            (where.id !== undefined && candidate.id === where.id) ||
            (where.tracking_token !== undefined &&
              candidate.tracking_token === where.tracking_token),
        );
        return row ? project(row, select) : null;
      },

      async findMany({
        where,
        select,
        orderBy,
        take,
      }: {
        where?: RequestWhere;
        select?: RelationSelection<"assignedTo">;
        orderBy?: OrderBy;
        take?: number;
      }) {
        let rows = sortRows(
          requests.filter((row) => matchesRequestWhere(row, where)),
          orderBy,
        );
        if (typeof take === "number") rows = rows.slice(0, take);

        const { assignedTo, ...columns } = select ?? {};
        return rows.map((row) => {
          const projected = project(row, columns as Selection) as Record<
            string,
            unknown
          >;
          if (assignedTo) {
            const owner = users.find((candidate) => candidate.id === row.assignedToId);
            projected.assignedTo = owner ? project(owner, assignedTo.select) : null;
          }
          return projected;
        });
      },

      async updateMany({
        where,
        data,
      }: {
        where: RequestWhere;
        data: Partial<FakeRequestRow>;
      }) {
        const matches = requests.filter((row) => matchesRequestWhere(row, where));
        for (const row of matches) Object.assign(row, data, { updatedAt: new Date() });
        return { count: matches.length };
      },
    },

    user: {
      async findUnique({
        where,
        select,
      }: {
        where: { id?: string; email?: string };
        select?: Selection;
      }) {
        const row = users.find(
          (candidate) =>
            (where.id !== undefined && candidate.id === where.id) ||
            (where.email !== undefined && candidate.email === where.email),
        );
        return row ? project(row, select) : null;
      },

      async create({
        data,
        select,
      }: {
        data: Partial<FakeMemberRow>;
        select?: Selection;
      }) {
        if (users.some((candidate) => candidate.email === data.email)) {
          throw new FakeUniqueConstraintError("email");
        }
        const row: FakeMemberRow = {
          id: nextId("user"),
          name: "",
          email: "",
          role: "SERVER",
          services_provided: [],
          bio: null,
          onboarding_token: null,
          createdAt: new Date(),
          ...data,
        };
        users.push(row);
        return project(row, select);
      },

      async update({
        where,
        data,
        select,
      }: {
        where: { id?: string; email?: string };
        data: Partial<FakeMemberRow>;
        select?: Selection;
      }) {
        const row = users.find(
          (candidate) =>
            (where.id !== undefined && candidate.id === where.id) ||
            (where.email !== undefined && candidate.email === where.email),
        );
        if (!row) throw new Error(`No User matching ${JSON.stringify(where)}`);
        Object.assign(row, data);
        return project(row, select);
      },

      async findMany({
        where,
        select,
        orderBy,
        take,
      }: {
        where?: { role?: string };
        select?: Selection;
        orderBy?: OrderBy;
        take?: number;
      }) {
        let rows = sortRows(
          users.filter((row) => where?.role === undefined || row.role === where.role),
          orderBy,
        );
        if (typeof take === "number") rows = rows.slice(0, take);
        return rows.map((row) => project(row, select));
      },
    },

    systemSettings: {
      async findUnique({
        where,
        select,
      }: {
        where: { id: string };
        select?: Selection;
      }) {
        const row = systemSettings.find((candidate) => candidate.id === where.id);
        return row ? project(row, select) : null;
      },

      async upsert({
        where,
        create,
        update,
        select,
      }: {
        where: { id: string };
        create: Omit<FakeSystemSettingsRow, "createdAt" | "updatedAt">;
        update: Partial<FakeSystemSettingsRow>;
        select?: Selection;
      }) {
        const now = new Date();
        const existing = systemSettings.find(
          (candidate) => candidate.id === where.id,
        );
        if (existing) {
          Object.assign(existing, update, { updatedAt: now });
          return project(existing, select);
        }
        const row: FakeSystemSettingsRow = {
          ...create,
          createdAt: now,
          updatedAt: now,
        };
        systemSettings.push(row);
        return project(row, select);
      },
    },

    auditLog: {
      async create({ data }: { data: Partial<FakeAuditLogRow> }) {
        if (auditCreateFailure) {
          const failure = auditCreateFailure;
          auditCreateFailure = null;
          throw failure;
        }
        const row: FakeAuditLogRow = {
          id: nextId("audit"),
          actorId: null,
          requestId: null,
          action: "",
          fromStatus: null,
          toStatus: null,
          metadata: null,
          createdAt: new Date(),
          ...data,
        };
        auditLogs.push(row);
        return row;
      },

      async findMany({
        where,
        select,
      }: {
        where?: AuditLogWhere;
        select?: Selection;
      }) {
        return auditLogs
          .filter(
            (row) =>
              matchesStringFilter(row.action, where?.action) &&
              matchesStringFilter(row.requestId ?? "", where?.requestId),
          )
          .map((row) => project(row, select));
      },
    },

    /** Rolls the in-memory tables back on failure, like a real transaction. */
    async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const requestsBefore = [...requests];
      const auditLogsBefore = [...auditLogs];
      const settingsBefore = systemSettings.map((row) => ({ ...row }));
      const usersBefore = users.map((row) => ({ ...row }));
      try {
        return await fn(client);
      } catch (err) {
        requests.splice(0, requests.length, ...requestsBefore);
        auditLogs.splice(0, auditLogs.length, ...auditLogsBefore);
        systemSettings.splice(0, systemSettings.length, ...settingsBefore);
        users.splice(0, users.length, ...usersBefore);
        throw err;
      }
    },
  };

  return {
    client,
    requests,
    users,
    auditLogs,
    systemSettings,
    failNextCreatesWithTokenCollision(count: number) {
      forcedCollisions = count;
    },
    failNextAuditCreate(error: Error) {
      auditCreateFailure = error;
    },
  };
}

function matchesRequestWhere(row: FakeRequestRow, where?: RequestWhere): boolean {
  if (!where) return true;
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.assignedToId !== undefined && row.assignedToId !== where.assignedToId) {
    return false;
  }
  if (!matchesStringFilter(row.status, where.status)) return false;
  if (!matchesStringFilter(row.service_type, where.service_type)) return false;
  return (["createdAt", "assignedAt", "updatedAt"] as const).every((column) =>
    matchesDateFilter(row[column], where[column]),
  );
}

/** Mirrors Prisma: a null column never satisfies a comparison filter. */
function matchesDateFilter(value: Date | null, filter?: DateFilter): boolean {
  if (filter === undefined) return true;
  if (value === null) return false;
  if (filter.lt !== undefined && value.getTime() >= filter.lt.getTime()) return false;
  return filter.gte === undefined || value.getTime() >= filter.gte.getTime();
}

function matchesStringFilter(value: string, filter?: StringFilter): boolean {
  if (filter === undefined) return true;
  if (typeof filter === "string") return value === filter;
  return filter.in === undefined || filter.in.includes(value);
}

/** Honours the single-column `orderBy` the flows under test use. */
function sortRows<T extends object>(rows: T[], orderBy?: OrderBy): T[] {
  const [field, direction] = Object.entries(orderBy ?? {})[0] ?? [];
  if (!field) return rows;
  const sign = direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => sign * compareColumns(a, b, field));
}

function compareColumns<T extends object>(a: T, b: T, field: string): number {
  const left = a[field as keyof T];
  const right = b[field as keyof T];
  if (left instanceof Date || right instanceof Date) {
    return toTime(left) - toTime(right);
  }
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function toTime(value: unknown): number {
  return value instanceof Date ? value.getTime() : 0;
}

export function project<T extends object>(row: T, select?: Selection): Partial<T> {
  if (!select) return { ...row };
  const picked: Record<string, unknown> = {};
  for (const [key, include] of Object.entries(select)) {
    if (include) picked[key] = row[key as keyof T];
  }
  return picked as Partial<T>;
}
