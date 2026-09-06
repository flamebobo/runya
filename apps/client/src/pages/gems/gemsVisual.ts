import type { GemTransactionPublic, RewardOrderPublic } from '@runew/contracts';
import {
  wishBalloon,
  wishBath,
  wishBook,
  wishCake,
  wishCandle,
  wishCat,
  wishCoffee,
  wishDinner,
  wishFlower,
  wishFruit,
  wishGift,
  wishHeart,
  wishHug,
  wishIcecream,
  wishMovie,
  wishMusic,
  wishPark,
  wishPhoto,
  wishPicnic,
  wishPlant,
  wishRainbow,
  wishRest,
  wishSea,
  wishStar,
  wishSun,
  wishTea,
  wishToy,
  wishTravel,
} from '@/assets/illustrations/gems';
import type { GlyphName } from '@/components/icons/Glyph';

export type RewardTone = 'apricot' | 'blush' | 'sage' | 'sky' | 'lavender';
export type RewardTilt = 'left' | 'right' | 'none';
export type RewardKind = 'eat' | 'rest' | 'out' | 'home' | 'mood';

export type RewardVisual = {
  glyph: GlyphName;
  tone: RewardTone;
  label: string;
  kind: RewardKind;
  sticker: string;
  tilt: RewardTilt;
};

export const rewardKindLabel: Record<RewardKind, string> = {
  eat: '吃喝',
  rest: '休息',
  out: '出门',
  home: '宝宝与家',
  mood: '心情',
};

const rewardKindOrder: RewardKind[] = ['eat', 'rest', 'out', 'home', 'mood'];

const defaultVisual: RewardVisual = {
  glyph: 'heart',
  tone: 'sky',
  label: '心愿',
  kind: 'mood',
  sticker: wishHeart,
  tilt: 'none',
};

export const rewardVisuals: Record<string, RewardVisual> = {
  tea: { glyph: 'bowl', tone: 'apricot', label: '奶茶', kind: 'eat', sticker: wishTea, tilt: 'left' },
  coffee: { glyph: 'bowl', tone: 'blush', label: '咖啡', kind: 'eat', sticker: wishCoffee, tilt: 'right' },
  cake: { glyph: 'sparkle', tone: 'blush', label: '蛋糕', kind: 'eat', sticker: wishCake, tilt: 'none' },
  icecream: { glyph: 'smile', tone: 'apricot', label: '冰淇淋', kind: 'eat', sticker: wishIcecream, tilt: 'left' },
  fruit: { glyph: 'sparkle', tone: 'blush', label: '水果', kind: 'eat', sticker: wishFruit, tilt: 'right' },
  dinner: { glyph: 'bowl', tone: 'sage', label: '晚餐', kind: 'eat', sticker: wishDinner, tilt: 'right' },
  rest: { glyph: 'moon', tone: 'lavender', label: '睡觉', kind: 'rest', sticker: wishRest, tilt: 'none' },
  bath: { glyph: 'sparkle', tone: 'sky', label: '泡澡', kind: 'rest', sticker: wishBath, tilt: 'left' },
  hug: { glyph: 'heart', tone: 'blush', label: '抱抱', kind: 'rest', sticker: wishHug, tilt: 'none' },
  sea: { glyph: 'sparkle', tone: 'sky', label: '看海', kind: 'out', sticker: wishSea, tilt: 'right' },
  picnic: { glyph: 'bowl', tone: 'apricot', label: '野餐', kind: 'out', sticker: wishPicnic, tilt: 'left' },
  park: { glyph: 'growth', tone: 'sage', label: '公园', kind: 'out', sticker: wishPark, tilt: 'none' },
  movie: { glyph: 'video', tone: 'blush', label: '电影', kind: 'out', sticker: wishMovie, tilt: 'right' },
  travel: { glyph: 'sparkle', tone: 'sky', label: '旅行', kind: 'out', sticker: wishTravel, tilt: 'left' },
  toy: { glyph: 'baby', tone: 'sky', label: '玩具', kind: 'home', sticker: wishToy, tilt: 'left' },
  photo: { glyph: 'photo', tone: 'sage', label: '写真', kind: 'home', sticker: wishPhoto, tilt: 'none' },
  balloon: { glyph: 'sparkle', tone: 'sky', label: '气球', kind: 'home', sticker: wishBalloon, tilt: 'right' },
  gift: { glyph: 'gem', tone: 'apricot', label: '礼物', kind: 'home', sticker: wishGift, tilt: 'none' },
  flower: { glyph: 'sparkle', tone: 'blush', label: '小花', kind: 'home', sticker: wishFlower, tilt: 'right' },
  plant: { glyph: 'growth', tone: 'sage', label: '小芽', kind: 'home', sticker: wishPlant, tilt: 'left' },
  candle: { glyph: 'sparkle', tone: 'lavender', label: '烛光', kind: 'home', sticker: wishCandle, tilt: 'none' },
  book: { glyph: 'book', tone: 'blush', label: '读书', kind: 'mood', sticker: wishBook, tilt: 'right' },
  music: { glyph: 'sparkle', tone: 'lavender', label: '音乐', kind: 'mood', sticker: wishMusic, tilt: 'left' },
  cat: { glyph: 'smile', tone: 'blush', label: '小猫', kind: 'mood', sticker: wishCat, tilt: 'none' },
  star: { glyph: 'sparkle', tone: 'apricot', label: '星星', kind: 'mood', sticker: wishStar, tilt: 'right' },
  sun: { glyph: 'sparkle', tone: 'apricot', label: '晴天', kind: 'mood', sticker: wishSun, tilt: 'none' },
  rainbow: { glyph: 'sparkle', tone: 'sky', label: '彩虹', kind: 'mood', sticker: wishRainbow, tilt: 'left' },
  wish: defaultVisual,
};

export const illustrationOptions = Object.entries(rewardVisuals).map(([key, visual]) => ({
  key,
  ...visual,
}));

export const illustrationGroups = rewardKindOrder.map((kind) => ({
  kind,
  label: rewardKindLabel[kind],
  options: illustrationOptions.filter((option) => option.kind === kind),
}));

export function illustrationCaption(visual: Pick<RewardVisual, 'kind' | 'label'>) {
  return `${rewardKindLabel[visual.kind]} · ${visual.label}`;
}

export const orderStatusLabel: Record<RewardOrderPublic['status'], string> = {
  REDEEMED: '已许下愿望',
  WAITING: '等待兑现',
  COMPLETED: '愿望已完成',
  CANCELED: '已取消，宝石已退回',
};

export const orderStatusGlyph: Record<RewardOrderPublic['status'], GlyphName> = {
  REDEEMED: 'gem',
  WAITING: 'sparkle',
  COMPLETED: 'heart',
  CANCELED: 'dash',
};

const recordKindLabel: Record<string, string> = {
  FEEDING_RECORD: '喂奶',
  SLEEP_RECORD: '睡眠',
  DIAPER_RECORD: '尿布',
  FOOD_RECORD: '辅食',
};

export function rewardVisual(illustrationKey: string | null | undefined): RewardVisual {
  return rewardVisuals[illustrationKey ?? 'wish'] ?? defaultVisual;
}

export function dateLabel(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function dateTimeLabel(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ledgerCopy(transaction: GemTransactionPublic) {
  if (transaction.reasonCode === 'RECORD_CREATED') {
    const kind = transaction.reasonText ? recordKindLabel[transaction.reasonText] : null;
    return {
      title: '留下记录',
      caption: kind ? `来自一次${kind}记录` : '来自一次温柔记录',
    };
  }
  if (transaction.reasonCode === 'REWARD_REDEEMED') {
    return {
      title: '许下愿望',
      caption: transaction.reasonText ? `兑换「${transaction.reasonText}」` : '把宝石换成一份小期待',
    };
  }
  if (transaction.reasonCode === 'REWARD_CANCELED_REFUND') {
    return {
      title: '愿望取消，宝石退回',
      caption: transaction.reasonText ? `「${transaction.reasonText}」已退回账本` : '宝石已回到账本',
    };
  }
  return {
    title: transaction.amount > 0 ? '宝石增加' : '宝石变化',
    caption: transaction.reasonText ?? '记在家庭账本里',
  };
}
