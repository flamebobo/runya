import { Image, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useMemo, useRef, useState } from 'react';
import type { FamilyRelationship, SemanticTone } from '@runew/domain-types';
import { createUlid } from '@runew/shared-utils';
import { heroArt, stickerSmile, stickerStar } from '@/assets/figma';
import { completeOnboarding } from '@/api/auth';
import { ApiError } from '@/api/client';
import { PrimaryActionButton, TextAction } from '@/components/buttons';
import { GlassDateField, GlassInput } from '@/components/forms';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { PageShell } from '@/components/foundation/PageShell';
import { SectionHeader } from '@/components/foundation/SectionHeader';
import { AppTopBar } from '@/components/navigation/AppTopBar';
import { BabyHeroCard } from '@/components/shell/BabyHeroCard';
import { ChoiceCard } from '@/components/shell/ChoiceCard';
import { QuickTile } from '@/components/shell/QuickTile';
import type { GlyphName } from '@/components/icons/Glyph';
import { formatBabyAgeLabel } from '@/utils/babyAge';
import styles from './index.module.scss';

type Step = 'welcome' | 'baby' | 'identity' | 'topics';

const STEP_ORDER: Step[] = ['welcome', 'baby', 'identity', 'topics'];

const RELATIONSHIP_CARDS: Array<{
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

const TOPIC_TILES: Array<{ id: string; label: string; glyph: GlyphName; tone: SemanticTone }> = [
  { id: '睡眠', label: '睡眠', glyph: 'moon', tone: 'lavender' },
  { id: '喂养', label: '喂养', glyph: 'bottle', tone: 'apricot' },
  { id: '发育', label: '发育', glyph: 'growth', tone: 'sage' },
  { id: '健康', label: '健康', glyph: 'heart', tone: 'sage' },
  { id: '情绪', label: '情绪', glyph: 'smile', tone: 'blush' },
  { id: '亲子互动', label: '亲子互动', glyph: 'family', tone: 'sky' },
];

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>('welcome');
  const [babyName, setBabyName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [relationship, setRelationship] = useState<FamilyRelationship>('MOM');
  const [topics, setTopics] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const idempotencyKey = useRef(createUlid());
  const stepIndex = useMemo(() => STEP_ORDER.indexOf(step), [step]);

  function goBack() {
    if (step === 'welcome') return;
    setMessage('');
    setStep(STEP_ORDER[Math.max(0, stepIndex - 1)]!);
  }

  function goNext() {
    if (step === 'welcome') {
      setStep('baby');
      return;
    }
    if (step === 'baby') {
      if (!babyName.trim()) {
        setMessage('先给宝宝起一个小名字');
        return;
      }
      if (!birthday) {
        setMessage('选一个生日，档案才知道从哪天开始长大');
        return;
      }
      setMessage('');
      setStep('identity');
      return;
    }
    if (step === 'identity') {
      setStep('topics');
      return;
    }
    void submit();
  }

  async function submit() {
    setLoading(true);
    setMessage('');
    try {
      await completeOnboarding(
        {
          relationship,
          timezoneName: 'Asia/Shanghai',
          baby: { name: babyName.trim(), birthday },
          topics,
        },
        idempotencyKey.current,
      );
      await Taro.reLaunch({ url: '/pages/index/index' });
    } catch (error) {
      if (error instanceof ApiError) {
        setMessage(error.message);
      } else {
        setMessage('还没保存成功，请再试一次');
      }
    } finally {
      setLoading(false);
    }
  }

  function toggleTopic(topic: string) {
    setTopics((current) =>
      current.includes(topic) ? current.filter((item) => item !== topic) : [...current, topic],
    );
  }

  const previewName = babyName.trim() || '宝宝';
  const previewAge = birthday ? formatBabyAgeLabel(birthday) : '生日还没选哦';

  return (
    <PageShell>
      <AppTopBar
        variant="standard"
        title="第一次见面"
        subtitle="慢慢来，我们一起把小家安顿好"
        onBackClick={step === 'welcome' ? undefined : goBack}
      />
      <View className={`page-content ${styles.page}`}>
        <View className={styles.progress} aria-label="引导进度">
          {STEP_ORDER.map((item, index) => (
            <View
              key={item}
              className={index <= stepIndex ? styles.progressDotActive : styles.progressDot}
            />
          ))}
        </View>

        {step === 'welcome' ? (
          <>
            <GlassSurface level="hero" radius="hero" className={styles.welcomeHero}>
              <View className={styles.welcomeHit}>
                <Image className={styles.welcomeArt} src={heroArt} mode="aspectFit" />
                <Image className={styles.welcomeStar} src={stickerStar} mode="aspectFit" />
                <Image className={styles.welcomeSmile} src={stickerSmile} mode="aspectFit" />
                <Text className={`text-page-title ${styles.title}`}>欢迎来到润芽</Text>
                <Text className={styles.subtitle}>
                  接下来只需要几步，给宝宝建一份会慢慢长大的档案。相机和相册会等你真正用到时再问。
                </Text>
              </View>
            </GlassSurface>
            <SectionHeader title="接下来这几步" caption="都不急，随时可以改" />
            <View className={styles.previewRow}>
              <QuickTile label="宝宝档案" glyph="baby" tone="sky" />
              <QuickTile label="家庭身份" glyph="family" tone="sage" />
              <QuickTile label="关心的事" glyph="heart" tone="blush" />
            </View>
          </>
        ) : null}

        {step === 'baby' ? (
          <>
            <BabyHeroCard name={previewName} ageLabel={previewAge} />
            <SectionHeader title="创建宝宝档案" caption="名字和生日可以之后再改" />
            <GlassInput
              label="宝宝昵称"
              value={babyName}
              placeholder="例如：润润"
              error={Boolean(message) && !babyName.trim()}
              onInput={setBabyName}
            />
            <GlassDateField
              label="生日"
              value={birthday}
              placeholder="点这里选择生日"
              error={Boolean(message) && !birthday}
              onChange={setBirthday}
            />
          </>
        ) : null}

        {step === 'identity' ? (
          <>
            <SectionHeader title="选择家庭身份" caption="这只是家里怎么称呼你，不是考核" />
            <View className={styles.identityGrid}>
              {RELATIONSHIP_CARDS.map((item) => (
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
          </>
        ) : null}

        {step === 'topics' ? (
          <>
            <SectionHeader
              title="现在最关心什么"
              caption="先轻轻推荐这些，之后仍可看全部知识"
            />
            <View className={styles.topicGrid}>
              {TOPIC_TILES.map((item) => (
                <QuickTile
                  key={item.id}
                  label={item.label}
                  glyph={item.glyph}
                  tone={item.tone}
                  selected={topics.includes(item.id)}
                  onClick={() => toggleTopic(item.id)}
                />
              ))}
            </View>
          </>
        ) : null}

        {message ? <Text className={styles.error}>{message}</Text> : null}

        <View className={styles.actions}>
          <PrimaryActionButton
            label={step === 'topics' ? '进入今天' : '下一步'}
            state={loading ? 'loading' : 'default'}
            onClick={goNext}
          />
          {step !== 'welcome' ? <TextAction label="上一步" onClick={goBack} /> : null}
        </View>
      </View>
    </PageShell>
  );
}
