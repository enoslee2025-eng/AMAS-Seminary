import { useMemo } from 'react';
import { courses, libraryResources } from '../../data/mockData';
import { usePersistentState } from '../../hooks/usePersistentState';
import { LibraryCategory, LibraryRuntimeRecord, LibraryRuntimeState } from '../../types/app';
import { getLibraryOverview, getLibraryRuntime, getRecentViewedResources } from './libraryState';

const filters: Array<{ key: 'all' | LibraryCategory; label: string }> = [
  { key: 'all', label: '全部资源' },
  { key: 'featured', label: '精选导读' },
  { key: 'research', label: '研究资料' },
  { key: 'audio', label: '音频内容' },
  { key: 'archive', label: '院史档案' },
];

export function LibraryView({
  runtimeRecord,
  onUpdateRuntime,
  onOpenCourse,
  selectedResourceId,
  onSelectResource,
}: {
  runtimeRecord: LibraryRuntimeRecord;
  onUpdateRuntime: (resourceId: string, updater: (current: LibraryRuntimeState) => LibraryRuntimeState) => void;
  onOpenCourse: (courseId: string) => void;
  selectedResourceId: string | null;
  onSelectResource: (resourceId: string | null) => void;
}) {
  const [activeFilter, setActiveFilter] = usePersistentState<'all' | LibraryCategory>('amas_library_filter', 'all');
  const [search, setSearch] = usePersistentState('amas_library_search', '');
  const selectedResource = libraryResources.find((item) => item.id === selectedResourceId) ?? null;
  const visibleResources = libraryResources
    .filter((item) => (activeFilter === 'all' ? true : item.category === activeFilter))
    .filter((item) => {
      const keyword = search.trim().toLowerCase();
      if (!keyword) {
        return true;
      }

      return [item.title, item.author, item.summary, item.format].join(' ').toLowerCase().includes(keyword);
    })
    .sort((left, right) => {
      const leftRuntime = runtimeRecord[left.id];
      const rightRuntime = runtimeRecord[right.id];
      const leftScore = Number(Boolean(leftRuntime?.favorite)) * 10 + Number(Boolean(leftRuntime?.viewed));
      const rightScore = Number(Boolean(rightRuntime?.favorite)) * 10 + Number(Boolean(rightRuntime?.viewed));
      return rightScore - leftScore;
    });
  const recentViewedResources = useMemo(() => getRecentViewedResources(libraryResources, runtimeRecord), [runtimeRecord]);
  const { favoriteCount, viewedCount } = useMemo(() => getLibraryOverview(runtimeRecord), [runtimeRecord]);

  const updateRuntime = (resourceId: string, updater: (current: LibraryRuntimeState) => LibraryRuntimeState) => {
    onUpdateRuntime(resourceId, updater);
  };

  const markViewedNow = (resourceId: string, extras?: Partial<LibraryRuntimeState>) =>
    updateRuntime(resourceId, (current) => ({
      ...current,
      viewed: true,
      lastViewedAt: new Date().toISOString(),
      ...extras,
    }));

  if (selectedResource) {
    const selectedRuntime = getLibraryRuntime(selectedResource.id, runtimeRecord);
    const relatedCourse = selectedResource.relatedCourseId
      ? courses.find((course) => course.id === selectedResource.relatedCourseId) ?? null
      : null;

    return (
      <div className="library-layout">
        <section className="content-card">
          <button type="button" className="back-link text-back-link" onClick={() => onSelectResource(null)}>
            返回资源库
          </button>
        </section>
        <section className="content-card library-hero-card">
          <div>
            <p className="eyebrow">Library Detail</p>
            <h2>{selectedResource.title}</h2>
            <p className="hero-copy">{selectedResource.summary}</p>
          </div>
          <div className="detail-chip-row">
            <span className="post-badge">{selectedResource.format}</span>
            <span className="post-badge">{selectedResource.author}</span>
            {selectedRuntime.favorite && <span className="post-badge">已收藏</span>}
            {selectedRuntime.downloaded && <span className="post-badge">已下载</span>}
          </div>
        </section>

        {relatedCourse && (
          <section className="detail-panel-card associated-course-card">
            <div className="module-header">
              <div>
                <p className="eyebrow">Related Course</p>
                <h2>关联课程摘要</h2>
              </div>
            </div>
            <div className="associated-course-grid">
              <div>
                <p className="post-author">{relatedCourse.title}</p>
                <p className="post-role">
                  {relatedCourse.degree} · {relatedCourse.instructor}
                </p>
              </div>
              <div className="detail-chip-row">
                <span className="post-badge">{relatedCourse.category}</span>
                <span className="post-badge">{relatedCourse.lessons} 节课</span>
                <span className="post-badge">最近课时 {relatedCourse.recentLesson}</span>
              </div>
            </div>
            <p className="hero-copy">
              这份资料已经挂到课程链路。后续会继续把阅读记录、课时进度和课程感悟统一进同一套学习状态。
            </p>
            <div className="library-action-row">
              <button type="button" className="primary-btn compact-btn" onClick={() => onOpenCourse(relatedCourse.id)}>
                打开关联课程
              </button>
            </div>
          </section>
        )}

        {recentViewedResources.length > 0 && (
          <section className="detail-panel-card">
            <div className="module-header">
              <div>
                <p className="eyebrow">Reading Trail</p>
                <h2>最近阅读轨迹</h2>
              </div>
            </div>
            <div className="archive-list">
              {recentViewedResources.slice(0, 3).map((resource) => (
                <button key={resource.id} type="button" className="archive-item" onClick={() => onSelectResource(resource.id)}>
                  <div>
                    <p className="post-author">{resource.title}</p>
                    <p className="post-role">
                      {resource.author} · {resource.format}
                    </p>
                  </div>
                  <div className="archive-meta">
                    <strong>{resource.id === selectedResource.id ? '当前资源' : '最近已读'}</strong>
                    <span>
                      {runtimeRecord[resource.id]?.lastViewedAt
                        ? new Date(runtimeRecord[resource.id].lastViewedAt as string).toLocaleString('zh-CN')
                        : '尚无阅读时间'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="detail-panel-card">
          <div className="module-header">
            <div>
              <p className="eyebrow">Reading State</p>
              <h2>资源状态</h2>
            </div>
          </div>
          <div className="detail-summary-row">
            <article className="detail-summary-card">
              <span className="detail-summary-label">查看状态</span>
              <strong>{selectedRuntime.viewed ? '已查看' : '未查看'}</strong>
              <span>{selectedRuntime.lastViewedAt ? new Date(selectedRuntime.lastViewedAt).toLocaleString('zh-CN') : '尚无记录'}</span>
            </article>
            <article className="detail-summary-card">
              <span className="detail-summary-label">收藏</span>
              <strong>{selectedRuntime.favorite ? '已收藏' : '未收藏'}</strong>
              <span>可继续和课程资料做联动</span>
            </article>
            <article className="detail-summary-card">
              <span className="detail-summary-label">下载</span>
              <strong>{selectedRuntime.downloaded ? '已下载' : '未下载'}</strong>
              <span>后续补真实下载目录</span>
            </article>
          </div>
          <div className="library-action-row">
            <button
              type="button"
              className={selectedRuntime.favorite ? 'chip-btn active' : 'chip-btn'}
              onClick={() => updateRuntime(selectedResource.id, (current) => ({ ...current, favorite: !current.favorite }))}
            >
              {selectedRuntime.favorite ? '取消收藏' : '加入收藏'}
            </button>
            <button type="button" className="secondary-btn compact-btn" onClick={() => markViewedNow(selectedResource.id)}>
              标记已查看
            </button>
            <button
              type="button"
              className="primary-btn compact-btn"
              onClick={() => markViewedNow(selectedResource.id, { downloaded: true })}
            >
              下载资源
            </button>
            {selectedResource.relatedCourseId && (
              <button type="button" className="secondary-btn compact-btn" onClick={() => onOpenCourse(selectedResource.relatedCourseId!)}>
                打开关联课程
              </button>
            )}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="library-layout">
      <section className="content-card library-hero-card">
        <div>
          <p className="eyebrow">Library Rebuild</p>
          <h2>图书馆资源入口已恢复</h2>
          <p className="hero-copy">
            这一页先恢复资料结构、分类筛选和资源卡片。后续会继续接检索、收藏、阅读状态以及与课程资料的联动。
          </p>
        </div>
        <div className="detail-chip-row">
          <span className="post-badge">资源 {libraryResources.length}</span>
          <span className="post-badge">已查看 {viewedCount}</span>
          <span className="post-badge">已收藏 {favoriteCount}</span>
        </div>
      </section>

      <section className="toolbar-card">
        <label className="search-field" htmlFor="library-search">
          <span>搜索资源</span>
          <input
            id="library-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="输入标题、作者或资源类型"
          />
        </label>
        <div className="category-row">
          {filters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={activeFilter === filter.key ? 'chip-btn active' : 'chip-btn'}
              onClick={() => setActiveFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <p className="toolbar-helper">资源现在已经支持搜索、收藏和已查看状态。后面继续补阅读器、下载链路和课程资料同步。</p>
      </section>

      {recentViewedResources.length > 0 && (
        <section className="content-card">
          <div className="module-header">
            <div>
              <p className="eyebrow">Recent Viewed</p>
              <h2>最近查看</h2>
            </div>
          </div>
          <div className="archive-list">
            {recentViewedResources.map((resource) => (
              <button key={resource.id} type="button" className="archive-item" onClick={() => onSelectResource(resource.id)}>
                <div>
                  <p className="post-author">{resource.title}</p>
                  <p className="post-role">{resource.author}</p>
                </div>
                <div className="archive-meta">
                  <strong>{runtimeRecord[resource.id]?.downloaded ? '已下载' : '已查看'}</strong>
                  <span>{runtimeRecord[resource.id]?.lastViewedAt ? new Date(runtimeRecord[resource.id].lastViewedAt as string).toLocaleString('zh-CN') : ''}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="panel-grid">
        {visibleResources.map((resource) => (
          <article className="module-card library-card" key={resource.id}>
            <div className="post-meta">
              <div>
                <p className="post-author">{resource.title}</p>
                <p className="post-role">{resource.author}</p>
              </div>
              <span className="course-updated">{resource.updatedAt}</span>
            </div>
            <div className="detail-chip-row">
              <span className="post-badge">{resource.format}</span>
              {resource.relatedCourseId && <span className="post-badge">关联课程</span>}
              {runtimeRecord[resource.id]?.favorite && <span className="post-badge">已收藏</span>}
              {runtimeRecord[resource.id]?.viewed && <span className="post-badge">已查看</span>}
              {runtimeRecord[resource.id]?.downloaded && <span className="post-badge">已下载</span>}
            </div>
            <p>{resource.summary}</p>
            <div className="library-action-row">
              <button
                type="button"
                className={runtimeRecord[resource.id]?.favorite ? 'chip-btn active' : 'chip-btn'}
                onClick={() => updateRuntime(resource.id, (current) => ({ ...current, favorite: !current.favorite }))}
              >
                {runtimeRecord[resource.id]?.favorite ? '取消收藏' : '加入收藏'}
              </button>
              <button
                type="button"
                className={runtimeRecord[resource.id]?.viewed ? 'chip-btn active' : 'chip-btn'}
                onClick={() =>
                  updateRuntime(resource.id, (current) => ({
                    ...current,
                    viewed: !current.viewed,
                    lastViewedAt: current.viewed ? null : new Date().toISOString(),
                  }))
                }
              >
                {runtimeRecord[resource.id]?.viewed ? '取消已看' : '标记已看'}
              </button>
              <button
                type="button"
                className="secondary-btn compact-btn"
                onClick={() => {
                  markViewedNow(resource.id, { downloaded: true });
                  onSelectResource(resource.id);
                }}
              >
                查看资源
              </button>
            </div>
            <div className="post-footer">
              <span>{resource.relatedCourseId ? '这份资料已经可以跳回课程模块，后续继续补同步和阅读进度。' : '下一步会接入阅读进度、下载目录和课程资料同步。'}</span>
              {resource.relatedCourseId && (
                <button type="button" className="secondary-btn compact-btn" onClick={() => onOpenCourse(resource.relatedCourseId!)}>
                  打开关联课程
                </button>
              )}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
