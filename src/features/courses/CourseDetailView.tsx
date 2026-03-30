import { useEffect, useMemo, useState } from 'react';
import { libraryResources } from '../../data/mockData';
import {
  CommunityPostPreview,
  CourseDetailTab,
  CourseRuntimeState,
  LibraryRuntimeRecord,
  LibraryRuntimeState,
  RuntimeSyncState,
} from '../../types/app';
import { getLibraryRuntime } from '../library/libraryState';
import { createProcessedQueueLogItem } from '../profile/profileState';
import { useProcessedQueueLog } from '../profile/useProcessedQueueLog';
import {
  DisplayCourse,
  getCompletedLessonsCount,
  getCourseMaterialStatus,
  markCurrentLesson,
  setDetailTab,
  toggleLessonCompleted,
  toggleMaterialViewed,
} from './courseState';

const tabLabels: Array<{ key: CourseDetailTab; label: string }> = [
  { key: 'syllabus', label: '课程目录' },
  { key: 'overview', label: '详情介绍' },
  { key: 'materials', label: '学习资料' },
];

export function CourseDetailView({
  course,
  runtime,
  progress,
  recentLesson,
  runtimeSyncState,
  onBack,
  onUpdateRuntime,
  libraryRuntimeRecord,
  onUpdateLibraryRuntime,
  onOpenResource,
  communityPostCount,
  latestCommunityPost,
  onOpenCommunity,
  onComposeCommunityPost,
}: {
  course: DisplayCourse;
  runtime: CourseRuntimeState;
  progress: number;
  recentLesson: string;
  runtimeSyncState: RuntimeSyncState | null;
  onBack: () => void;
  onUpdateRuntime: (updater: (current: CourseRuntimeState) => CourseRuntimeState) => void;
  libraryRuntimeRecord: LibraryRuntimeRecord;
  onUpdateLibraryRuntime: (
    resourceId: string,
    updater: (current: LibraryRuntimeState) => LibraryRuntimeState,
    source?: 'view' | 'favorite' | 'download' | 'restore',
  ) => void;
  onOpenResource: (resourceId: string) => void;
  communityPostCount: number;
  latestCommunityPost: CommunityPostPreview | null;
  onOpenCommunity: () => void;
  onComposeCommunityPost: (draft: string) => void;
}) {
  const [activeTab, setActiveTabState] = useState<CourseDetailTab>(runtime.lastOpenedTab ?? 'overview');
  const [, , appendProcessedQueueLog] = useProcessedQueueLog();

  useEffect(() => {
    setActiveTabState(runtime.lastOpenedTab ?? 'overview');
  }, [course.id, runtime.lastOpenedTab]);

  const setActiveTab = (tab: CourseDetailTab) => {
    setActiveTabState(tab);
    onUpdateRuntime((current) => setDetailTab(current, tab));
  };

  const completedLessons = useMemo(() => getCompletedLessonsCount(runtime), [runtime]);
  const currentLessonTitle =
    course.syllabus.find((lesson) => lesson.id === runtime.currentLessonId)?.title ?? recentLesson;
  const nextPendingLesson = useMemo(
    () => course.syllabus.find((lesson) => !runtime.completedLessonIds.includes(lesson.id)) ?? null,
    [course.syllabus, runtime.completedLessonIds],
  );
  const readyMaterialCount = useMemo(
    () => course.materials.filter((material) => material.status === 'ready').length,
    [course.materials],
  );
  const materialEntries = useMemo(
    () =>
      course.materials.map((material) => ({
        material,
        linkedResource: material.libraryResourceId
          ? libraryResources.find((resource) => resource.id === material.libraryResourceId) ?? null
          : null,
        status: getCourseMaterialStatus(material, runtime, libraryRuntimeRecord),
      })),
    [course.materials, libraryRuntimeRecord, runtime],
  );
  const viewedMaterialCount = useMemo(
    () => materialEntries.filter((entry) => entry.status.viewed).length,
    [materialEntries],
  );
  const linkedMaterialCount = useMemo(
    () => materialEntries.filter((entry) => Boolean(entry.linkedResource)).length,
    [materialEntries],
  );
  const inProgressMaterialCount = useMemo(
    () => materialEntries.filter((entry) => entry.status.progressPercent > 0 && entry.status.progressPercent < 100).length,
    [materialEntries],
  );
  const downloadedMaterialCount = useMemo(
    () => materialEntries.filter((entry) => entry.status.downloaded).length,
    [materialEntries],
  );
  const suggestedCommunityDraft = useMemo(
    () => `我正在学习《${course.title}》的「${currentLessonTitle}」，今天的一个收获是：`,
    [course.title, currentLessonTitle],
  );

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

  const handleToggleLessonCompleted = (lessonId: string, lessonTitle: string) => {
    const wasCompleted = runtime.completedLessonIds.includes(lessonId);
    onUpdateRuntime((current) => toggleLessonCompleted(current, lessonId));

    if (!wasCompleted) {
      logLearningAction(`完成《${course.title}》课时`, `已完成「${lessonTitle}」，课程进度继续向前推进。`, '完成课时');
    }
  };

  const handleMarkCurrentLesson = (lessonId: string, lessonTitle: string) => {
    const isCurrent = runtime.currentLessonId === lessonId;
    onUpdateRuntime((current) => markCurrentLesson(current, lessonId));

    if (!isCurrent) {
      logLearningAction(`切换《${course.title}》当前课时`, `已将「${lessonTitle}」设为当前学习位置。`, '设为当前');
    }
  };

  const handleToggleMaterialViewed = (materialId: string, materialTitle: string) => {
    const wasViewed = runtime.viewedMaterialIds.includes(materialId);
    onUpdateRuntime((current) => toggleMaterialViewed(current, materialId));

    if (!wasViewed) {
      logLearningAction(`查看课程资料《${materialTitle}》`, `这份资料已记入《${course.title}》的学习轨迹。`, '标记资料已读');
    }
  };

  const ensureMaterialViewed = (materialId: string) => {
    if (runtime.viewedMaterialIds.includes(materialId)) {
      return;
    }

    onUpdateRuntime((current) => (current.viewedMaterialIds.includes(materialId) ? current : toggleMaterialViewed(current, materialId)));
  };

  const handleOpenLinkedMaterial = (materialId: string, materialTitle: string, resourceId: string, resourceTitle: string) => {
    ensureMaterialViewed(materialId);
    onUpdateLibraryRuntime(
      resourceId,
      (current) => ({
        ...current,
        viewed: true,
        lastViewedAt: new Date().toISOString(),
      }),
      'view',
    );
    logLearningAction(`打开课程资料《${materialTitle}》`, `已从《${course.title}》进入图书馆资源《${resourceTitle}》。`, '打开图书馆资料');
    onOpenResource(resourceId);
  };

  const handleToggleLinkedMaterialDownloaded = (materialId: string, materialTitle: string, resourceId: string, resourceTitle: string) => {
    const currentResourceRuntime = getLibraryRuntime(resourceId, libraryRuntimeRecord);
    const nextDownloaded = !currentResourceRuntime.downloaded;

    ensureMaterialViewed(materialId);
    onUpdateLibraryRuntime(
      resourceId,
      (current) => ({
        ...current,
        viewed: true,
        downloaded: nextDownloaded,
        lastViewedAt: new Date().toISOString(),
      }),
      'download',
    );
    logLearningAction(
      `${nextDownloaded ? '加入' : '移出'}离线资料夹《${materialTitle}》`,
      `《${resourceTitle}》已${nextDownloaded ? '加入' : '移出'}离线资料夹，并继续和《${course.title}》同步。`,
      nextDownloaded ? '加入离线资料夹' : '移出离线资料夹',
    );
  };

  const handleOpenPrimaryLinkedResource = () => {
    const primaryLinkedResource = course.primaryLinkedResource;
    if (!primaryLinkedResource) {
      setActiveTab('materials');
      return;
    }

    const linkedMaterial = course.materials.find((material) => material.libraryResourceId === primaryLinkedResource.resourceId) ?? null;
    if (linkedMaterial) {
      handleOpenLinkedMaterial(linkedMaterial.id, linkedMaterial.title, primaryLinkedResource.resourceId, primaryLinkedResource.resourceTitle);
      return;
    }

    onOpenResource(primaryLinkedResource.resourceId);
  };

  return (
    <div className="course-detail-layout">
      <button type="button" className="back-link" onClick={onBack}>
        返回课程列表
      </button>

      <section className={`detail-hero-card tone-${course.coverTone}`}>
        <div>
          <p className="eyebrow">{course.degree} · {course.instructor}</p>
          <h2>{course.title}</h2>
          <p className="hero-copy">{course.description}</p>
        </div>
        <div className="detail-stats">
          <div>
            <strong>{progress}%</strong>
            <span>当前进度</span>
          </div>
          <div>
            <strong>{completedLessons}/{course.syllabus.length}</strong>
            <span>完成课时</span>
          </div>
          <div>
            <strong>{course.updatedAt}</strong>
            <span>最近更新</span>
          </div>
        </div>
        <div className="hero-actions">
          <button type="button" className="primary-btn compact-btn" onClick={() => setActiveTab('syllabus')}>
            继续当前课时
          </button>
          <button type="button" className="secondary-btn compact-btn" onClick={handleOpenPrimaryLinkedResource}>
            {course.primaryLinkedResource?.ctaLabel ?? '查看学习资料'}
          </button>
          <button type="button" className="secondary-btn compact-btn" onClick={onOpenCommunity}>
            打开课程讨论
          </button>
        </div>
      </section>

      {runtimeSyncState && (
        <section className="content-card sync-feedback-card">
          <p className="eyebrow">Progress Sync</p>
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

      <section className="detail-toolbar-card">
        <div className="detail-chip-row">
          {tabLabels.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={tab.key === activeTab ? 'chip-btn active' : 'chip-btn'}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'overview' && (
        <>
          <section className="detail-panel-card">
            <div className="goal-progress-card">
              <div className="goal-progress-header">
                <div>
                  <span className="detail-summary-label">当前学习焦点</span>
                  <strong>{currentLessonTitle}</strong>
                </div>
                <span className="post-badge">{completedLessons}/{course.syllabus.length}</span>
              </div>
              <p className="backup-feedback">
                {nextPendingLesson
                  ? `下一步建议继续推进「${nextPendingLesson.title}」，并把相关资料继续接到图书馆进度里。`
                  : '这门课的目录已经全部完成，可以转向复盘、讨论或补资料整理。'}
              </p>
              <div className="coach-card-actions">
                <button type="button" className="primary-btn compact-btn" onClick={() => setActiveTab('syllabus')}>
                  打开课程目录
                </button>
                <button type="button" className="secondary-btn compact-btn" onClick={handleOpenPrimaryLinkedResource}>
                  {course.primaryLinkedResource?.ctaLabel ?? '打开学习资料'}
                </button>
              </div>
            </div>
            <div className="detail-summary-row">
              <div className="detail-summary-card">
                <span className="detail-summary-label">当前课时</span>
                <strong>{currentLessonTitle}</strong>
              </div>
              <div className="detail-summary-card">
                <span className="detail-summary-label">最近学习</span>
                <strong>{course.lastStudiedLabel}</strong>
                <span>{course.lastActivityDetail}</span>
              </div>
              <div className="detail-summary-card">
                <span className="detail-summary-label">资料已接图书馆</span>
                <strong>{linkedMaterialCount} 份</strong>
              </div>
              <div className="detail-summary-card">
                <span className="detail-summary-label">阅读中 / 已下载</span>
                <strong>{inProgressMaterialCount} / {downloadedMaterialCount}</strong>
              </div>
            </div>
            <div className="module-header">
              <div>
                <p className="eyebrow">Course Intro</p>
                <h3>课程简介</h3>
              </div>
            </div>
            <p className="detail-rich-copy">{course.description}</p>
            <h3>课程目标</h3>
            <ul className="detail-list">
              {course.goals.map((goal) => (
                <li key={goal}>{goal}</li>
              ))}
            </ul>
            <div className="detail-meta-note">
              <strong>最近学习：</strong>
              <span>{recentLesson}</span>
            </div>
          </section>

          <section className="detail-panel-card">
            <div className="module-header">
              <div>
                <p className="eyebrow">Course Discussion</p>
                <h3>课程讨论</h3>
              </div>
              <div className="hero-actions">
                <button type="button" className="secondary-btn compact-btn" onClick={onOpenCommunity}>
                  打开相关讨论
                </button>
                <button type="button" className="primary-btn compact-btn" onClick={() => onComposeCommunityPost(suggestedCommunityDraft)}>
                  发布课程感悟
                </button>
              </div>
            </div>
            <div className="detail-summary-row">
              <article className="detail-summary-card">
                <span className="detail-summary-label">讨论动态</span>
                <strong>{communityPostCount}</strong>
                <span>{communityPostCount > 0 ? '已回流到校友圈讨论流' : '这门课还没有关联讨论'}</span>
              </article>
              <article className="detail-summary-card">
                <span className="detail-summary-label">最近讨论作者</span>
                <strong>{latestCommunityPost?.author ?? '等待首条动态'}</strong>
                <span>{latestCommunityPost?.time ?? '进入社区后可直接发布本课感悟'}</span>
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
                <div className="post-footer">
                  <span>进入社区后会自动带上这门课的讨论上下文，方便继续跟进。</span>
                </div>
              </article>
            ) : (
              <div className="empty-state-card">
                <strong>这门课还没有讨论记录</strong>
                <span>可以从社区页直接发一条关联本课程的感悟或恢复进展。</span>
              </div>
            )}
          </section>
        </>
      )}

      {activeTab === 'syllabus' && (
        <section className="detail-panel-card">
          <div className="goal-progress-card">
            <div className="goal-progress-header">
              <div>
                <span className="detail-summary-label">目录进度</span>
                <strong>{currentLessonTitle}</strong>
              </div>
              <span className="post-badge">{completedLessons}/{course.syllabus.length}</span>
            </div>
            <p className="backup-feedback">
              {nextPendingLesson
                ? `下一课建议推进「${nextPendingLesson.title}」，完成后课程进度会自动同步到首页和个人中心。`
                : '所有课时都已经完成，现在可以回到详情介绍做复盘或进入社区讨论。'}
            </p>
          </div>
          <div className="detail-summary-row">
            <article className="detail-summary-card">
              <span className="detail-summary-label">课程目录</span>
              <strong>{course.syllabus.length} 节</strong>
            </article>
            <article className="detail-summary-card">
              <span className="detail-summary-label">已完成</span>
              <strong>{completedLessons} 节</strong>
            </article>
            <article className="detail-summary-card">
              <span className="detail-summary-label">待完成</span>
              <strong>{Math.max(course.syllabus.length - completedLessons, 0)} 节</strong>
            </article>
          </div>
          <h3>课程目录</h3>
          <div className="lesson-list">
            {course.syllabus.map((lesson, index) => (
              <article className="lesson-card" key={lesson.id}>
                <div className="lesson-content">
                  <p className="lesson-index">第 {index + 1} 课</p>
                  <h4>{lesson.title}</h4>
                </div>
                <div className="lesson-meta">
                  <span>{lesson.duration}</span>
                  <span className={runtime.completedLessonIds.includes(lesson.id) ? 'lesson-status done' : 'lesson-status'}>
                    {runtime.completedLessonIds.includes(lesson.id) ? '已完成' : '未完成'}
                  </span>
                  <div className="lesson-actions">
                    <button type="button" className="secondary-btn compact-btn" onClick={() => handleMarkCurrentLesson(lesson.id, lesson.title)}>
                      设为当前
                    </button>
                    <button type="button" className="primary-btn compact-btn" onClick={() => handleToggleLessonCompleted(lesson.id, lesson.title)}>
                      {runtime.completedLessonIds.includes(lesson.id) ? '撤销完成' : '标记完成'}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'materials' && (
        <section className="detail-panel-card">
          <div className="detail-summary-row">
            <article className="detail-summary-card">
              <span className="detail-summary-label">资料总数</span>
              <strong>{course.materials.length} 份</strong>
            </article>
            <article className="detail-summary-card">
              <span className="detail-summary-label">可查看</span>
              <strong>{readyMaterialCount} 份</strong>
            </article>
            <article className="detail-summary-card">
              <span className="detail-summary-label">已接图书馆</span>
              <strong>{linkedMaterialCount} 份</strong>
            </article>
            <article className="detail-summary-card">
              <span className="detail-summary-label">阅读中 / 已下载</span>
              <strong>{inProgressMaterialCount} / {downloadedMaterialCount}</strong>
            </article>
          </div>
          <div className="goal-progress-card">
            <div className="goal-progress-header">
              <div>
                <span className="detail-summary-label">资料整理</span>
                <strong>把课程资料接回图书馆进度链路</strong>
              </div>
              <span className="post-badge">{viewedMaterialCount}/{course.materials.length}</span>
            </div>
            <p className="backup-feedback">已接入图书馆的资料会直接显示阅读进度和离线状态，课程页和图书馆页现在可以从同一份资源继续往下读。</p>
          </div>
          <h3>学习资料</h3>
          <div className="material-list">
            {materialEntries.map(({ material, linkedResource, status }) => (
              <article className="material-card" key={material.id}>
                <div className="material-content">
                  <p className="material-format">{material.format}</p>
                  <h4>{material.title}</h4>
                  <p className="backup-feedback">
                    {linkedResource
                      ? status.progressPercent >= 100
                        ? `已同步到图书馆资源《${linkedResource.title}》，当前已经完成，可以回到课程或讨论区复盘。`
                        : status.progressPercent > 0
                          ? `已同步到图书馆资源《${linkedResource.title}》，当前${status.progressLabel} ${status.progressPercent}%。`
                          : status.downloaded
                            ? `已同步到图书馆资源《${linkedResource.title}》，并已加入离线资料夹。`
                            : status.viewed
                              ? `这份资料已经从课程页或图书馆打开过，后续进度会继续同步显示在这里。`
                              : `这份资料已接入图书馆资源《${linkedResource.title}》，可以直接继续阅读并保留离线状态。`
                      : runtime.viewedMaterialIds.includes(material.id)
                        ? '这份资料已记入当前学习轨迹。'
                        : material.status === 'draft'
                          ? '这份资料还在草稿区，后续会继续补回图书馆入口。'
                          : '可在阅读后标记已读，保持课程资料同步。'}
                  </p>
                </div>
                <div className="material-meta">
                  <span className={material.status === 'ready' ? 'material-status ready' : 'material-status draft'}>
                    {material.status === 'ready' ? '可查看' : '草稿'}
                  </span>
                  {linkedResource && <span className="post-badge">图书馆同步</span>}
                  {linkedResource && status.progressPercent > 0 && (
                    <span className="post-badge">{status.progressLabel} {status.progressPercent}%</span>
                  )}
                  {linkedResource && status.downloaded && <span className="post-badge">已下载</span>}
                  {linkedResource ? (
                    <div className="lesson-actions">
                      <button
                        type="button"
                        className="primary-btn compact-btn"
                        onClick={() => handleOpenLinkedMaterial(material.id, material.title, linkedResource.id, linkedResource.title)}
                      >
                        {status.progressPercent > 0 && status.progressPercent < 100
                          ? '继续阅读'
                          : status.progressPercent >= 100
                            ? '再次查看'
                            : '打开图书馆资料'}
                      </button>
                      <button
                        type="button"
                        className="secondary-btn compact-btn"
                        onClick={() =>
                          handleToggleLinkedMaterialDownloaded(material.id, material.title, linkedResource.id, linkedResource.title)
                        }
                      >
                        {status.downloaded ? '移出离线资料夹' : '加入离线资料夹'}
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="secondary-btn compact-btn" onClick={() => handleToggleMaterialViewed(material.id, material.title)}>
                      {runtime.viewedMaterialIds.includes(material.id) ? '撤销已读' : '标记已读'}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
