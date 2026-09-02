import { Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import { fetchBootstrap, loginUser } from '@/api/auth';
import { ApiError } from '@/api/client';
import { PrimaryActionButton, TextAction } from '@/components/buttons';
import { GlassInput } from '@/components/forms';
import { AuthScreen } from '@/components/shell/AuthScreen';
import { needsOnboarding } from '@/hooks/useBootstrap';
import styles from './index.module.scss';

type LoginState = 'default' | 'loading' | 'field-error' | 'wrong-password' | 'network' | 'disabled';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<LoginState>('default');
  const [message, setMessage] = useState('');

  async function handleLogin() {
    if (!username.trim() || !password) {
      setState('field-error');
      setMessage('请先把账号和密码都填好');
      return;
    }

    setState('loading');
    setMessage('');
    try {
      await loginUser({ username: username.trim(), password });
      const bootstrap = await fetchBootstrap();
      if (needsOnboarding(bootstrap)) {
        await Taro.reLaunch({ url: '/pages/onboarding/index' });
        return;
      }
      await Taro.reLaunch({ url: '/pages/index/index' });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'AUTH_INVALID_CREDENTIALS') {
          setState('wrong-password');
          setMessage('账号或密码不太对，再试一次');
          return;
        }
        if (error.code === 'AUTH_ACCOUNT_DISABLED') {
          setState('disabled');
          setMessage(error.message);
          return;
        }
        setState(error.status >= 500 ? 'network' : 'field-error');
        setMessage(error.message);
        return;
      }
      setState('network');
      setMessage('网络好像有点慢，稍后再试一次');
    }
  }

  return (
    <AuthScreen
      title="欢迎回家"
      subtitle="把润润长大的每一天，轻轻收进这个小家。"
      footer={
        <TextAction
          label="还没有账号？去注册"
          onClick={() => Taro.navigateTo({ url: '/pages/auth/register/index' })}
        />
      }
    >
      <GlassInput
        label="账号"
        value={username}
        placeholder="请输入账号"
        error={state === 'field-error' || state === 'wrong-password'}
        onInput={setUsername}
      />
      <GlassInput
        label="密码"
        value={password}
        password
        placeholder="请输入密码"
        error={state === 'field-error' || state === 'wrong-password'}
        onInput={setPassword}
      />
      {message ? <Text className={styles.error}>{message}</Text> : null}
      <PrimaryActionButton
        label="进入润芽"
        state={state === 'loading' ? 'loading' : 'default'}
        onClick={handleLogin}
      />
    </AuthScreen>
  );
}
