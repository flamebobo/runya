import {
  babyChanges,
  babies,
  devices,
  families,
  familyInvites,
  familyMembers,
  familyMemberPermissions,
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
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { schema } from '@runew/db';
import { createDefaultRewards } from '../gems/defaults.js';
import { AppError } from '../../lib/errors.js';
import {
  generateInviteToken,
  generateSessionToken,
  hashClientMetadata,
  hashInviteToken,
  hashToken,
} from '../../lib/crypto.js';
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
    birthTime: row.birthTime,
    avatarMediaId: row.avatarMediaId,
    birthHeightCm: row.birthHeightCm,
    birthWeightKg: row.birthWeightKg,
    notes: row.notes,
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
  metadata: {
    ip?: string;
    userAgent?: string;
    deviceName?: string;
    appVersion?: string;
  },
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
  metadata: {
    ip?: string;
    userAgent?: string;
    deviceName?: string;
    appVersion?: string;
  },
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
  metadata: {
    ip?: string;
    userAgent?: string;
    deviceName?: string;
    appVersion?: string;
  },
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
): Promise<{
  userId: string;
  sessionId: string;
  platform: Platform;
  deviceId: string | null;
}> {
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

/** Returns the user's current active family for single-family P0 routes. */
export async function getActiveFamilyId(db: Database, userId: string) {
  const memberships = await listFamiliesForUser(db, userId);
  const membership = memberships[0];
  if (!membership) {
    throw new AppError('FAMILY_ACCESS_DENIED', '尚未加入任何家庭', 400);
  }
  return membership.family.id;
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

/**
 * Applies the member override after the active-membership and family-scope checks.
 * Role defaults remain the product default; an explicit DENY is the only override
 * needed for the current family collaboration surface.
 */
export async function requireFamilyPermission(
  db: Database,
  userId: string,
  familyId: string,
  resource: string,
  action: string,
) {
  const member = await requireFamilyMembership(db, userId, familyId);
  const denied = await db
    .select({ id: familyMemberPermissions.id })
    .from(familyMemberPermissions)
    .where(
      and(
        eq(familyMemberPermissions.familyMemberId, member.id),
        eq(familyMemberPermissions.resource, resource),
        eq(familyMemberPermissions.action, action),
        eq(familyMemberPermissions.effect, 'DENY'),
      ),
    )
    .limit(1);
  if (denied[0]) {
    throw new AppError('PERMISSION_DENIED', '当前成员没有该家庭资源权限', 403);
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

  const familyRows = await db
    .select()
    .from(families)
    .where(eq(families.id, familyId))
    .limit(1);
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
    birthTime: body.birthTime ?? null,
    avatarMediaId: body.avatarMediaId ?? null,
    birthHeightCm: body.birthHeightCm ?? null,
    birthWeightKg: body.birthWeightKg ?? null,
    notes: body.notes ?? null,
    createdBy: userId,
    createdAt: now,
    updatedBy: userId,
    updatedAt: now,
  });

  const rows = await db.select().from(babies).where(eq(babies.id, babyId)).limit(1);
  return mapBaby(rows[0]!);
}

/** M11: adding a second baby is an explicit action and must not reuse the first row. */
export async function addBaby(
  db: Database,
  userId: string,
  familyId: string,
  body: CreateBabyBody,
) {
  await requireFamilyMembership(db, userId, familyId);
  const now = utcNowMs();
  const babyId = createUlid();
  await db.insert(babies).values({
    id: babyId,
    familyId,
    name: body.name,
    nickname: body.nickname ?? null,
    sex: body.sex ?? null,
    birthday: body.birthday,
    birthTime: body.birthTime ?? null,
    avatarMediaId: body.avatarMediaId ?? null,
    birthHeightCm: body.birthHeightCm ?? null,
    birthWeightKg: body.birthWeightKg ?? null,
    notes: body.notes ?? null,
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
  tokenOverride?: string,
) {
  await requireFamilyMembership(db, userId, familyId);
  const token = tokenOverride ?? generateInviteToken();
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

  try {
    return await db.transaction(async (tx) => {
      // Claim first with a conditional update. Two connections racing here cannot both consume one token.
      const claimed = await tx
        .update(familyInvites)
        .set({ usedAt: now, usedBy: userId })
        .where(
          and(
            eq(familyInvites.id, invite.id),
            isNull(familyInvites.usedAt),
            gt(familyInvites.expiresAt, now),
          ),
        )
        .returning();
      if (!claimed[0]) {
        throw new AppError(
          'GONE',
          invite.usedAt ? '邀请链接已被使用' : '邀请链接已过期',
          410,
        );
      }

      const existing = await tx
        .select()
        .from(familyMembers)
        .where(
          and(
            eq(familyMembers.familyId, invite.familyId),
            eq(familyMembers.userId, userId),
          ),
        )
        .limit(1);
      if (existing[0]?.status === FamilyMemberStatus.DISABLED) {
        throw new AppError(
          'FAMILY_ACCESS_DENIED',
          '该成员已被停用，请联系家庭管理员恢复',
          403,
        );
      }
      if (!existing[0]) {
        await tx.insert(familyMembers).values({
          id: createUlid(),
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

      const familyRows = await tx
        .select()
        .from(families)
        .where(eq(families.id, invite.familyId))
        .limit(1);
      return mapFamily(familyRows[0]!);
    });
  } catch (error) {
    // SQLite can report BUSY while another connection is committing the claim; expose the domain result.
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'SQLITE_BUSY'
    ) {
      throw new AppError('GONE', '邀请链接已被使用', 410);
    }
    throw error;
  }
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
  const changes = [
    ['name', baby.name, patch.name],
    ['nickname', baby.nickname, patch.nickname],
    ['sex', baby.sex, patch.sex],
    ['birthday', baby.birthday, patch.birthday],
    ['birthTime', baby.birthTime, patch.birthTime],
    ['avatarMediaId', baby.avatarMediaId, patch.avatarMediaId],
    ['birthHeightCm', baby.birthHeightCm, patch.birthHeightCm],
    ['birthWeightKg', baby.birthWeightKg, patch.birthWeightKg],
    ['notes', baby.notes, patch.notes],
  ].filter(([, oldValue, newValue]) => newValue !== undefined && oldValue !== newValue);
  await db
    .update(babies)
    .set({
      name: patch.name ?? baby.name,
      nickname: patch.nickname === undefined ? baby.nickname : (patch.nickname ?? null),
      sex: patch.sex === undefined ? baby.sex : (patch.sex ?? null),
      birthday: patch.birthday ?? baby.birthday,
      birthTime: patch.birthTime === undefined ? baby.birthTime : patch.birthTime,
      avatarMediaId:
        patch.avatarMediaId === undefined ? baby.avatarMediaId : (patch.avatarMediaId ?? null),
      birthHeightCm:
        patch.birthHeightCm === undefined ? baby.birthHeightCm : (patch.birthHeightCm ?? null),
      birthWeightKg:
        patch.birthWeightKg === undefined ? baby.birthWeightKg : (patch.birthWeightKg ?? null),
      notes: patch.notes === undefined ? baby.notes : (patch.notes ?? null),
      updatedBy: userId,
      updatedAt: now,
      version: baby.version + 1,
    })
    .where(eq(babies.id, babyId));

  if (changes.length > 0) {
    await db.insert(babyChanges).values(
      changes.map(([field, oldValue, newValue]) => ({
        id: createUlid(),
        familyId: baby.familyId,
        babyId,
        actorUserId: userId,
        field: String(field),
        oldValue: oldValue == null ? null : String(oldValue),
        newValue: newValue == null ? null : String(newValue),
        changedAt: now,
      })),
    );
  }

  const rows = await db.select().from(babies).where(eq(babies.id, babyId)).limit(1);
  return mapBaby(rows[0]!);
}

export async function softDeleteBaby(db: Database, userId: string, babyId: string) {
  const baby = await requireBabyInFamily(db, userId, babyId);
  const now = utcNowMs();
  await db
    .update(babies)
    .set({ deletedAt: now, updatedBy: userId, updatedAt: now, version: baby.version + 1 })
    .where(eq(babies.id, babyId));
  return { id: babyId, deletedAt: now };
}
