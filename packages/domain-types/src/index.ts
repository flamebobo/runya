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

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'GONE'
  | 'RATE_LIMITED'
  | 'RETRYABLE_ERROR'
  | 'INTERNAL_ERROR';
