import {
  babies,
  devices,
  families,
  familyInvites,
  familyMembers,
  userAuthCredentials,
  userSessions,
  users,
} from '@runew/db';
import type {
  BabyPublic,
  BootstrapResponse,
  CreateBabyBody,
  CreateFamilyBody,
  FamilyMemberPublic,
  FamilyPublic,
  LoginBody,
  OnboardingCompleteBody,
  RegisterBody,
  UpdateBabyBody,
  UserPublic,
} from '@runew/contracts';
import {
  BootstrapStatus,
  FamilyMemberRole,
  FamilyMemberStatus,
  IdentifierType,
  UserStatus,
} from '@runew/domain-types';
import type { Platform } from '@runew/domain-types';
import { createUlid, utcNowMs } from '@runew/shared-utils';
import { and, eq, isNull } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { schema } from '@runew/db';
import { createDefaultRewards } from '../gems/defaults.js';
import { AppError } from '../../lib/errors.js';
import { generateInviteToken, generateSessionToken, hashClientMetadata, hashInviteToken, hashToken } from '../../lib/crypto.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { SESSION_TTL_MS, normalizeUsername } from '../../lib/auth-constants.js';

type Database = LibSQLDatabase<typeof schema>;

export function mapUser(row: typeof users.$inferSelect): UserPublic {
  return {
    id: row.id,
    nickname: row.nickname,
    status: row.status as UserPublic['status'],
    locale: row.locale,
    timezoneName: row.timezoneName,
    topicPreferences: row.topicPreferencesJson
      ? (JSON.parse(row.topicPreferencesJson) as string[])
      : undefined,
  };
}

export function mapFamily(row: typeof families.$inferSelect): FamilyPublic {
  return {
    id: row.id,
    name: row.name,
    ownerUserId: row.ownerUserId,
    gemBalance: row.gemBalanceCache,
    level: row.level,
    timezoneName: row.timezoneName,
    version: row.version,
  };
}

export function mapBaby(row: typeof babies.$inferSelect): BabyPublic {
  return {
    id: row.id,
    familyId: row.familyId,
    name: row.name,
    nickname: row.nickname,
    sex: (row.sex as BabyPublic['sex']) ?? null,
    birthday: row.birthday,
    version: row.version,
  };
}

export function mapMember(
  row: typeof familyMembers.$inferSelect,
  nickname?: string,
): FamilyMemberPublic {
  return {
    id: row.id,
    familyId: row.familyId,
    userId: row.userId,
    relationship: row.relationship,
    role: row.role as FamilyMemberPublic['role'],
    status: row.status as FamilyMemberPublic['status'],
    nickname,
  };
}

export async function getUserById(db: Database, userId: string) {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return rows[0] ?? null;
}

export async function registerUser(
  db: Database,
  body: RegisterBody,
  platform: Platform,
  metadata: { ip?: string; userAgent?: string; deviceName?: string; appVersion?: string },
) {
  const username = normalizeUsername(body.username);
  const existing = await db
    .select()
    .from(userAuthCredentials)
    .where(eq(userAuthCredentials.identifierNormalized, username))
    .limit(1);
  if (existing[0]) {
    throw new AppError('CONFLICT', '该账号已被注册', 409);
  }

  const now = utcNowMs();
  const userId = createUlid();
  const credentialId = createUlid();
  const passwordHash = await hashPassword(body.password);

  await db.insert(users).values({
    id: userId,
    nickname: body.nickname?.trim() || body.username.trim(),
    status: UserStatus.ACTIVE,
    locale: 'zh-CN',
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(userAuthCredentials).values({
    id: credentialId,
    userId,
    identifierType: IdentifierType.USERNAME,
    identifierNormalized: username,
    passwordHash,
    passwordChangedAt: now,
    createdAt: now,
  });

  return createSessionForUser(db, userId, platform, metadata);
}

export async function loginUser(
  db: Database,
  body: LoginBody,
  platform: Platform,
  metadata: { ip?: string; userAgent?: string; deviceName?: string; appVersion?: string },
) {
  const username = normalizeUsername(body.username);
  const credentialRows = await db
    .select()
    .from(userAuthCredentials)
    .where(eq(userAuthCredentials.identifierNormalized, username))
    .limit(1);
  const credential = credentialRows[0];
  if (!credential) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', '账号或密码不正确', 401);
  }

  const user = await getUserById(db, credential.userId);
  if (!user) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', '账号或密码不正确', 401);
  }
  if (user.status === UserStatus.DISABLED) {
    throw new AppError('AUTH_ACCOUNT_DISABLED', '账号已被停用，请联系家人处理', 403);
  }

  const valid = await verifyPassword(body.password, credential.passwordHash);
  if (!valid) {
    await db
      .update(userAuthCredentials)
      .set({ failedAttempts: credential.failedAttempts + 1 })
      .where(eq(userAuthCredentials.id, credential.id));
    throw new AppError('AUTH_INVALID_CREDENTIALS', '账号或密码不正确', 401);
  }

  await db
    .update(userAuthCredentials)
    .set({ failedAttempts: 0, lockedUntil: null })
    .where(eq(userAuthCredentials.id, credential.id));

  return createSessionForUser(db, user.id, platform, metadata);
}

async function upsertDevice(
  db: Database,
  userId: string,
  platform: Platform,
  metadata: { deviceName?: string; appVersion?: string },
) {
  const now = utcNowMs();
  const deviceId = createUlid();
  await db.insert(devices).values({
    id: deviceId,
    userId,
    platform,
    deviceName: metadata.deviceName ?? null,
    appVersion: metadata.appVersion ?? null,
    lastSeenAt: now,
    createdAt: now,
  });
  return deviceId;
}

export async function createSessionForUser(
  db: Database,
  userId: string,
  platform: Platform,
  metadata: { ip?: string; userAgent?: string; deviceName?: string; appVersion?: string },
) {
  const user = await getUserById(db, userId);
  if (!user) {
    throw new AppError('NOT_FOUND', '用户不存在', 404);
  }
  if (user.status === UserStatus.DISABLED) {
    throw new AppError('AUTH_ACCOUNT_DISABLED', '账号已被停用，请联系家人处理', 403);
  }

  const now = utcNowMs();
  const token = generateSessionToken();
  const sessionId = createUlid();
  const deviceId = await upsertDevice(db, userId, platform, metadata);

  await db.insert(userSessions).values({
    id: sessionId,
    userId,
    tokenHash: hashToken(token),
    platform,
    deviceId,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: now + SESSION_TTL_MS,
    ipHash: metadata.ip ? hashClientMetadata(metadata.ip) : null,
    userAgentHash: metadata.userAgent ? hashClientMetadata(metadata.userAgent) : null,
  });

  return {
    user: mapUser(user),
    session: {
      sessionId,
      expiresAt: now + SESSION_TTL_MS,
      platform,
      token,
    },
  };
}

export async function resolveSession(
  db: Database,
  token: string,
): Promise<{ userId: string; sessionId: string; platform: Platform; deviceId: string | null }> {
  const rows = await db
    .select()
    .from(userSessions)
    .where(eq(userSessions.tokenHash, hashToken(token)))
    .limit(1);
  const session = rows[0];
  if (!session) {
    throw new AppError('AUTH_SESSION_EXPIRED', '登录已过期，请重新登录', 401);
  }
  if (session.revokedAt) {
    throw new AppError('AUTH_SESSION_REVOKED', '登录已在其他设备退出', 401);
  }
  const now = utcNowMs();
  if (session.expiresAt <= now) {
    throw new AppError('AUTH_SESSION_EXPIRED', '登录已过期，请重新登录', 401);
  }

  const user = await getUserById(db, session.userId);
  if (!user || user.status === UserStatus.DISABLED) {
    throw new AppError('AUTH_ACCOUNT_DISABLED', '账号已被停用，请联系家人处理', 403);
  }

  await db
    .update(userSessions)
    .set({ lastSeenAt: now })
    .where(eq(userSessions.id, session.id));

  return {
    userId: session.userId,
    sessionId: session.id,
    platform: session.platform as Platform,
    deviceId: session.deviceId,
  };
}

export async function logoutSession(db: Database, sessionId: string) {
  const now = utcNowMs();
  await db
    .update(userSessions)
    .set({ revokedAt: now })
    .where(eq(userSessions.id, sessionId));
}

export async function listFamiliesForUser(db: Database, userId: string) {
  const memberships = await db
    .select({
      member: familyMembers,
      family: families,
    })
    .from(familyMembers)
    .innerJoin(families, eq(familyMembers.familyId, families.id))
    .where(
      and(
        eq(familyMembers.userId, userId),
        eq(familyMembers.status, FamilyMemberStatus.ACTIVE),
      ),
    );

  return memberships.map((row) => ({
    family: mapFamily(row.family),
    member: row.member,
  }));
}

export async function requireFamilyMembership(
  db: Database,
  userId: string,
  familyId: string,
) {
  const rows = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.familyId, familyId),
        eq(familyMembers.userId, userId),
        eq(familyMembers.status, FamilyMemberStatus.ACTIVE),
      ),
    )
    .limit(1);
  const member = rows[0];
  if (!member) {
    throw new AppError('FAMILY_ACCESS_DENIED', '无权访问该家庭', 403);
  }
  return member;
}

export async function createFamily(
  db: Database,
  userId: string,
  body: CreateFamilyBody,
) {
  const existingMemberships = await listFamiliesForUser(db, userId);
  if (existingMemberships.length > 0) {
    return existingMemberships[0]!.family;
  }

  const now = utcNowMs();
  const familyId = createUlid();
  const memberId = createUlid();

  await db.insert(families).values({
    id: familyId,
    name: body.name,
    ownerUserId: userId,
    timezoneName: body.timezoneName,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(familyMembers).values({
    id: memberId,
    familyId,
    userId,
    relationship: body.relationship,
    role: FamilyMemberRole.OWNER,
    status: FamilyMemberStatus.ACTIVE,
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await createDefaultRewards(db, familyId, userId, now);

  const familyRows = await db.select().from(families).where(eq(families.id, familyId)).limit(1);
  return mapFamily(familyRows[0]!);
}

export async function listBabiesForFamily(db: Database, familyId: string) {
  const rows = await db
    .select()
    .from(babies)
    .where(and(eq(babies.familyId, familyId), isNull(babies.deletedAt)));
  return rows.map(mapBaby);
}

export async function createBaby(
  db: Database,
  userId: string,
  familyId: string,
  body: CreateBabyBody,
) {
  await requireFamilyMembership(db, userId, familyId);
  const existing = await listBabiesForFamily(db, familyId);
  if (existing.length > 0) {
    return existing[0]!;
  }

  const now = utcNowMs();
  const babyId = createUlid();
  await db.insert(babies).values({
    id: babyId,
    familyId,
    name: body.name,
    nickname: body.nickname ?? null,
    sex: body.sex ?? null,
    birthday: body.birthday,
    createdBy: userId,
    createdAt: now,
    updatedBy: userId,
    updatedAt: now,
  });

  const rows = await db.select().from(babies).where(eq(babies.id, babyId)).limit(1);
  return mapBaby(rows[0]!);
}

export async function requireBabyInFamily(
  db: Database,
  userId: string,
  babyId: string,
) {
  const rows = await db
    .select()
    .from(babies)
    .where(and(eq(babies.id, babyId), isNull(babies.deletedAt)))
    .limit(1);
  const baby = rows[0];
  if (!baby) {
    throw new AppError('NOT_FOUND', '宝宝档案不存在', 404);
  }
  await requireFamilyMembership(db, userId, baby.familyId);
  return baby;
}

export async function completeOnboarding(
  db: Database,
  userId: string,
  body: OnboardingCompleteBody,
  deviceId: string | null,
) {
  const family = await createFamily(db, userId, {
    name: body.familyName ?? `${body.baby.name}的小家`,
    timezoneName: body.timezoneName,
    relationship: body.relationship,
  });

  const baby = await createBaby(db, userId, family.id, body.baby);
  const now = utcNowMs();

  if (body.topics.length > 0) {
    await db
      .update(users)
      .set({
        topicPreferencesJson: JSON.stringify(body.topics),
        updatedAt: now,
      })
      .where(eq(users.id, userId));
  }

  if (deviceId) {
    await db
      .update(devices)
      .set({
        currentFamilyId: family.id,
        currentBabyId: baby.id,
        lastSeenAt: now,
      })
      .where(eq(devices.id, deviceId));
  }

  return { family, baby };
}

export async function buildBootstrap(
  db: Database,
  userId: string,
  deviceId: string | null,
): Promise<BootstrapResponse> {
  const userRow = await getUserById(db, userId);
  if (!userRow) {
    throw new AppError('NOT_FOUND', '用户不存在', 404);
  }

  const memberships = await listFamiliesForUser(db, userId);
  const familiesList = memberships.map((item) => item.family);

  let currentFamily: FamilyPublic | null = null;
  let currentBaby: BabyPublic | null = null;
  let babiesList: BabyPublic[] = [];
  let members: FamilyMemberPublic[] | undefined;

  const deviceRows = deviceId
    ? await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1)
    : [];
  const device = deviceRows[0];

  if (familiesList.length > 0) {
    const preferredFamilyId = device?.currentFamilyId;
    currentFamily =
      familiesList.find((family) => family.id === preferredFamilyId) ??
      familiesList[0] ??
      null;

    if (currentFamily) {
      babiesList = await listBabiesForFamily(db, currentFamily.id);
      const preferredBabyId = device?.currentBabyId;
      currentBaby =
        babiesList.find((baby) => baby.id === preferredBabyId) ?? babiesList[0] ?? null;

      const memberRows = await db
        .select({
          member: familyMembers,
          user: users,
        })
        .from(familyMembers)
        .innerJoin(users, eq(familyMembers.userId, users.id))
        .where(eq(familyMembers.familyId, currentFamily.id));

      members = memberRows.map((row) => mapMember(row.member, row.user.nickname));
    }
  }

  let status: BootstrapResponse['status'] = BootstrapStatus.READY;
  if (familiesList.length === 0) {
    status = BootstrapStatus.MISSING_FAMILY;
  } else if (!currentBaby) {
    status = BootstrapStatus.MISSING_BABY;
  }

  return {
    status,
    user: mapUser(userRow),
    families: familiesList,
    currentFamily,
    members,
    babies: babiesList,
    currentBaby,
    gemBalance: currentFamily?.gemBalance ?? 0,
    unreadNotifications: 0,
    running: { sleep: null, feeding: null },
    sync: { cursor: device?.syncCursor ?? 0, epoch: 1 },
    apiVersion: 'v1',
    minSupportedClientVersion: '0.1.0',
    latestClientVersion: '0.1.0',
  };
}

export async function createFamilyInvite(
  db: Database,
  userId: string,
  familyId: string,
  relationshipHint?: string,
  expiresInHours = 72,
) {
  await requireFamilyMembership(db, userId, familyId);
  const token = generateInviteToken();
  const now = utcNowMs();
  const inviteId = createUlid();

  await db.insert(familyInvites).values({
    id: inviteId,
    familyId,
    tokenHash: hashInviteToken(token),
    createdBy: userId,
    relationshipHint: relationshipHint ?? null,
    expiresAt: now + expiresInHours * 60 * 60 * 1000,
    createdAt: now,
  });

  return {
    id: inviteId,
    familyId,
    token,
    expiresAt: now + expiresInHours * 60 * 60 * 1000,
  };
}

export async function acceptFamilyInvite(
  db: Database,
  userId: string,
  token: string,
  relationship: string,
) {
  const rows = await db
    .select()
    .from(familyInvites)
    .where(eq(familyInvites.tokenHash, hashInviteToken(token)))
    .limit(1);
  const invite = rows[0];
  if (!invite) {
    throw new AppError('NOT_FOUND', '邀请链接无效或已过期', 404);
  }
  if (invite.usedAt) {
    throw new AppError('GONE', '邀请链接已被使用', 410);
  }
  const now = utcNowMs();
  if (invite.expiresAt <= now) {
    throw new AppError('GONE', '邀请链接已过期', 410);
  }

  const existing = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.familyId, invite.familyId),
        eq(familyMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!existing[0]) {
    const memberId = createUlid();
    await db.insert(familyMembers).values({
      id: memberId,
      familyId: invite.familyId,
      userId,
      relationship,
      role: FamilyMemberRole.MEMBER,
      status: FamilyMemberStatus.ACTIVE,
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  await db
    .update(familyInvites)
    .set({ usedAt: now, usedBy: userId })
    .where(eq(familyInvites.id, invite.id));

  const familyRows = await db
    .select()
    .from(families)
    .where(eq(families.id, invite.familyId))
    .limit(1);
  return mapFamily(familyRows[0]!);
}

export async function updateBaby(
  db: Database,
  userId: string,
  babyId: string,
  patch: UpdateBabyBody,
  expectedVersion: number | null,
) {
  const baby = await requireBabyInFamily(db, userId, babyId);
  if (expectedVersion !== null && baby.version !== expectedVersion) {
    throw new AppError('CONFLICT', '宝宝档案已被更新，请刷新后重试', 409);
  }

  const now = utcNowMs();
  await db
    .update(babies)
    .set({
      name: patch.name ?? baby.name,
      nickname: patch.nickname === undefined ? baby.nickname : patch.nickname ?? null,
      sex: patch.sex === undefined ? baby.sex : patch.sex ?? null,
      birthday: patch.birthday ?? baby.birthday,
      updatedBy: userId,
      updatedAt: now,
      version: baby.version + 1,
    })
    .where(eq(babies.id, babyId));

  const rows = await db.select().from(babies).where(eq(babies.id, babyId)).limit(1);
  return mapBaby(rows[0]!);
}
