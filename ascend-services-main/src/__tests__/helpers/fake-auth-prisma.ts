/**
 * In-memory stand-in for the Prisma client used by the authentication flows.
 *
 * Like `fake-prisma`, it honours `select`, so a test asserting that a payload
 * or a log line omits a column is really asserting the production code never
 * asked for it. Only the operations the auth code actually performs exist here;
 * anything else should fail loudly rather than quietly return a default.
 */
import { FakeUniqueConstraintError, project, type Selection } from "./fake-prisma";

export interface FakeUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface FakePasskeyRow {
  id: string;
  credential_id: string;
  userId: string;
  public_key: Uint8Array;
  counter: number;
  transports: string[];
  device_type: string;
  backed_up: boolean;
  label: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FakeChallengeRow {
  id: string;
  ceremony: string;
  challenge: string;
  userId: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface FakeAuditRow {
  actorId: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
}

/** A row as Prisma sees it on `create`: database defaults are optional. */
type CreateData<Row, Defaulted extends keyof Row> = Omit<Row, Defaulted> &
  Partial<Pick<Row, Defaulted>>;

type PasskeyCreateData = CreateData<
  FakePasskeyRow,
  "id" | "counter" | "transports" | "label" | "lastUsedAt" | "createdAt" | "updatedAt"
>;

type ChallengeCreateData = CreateData<
  FakeChallengeRow,
  "id" | "consumedAt" | "createdAt"
>;

type AuditCreateData = CreateData<FakeAuditRow, "actorId" | "metadata">;

export interface FakeAuthPrisma {
  client: unknown;
  users: FakeUserRow[];
  passkeys: FakePasskeyRow[];
  challenges: FakeChallengeRow[];
  auditLogs: FakeAuditRow[];
}

export function createFakeAuthPrisma(users: FakeUserRow[] = []): FakeAuthPrisma {
  const passkeys: FakePasskeyRow[] = [];
  const challenges: FakeChallengeRow[] = [];
  const auditLogs: FakeAuditRow[] = [];
  let sequence = 0;

  const nextId = (prefix: string) => `${prefix}-${++sequence}`;

  const client = {
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
    },

    passkeyCredential: {
      async create({ data, select }: { data: PasskeyCreateData; select?: Selection }) {
        if (passkeys.some((row) => row.credential_id === data.credential_id)) {
          throw new FakeUniqueConstraintError("credential_id");
        }
        const now = new Date();
        const row: FakePasskeyRow = {
          id: nextId("passkey"),
          counter: 0,
          transports: [],
          label: null,
          lastUsedAt: null,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        passkeys.push(row);
        return project(row, select);
      },

      async findMany({
        where,
        select,
      }: {
        where: { userId: string };
        select?: Selection;
      }) {
        return passkeys
          .filter((row) => row.userId === where.userId)
          .map((row) => project(row, select));
      },

      async findUnique({
        where,
        select,
      }: {
        where: { credential_id: string };
        select?: Selection & { user?: { select: Selection } };
      }) {
        const row = passkeys.find(
          (candidate) => candidate.credential_id === where.credential_id,
        );
        if (!row) return null;

        const { user: userSelect, ...columns } = select ?? {};
        const projected = project(row, columns as Selection) as Record<string, unknown>;
        if (userSelect) {
          const owner = users.find((candidate) => candidate.id === row.userId);
          projected.user = owner ? project(owner, userSelect.select) : null;
        }
        return projected;
      },

      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakePasskeyRow>;
      }) {
        const row = passkeys.find((candidate) => candidate.id === where.id);
        if (!row) throw new Error(`No PasskeyCredential with id ${where.id}`);
        Object.assign(row, data, { updatedAt: new Date() });
        return { ...row };
      },
    },

    webAuthnChallenge: {
      async create({ data, select }: { data: ChallengeCreateData; select?: Selection }) {
        const row: FakeChallengeRow = {
          id: nextId("ceremony"),
          consumedAt: null,
          createdAt: new Date(),
          ...data,
        };
        challenges.push(row);
        return project(row, select);
      },

      async findUnique({
        where,
        select,
      }: {
        where: { id: string };
        select?: Selection;
      }) {
        const row = challenges.find((candidate) => candidate.id === where.id);
        return row ? project(row, select) : null;
      },

      async updateMany({
        where,
        data,
      }: {
        where: { id: string; consumedAt: null };
        data: Partial<FakeChallengeRow>;
      }) {
        const row = challenges.find(
          (candidate) => candidate.id === where.id && candidate.consumedAt === null,
        );
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },

      async deleteMany({ where }: { where: { expiresAt: { lt: Date } } }) {
        const survivors = challenges.filter(
          (row) => row.expiresAt.getTime() >= where.expiresAt.lt.getTime(),
        );
        const removed = challenges.length - survivors.length;
        challenges.splice(0, challenges.length, ...survivors);
        return { count: removed };
      },
    },

    auditLog: {
      async create({ data }: { data: AuditCreateData }) {
        const row: FakeAuditRow = { actorId: null, metadata: null, ...data };
        auditLogs.push(row);
        return row;
      },
    },
  };

  return { client, users, passkeys, challenges, auditLogs };
}
