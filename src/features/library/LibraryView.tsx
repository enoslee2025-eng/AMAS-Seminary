import { useMemo } from 'react';
import { libraryResources } from '../../data/mockData';
import { useScopedPersistentState } from '../../hooks/usePersistentState';
import { CommunityPostPreview, LibraryCategory, LibraryResource, LibraryRuntimeRecord, LibraryRuntimeState, RuntimeSyncState } from '../../types/app';
import { DisplayCourse } from '../courses/courseState';
import { createProcessedQueueLogItem } from '../profile/profileState';
import { useProcessedQueueLog } from '../profile/useProcessedQueueLog';
import {
  clampLibraryProgress,
  getDownloadedResources,
  getInProgressResources,
  getLibraryOverview,
  getLibraryProgressLabel,
  getLibraryRuntime,
  getRecentViewedResources,
} from './libraryState';

type LibraryFilterKey = 'all' | 'favorite' | 'viewed' | 'downloaded' | 'in_progress' | LibraryCategory;

const filters: Array<{ key: LibraryFilterKey; label: string }> = [
  { key: 'all', label: '全部资源' },
  { key: 'in_progress', label: '阅读中' },
  { key: 'downloaded', label: '已下载' },
  { key: 'favorite', label: '已收藏' },
  { key: 'viewed', label: '已查看' },
  { key: 'featured', label: '精选导读' },
  { key: 'research', label: '研究资料' },
  { key: 'audio', label: '音频内容' },
  { key: 'archive', label: '院史档案' },
];

export function LibraryView({
  storageScopeKey,
  runtimeRecord,
  displayCourses,
  onUpdateRuntime,
  runtimeSyncState,
  onOpenCourse,
  onOpenCommunityCourse,
  communityPosts,
  selectedResourceId,
  onSelectResource,
}: {
  storageScopeKey: string;
  runtimeRecord: LibraryRuntimeRecord;
  displayCourses: DisplayCourse[];
  onUpdateRuntime: (
    resourceId: string,
    updater: (current: LibraryRuntimeState) => LibraryRuntimeState,
    source?: 'view' | 'favorite' | 'download' | 'restore',
  ) => void;
  runtimeSyncState: RuntimeSyncState | null;
  onOpenCourse: (courseId: string) => void;
  onOpenCommunityCourse: (courseId: string, options?: { mode?: 'feed' | 'compose'; draft?: string }) => void;
  communityPosts: CommunityPostPreview[];
  selectedResourceId: string | null;
  onSelectResource: (resourceId: string | null) => void;
}) {
  const [activeFilter, setActiveFilter] = useScopedPersistentState<LibraryFilterKey>(
    'amas_library_filter',
    storageScopeKey,
    'all',
  );
  const [search, setSearch] = useScopedPersistentState('amas_library_search', storageScopeKey, '');
  const [, , appendProcessedQueueLog] = useProcessedQueueLog(storageScopeKey);
  const selectedResource = libraryResources.find((item) => item.id === selectedResourceId) ?? null;
  const visibleResources = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return libraryResources
      .filter((item) => {
        if (activeFilter === 'all') {
          return true;
        }

        if (activeFilter === 'favorite') {
          return Boolean(runtimeRecord[item.id]?.favorite);
        }

        if (activeFilter === 'viewed') {
          return Boolean(runtimeRecord[item.id]?.viewed);
        }

        if (activeFilter === 'downloaded') {
          return Boolean(runtimeRecord[item.id]?.downloaded);
        }

        if (activeFilter === 'in_progress') {
          const progressPercent = runtimeRecord[item.id]?.progressPercent ?? 0;
          return progressPercent > 0 && progressPercent < 100;
        }

        return item.category === activeFilter;
      })
      .filter((item) => {
        if (!keyword) {
          return true;
        }

        return [item.title, item.author, item.summary, item.format].join(' ').toLowerCase().includes(keyword);
      })
      .sort((left, right) => {
        const leftRuntime = runtimeRecord[left.id];
        const rightRuntime = runtimeRecord[right.id];
        const leftScore =
          Number(Boolean(leftRuntime?.downloaded)) * 20 +
          Number(Boolean(leftRuntime?.favorite)) * 10 +
          Number(Boolean(leftRuntime?.viewed)) * 5;
        const rightScore =
          Number(Boolean(rightRuntime?.downloaded)) * 20 +
          Number(Boolean(rightRuntime?.favorite)) * 10 +
          Number(Boolean(rightRuntime?.viewed)) * 5;

        if (rightScore !== leftScore) {
          return rightScore - leftScore;
        }

        const leftTime = leftRuntime?.lastViewedAt ? new Date(leftRuntime.lastViewedAt).getTime() : 0;
        const rightTime = rightRuntime?.lastViewedAt ? new Date(rightRuntime.lastViewedAt).getTime() : 0;
        return rightTime - leftTime;
      });
  }, [activeFilter, runtimeRecord, search]);
  const recentViewedResources = useMemo(() => getRecentViewedResources(libraryResources, runtimeRecord), [runtimeRecord]);
  const inProgressResources = useMemo(() => getInProgressResources(libraryResources, runtimeRecord), [runtimeRecord]);
  const downloadedResources = useMemo(() => getDownloadedResources(libraryResources, runtimeRecord), [runtimeRecord]);
  const { favoriteCount, viewedCount, inProgressCount, downloadedCount } = useMemo(() => getLibraryOverview(runtimeRecord), [runtimeRecord]);

  const updateRuntime = (
    resourceId: string,
    updater: (current: LibraryRuntimeState) => LibraryRuntimeState,
    source: 'view' | 'favorite' | 'download' | 'restore' = 'view',
  ) => {
    onUpdateRuntime(resourceId, updater, source);
  };

  const logLearningAction = (title: string, detail: string, actionLabel: string) => {
    appendProcessedQueueLog(
      createProcessedQueueLogItem({
        category: 'learning',
        title,
        detail,
        actionLabel,
      }),
    );
  };

  const formatTimestamp = (value: string | null | undefined, fallback: string) => (value ? new Date(value).toLocaleString('zh-CN') : fallback);
  const progressPresetOptions = [0, 25, 50, 75, 100];
  const getRelatedCourse = (courseId?: string | null) => {
    if (!courseId) {
      return null;
    }

    return displayCourses.find((course) => course.id === courseId) ?? null;
  };

  const getResourceDetail = (resource: LibraryResource) => {
    if (!resource.relatedCourseId) {
      return `${resource.author} · ${resource.format}`;
    }

    const relatedCourse = getRelatedCourse(resource.relatedCourseId);
    return relatedCourse ? `已关联《${relatedCourse.title}》 · ${resource.format}` : `${resource.author} · ${resource.format}`;
  };

  const getResourceProgressNoun = (resource: LibraryResource) => {
    if (resource.format === 'Audio') {
      return '收听进度';
    }

    if (resource.format === 'Archive') {
      return '整理进度';
    }

    return '阅读进度';
  };

  const markViewedNow = (resourceId: string, extras?: Partial<LibraryRuntimeState>, actionLabel = '查看资源') => {
    const resource = libraryResources.find((item) => item.id === resourceId) ?? null;
    updateRuntime(
      resourceId,
      (current) => ({
        ...current,
        viewed: true,
        lastViewedAt: new Date().toISOString(),
        ...extras,
      }),
      actionLabel === '下载资源' ? 'download' : 'view',
    );

    if (resource) {
      logLearningAction(`查看资料《${resource.title}》`, getResourceDetail(resource), actionLabel);
    }
  };

  const toggleDownloaded = (resource: LibraryResource) => {
    const currentRuntime = getLibraryRuntime(resource.id, runtimeRecord);
    const nextDownloaded = !currentRuntime.downloaded;
    updateRuntime(
      resource.id,
      (current) => ({
        ...current,
        viewed: true,
        downloaded: nextDownloaded,
        lastViewedAt: new Date().toISOString(),
      }),
      'download',
    );

    logLearningAction(
      `${nextDownloaded ? '加入' : '移出'}离线资料夹《${resource.title}》`,
      getResourceDetail(resource),
      nextDownloaded ? '加入离线资料夹' : '移出离线资料夹',
    );
  };

  const updateReadingProgress = (resource: LibraryResource, nextPercent: number) => {
    const progressPercent = clampLibraryProgress(nextPercent);
    updateRuntime(
      resource.id,
      (current) => ({
        ...current,
        viewed: current.viewed || progressPercent > 0,
        progressPercent,
        lastViewedAt: new Date().toISOString(),
      }),
      'view',
    );

    logLearningAction(
      progressPercent >= 100 ? `完成资料《${resource.title}》` : `更新资料进度《${resource.title}》`,
      `${getResourceDetail(resource)} · ${getLibraryProgressLabel(progressPercent)}`,
      progressPercent >= 100 ? '完成资料' : `${getResourceProgressNoun(resource)} ${progressPercent}%`,
    );
  };

  const getEmptyStateCopy = () => {
    if (search.trim()) {
      return {
        title: '没有匹配的资源',
        detail: '试试更换关键词，或者切回全部资源继续浏览。',
      };
    }

    if (activeFilter === 'downloaded') {
      return {
        title: '离线资料夹还是空的',
        detail: '先在资源卡片或详情页把资料加入离线资料夹，这里就会按账号保留已下载清单。',
      };
    }

    if (activeFilter === 'favorite') {
      return {
        title: '还没有收藏的资料',
        detail: '先挑几份想回看的资料加入收藏，后面就能从这里快速找回。',
      };
    }

    if (activeFilter === 'in_progress') {
      return {
        title: '还没有正在阅读的资料',
        detail: '推进任意资源的阅读进度后，这里会集中保留你的继续阅读清单。',
      };
    }

    if (activeFilter === 'viewed') {
      return {
        title: '还没有阅读记录',
        detail: '打开任意资料后，这里会沉淀你的最近查看记录。',
      };
    }

    return {
      title: '没有匹配的资源',
      detail: '试试更换分类，或者搜索标题、作者与资源类型。',
    };
  };

  const getResourceFooterCopy = (resource: LibraryResource) => {
    const runtime = runtimeRecord[resource.id];
    const progressPercent = runtime?.progressPercent ?? 0;
    const relatedCourse = getRelatedCourse(resource.relatedCourseId);

    if (relatedCourse?.primaryLinkedResource?.resourceId === resource.id) {
      return progressPercent > 0
        ? `这份资料现在也是《${relatedCourse.title}》的主资料入口，可以直接把课程和阅读进度一起续上。`
        : `这份资料现在已经挂在《${relatedCourse.title}》的主资料入口上，适合从图书馆直接回到课程链路。`;
    }

    if (progressPercent >= 100) {
      return '这份资料已经完成，可以回到课程模块或讨论区继续做复盘。';
    }

    if (progressPercent > 0) {
      return `当前已推进到 ${progressPercent}%，可以从图书馆继续回到上次阅读位置。`;
    }

    if (runtime?.downloaded) {
      return '这份资料已经进入离线资料夹，可以从已下载清单或资源详情继续查看。';
    }

    if (resource.relatedCourseId) {
      return relatedCourse
        ? `这份资料已关联《${relatedCourse.title}》，课程当前进度 ${relatedCourse.progressValue}%，也可以先加入离线资料夹再继续回看。`
        : '这份资料已经可以跳回课程模块，也可以先加入离线资料夹再继续回看。';
    }

    return '现在已经支持阅读进度、收藏和离线资料夹，后面继续补阅读器体验和真实下载链路。';
  };

  if (selectedResource) {
    const selectedRuntime = getLibraryRuntime(selectedResource.id, runtimeRecord);
    const relatedCourse = getRelatedCourse(selectedResource.relatedCourseId);
    const relatedCommunityPosts = selectedResource.relatedCourseId
      ? communityPosts.filter((post) => post.courseId === selectedResource.relatedCourseId)
      : [];
    const latestCommunityPost = relatedCommunityPosts[0] ?? null;
    const suggestedDiscussionDraft = `我刚查看了《${selectedResource.title}》，这份资料对《${relatedCourse?.title ?? '相关课程'}》的帮助是：`;

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
            <span className="post-badge">{getResourceProgressNoun(selectedResource)} {selectedRuntime.progressPercent}%</span>
            {selectedRuntime.favorite && <span className="post-badge">已收藏</span>}
            {selectedRuntime.downloaded && <span className="post-badge">已下载</span>}
          </div>
        </section>

        {runtimeSyncState && (
          <section className="content-card sync-feedback-card">
            <p className="eyebrow">Library Sync</p>
            <p
              className={`backup-feedback ${
                runtimeSyncState.tone === 'error'
                  ? 'backup-feedback-error'
                  : runtimeSyncState.tone === 'syncing'
                    ? 'backup-feedback-syncing'
                    : 'backup-feedback-success'
              }`}
            >
              {runtimeSyncState.message}
            </p>
          </section>
        )}

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
                <span className="post-badge">{relatedCourse.completedLessonsCount}/{relatedCourse.syllabus.length} 课时完成</span>
                <span className="post-badge">课程进度 {relatedCourse.progressValue}%</span>
                {relatedCourse.primaryLinkedResource?.resourceId === selectedResource.id && <span className="post-badge">当前主资料</span>}
              </div>
            </div>
            <p className="hero-copy">
              {relatedCourse.lastActivityDetail}
            </p>
            <div className="detail-summary-row">
              <article className="detail-summary-card">
                <span className="detail-summary-label">最近活动</span>
                <strong>{relatedCourse.lastStudiedLabel}</strong>
                <span>{relatedCourse.lastActivitySource === 'resource' ? '最近一次是从资料入口继续' : '最近一次是从课程入口继续'}</span>
              </article>
              <article className="detail-summary-card">
                <span className="detail-summary-label">资料联动</span>
                <strong>{relatedCourse.linkedMaterialsCount} 份</strong>
                <span>阅读中 {relatedCourse.inProgressMaterialsCount} 份 · 已下载 {relatedCourse.downloadedMaterialsCount} 份</span>
              </article>
            </div>
            <div className="library-action-row">
              <button type="button" className="primary-btn compact-btn" onClick={() => onOpenCourse(relatedCourse.id)}>
                继续关联课程
              </button>
              {relatedCourse.primaryLinkedResource && relatedCourse.primaryLinkedResource.resourceId !== selectedResource.id && (
                <button
                  type="button"
                  className="secondary-btn compact-btn"
                  onClick={() => onSelectResource(relatedCourse.primaryLinkedResource!.resourceId)}
                >
                  {relatedCourse.primaryLinkedResource.ctaLabel}
                </button>
              )}
              <button type="button" className="secondary-btn compact-btn" onClick={() => onOpenCommunityCourse(relatedCourse.id)}>
                打开相关讨论
              </button>
            </div>
          </section>
        )}

        {relatedCourse && (
          <section className="detail-panel-card">
            <div className="module-header">
              <div>
                <p className="eyebrow">Resource Discussion</p>
                <h2>资料相关讨论</h2>
              </div>
            </div>
            <div className="detail-summary-row">
              <article className="detail-summary-card">
                <span className="detail-summary-label">讨论动态</span>
                <strong>{relatedCommunityPosts.length}</strong>
                <span>{relatedCommunityPosts.length > 0 ? '已进入课程讨论流' : '还没有关联这份资料的讨论'}</span>
              </article>
              <article className="detail-summary-card">
                <span className="detail-summary-label">最近讨论</span>
                <strong>{latestCommunityPost?.author ?? '等待首条动态'}</strong>
                <span>{latestCommunityPost?.time ?? '可以从这里直接发起讨论'}</span>
              </article>
            </div>
            {latestCommunityPost ? (
              <article className="module-card post-card">
                <div className="post-meta">
                  <div>
                    <p className="post-author">{latestCommunityPost.author}</p>
                    <p className="post-role">{latestCommunityPost.role}</p>
                  </div>
                  <span className="course-updated">{latestCommunityPost.time}</span>
                </div>
                <span className="post-badge">{latestCommunityPost.badge}</span>
                <p className="post-content">{latestCommunityPost.content}</p>
              </article>
            ) : (
              <div className="empty-state-card">
                <strong>这份资料还没有讨论记录</strong>
                <span>可以直接带着资源上下文进入社区，发布一条新的课程感悟。</span>
              </div>
            )}
            <div className="library-action-row">
              <button type="button" className="secondary-btn compact-btn" onClick={() => onOpenCommunityCourse(relatedCourse.id)}>
                查看课程讨论
              </button>
              <button
                type="button"
                className="primary-btn compact-btn"
                onClick={() => onOpenCommunityCourse(relatedCourse.id, { mode: 'compose', draft: suggestedDiscussionDraft })}
              >
                基于资料发感悟
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
              <p className="eyebrow">Reading Progress</p>
              <h2>{getResourceProgressNoun(selectedResource)}</h2>
            </div>
          </div>
          <div className="progress-meta">
            <span>{getLibraryProgressLabel(selectedRuntime.progressPercent)}</span>
            <strong>{selectedRuntime.progressPercent}%</strong>
          </div>
          <div className="progress-bar">
            <span style={{ width: `${selectedRuntime.progressPercent}%` }} />
          </div>
          <p className="hero-copy">
            这份资料的当前状态是“{getLibraryProgressLabel(selectedRuntime.progressPercent)}”。进度会跟随工作区快照一起保留。
          </p>
          <div className="category-row">
            {progressPresetOptions.map((progressPercent) => (
              <button
                key={progressPercent}
                type="button"
                className={selectedRuntime.progressPercent === progressPercent ? 'chip-btn active' : 'chip-btn'}
                onClick={() => updateReadingProgress(selectedResource, progressPercent)}
              >
                {progressPercent === 0 ? '未开始' : progressPercent === 100 ? '已完成' : `${progressPercent}%`}
              </button>
            ))}
          </div>
        </section>

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
              <span>{formatTimestamp(selectedRuntime.lastViewedAt, '尚无记录')}</span>
            </article>
            <article className="detail-summary-card">
              <span className="detail-summary-label">{getResourceProgressNoun(selectedResource)}</span>
              <strong>{selectedRuntime.progressPercent}%</strong>
              <span>{getLibraryProgressLabel(selectedRuntime.progressPercent)}</span>
            </article>
            <article className="detail-summary-card">
              <span className="detail-summary-label">收藏</span>
              <strong>{selectedRuntime.favorite ? '已收藏' : '未收藏'}</strong>
              <span>可继续和课程资料做联动</span>
            </article>
            <article className="detail-summary-card">
              <span className="detail-summary-label">离线资料夹</span>
              <strong>{selectedRuntime.downloaded ? '已加入' : '未加入'}</strong>
              <span>{selectedRuntime.downloaded ? '已进入离线资料夹，可从已下载清单继续找回。' : '加入后会出现在图书馆的已下载清单里。'}</span>
            </article>
          </div>
          <div className="library-action-row">
            <button
              type="button"
              className={selectedRuntime.favorite ? 'chip-btn active' : 'chip-btn'}
              onClick={() => {
                updateRuntime(selectedResource.id, (current) => ({ ...current, favorite: !current.favorite }), 'favorite');
                if (!selectedRuntime.favorite) {
                  logLearningAction(`收藏资料《${selectedResource.title}》`, getResourceDetail(selectedResource), '加入收藏');
                }
              }}
            >
              {selectedRuntime.favorite ? '取消收藏' : '加入收藏'}
            </button>
            <button type="button" className="secondary-btn compact-btn" onClick={() => markViewedNow(selectedResource.id)}>
              {selectedRuntime.viewed ? '刷新查看时间' : '标记已查看'}
            </button>
            <button
              type="button"
              className="primary-btn compact-btn"
              onClick={() => toggleDownloaded(selectedResource)}
            >
              {selectedRuntime.downloaded ? '移出离线资料夹' : '加入离线资料夹'}
            </button>
            {selectedResource.relatedCourseId && (
              <button type="button" className="secondary-btn compact-btn" onClick={() => onOpenCourse(selectedResource.relatedCourseId!)}>
                继续关联课程
              </button>
            )}
            {selectedResource.relatedCourseId && (
              <button type="button" className="secondary-btn compact-btn" onClick={() => onOpenCommunityCourse(selectedResource.relatedCourseId!)}>
                打开讨论
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
            这一页已经恢复资料结构、分类筛选、收藏、阅读进度、离线资料夹和课程资料联动。接下来继续补阅读器体验和真实下载链路。
          </p>
        </div>
        <div className="detail-chip-row">
          <span className="post-badge">资源 {libraryResources.length}</span>
          <span className="post-badge">阅读中 {inProgressCount}</span>
          <span className="post-badge">已收藏 {favoriteCount}</span>
          <span className="post-badge">已下载 {downloadedCount}</span>
        </div>
      </section>

      {runtimeSyncState && (
        <section className="content-card sync-feedback-card">
          <p className="eyebrow">Library Sync</p>
          <p
            className={`backup-feedback ${
              runtimeSyncState.tone === 'error'
                ? 'backup-feedback-error'
                : runtimeSyncState.tone === 'syncing'
                  ? 'backup-feedback-syncing'
                  : 'backup-feedback-success'
            }`}
          >
            {runtimeSyncState.message}
          </p>
        </section>
      )}

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
        <p className="toolbar-helper">资源现在已经支持搜索、阅读进度、收藏、已查看、离线资料夹和课程联动筛选。后面继续补阅读器体验和真实下载链路。</p>
      </section>

      {inProgressResources.length > 0 && (
        <section className="content-card">
          <div className="module-header">
            <div>
              <p className="eyebrow">Continue Reading</p>
              <h2>继续阅读</h2>
            </div>
          </div>
          <div className="archive-list">
            {inProgressResources.map((resource) => {
              const progressPercent = runtimeRecord[resource.id]?.progressPercent ?? 0;
              return (
                <button key={resource.id} type="button" className="archive-item" onClick={() => onSelectResource(resource.id)}>
                  <div>
                    <p className="post-author">{resource.title}</p>
                    <p className="post-role">
                      {resource.author} · {resource.format}
                    </p>
                  </div>
                  <div className="archive-meta">
                    <strong>{progressPercent}%</strong>
                    <span>{getLibraryProgressLabel(progressPercent)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

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
                  <span>{formatTimestamp(runtimeRecord[resource.id]?.lastViewedAt, '')}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {downloadedResources.length > 0 && (
        <section className="content-card">
          <div className="module-header">
            <div>
              <p className="eyebrow">Offline Shelf</p>
              <h2>离线资料夹</h2>
            </div>
          </div>
          <div className="archive-list">
            {downloadedResources.map((resource) => (
              <button key={resource.id} type="button" className="archive-item" onClick={() => onSelectResource(resource.id)}>
                <div>
                  <p className="post-author">{resource.title}</p>
                  <p className="post-role">
                    {resource.author} · {resource.format}
                  </p>
                </div>
                <div className="archive-meta">
                  <strong>离线可用</strong>
                  <span>{formatTimestamp(runtimeRecord[resource.id]?.lastViewedAt, '已加入资料夹')}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="panel-grid">
        {visibleResources.length > 0 ? (
          visibleResources.map((resource) => (
            <article className="module-card library-card" key={resource.id}>
              {(() => {
                const runtime = getLibraryRuntime(resource.id, runtimeRecord);
                const progressPercent = runtime.progressPercent;
                return (
                  <>
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
                      {runtime.favorite && <span className="post-badge">已收藏</span>}
                      {runtime.viewed && <span className="post-badge">已查看</span>}
                      {runtime.downloaded && <span className="post-badge">已下载</span>}
                    </div>
                    <p>{resource.summary}</p>
                    <div className="progress-meta">
                      <span>
                        {getResourceProgressNoun(resource)} · {getLibraryProgressLabel(progressPercent)}
                      </span>
                      <strong>{progressPercent}%</strong>
                    </div>
                    <div className="progress-bar">
                      <span style={{ width: `${progressPercent}%` }} />
                    </div>
                    <div className="library-action-row">
                      <button
                        type="button"
                        className={runtime.favorite ? 'chip-btn active' : 'chip-btn'}
                        onClick={() => {
                          updateRuntime(resource.id, (current) => ({ ...current, favorite: !current.favorite }), 'favorite');
                          if (!runtime.favorite) {
                            logLearningAction(`收藏资料《${resource.title}》`, getResourceDetail(resource), '加入收藏');
                          }
                        }}
                      >
                        {runtime.favorite ? '取消收藏' : '加入收藏'}
                      </button>
                      <button
                        type="button"
                        className={runtime.viewed ? 'chip-btn active' : 'chip-btn'}
                        onClick={() => markViewedNow(resource.id, undefined, runtime.viewed ? '刷新查看' : '标记已看')}
                      >
                        {runtime.viewed ? '刷新查看' : '标记已看'}
                      </button>
                      <button
                        type="button"
                        className={runtime.downloaded ? 'chip-btn active' : 'chip-btn'}
                        onClick={() => toggleDownloaded(resource)}
                      >
                        {runtime.downloaded ? '移出资料夹' : '加入资料夹'}
                      </button>
                      <button
                        type="button"
                        className="secondary-btn compact-btn"
                        onClick={() => {
                          markViewedNow(resource.id);
                          onSelectResource(resource.id);
                        }}
                      >
                        {progressPercent > 0 && progressPercent < 100 ? '继续阅读' : progressPercent >= 100 ? '再次查看' : '查看资源'}
                      </button>
                    </div>
                    <div className="post-footer">
                      <span>{getResourceFooterCopy(resource)}</span>
                      {resource.relatedCourseId && (
                        <>
                          <button type="button" className="secondary-btn compact-btn" onClick={() => onOpenCourse(resource.relatedCourseId!)}>
                            继续课程
                          </button>
                          <button type="button" className="secondary-btn compact-btn" onClick={() => onOpenCommunityCourse(resource.relatedCourseId!)}>
                            打开讨论
                          </button>
                        </>
                      )}
                    </div>
                  </>
                );
              })()}
            </article>
          ))
        ) : (
          <div className="empty-state-card">
            <strong>{getEmptyStateCopy().title}</strong>
            <span>{getEmptyStateCopy().detail}</span>
          </div>
        )}
      </section>
    </div>
  );
}
