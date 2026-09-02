import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text } from '@tarojs/components';
import styles from './ErrorBoundary.module.scss';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('RUNEW ErrorBoundary', error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <View className={styles.root} role="alert">
          <Text className={styles.title}>页面暂时遇到了一点小问题</Text>
          <Text className={styles.caption}>请稍后再试，你的记录不会因此消失。</Text>
        </View>
      );
    }

    return this.props.children;
  }
}
