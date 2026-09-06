import type { FamilyRelationship, SemanticTone } from '@runew/domain-types';
import type { GlyphName } from '@/components/icons/Glyph';

export const FAMILY_RELATIONSHIP_CARDS: Array<{
  value: FamilyRelationship;
  title: string;
  caption: string;
  glyph: GlyphName;
  tone: SemanticTone;
}> = [
  { value: 'MOM', title: '妈妈', caption: '记下很多温柔的小事', glyph: 'smile', tone: 'blush' },
  { value: 'DAD', title: '爸爸', caption: '把陪伴收进时间线', glyph: 'family', tone: 'sage' },
  { value: 'GRANDPARENT', title: '祖辈', caption: '把疼爱慢慢收藏', glyph: 'heart', tone: 'lavender' },
  { value: 'OTHER', title: '其他家人', caption: '这个小家也有我', glyph: 'sparkle', tone: 'sky' },
];

export function familyMemberGlyph(relationship: string): GlyphName {
  return (
    FAMILY_RELATIONSHIP_CARDS.find((item) => item.value === relationship)?.glyph ?? 'sparkle'
  );
}

const FALLBACK_TONES: SemanticTone[] = ['blush', 'sage', 'lavender', 'sky', 'apricot'];

export function familyMemberTone(relationship: string, index = 0): SemanticTone {
  return (
    FAMILY_RELATIONSHIP_CARDS.find((item) => item.value === relationship)?.tone ??
    FALLBACK_TONES[index % FALLBACK_TONES.length] ??
    'sage'
  );
}

export function familyMemberLabel(relationship: string, nickname?: string | null): string {
  if (nickname) return nickname;
  return FAMILY_RELATIONSHIP_CARDS.find((item) => item.value === relationship)?.title ?? '家人';
}
