import { Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import { registerUser } from '@/api/auth';
import { ApiError } from '@/api/client';
import { PrimaryActionButton, TextAction } from '@/components/buttons';
import { GlassInput } from '@/components/forms';
import { AuthScreen } from '@/components/shell/AuthScreen';
import styles from './index.module.scss';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [fieldError, setFieldError] = useState(false);

  async function handleRegister() {
    if (!username.trim() || !password) {
      setFieldError(true);
      setMessage('请先填写账号和密码');
      return;
    }
    setLoading(true);
    setFieldError(false);
    setMessage('');
    try {
      await registerUser({
        username: username.trim(),
        password,
        nickname: nickname.trim() || undefined,
      });
      await Taro.reLaunch({ url: '/pages/onboarding/index' });
    } catch (error) {
      if (error instanceof ApiError) {
        setMessage(error.message);
        setFieldError(error.code === 'VALIDATION_ERROR' || error.code === 'CONFLICT');
      } else {
        setMessage('注册还没成功，请稍后再试');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScreen
      title="给家里点一盏小灯"
      subtitle="先留下一个账号，再一起把宝宝的日子收藏起来。"
      footer={
        <TextAction
          label="已有账号？去登录"
          onClick={() => Taro.navigateTo({ url: '/pages/auth/login/index' })}
        />
      }
    >
      <GlassInput
        label="账号"
        value={username}
        placeholder="字母、数字或中文"
        error={fieldError}
        onInput={setUsername}
      />
      <GlassInput
        label="昵称"
        value={nickname}
        placeholder="家人怎么称呼你"
        onInput={setNickname}
      />
      <GlassInput
        label="密码"
        value={password}
        password
        placeholder="至少 8 位"
        error={fieldError}
        onInput={setPassword}
      />
      {message ? <Text className={styles.error}>{message}</Text> : null}
      <PrimaryActionButton
        label="开始收藏每一天"
        state={loading ? 'loading' : 'default'}
        onClick={handleRegister}
      />
    </AuthScreen>
  );
}
