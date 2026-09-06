import { useState, type ComponentProps, type ComponentType } from 'react';
import { Image, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createUlid } from '@runew/shared-utils';
import type {
  CreateRewardBody,
  GemTransactionPublic,
  RewardOrderPublic,
  RewardPublic,
} from '@runew/contracts';
import {
  AppDrawer,
  AppTopBar,
  BottomNav,
  DEFAULT_DRAWER_ITEMS,
  EmptyState,
  ErrorState,
  GlassSurface,
  Glyph,
  PageShell,
  SectionHeader,
  Skeleton,
} from '@/components';
import { PrimaryActionButton, SecondaryGlassButton, TextAction } from '@/components/buttons';
import { GlassInput, GlassTextArea } from '@/components/forms';
import { BottomSheet, ConfirmDialog } from '@/components/overlay';
import { AppBootstrapGate } from '@/components/shell/AppBootstrapGate';
import {
  cancelRewardOrder,
  createCustomReward,
  fetchGemBalance,
  fetchOrders,
  fetchRewards,
  fetchTransactions,
  fulfillRewardOrder,
  redeemReward,
} from '@/api/gems';
import { useBootstrapQuery } from '@/hooks/useBootstrap';
import { useUiOverlayStore } from '@/stores/runtime';
import { formatBabyAgeLabel } from '@/utils/babyAge';
import classNames from '@/utils/classNames';
import { rootTabUrl } from '@/utils/rootNavigation';
import {
  dateLabel,
  dateTimeLabel,
  illustrationCaption,
  illustrationGroups,
  ledgerCopy,
  orderStatusGlyph,
  orderStatusLabel,
  rewardKindLabel,
  rewardVisual,
  type RewardKind,
} from './gemsVisual';
import styles from './index.module.scss';

type GemsView = 'catalog' | 'orders' | 'ledger';
type IllustrationOption = (typeof illustrationGroups)[number]['options'][number];
type HoverableViewProps = ComponentProps<typeof View> & {
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

const HoverableView = View as ComponentType<HoverableViewProps>;

const VIEW_OPTIONS: Array<{ value: GemsView; label: string; ariaLabel: string }> = [
  { value: 'catalog', label: '目录', ariaLabel: '愿望目录' },
  { value: 'orders', label: '我的', ariaLabel: '我的愿望' },
  { value: 'ledger', label: '账本', ariaLabel: '宝石账本' },
];

function IllustrationChip({
  option,
  selected,
  onPreview,
  onClearPreview,
  onSelect,
}: {
  option: IllustrationOption;
  selected: boolean;
  onPreview: () => void;
  onClearPreview: () => void;
  onSelect: () => void;
}) {
  return (
    <HoverableView
      className={classNames(
        styles.illustrationChip,
        styles[`art${option.tone}`],
        selected ? styles.illustrationChipActive : undefined,
      )}
      hoverClass={styles.illustrationChipHover}
      hoverStayTime={80}
      role="button"
      aria-label={`${option.label}，${rewardKindLabel[option.kind]}`}
      aria-pressed={selected}
      onTouchStart={onPreview}
      onMouseEnter={onPreview}
      onMouseLeave={onClearPreview}
      onClick={onSelect}
    >
      <Image className={styles.illustrationSticker} src={option.sticker} mode="aspectFit" />
    </HoverableView>
  );
}

function GemsBody() {
  const queryClient = useQueryClient();
  const bootstrap = useBootstrapQuery(false);
  const { drawerOpen, setDrawerOpen, setBottomNavActive, showToast } = useUiOverlayStore();
  const [view, setView] = useState<GemsView>('catalog');
  const [selectedReward, setSelectedReward] = useState<RewardPublic | null>(null);
  const [confirmReward, setConfirmReward] = useState<RewardPublic | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<RewardOrderPublic | null>(null);
  const [cancelOrder, setCancelOrder] = useState<RewardOrderPublic | null>(null);
  const [fulfillOrder, setFulfillOrder] = useState<RewardOrderPublic | null>(null);
  const [ledgerItem, setLedgerItem] = useState<GemTransactionPublic | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customPrice, setCustomPrice] = useState('10');
  const [customIllustration, setCustomIllustration] = useState('wish');
  const [previewIllustration, setPreviewIllustration] = useState<string | null>(null);
  const [stickerKind, setStickerKind] = useState<RewardKind>('mood');

  const gemAmount = bootstrap.data?.gemBalance ?? 0;
  const baby = bootstrap.data?.currentBaby;
  const babyName = baby?.nickname ?? baby?.name ?? '宝宝';
  const ageLabel = baby ? formatBabyAgeLabel(baby.birthday) : '成长中';

  const balance = useQuery({ queryKey: ['gems', 'balance'], queryFn: fetchGemBalance });
  const rewards = useQuery({ queryKey: ['gems', 'rewards'], queryFn: fetchRewards });
  const orders = useQuery({ queryKey: ['gems', 'orders'], queryFn: fetchOrders });
  const transactions = useQuery({ queryKey: ['gems', 'transactions'], queryFn: fetchTransactions });

  const catalog = rewards.data ?? [];
  const orderList = orders.data ?? [];
  const ledger = transactions.data ?? [];
  const available = balance.data?.balance ?? gemAmount;
  const latestEarn = ledger.find((item) => item.amount > 0) ?? null;
  const selectedVisual = selectedReward ? rewardVisual(selectedReward.illustrationKey) : null;
  const previewVisual = rewardVisual(previewIllustration ?? customIllustration);
  const stickerOptions =
    illustrationGroups.find((group) => group.kind === stickerKind)?.options ?? [];
  const redeemShortfall = selectedReward
    ? Math.max(0, selectedReward.priceGems - available)
    : 0;
  const waitingCount = orderList.filter(
    (order) => order.status === 'WAITING' || order.status === 'REDEEMED',
  ).length;

  async function refreshGems() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['gems', 'balance'] }),
      queryClient.invalidateQueries({ queryKey: ['gems', 'rewards'] }),
      queryClient.invalidateQueries({ queryKey: ['gems', 'orders'] }),
      queryClient.invalidateQueries({ queryKey: ['gems', 'transactions'] }),
    ]);
  }

  const redeem = useMutation({
    mutationFn: (reward: RewardPublic) => redeemReward(reward.id, createUlid()),
    onSuccess: async ({ order }) => {
      setConfirmReward(null);
      setSelectedReward(null);
      showToast(`「${order.rewardName}」已经许下，等一个温柔兑现`);
      await refreshGems();
      setView('orders');
    },
    onError: (error) => showToast(error instanceof Error ? error.message : '兑换暂时没有完成'),
  });

  const orderAction = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'cancel' | 'fulfill' }) =>
      action === 'cancel' ? cancelRewardOrder(id) : fulfillRewardOrder(id),
    onSuccess: async (order) => {
      setCancelOrder(null);
      setFulfillOrder(null);
      setSelectedOrder(order);
      showToast(order.status === 'CANCELED' ? '宝石已退回账本' : '已把这份愿望记为完成');
      await refreshGems();
    },
    onError: (error) => showToast(error instanceof Error ? error.message : '愿望进度暂时没有更新'),
  });

  const customReward = useMutation({
    mutationFn: (body: CreateRewardBody) => createCustomReward(body),
    onSuccess: async (reward) => {
      setCustomOpen(false);
      setCustomName('');
      setCustomDescription('');
      setCustomPrice('10');
      setCustomIllustration('wish');
      setPreviewIllustration(null);
      showToast('家庭愿望已加入目录');
      await queryClient.invalidateQueries({ queryKey: ['gems', 'rewards'] });
      setSelectedReward(reward);
      setView('catalog');
    },
    onError: (error) => showToast(error instanceof Error ? error.message : '家庭愿望暂时没有保存'),
  });

  function openRootTab(tab: 'today' | 'records' | 'memories' | 'family') {
    setDrawerOpen(false);
    setBottomNavActive(tab);
    void Taro.reLaunch({ url: rootTabUrl(tab) });
  }

  function goLeaveARecord() {
    setDrawerOpen(false);
    setBottomNavActive('today');
    void Taro.reLaunch({ url: rootTabUrl('today') });
  }

  function submitCustom() {
    const price = Number(customPrice);
    if (!customName.trim() || !Number.isInteger(price) || price < 1) {
      showToast('请填写愿望名称和整数宝石数');
      return;
    }
    customReward.mutate({
      name: customName.trim(),
      description: customDescription.trim() || null,
      priceGems: price,
      stock: null,
      illustrationKey: customIllustration,
    });
  }

  return (
    <PageShell bottomNav>
      <AppTopBar
        title="宝石小愿望"
        subtitle="每一颗都来自你留下的温柔记录"
        gemAmount={available}
        onMenuClick={() => setDrawerOpen(true)}
      />
      <View className={`page-content ${styles.page}`}>
        <GlassSurface level="tinted" tone="apricot" radius="card" className={styles.wallet}>
          <View className={styles.walletGem} aria-hidden>
            <Glyph name="gem" size="sm" />
          </View>
          <View className={styles.walletMain}>
            <View className={styles.walletLine}>
              <Text className={styles.walletAmount}>{available}</Text>
              <Text className={styles.walletUnit}>颗可用</Text>
            </View>
            {latestEarn ? (
              <Text className={styles.walletCaption}>
                最近一次来自留下记录 · {dateLabel(latestEarn.createdAt)}
              </Text>
            ) : (
              <Text className={styles.walletCaption}>留下记录，宝石会轻轻落进这里</Text>
            )}
            {balance.data && balance.data.balance !== balance.data.ledgerBalance ? (
              <Text className={styles.walletHint}>账本正在校准，稍后会自动同步</Text>
            ) : null}
          </View>
          <TextAction label="账本" onClick={() => setView('ledger')} />
        </GlassSurface>

        <View className={styles.viewTabs} role="tablist" aria-label="宝石视图">
          {VIEW_OPTIONS.map((option) => {
            const selected = view === option.value;
            const label =
              option.value === 'orders' && waitingCount > 0
                ? `${option.label} ${waitingCount}`
                : option.label;
            return (
              <View
                key={option.value}
                className={classNames(styles.viewTab, selected ? styles.viewTabActive : undefined)}
                role="tab"
                aria-selected={selected}
                aria-label={option.ariaLabel}
                onClick={() => setView(option.value)}
              >
                <Text>{label}</Text>
              </View>
            );
          })}
        </View>

        {view === 'catalog' ? (
          <CatalogPanel
            loading={rewards.isLoading}
            error={rewards.isError}
            onRetry={() => void rewards.refetch()}
            catalog={catalog}
            available={available}
            waitingCount={waitingCount}
            onOpenCustom={() => {
              setPreviewIllustration(null);
              setStickerKind(rewardVisual(customIllustration).kind);
              setCustomOpen(true);
            }}
            onOpenReward={setSelectedReward}
            onLeaveRecord={goLeaveARecord}
          />
        ) : null}

        {view === 'orders' ? (
          <OrdersPanel
            loading={orders.isLoading}
            error={orders.isError}
            onRetry={() => void orders.refetch()}
            orders={orderList}
            onOpenOrder={setSelectedOrder}
            onBrowseCatalog={() => setView('catalog')}
          />
        ) : null}

        {view === 'ledger' ? (
          <LedgerPanel
            loading={transactions.isLoading}
            error={transactions.isError}
            onRetry={() => void transactions.refetch()}
            items={ledger}
            onOpenItem={setLedgerItem}
            onLeaveRecord={goLeaveARecord}
          />
        ) : null}
      </View>

      <BottomNav active={null} onSelect={openRootTab} onAddClick={goLeaveARecord} />
      <AppDrawer
        open={drawerOpen}
        babyName={babyName}
        babyAgeLabel={ageLabel}
        gemAmount={available}
        items={DEFAULT_DRAWER_ITEMS.map((item) => ({
          ...item,
          active: item.id === 'gems',
          onClick: () => {
            setDrawerOpen(false);
            if (item.id === 'gems') return;
            if (
              item.id === 'today' ||
              item.id === 'records' ||
              item.id === 'memories' ||
              item.id === 'family'
            ) {
              openRootTab(item.id);
              return;
            }
            if (item.id === 'growth') {
              void Taro.navigateTo({ url: '/pages/growth/index' });
              return;
            }
            if (item.id === 'knowledge') {
              void Taro.navigateTo({ url: '/pages/knowledge/index' });
              return;
            }
            if (item.id === 'health') {
              void Taro.navigateTo({ url: '/pages/health/index' });
              return;
            }
            if (item.id === 'mom') {
              void Taro.navigateTo({ url: '/pages/mom/index' });
              return;
            }
            if (item.id === 'settings') {
              void Taro.navigateTo({ url: '/pages/settings/index' });
              return;
            }
            if (item.id === 'baby') {
              void Taro.navigateTo({ url: '/pages/baby/index' });
              return;
            }
            showToast(`${item.title}正在布置，先把这份小愿望收好`);
          },
        }))}
        onClose={() => setDrawerOpen(false)}
        onSearchClick={() => {
          setDrawerOpen(false);
          void Taro.navigateTo({ url: '/pages/search/index' });
        }}
        onNotificationClick={() => {
          setDrawerOpen(false);
          void Taro.navigateTo({ url: '/pages/notifications/index' });
        }}
        onAdminClick={() => {
          setDrawerOpen(false);
          void Taro.navigateTo({ url: '/pages/admin/index' });
        }}
      />

      <BottomSheet
        open={customOpen}
        title="定制一个家庭愿望"
        onClose={() => {
          setCustomOpen(false);
          setPreviewIllustration(null);
        }}
      >
        <View className={styles.form}>
          <GlassInput
            label="愿望名称"
            value={customName}
            placeholder="例如：一起去看海"
            onInput={setCustomName}
          />
          <GlassTextArea
            label="想对家人说"
            value={customDescription}
            placeholder="写下这份愿望为什么值得期待"
            onInput={setCustomDescription}
          />
          <GlassInput
            label="需要的宝石"
            value={customPrice}
            type="number"
            onInput={setCustomPrice}
          />
          <View>
            <View className={styles.illustrationLegend}>
              <Text className={styles.formLabel}>选一个可爱的小标记</Text>
              <Text className={styles.illustrationHint} aria-live="polite">
                {illustrationCaption(previewVisual)}
              </Text>
            </View>
            <View className={styles.kindTabs} role="tablist" aria-label="标记类型">
              {illustrationGroups.map((group) => {
                const selected = stickerKind === group.kind;
                return (
                  <View
                    key={group.kind}
                    className={classNames(styles.kindTab, selected ? styles.kindTabActive : undefined)}
                    role="tab"
                    aria-selected={selected}
                    aria-label={group.label}
                    onClick={() => {
                      setStickerKind(group.kind);
                      setPreviewIllustration(null);
                    }}
                  >
                    <Text>{group.label}</Text>
                  </View>
                );
              })}
            </View>
            <View className={styles.illustrationRow}>
              {stickerOptions.map((option) => (
                <IllustrationChip
                  key={option.key}
                  option={option}
                  selected={customIllustration === option.key}
                  onPreview={() => setPreviewIllustration(option.key)}
                  onClearPreview={() => setPreviewIllustration(null)}
                  onSelect={() => setCustomIllustration(option.key)}
                />
              ))}
            </View>
          </View>
          <PrimaryActionButton
            label="加入家庭愿望目录"
            onClick={submitCustom}
            state={customReward.isPending ? 'loading' : 'default'}
          />
        </View>
      </BottomSheet>

      <BottomSheet
        open={selectedReward !== null}
        title={selectedReward?.name ?? '愿望详情'}
        onClose={() => setSelectedReward(null)}
      >
        {selectedReward && selectedVisual ? (
          <View className={styles.detail}>
            <View className={classNames(styles.detailArt, styles[`art${selectedVisual.tone}`])} aria-hidden>
              <Image className={styles.detailSticker} src={selectedVisual.sticker} mode="aspectFit" />
            </View>
            <Text className={styles.detailDescription}>
              {selectedReward.description || '和家人一起，把这份小期待变成真实的回忆。'}
            </Text>
            <View className={styles.priceChip} aria-label={`${selectedReward.priceGems} 宝石`}>
              <Glyph name="gem" size="sm" />
              <Text className={styles.priceText}>{selectedReward.priceGems} 宝石</Text>
            </View>
            {redeemShortfall > 0 ? (
              <Text className={styles.shortfall}>
                还差 {redeemShortfall} 颗宝石。先把温柔记录留进今天吧，宝石会自己长回来。
              </Text>
            ) : (
              <Text className={styles.detailHint}>兑换后可以在「我的愿望」里等待兑现。</Text>
            )}
            <PrimaryActionButton
              label={redeemShortfall > 0 ? '先去留下记录' : '许下这个愿望'}
              state={redeem.isPending ? 'loading' : 'default'}
              onClick={() => {
                if (redeemShortfall > 0) {
                  setSelectedReward(null);
                  goLeaveARecord();
                  return;
                }
                setConfirmReward(selectedReward);
                setSelectedReward(null);
              }}
            />
          </View>
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={selectedOrder !== null}
        title={selectedOrder?.rewardName ?? '愿望进度'}
        onClose={() => setSelectedOrder(null)}
      >
        {selectedOrder ? (
          <View className={styles.detail}>
            <View
              className={classNames(
                styles.detailIcon,
                styles[`well${selectedOrder.status === 'COMPLETED' ? 'sage' : 'apricot'}`],
              )}
            >
              <Glyph name={orderStatusGlyph[selectedOrder.status]} size="lg" />
            </View>
            <Text className={styles.statusChip}>{orderStatusLabel[selectedOrder.status]}</Text>
            <Text className={styles.detailDescription}>
              当时用 {selectedOrder.priceGemsSnapshot} 宝石许下。价格会一直留在订单里，后面改目录也不会变。
            </Text>
            <Text className={styles.detailHint}>许下于 {dateTimeLabel(selectedOrder.redeemedAt)}</Text>
            {selectedOrder.status === 'COMPLETED' && selectedOrder.fulfilledAt ? (
              <Text className={styles.refund}>完成于 {dateLabel(selectedOrder.fulfilledAt)}</Text>
            ) : null}
            {selectedOrder.status === 'CANCELED' ? (
              <Text className={styles.refund}>宝石已退回家庭账本</Text>
            ) : null}
            {selectedOrder.status === 'WAITING' || selectedOrder.status === 'REDEEMED' ? (
              <View className={styles.orderActions}>
                <SecondaryGlassButton
                  label="取消并退回宝石"
                  onClick={() => {
                    setSelectedOrder(null);
                    setCancelOrder(selectedOrder);
                  }}
                />
                <PrimaryActionButton
                  label="标记为已完成"
                  onClick={() => {
                    setSelectedOrder(null);
                    setFulfillOrder(selectedOrder);
                  }}
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={ledgerItem !== null}
        title="这笔宝石"
        onClose={() => setLedgerItem(null)}
      >
        {ledgerItem ? (
          <View className={styles.detail}>
            <View
              className={classNames(
                styles.detailIcon,
                styles[ledgerItem.amount >= 0 ? 'wellsage' : 'wellblush'],
              )}
            >
              <Glyph name={ledgerItem.amount >= 0 ? 'sparkle' : 'gem'} size="lg" />
            </View>
            <Text className={`text-card-title ${styles.cardName}`}>
              {ledgerCopy(ledgerItem).title}
            </Text>
            <Text className={styles.detailDescription}>{ledgerCopy(ledgerItem).caption}</Text>
            <Text className={classNames(styles.ledgerAmount, ledgerItem.amount < 0 ? styles.negative : '')}>
              {ledgerItem.amount > 0 ? '+' : ''}
              {ledgerItem.amount}
            </Text>
            <Text className={styles.detailHint}>之后余额 {ledgerItem.balanceAfter}</Text>
            <Text className={styles.detailHint}>{dateTimeLabel(ledgerItem.createdAt)}</Text>
          </View>
        ) : null}
      </BottomSheet>

      <ConfirmDialog
        open={confirmReward !== null}
        title="确认许下这份愿望？"
        message={
          confirmReward
            ? `将使用 ${confirmReward.priceGems} 宝石兑换「${confirmReward.name}」。兑换后可以在「我的愿望」里查看进度。`
            : ''
        }
        confirmLabel="确认兑换"
        onCancel={() => setConfirmReward(null)}
        onConfirm={() => {
          if (confirmReward) redeem.mutate(confirmReward);
        }}
      />
      <ConfirmDialog
        open={cancelOrder !== null}
        title="取消这份愿望？"
        message="宝石会退回家庭账本。已经一起完成的回忆不会被抹掉，只是这份兑换先轻轻放下。"
        confirmLabel="退回宝石"
        danger
        onCancel={() => setCancelOrder(null)}
        onConfirm={() => {
          if (cancelOrder) orderAction.mutate({ id: cancelOrder.id, action: 'cancel' });
        }}
      />
      <ConfirmDialog
        open={fulfillOrder !== null}
        title="把愿望记为完成？"
        message="完成后，这份小期待会成为家里的一段回忆。"
        confirmLabel="已经兑现"
        onCancel={() => setFulfillOrder(null)}
        onConfirm={() => {
          if (fulfillOrder) orderAction.mutate({ id: fulfillOrder.id, action: 'fulfill' });
        }}
      />
    </PageShell>
  );
}

function CatalogPanel({
  loading,
  error,
  onRetry,
  catalog,
  available,
  waitingCount,
  onOpenCustom,
  onOpenReward,
  onLeaveRecord,
}: {
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  catalog: RewardPublic[];
  available: number;
  waitingCount: number;
  onOpenCustom: () => void;
  onOpenReward: (reward: RewardPublic) => void;
  onLeaveRecord: () => void;
}) {
  if (loading) return <Skeleton lines={8} />;
  if (error) {
    return (
      <ErrorState
        title="愿望目录还在路上"
        description="联网后再来看看，家里的小期待都还在。"
        onRetry={onRetry}
      />
    );
  }
  return (
    <View className={styles.section}>
      <SectionHeader
        title="把期待留给未来"
        caption={
          waitingCount > 0
            ? `有 ${waitingCount} 份愿望正在等待兑现`
            : '选择一个真正想和家人一起完成的小愿望'
        }
        actionLabel="定制愿望"
        onAction={onOpenCustom}
        glyph="gem"
        tone="apricot"
      />
      {catalog.length === 0 ? (
        <EmptyState
          title="目录还是空的"
          description="先写一个只属于你们家的小愿望，或者留下记录让宝石慢慢长大。"
        />
      ) : (
        <View className={styles.grid}>
          {catalog.map((reward) => {
            const visual = rewardVisual(reward.illustrationKey);
            const reachable = available >= reward.priceGems;
            return (
              <GlassSurface
                key={reward.id}
                level="tinted"
                tone={visual.tone}
                radius="card"
                interactive
                className={styles.card}
              >
                <View
                  className={styles.cardHit}
                  role="button"
                  aria-label={`${reward.name}，${reward.priceGems} 宝石`}
                  onClick={() => onOpenReward(reward)}
                >
                  <View className={classNames(styles.cardArt, styles[`art${visual.tone}`])} aria-hidden>
                    <Image
                      className={classNames(styles.cardSticker, styles[`tilt${visual.tilt}`])}
                      src={visual.sticker}
                      mode="aspectFit"
                    />
                  </View>
                  <Text className={styles.cardName}>{reward.name}</Text>
                  <View className={styles.cardFooter}>
                    <View className={styles.priceChip}>
                      <Glyph name="gem" size="sm" />
                      <Text className={styles.priceText}>{reward.priceGems}</Text>
                    </View>
                    {reachable ? null : <Text className={styles.cardHintSoft}>再积一点</Text>}
                  </View>
                </View>
              </GlassSurface>
            );
          })}
        </View>
      )}
      <TextAction label="先去留下一次记录" onClick={onLeaveRecord} />
    </View>
  );
}

function OrdersPanel({
  loading,
  error,
  onRetry,
  orders,
  onOpenOrder,
  onBrowseCatalog,
}: {
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  orders: RewardOrderPublic[];
  onOpenOrder: (order: RewardOrderPublic) => void;
  onBrowseCatalog: () => void;
}) {
  if (loading) return <Skeleton lines={6} />;
  if (error) {
    return (
      <ErrorState
        title="愿望进度还没打开"
        description="稍后再看一眼，兑换记录都还在账本里。"
        onRetry={onRetry}
      />
    );
  }
  if (orders.length === 0) {
    return (
      <EmptyState
        title="还没有许下愿望"
        description="目录里都是真正想和家人一起完成的小事，不着急。"
        actionLabel="去愿望目录看看"
        onAction={onBrowseCatalog}
      />
    );
  }
  return (
    <View className={styles.section}>
      <SectionHeader
        title="我的愿望"
        caption="每一笔兑换都保留在家庭账本里"
        glyph="sparkle"
        tone="sky"
      />
      <View className={styles.orders}>
        {orders.map((order) => (
          <GlassSurface
            key={order.id}
            level="tinted"
            tone={order.status === 'COMPLETED' ? 'sage' : order.status === 'CANCELED' ? undefined : 'apricot'}
            radius="card"
            interactive
            className={styles.order}
          >
            <View
              className={styles.orderHit}
              role="button"
              aria-label={`${order.rewardName}，${orderStatusLabel[order.status]}`}
              onClick={() => onOpenOrder(order)}
            >
              <View className={styles.orderTop}>
                <View className={styles.orderHeading}>
                  <View className={classNames(styles.orderIcon, styles[`well${order.status === 'COMPLETED' ? 'sage' : 'apricot'}`])}>
                    <Glyph name={orderStatusGlyph[order.status]} size="sm" />
                  </View>
                  <Text className={`text-card-title ${styles.cardName}`}>{order.rewardName}</Text>
                </View>
                <Text className={styles.status}>{orderStatusLabel[order.status]}</Text>
              </View>
              <Text className={styles.cardDescription}>
                {order.priceGemsSnapshot} 宝石 · {dateLabel(order.createdAt)}
              </Text>
            </View>
          </GlassSurface>
        ))}
      </View>
    </View>
  );
}

function LedgerPanel({
  loading,
  error,
  onRetry,
  items,
  onOpenItem,
  onLeaveRecord,
}: {
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  items: GemTransactionPublic[];
  onOpenItem: (item: GemTransactionPublic) => void;
  onLeaveRecord: () => void;
}) {
  if (loading) return <Skeleton lines={6} />;
  if (error) {
    return (
      <ErrorState
        title="账本还在整理"
        description="流水不会被覆盖。稍后再打开，每一笔都还在。"
        onRetry={onRetry}
      />
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        title="账本还很安静"
        description="留下一次记录，第一颗宝石就会出现在这里。"
        actionLabel="去留下记录"
        onAction={onLeaveRecord}
      />
    );
  }
  return (
    <View className={styles.section}>
      <SectionHeader
        title="宝石账本"
        caption="记录和兑换的每一次变化都不会被覆盖"
        glyph="list"
        tone="sage"
      />
      <GlassSurface level="card" radius="card" className={styles.ledger}>
        {items.map((transaction) => {
          const copy = ledgerCopy(transaction);
          return (
            <View
              key={transaction.id}
              className={styles.ledgerRow}
              role="button"
              aria-label={`${copy.title}，${transaction.amount > 0 ? '+' : ''}${transaction.amount}`}
              onClick={() => onOpenItem(transaction)}
            >
              <View className={styles.ledgerMain}>
                <Text className={styles.ledgerReason}>{copy.title}</Text>
                <Text className={styles.cardDescription}>{copy.caption}</Text>
              </View>
              <Text className={classNames(styles.ledgerAmount, transaction.amount < 0 ? styles.negative : '')}>
                {transaction.amount > 0 ? '+' : ''}
                {transaction.amount}
              </Text>
            </View>
          );
        })}
      </GlassSurface>
    </View>
  );
}

export default function GemsPage() {
  return (
    <AppBootstrapGate>
      <GemsBody />
    </AppBootstrapGate>
  );
}
