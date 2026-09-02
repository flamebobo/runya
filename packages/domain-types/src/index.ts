export const UserStatus = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const IdentifierType = {
  USERNAME: 'USERNAME',
  EMAIL: 'EMAIL',
  PHONE: 'PHONE',
} as const;
export type IdentifierType = (typeof IdentifierType)[keyof typeof IdentifierType];

export const Platform = {
  H5: 'H5',
  WEAPP: 'WEAPP',
} as const;
export type Platform = (typeof Platform)[keyof typeof Platform];

export const FamilyMemberRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
} as const;
export type FamilyMemberRole =
  (typeof FamilyMemberRole)[keyof typeof FamilyMemberRole];

export const FamilyMemberStatus = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
} as const;
export type FamilyMemberStatus =
  (typeof FamilyMemberStatus)[keyof typeof FamilyMemberStatus];

export const PermissionEffect = {
  ALLOW: 'ALLOW',
  DENY: 'DENY',
} as const;
export type PermissionEffect =
  (typeof PermissionEffect)[keyof typeof PermissionEffect];

export const SemanticTone = {
  APRICOT: 'apricot',
  SAGE: 'sage',
  LAVENDER: 'lavender',
  SKY: 'sky',
  BLUSH: 'blush',
} as const;
export type SemanticTone = (typeof SemanticTone)[keyof typeof SemanticTone];

export const BottomNavKey = {
  TODAY: 'today',
  RECORDS: 'records',
  MEMORIES: 'memories',
  FAMILY: 'family',
} as const;
export type BottomNavKey = (typeof BottomNavKey)[keyof typeof BottomNavKey];

export const FamilyRelationship = {
  MOM: 'MOM',
  DAD: 'DAD',
  GRANDPARENT: 'GRANDPARENT',
  OTHER: 'OTHER',
} as const;
export type FamilyRelationship =
  (typeof FamilyRelationship)[keyof typeof FamilyRelationship];

export const BabySex = {
  MALE: 'MALE',
  FEMALE: 'FEMALE',
  UNKNOWN: 'UNKNOWN',
} as const;
export type BabySex = (typeof BabySex)[keyof typeof BabySex];

export const BootstrapStatus = {
  FIRST_RUN: 'FIRST_RUN',
  MISSING_FAMILY: 'MISSING_FAMILY',
  MISSING_BABY: 'MISSING_BABY',
  READY: 'READY',
} as const;
export type BootstrapStatus =
  (typeof BootstrapStatus)[keyof typeof BootstrapStatus];

export const FeedingType = {
  BOTTLE: 'BOTTLE',
  BREAST: 'BREAST',
} as const;
export type FeedingType = (typeof FeedingType)[keyof typeof FeedingType];

export const MilkType = {
  FORMULA: 'FORMULA',
  BREAST_MILK: 'BREAST_MILK',
  MIXED: 'MIXED',
} as const;
export type MilkType = (typeof MilkType)[keyof typeof MilkType];

export const FeedingStatus = {
  COMPLETED: 'COMPLETED',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
} as const;
export type FeedingStatus = (typeof FeedingStatus)[keyof typeof FeedingStatus];

export const BreastSide = {
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
} as const;
export type BreastSide = (typeof BreastSide)[keyof typeof BreastSide];

export const SleepStatus = {
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
} as const;
export type SleepStatus = (typeof SleepStatus)[keyof typeof SleepStatus];

export const DiaperType = {
  WET: 'WET',
  DIRTY: 'DIRTY',
  BOTH: 'BOTH',
  DRY: 'DRY',
} as const;
export type DiaperType = (typeof DiaperType)[keyof typeof DiaperType];

export const RecordKind = {
  FEEDING: 'FEEDING',
  SLEEP: 'SLEEP',
  DIAPER: 'DIAPER',
  FOOD: 'FOOD',
} as const;
export type RecordKind = (typeof RecordKind)[keyof typeof RecordKind];

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_REQUIRED'
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_SESSION_EXPIRED'
  | 'AUTH_SESSION_REVOKED'
  | 'AUTH_ACCOUNT_DISABLED'
  | 'AUTH_RATE_LIMITED'
  | 'CSRF_INVALID'
  | 'PERMISSION_DENIED'
  | 'FAMILY_ACCESS_DENIED'
  | 'BABY_ACCESS_DENIED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'GONE'
  | 'RATE_LIMITED'
  | 'RETRYABLE_ERROR'
  | 'INTERNAL_ERROR'
  | 'ENTITY_VERSION_CONFLICT'
  | 'ENTITY_ID_REUSED'
  | 'ENTITY_DELETED'
  | 'SYNC_DEPENDENCY_CYCLE'
  | 'SYNC_CURSOR_EXPIRED'
  | 'FULL_RESYNC_REQUIRED'
  | 'MERGE_REQUIRES_FIELD_SELECTION'
  | 'CLIENT_CLOCK_SUSPECT'
  | 'UNSUPPORTED_ENTITY_TYPE';

export const SyncOp = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  RESTORE: 'RESTORE',
} as const;
export type SyncOp = (typeof SyncOp)[keyof typeof SyncOp];

export const SyncPushStatus = {
  APPLIED: 'APPLIED',
  DUPLICATE_QUEUED: 'DUPLICATE_QUEUED',
  CONFLICT: 'CONFLICT',
  ENTITY_DELETED: 'ENTITY_DELETED',
} as const;
export type SyncPushStatus = (typeof SyncPushStatus)[keyof typeof SyncPushStatus];

export const DuplicateStatus = {
  PENDING: 'PENDING',
  MERGED: 'MERGED',
  KEEP_BOTH: 'KEEP_BOTH',
} as const;
export type DuplicateStatus = (typeof DuplicateStatus)[keyof typeof DuplicateStatus];

export const EntityType = {
  DIAPER_RECORD: 'DIAPER_RECORD',
  FOOD_RECORD: 'FOOD_RECORD',
  GROWTH_RECORD: 'GROWTH_RECORD',
  MILESTONE: 'MILESTONE',
} as const;
export type EntityType = (typeof EntityType)[keyof typeof EntityType];
