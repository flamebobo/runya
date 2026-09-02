import { Image, Text, View } from '@tarojs/components';
import { babyAvatar, heroArt } from '@/assets/figma';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import styles from './BabyHeroCard.module.scss';

export interface BabyHeroCardProps {
  name: string;
  ageLabel: string;
  heightLabel: string;
  weightLabel: string;
  headLabel: string;
  onClick?: () => void;
}

export function BabyHeroCard({
  name,
  ageLabel,
  heightLabel,
  weightLabel,
  headLabel,
  onClick,
}: BabyHeroCardProps) {
  return (
    <GlassSurface
      level="hero"
      radius="hero"
      interactive={Boolean(onClick)}
      className={styles.card}
    >
      <View
        className={styles.hit}
        role={onClick ? 'button' : undefined}
        aria-label={onClick ? `${name}的档案` : undefined}
        onClick={onClick}
      >
        <Image className={styles.art} src={heroArt} mode="aspectFit" />
        <View className={styles.avatarWrap}>
          <Image className={styles.avatar} src={babyAvatar} mode="aspectFill" />
        </View>
        <View className={styles.identity}>
          <Text className={styles.name}>{name}</Text>
          <Text className={styles.age}>{ageLabel}</Text>
        </View>
        <View className={styles.stats}>
          <Text className={styles.height}>{heightLabel}</Text>
          <Text className={styles.stat}>{weightLabel}</Text>
          <Text className={styles.stat}>{headLabel}</Text>
        </View>
      </View>
    </GlassSurface>
  );
}
