import { Image, View } from '@tarojs/components';
import { blobBl, blobTr } from '@/assets/figma';
import styles from './PageAmbient.module.scss';

export function PageAmbient() {
  return (
    <View className={styles.root} aria-hidden>
      <Image className={styles.blobTr} src={blobTr} mode="aspectFill" />
      <Image className={styles.blobBl} src={blobBl} mode="aspectFill" />
      <View className={styles.orbSage} />
      <View className={styles.orbLavender} />
      <View className={styles.orbApricot} />
      <View className={styles.sparkA} />
      <View className={styles.sparkB} />
      <View className={styles.sparkC} />
    </View>
  );
}
