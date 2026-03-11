import { useMemo, useState } from 'react';

type TabKey = 'home' | 'courses' | 'community' | 'library' | 'profile';

type RecoveryModule = {
  id: string;
  title: string;
  status: 'recovered' | 'rebuild' | 'pending';
  summary: string;
};

const modules: RecoveryModule[] = [
  {
    id: 'shell',
    title: '应用框架',
    status: 'rebuild',
    summary: '新的源码入口、导航框架、恢复页入口已经建立，可继续替换为真实业务模块。',
  },
  {
    id: 'courses',
    title: '课程系统',
    status: 'pending',
    summary: '课程列表、课程详情、学习记录和上传链路需要从旧快照逐步回迁到源码。',
  },
  {
    id: 'community',
    title: '校友圈',
    status: 'pending',
    summary: '动态、通知、通讯录、聊天入口逻辑仍需分阶段重建。',
  },
  {
    id: 'profile',
    title: '个人中心',
    status: 'pending',
    summary: '个人资料、学习概览、后端同步能力需要重新建立源码实现。',
  },
];

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'home', label: '首页' },
  { key: 'courses', label: '课程' },
  { key: 'community', label: '校友圈' },
  { key: 'library', label: '图书馆' },
  { key: 'profile', label: '我的' },
];

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('home');

  const tabContent = useMemo(() => {
    switch (activeTab) {
      case 'home':
        return (
          <>
            <section className="hero-card">
              <div>
                <p className="eyebrow">AMAS Seminary</p>
                <h1>源码恢复工作区已建立</h1>
                <p className="hero-copy">
                  当前仓库已经从“只有运行包”恢复为“可继续开发”的源码工程。接下来会以这套新骨架为基底，逐步重建课程、校友圈、聊天和个人中心。
                </p>
              </div>
              <div className="hero-actions">
                <a className="primary-btn" href="/recovered/index.html" target="_blank" rel="noreferrer">
                  打开恢复快照
                </a>
                <a className="secondary-btn" href="https://github.com/new" target="_blank" rel="noreferrer">
                  创建远程仓库
                </a>
              </div>
            </section>

            <section className="panel-grid">
              {modules.map((module) => (
                <article className="module-card" key={module.id}>
                  <div className="module-header">
                    <h2>{module.title}</h2>
                    <span className={`status-badge status-${module.status}`}>
                      {module.status === 'recovered' && '已抢救'}
                      {module.status === 'rebuild' && '重建中'}
                      {module.status === 'pending' && '待恢复'}
                    </span>
                  </div>
                  <p>{module.summary}</p>
                </article>
              ))}
            </section>
          </>
        );
      case 'courses':
        return (
          <section className="content-card">
            <h2>课程模块</h2>
            <p>下一步会从课程页开始恢复源码，包括课程列表、学习进度、课程详情和资料状态。</p>
          </section>
        );
      case 'community':
        return (
          <section className="content-card">
            <h2>校友圈模块</h2>
            <p>下一步会重建校友圈、通知、通讯录和聊天入口，优先把页面状态与后端入口重新接通。</p>
          </section>
        );
      case 'library':
        return (
          <section className="content-card">
            <h2>图书馆模块</h2>
            <p>图书馆会在课程和社区之后恢复，重点是安全区页眉、检索和资源卡片结构。</p>
          </section>
        );
      case 'profile':
        return (
          <section className="content-card">
            <h2>个人中心模块</h2>
            <p>个人资料编辑、学习概览、后端资料同步能力会在课程基础恢复后重新接上。</p>
          </section>
        );
      default:
        return null;
    }
  }, [activeTab]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Recovery Workspace</p>
          <h1>AMAS Seminary</h1>
        </div>
        <span className="header-chip">Editable Source</span>
      </header>

      <main className="app-main">{tabContent}</main>

      <nav className="bottom-nav">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={tab.key === activeTab ? 'nav-btn active' : 'nav-btn'}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

export default App;

