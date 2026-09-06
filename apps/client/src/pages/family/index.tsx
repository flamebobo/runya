import { AppTopBar, BottomNav, PageShell } from '@/components';
import { AppBootstrapGate } from '@/components/shell/AppBootstrapGate';
import { FamilyHome } from '@/components/family/FamilyHome';
import { useBootstrapQuery } from '@/hooks/useBootstrap';
import Taro from '@tarojs/taro';
import type { BottomNavKey } from '@runew/domain-types';

export default function FamilyPage() {
  const bootstrap = useBootstrapQuery();
  return (
    <AppBootstrapGate>
      <PageShell scroll bottomNav>
        <AppTopBar title="我们的小家" subtitle="一起陪伴，一起留下共同记忆" gemAmount={bootstrap.data?.gemBalance ?? 0} />
        <FamilyHome familyId={bootstrap.data?.currentFamily?.id} familyName={bootstrap.data?.currentFamily?.name} />
        <BottomNav active="family" onSelect={(tab: BottomNavKey) => void Taro.reLaunch({ url: tab === 'family' ? '/pages/family/index' : tab === 'today' ? '/pages/index/index' : `/pages/index/index?tab=${tab}` })} />
      </PageShell>
    </AppBootstrapGate>
  );
}
