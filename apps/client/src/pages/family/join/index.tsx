import { Text, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useState } from 'react';
import type { FamilyRelationship } from '@runew/domain-types';
import { GlassInput, SegmentedControl } from '@/components/forms';
import { AuthScreen } from '@/components/shell/AuthScreen';
import { ChoiceCard } from '@/components/shell/ChoiceCard';
import { PrimaryActionButton, SecondaryGlassButton, TextAction } from '@/components/buttons';
import { FAMILY_RELATIONSHIP_CARDS } from '@/components/family/relationshipCards';
import { acceptFamilyInvite, createFamily } from '@/api/family';
import { fetchBootstrap, loginUser, registerUser } from '@/api/auth';
import { ApiError } from '@/api/client';
import { parseFamilyInvite } from '@/utils/familyInvite';
import styles from './index.module.scss';

export default function FamilyJoinPage() {
  const routeToken = parseFamilyInvite(useRouter().params.token ?? '') ?? '';
  const [joinMode, setJoinMode] = useState(Boolean(routeToken));
  const [inviteInput, setInviteInput] = useState(routeToken);
  const [username, setUsername] = useState('');
  const [familyName, setFamilyName] = useState('我们的小家');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [relationship, setRelationship] = useState<FamilyRelationship>('DAD');
  const [register, setRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const createMode = !joinMode;

  async function scanInvite() {
    try {
      const result = await Taro.scanCode({ onlyFromCamera: true });
      setInviteInput(result.result);
      setJoinMode(true);
      setMessage('已读到邀请，继续填写账号就好');
    } catch {
      setMessage('没有读到二维码，可以直接粘贴邀请链接');
    }
  }

  async function join() {
    if (!username.trim() || password.length < 8) {
      setMessage('请填写账号，并输入至少 8 位密码');
      return;
    }
    const inviteToken = parseFamilyInvite(inviteInput) ?? '';
    if (!createMode && !inviteToken) {
      setMessage('请粘贴有效的邀请链接或邀请码');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      if (register)
        await registerUser({
          username: username.trim(),
          password,
          nickname: nickname.trim() || undefined,
        });
      else await loginUser({ username: username.trim(), password });
      if (createMode)
        await createFamily({
          name: familyName.trim() || '我们的小家',
          timezoneName: 'Asia/Shanghai',
          relationship,
        });
      else await acceptFamilyInvite(inviteToken, relationship);
      const bootstrap = await fetchBootstrap();
      await Taro.reLaunch({
        url:
          bootstrap.status === 'READY'
            ? '/pages/index/index?tab=family'
            : '/pages/onboarding/index',
      });
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : '加入还没成功，请再试一次',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScreen
      eyebrow="我们的小家"
      title={createMode ? '给我们创建一个小家' : '有人在小家等你'}
      subtitle="一起记录，一起照顾，把平凡日子收藏成共同记忆。"
      footer={
        <TextAction
          label={register ? '已有账号？直接登录' : '还没有账号？注册后加入'}
          onClick={() => setRegister((value) => !value)}
        />
      }
    >
      <SegmentedControl
        ariaLabel="创建或加入小家"
        options={[
          { value: 'create', label: '创建小家' },
          { value: 'join', label: '加入小家' },
        ]}
        value={createMode ? 'create' : 'join'}
        onChange={(value) => setJoinMode(value === 'join')}
      />
      {!createMode ? (
        <View className={styles.inviteBox}>
          <GlassInput
            label="邀请链接或邀请码"
            value={inviteInput}
            placeholder="粘贴家人发来的邀请"
            onInput={setInviteInput}
          />
          <SecondaryGlassButton label="扫描二维码" onClick={() => void scanInvite()} />
        </View>
      ) : (
        <GlassInput
          label="小家名字"
          value={familyName}
          placeholder="例如：润润的小家"
          onInput={setFamilyName}
        />
      )}
      <GlassInput
        label="账号"
        value={username}
        placeholder="请输入账号"
        onInput={setUsername}
      />
      <GlassInput
        label="密码"
        password
        value={password}
        placeholder="至少 8 位"
        onInput={setPassword}
      />
      {register ? (
        <GlassInput
          label="昵称"
          value={nickname}
          placeholder="家人怎么称呼你"
          onInput={setNickname}
        />
      ) : null}
      <Text className={styles.identityLabel}>你在家里的称呼</Text>
      <View className={styles.identityGrid}>
        {FAMILY_RELATIONSHIP_CARDS.map((item) => (
          <ChoiceCard
            key={item.value}
            title={item.title}
            caption={item.caption}
            glyph={item.glyph}
            tone={item.tone}
            selected={relationship === item.value}
            onClick={() => setRelationship(item.value)}
          />
        ))}
      </View>
      {message ? <Text className={styles.error}>{message}</Text> : null}
      <PrimaryActionButton
        label={
          createMode
            ? register
              ? '注册并创建小家'
              : '登录并创建小家'
            : register
              ? '注册并加入小家'
              : '登录并加入小家'
        }
        state={loading ? 'loading' : 'default'}
        onClick={() => void join()}
      />
    </AuthScreen>
  );
}
