import { Button, Text, View } from '@tarojs/components';
import Taro, { useShareAppMessage } from '@tarojs/taro';
import { useMemo, useState } from 'react';
import {
  copyFamilyInvite,
  getFamilyInviteLink,
  shareFamilyInvite,
} from '@/adapters/familyInvite';
import { SecondaryGlassButton } from '@/components/buttons';
import { createInviteQr, FAMILY_JOIN_PATH } from '@/utils/familyInvite';
import styles from './FamilyInvitePanel.module.scss';

export function FamilyInvitePanel({
  token,
  expiresAt,
}: {
  token: string;
  expiresAt: number;
}) {
  const [message, setMessage] = useState('');
  const link = getFamilyInviteLink(token);
  const value = link ?? token;
  const code = useMemo(() => createInviteQr(value), [value]);
  const size = code.getModuleCount();
  const isWeapp = Taro.getEnv() === Taro.ENV_TYPE.WEAPP;
  useShareAppMessage(() => ({
    title: '一起来到我们的小家',
    path: `${FAMILY_JOIN_PATH}?token=${encodeURIComponent(token)}`,
  }));

  async function copy() {
    try {
      await copyFamilyInvite(value);
      setMessage(link ? '邀请链接已复制' : '邀请码已复制');
    } catch {
      setMessage('复制未成功，请再试一次');
    }
  }
  async function share() {
    if (!link) return;
    try {
      const result = await shareFamilyInvite(link);
      setMessage(
        result === 'unsupported'
          ? '此浏览器未启用系统分享，请复制链接'
          : result === 'cancelled'
            ? ''
            : '分享已发送',
      );
    } catch {
      setMessage('分享未成功，请再试一次');
    }
  }

  return (
    <View className={styles.panel}>
      <Text className={styles.title}>给家人留一个位置</Text>
      <View className={styles.qr} role="img" aria-label="家庭邀请二维码">
        {Array.from({ length: size + 8 }, (_, row) => (
          <View key={row} className={styles.row}>
            {Array.from({ length: size + 8 }, (_, col) => (
              <View
                key={col}
                style={{
                  flex: 1,
                  backgroundColor:
                    row >= 4 &&
                    col >= 4 &&
                    row < size + 4 &&
                    col < size + 4 &&
                    code.isDark(row - 4, col - 4)
                      ? '#000000'
                      : '#ffffff',
                }}
              />
            ))}
          </View>
        ))}
      </View>
      <Text className={styles.expiry}>
        有效期至 {new Date(expiresAt).toLocaleString('zh-CN')}
      </Text>
      <View className={styles.actions}>
        <SecondaryGlassButton
          label={link ? '复制邀请链接' : '复制邀请码'}
          onClick={() => void copy()}
        />
        {isWeapp ? (
          <Button className={styles.nativeShare} openType="share">
            分享给家人
          </Button>
        ) : (
          <SecondaryGlassButton label="系统分享" onClick={() => void share()} />
        )}
      </View>
      {message ? (
        <View role="status" className={styles.message}>
          {message}
        </View>
      ) : null}
    </View>
  );
}
