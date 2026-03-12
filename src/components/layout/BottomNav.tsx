import { tabs } from '../../data/mockData';
import { TabKey } from '../../types/app';

export function BottomNav({ activeTab, onChange }: { activeTab: TabKey; onChange: (tab: TabKey) => void }) {
  return (
    <nav className="bottom-nav">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={tab.key === activeTab ? 'nav-btn active' : 'nav-btn'}
          onClick={() => onChange(tab.key)}
        >
          <span>{tab.label}</span>
          <small>{tab.subtitle}</small>
        </button>
      ))}
    </nav>
  );
}
