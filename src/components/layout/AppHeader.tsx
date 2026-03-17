import { TabKey } from '../../types/app';

const descriptions: Record<TabKey, { eyebrow: string; title: string; chip: string }> = {
  home: {
    eyebrow: 'Source Rebuild',
    title: '源码重建版',
    chip: 'Current',
  },
  courses: {
    eyebrow: 'Courses Rebuild',
    title: '课程模块重建',
    chip: 'Phase 2',
  },
  community: {
    eyebrow: 'Community Rebuild',
    title: '校友圈模块',
    chip: 'Phase 3',
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
