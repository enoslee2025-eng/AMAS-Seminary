import { tabs } from '../../data/mockData';
import { TabKey } from '../../types/app';

export function BottomNav({
  activeTab,
  onChange,
  badgeCounts = {},
}: {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
  badgeCounts?: Partial<Record<TabKey, number>>;
}) {
  return (
    <nav className="bottom-nav">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={tab.key === activeTab ? 'nav-btn active' : 'nav-btn'}
          onClick={() => onChange(tab.key)}
        >
          <span className="nav-btn-label">
            <span>{tab.label}</span>
            {badgeCounts[tab.key] ? <span className="nav-badge">{badgeCounts[tab.key]! > 99 ? '99+' : badgeCounts[tab.key]}</span> : null}
          </span>
          <small>{tab.subtitle}</small>
        </button>
      ))}
    </nav>
  );
}
