import { TabKey } from '../../types/app';

const descriptions: Record<TabKey, { eyebrow: string; title: string; chip: string }> = {
  home: {
    eyebrow: 'Product Source',
    title: '源码产品主线',
    chip: 'Primary',
  },
  courses: {
    eyebrow: 'Courses Rebuild',
    title: '课程模块重建',
    chip: 'Phase 2',
  },
  community: {
    eyebrow: 'Community Sandbox',
    title: '校友圈次级恢复区',
    chip: 'Secondary',
  },
  library: {
    eyebrow: 'Library Rebuild',
    title: '图书馆模块',
    chip: 'Phase 4',
  },
  profile: {
    eyebrow: 'Profile Rebuild',
    title: '个人中心',
    chip: 'Phase 2',
  },
};

export function AppHeader({ activeTab }: { activeTab: TabKey }) {
  const content = descriptions[activeTab];

  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">{content.eyebrow}</p>
        <h1>{content.title}</h1>
      </div>
      <span className="header-chip">{content.chip}</span>
    </header>
  );
}
