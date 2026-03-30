import { useEffect, useRef, useState } from 'react';
import { ConversationPreview, CommunityNotification, LibraryResource, LibraryRuntimeRecord } from '../../types/app';
import { StatusBadge } from '../../components/common/StatusBadge';
import {
  homeAnnouncementDetails,
  homeAnnouncementArchive,
  homeAcademyTracks,
  homeAdmissionGuide,
  homeAnnouncements,
  homeDigitalPrograms,
  homeDigitalSchedule,
  homeDigitalHighlights,
  homeOverviewSections,
  homeQuickEntries,
  homeVisionPoints,
  modules,
  rebuildMilestones,
} from '../../data/mockData';
import { DisplayCourse, LearningOverview } from '../courses/courseState';
import { useScopedPersistentState } from '../../hooks/usePersistentState';
import {
  buildDailyWrapUpReport,
  buildProfileSprintPlan,
  buildProfileTodayTasks,
  getLocalDateKey,
  getProfileActionCoachSummary,
  getProfileSprintSummary,
  getProfileTodayTaskOverview,
  getProcessedQueueSummary,
} from '../profile/profileState';
import { useProcessedQueueLog } from '../profile/useProcessedQueueLog';
import { getLibraryProgressLabel } from '../library/libraryState';

type RestoredHomePanel = 'announcements' | 'academy' | 'digital';

type RestoredPanelItem = {
  id: string;
  eyebrow?: string;
  title: string;
  detail: string;
  actionLabel: string;
  actionTarget: 'notifications' | 'conversations' | 'profile' | 'course' | 'resource';
  courseId?: string;
  resourceId?: string;
  badge?: string;
  meta?: string;
};

export function HomeView({
  profileName,
  storageScopeKey,
  displayCourses,
  continueLearningCourses,
  learningOverview,
  recentViewedResources,
  libraryRuntimeRecord,
  conversations,
  notifications,
  onOpenCourse,
  onOpenResource,
  onOpenProfile,
  onOpenCommunityInbox,
}: {
  profileName: string;
  storageScopeKey: string;
  displayCourses: DisplayCourse[];
  continueLearningCourses: DisplayCourse[];
  learningOverview: LearningOverview;
  recentViewedResources: LibraryResource[];
  libraryRuntimeRecord: LibraryRuntimeRecord;
  conversations: ConversationPreview[];
  notifications: CommunityNotification[];
  onOpenCourse: (courseId: string) => void;
  onOpenResource: (resourceId: string) => void;
  onOpenProfile: () => void;
  onOpenCommunityInbox: (options?: { section?: 'conversations' | 'notifications'; conversationId?: string; notificationId?: string }) => void;
}) {
  const [processedQueueLog] = useProcessedQueueLog(storageScopeKey);
  const restoredPanelRef = useRef<HTMLDivElement | null>(null);
  const [dailySprintState] = useScopedPersistentState<{ dateKey: string; completedStepIds: string[] }>(
    'amas_profile_daily_sprint_state',
    storageScopeKey,
    {
      dateKey: '',
      completedStepIds: [],
    },
  );
  const [restoredPanel, setRestoredPanel] = useState<RestoredHomePanel>('announcements');
  const [wrapUpNotice, setWrapUpNotice] = useState<string | null>(null);
  const todayOverview = getProfileTodayTaskOverview(displayCourses, libraryRuntimeRecord, conversations, notifications);
  const processedSummary = getProcessedQueueSummary(processedQueueLog);
  const actionCoach = getProfileActionCoachSummary({
    displayCourses,
    libraryRuntimeRecord,
    conversations,
    notifications,
    todayOverview,
    processedSummary,
  });
  const nextTodayTask = buildProfileTodayTasks({
    displayCourses,
    libraryRuntimeRecord,
    conversations,
    notifications,
    limit: 1,
  })[0] ?? null;
  const sprintPlan = buildProfileSprintPlan({
    recommendedStudy: actionCoach.recommendedStudy,
    recommendedReminder: actionCoach.recommendedReminder,
    nextTodayTask,
  });
  const sprintState = dailySprintState.dateKey === getLocalDateKey() ? dailySprintState : { dateKey: getLocalDateKey(), completedStepIds: [] };
  const sprintSummary = getProfileSprintSummary(sprintPlan, sprintState.completedStepIds);
  const nextSprintStep = sprintPlan.find((step) => !sprintState.completedStepIds.includes(step.id)) ?? null;
  const entryCourseId =
    actionCoach.recommendedStudy?.courseId ?? continueLearningCourses[0]?.id ?? displayCourses[0]?.id ?? null;
  const dailyWrapUp = buildDailyWrapUpReport({
    profileName,
    todayOverview,
    processedSummary,
    weeklyGoalSummary: {
      weeklyTargetActions: 10,
      weeklyCompletedActions: processedSummary.totalActions,
      weeklyCompletionRate: Math.min(100, Math.round((processedSummary.totalActions / 10) * 100)),
      remainingWeeklyActions: Math.max(10 - processedSummary.totalActions, 0),
      remainingTodayTasks: todayOverview.total,
      dominantCategoryLabel: actionCoach.recommendedStudy ? '学习推进优先' : '提醒处理优先',
      dominantCategoryDetail: actionCoach.dailySummary,
      nextStepLabel: nextSprintStep?.title ?? '打开个人中心',
      nextStepDetail: nextSprintStep?.detail ?? '进入个人中心查看今日冲刺和复盘。',
    },
    actionCoach,
  });

  useEffect(() => {
    if (!wrapUpNotice) {
      return;
    }

    const timer = window.setTimeout(() => setWrapUpNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [wrapUpNotice]);

  const handleCopyDailyWrapUp = () => {
    if (!navigator.clipboard?.writeText) {
      setWrapUpNotice('当前环境暂不支持直接复制，请在个人中心查看完整日报。');
      return;
    }

    void navigator.clipboard
      .writeText(dailyWrapUp.text)
      .then(() => setWrapUpNotice('今日学习播报已复制，可以直接分享。'))
      .catch(() => setWrapUpNotice('复制失败，可稍后重试或在个人中心复制。'));
  };

  const openSprintStep = () => {
    if (!nextSprintStep) {
      onOpenProfile();
      return;
    }

    if (nextSprintStep.entryTarget === 'resource' && nextSprintStep.resourceId) {
      onOpenResource(nextSprintStep.resourceId);
      return;
    }

    if (nextSprintStep.courseId) {
      onOpenCourse(nextSprintStep.courseId);
      return;
    }

    if (nextSprintStep.resourceId) {
      onOpenResource(nextSprintStep.resourceId);
      return;
    }

    onOpenCommunityInbox({
      section: nextSprintStep.conversationId ? 'conversations' : 'notifications',
      ...(nextSprintStep.conversationId ? { conversationId: nextSprintStep.conversationId } : {}),
      ...(nextSprintStep.notificationId ? { notificationId: nextSprintStep.notificationId } : {}),
    });
  };

  const openRecommendedStudy = () => {
    if (actionCoach.recommendedStudy?.entryTarget === 'resource' && actionCoach.recommendedStudy.resourceId) {
      onOpenResource(actionCoach.recommendedStudy.resourceId);
      return;
    }

    if (actionCoach.recommendedStudy?.courseId) {
      onOpenCourse(actionCoach.recommendedStudy.courseId);
      return;
    }

    if (actionCoach.recommendedStudy?.resourceId) {
      onOpenResource(actionCoach.recommendedStudy.resourceId);
      return;
    }

    onOpenProfile();
  };

  const openRecommendedReminder = () => {
    if (!actionCoach.recommendedReminder) {
      onOpenProfile();
      return;
    }

    onOpenCommunityInbox({
      section: actionCoach.recommendedReminder.section,
      ...(actionCoach.recommendedReminder.conversationId ? { conversationId: actionCoach.recommendedReminder.conversationId } : {}),
      ...(actionCoach.recommendedReminder.notificationId ? { notificationId: actionCoach.recommendedReminder.notificationId } : {}),
    });
  };

  const openQuickEntry = (entryId: string) => {
    if (entryId === 'academy') {
      openRestoredPanel('academy');
      return;
    }

    openRestoredPanel('digital');
  };

  const openPanelAction = (item: RestoredPanelItem) => {
    if (item.actionTarget === 'profile') {
      onOpenProfile();
      return;
    }

    if (item.actionTarget === 'notifications') {
      onOpenCommunityInbox({ section: 'notifications' });
      return;
    }

    if (item.actionTarget === 'conversations') {
      onOpenCommunityInbox({ section: 'conversations' });
      return;
    }

    if (item.actionTarget === 'resource' && item.resourceId) {
      onOpenResource(item.resourceId);
      return;
    }

    if (item.actionTarget === 'course' && item.courseId) {
      onOpenCourse(item.courseId);
      return;
    }

    onOpenProfile();
  };

  const openRestoredPanel = (panel: RestoredHomePanel) => {
    setRestoredPanel(panel);
    window.requestAnimationFrame(() => {
      restoredPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const restoredPanelConfig: Record<
    RestoredHomePanel,
    {
      eyebrow: string;
      title: string;
      detail: string;
      primaryLabel: string;
      primaryAction: () => void;
      items: RestoredPanelItem[];
    }
  > = {
    announcements: {
      eyebrow: 'Notice Center',
      title: '最新公告',
      detail: '把首页公告先做成可进入的小视图，后面再继续接真实通知流、筛选器和历史归档。',
      primaryLabel: '打开通知中心',
      primaryAction: () => onOpenCommunityInbox({ section: 'notifications' }),
      items: homeAnnouncementDetails,
    },
    academy: {
      eyebrow: 'Academy Overview',
      title: '学院概览',
      detail: '这里先承接恢复快照里的学院简介、入学路径和院史内容，方便我们逐步把原始首页结构源码化。',
      primaryLabel: '打开学习工作台',
      primaryAction: onOpenProfile,
      items: homeOverviewSections,
    },
    digital: {
      eyebrow: 'Digital Education',
      title: '数字教育',
      detail: '线上讲座、资料联动和社区复盘先放进同一入口，后续继续补直播状态、回放与远程课堂流程。',
      primaryLabel: entryCourseId ? '打开当前课程' : '查看全部通知',
      primaryAction: () => {
        if (entryCourseId) {
          onOpenCourse(entryCourseId);
          return;
        }

        onOpenCommunityInbox({ section: 'notifications' });
      },
      items: homeDigitalHighlights,
    },
  };
  const activeRestoredPanel = restoredPanelConfig[restoredPanel];
  const academyPrimaryTrack = homeAcademyTracks[0] ?? null;
  const digitalPrimaryProgram = homeDigitalPrograms[0] ?? null;

  const renderRestoredSupport = () => {
    if (restoredPanel === 'announcements') {
      return (
        <section className="restored-support-grid">
          <article className="restored-support-card">
            <div className="module-header">
              <div>
                <p className="eyebrow">Announcement Archive</p>
                <h2>公告归档</h2>
              </div>
              <span className="post-badge">{homeAnnouncementArchive.length} 条</span>
            </div>
            <div className="archive-list">
              {homeAnnouncementArchive.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="archive-item actionable-item"
                  onClick={() => openPanelAction(item)}
                >
                  <div>
                    <p className="post-role">{item.eyebrow}</p>
                    <p className="post-author">{item.title}</p>
                    <p className="backup-feedback">{item.detail}</p>
                  </div>
                  <div className="archive-meta">
                    <strong>{item.meta}</strong>
                    <span>{item.actionLabel}</span>
                  </div>
                </button>
              ))}
            </div>
          </article>
        </section>
      );
    }

    if (restoredPanel === 'academy') {
      return (
        <section className="restored-support-grid">
          <article className="restored-support-card">
            <div className="module-header">
              <div>
                <p className="eyebrow">Programs</p>
                <h2>学科介绍</h2>
              </div>
              {academyPrimaryTrack && (
                <button type="button" className="secondary-btn compact-btn" onClick={() => openPanelAction(academyPrimaryTrack)}>
                  {academyPrimaryTrack.actionLabel}
                </button>
              )}
            </div>
            <div className="restored-track-grid">
              {homeAcademyTracks.map((item) => (
                <article key={item.id} className="restored-track-card">
                  <div className="restored-track-top">
                    <span className="post-badge">{item.badge}</span>
                    <strong>{item.title}</strong>
                  </div>
                  <p>{item.detail}</p>
                  <button type="button" className="secondary-btn compact-btn" onClick={() => openPanelAction(item)}>
                    {item.actionLabel}
                  </button>
                </article>
              ))}
            </div>
          </article>
          <article className="restored-support-card">
            <div className="module-header">
              <div>
                <p className="eyebrow">Admissions Guide</p>
                <h2>入学指南</h2>
              </div>
            </div>
            <div className="restored-step-list">
              {homeAdmissionGuide.map((step) => (
                <article key={step.id} className="restored-step-item">
                  <span className="restored-step-index">{step.step}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.detail}</p>
                  </div>
                </article>
              ))}
            </div>
          </article>
        </section>
      );
    }

    return (
      <section className="restored-support-grid">
        <article className="restored-support-card">
          <div className="module-header">
            <div>
              <p className="eyebrow">Digital Tracks</p>
              <h2>数字教育能力</h2>
            </div>
            {digitalPrimaryProgram && (
              <button type="button" className="secondary-btn compact-btn" onClick={() => openPanelAction(digitalPrimaryProgram)}>
                {digitalPrimaryProgram.actionLabel}
              </button>
            )}
          </div>
          <div className="restored-track-grid">
            {homeDigitalPrograms.map((item) => (
              <article key={item.id} className="restored-track-card">
                <div className="restored-track-top">
                  <span className="post-badge">{item.badge}</span>
                  <strong>{item.title}</strong>
                </div>
                <p>{item.detail}</p>
                <button type="button" className="secondary-btn compact-btn" onClick={() => openPanelAction(item)}>
                  {item.actionLabel}
                </button>
              </article>
            ))}
          </div>
        </article>
        <article className="restored-support-card">
          <div className="module-header">
            <div>
              <p className="eyebrow">Remote Schedule</p>
              <h2>远程教学安排</h2>
            </div>
          </div>
          <div className="restored-schedule-list">
            {homeDigitalSchedule.map((item) => (
              <article key={item.id} className="restored-schedule-item">
                <span className="restored-schedule-time">{item.time}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>
    );
  };

  return (
    <>
      <section className="hero-card home-hero-card">
        <div className="home-hero-copy">
          <p className="eyebrow">AMAS Seminary</p>
          <h2>你现在打开的是产品主线源码版</h2>
          <p className="hero-copy">
            这里是我们继续开发和准备后端接入的主工作区，用来承接课程、图书馆、个人中心等核心产品能力。恢复快照版仅作为内部设计参考，不再作为产品主线。
          </p>
        </div>
        <div className="home-mode-grid">
          <article className="mode-entry-card current">
            <span className="mode-entry-tag">当前所在</span>
            <strong>源码产品主线</strong>
            <p>可编辑、可提交、可继续开发，后端边界和核心能力都会优先接在这里。</p>
            <div className="hero-actions">
              <button type="button" className="primary-btn compact-btn" onClick={onOpenProfile}>
                查看今日冲刺
              </button>
              {entryCourseId && (
                <button type="button" className="secondary-btn compact-btn" onClick={() => onOpenCourse(entryCourseId)}>
                  打开当前课程
                </button>
              )}
            </div>
          </article>
          <article className="mode-entry-card">
            <span className="mode-entry-tag">内部参考</span>
            <strong>恢复快照参考版</strong>
            <p>直接打开从 iOS 安装包里救回来的旧界面，用来核对视觉、层级和原始流程，不作为当前产品主线。</p>
            <div className="hero-actions">
              <a className="primary-btn compact-btn" href="./recovered/index.html">
                打开设计参考
              </a>
              <a className="secondary-btn compact-btn" href="https://github.com/enoslee2025-eng/AMAS-Seminary" target="_blank" rel="noreferrer">
                查看 GitHub
              </a>
            </div>
          </article>
        </div>
        <p className="mode-entry-note">恢复快照只用于内部对照原始 App，源码产品主线才是当前继续开发、接后端和准备上线的版本。</p>
      </section>

      <section className="content-card classic-home-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Restored Home</p>
            <h2>原始首页结构重建</h2>
          </div>
          <button type="button" className="secondary-btn compact-btn" onClick={() => openRestoredPanel('announcements')}>
            查看全部公告
          </button>
        </div>
        <article className="announcement-board">
          <div className="announcement-board-copy">
            <span className="announcement-board-label">Mission Statement</span>
            <strong>“主啊，我在这里，请差遣我。”</strong>
            <p>把恢复快照里最有辨识度的首页结构先接回源码版，后面继续补视觉细节和真实内容源。</p>
          </div>
          <div className="announcement-list">
            {homeAnnouncements.map((announcement) => (
              <article key={announcement.id} className="announcement-item">
                <span className={`announcement-dot tone-${announcement.tone}`} />
                <div className="announcement-item-copy">
                  <strong>{announcement.title}</strong>
                  <span>{announcement.date}</span>
                </div>
              </article>
            ))}
          </div>
        </article>
        <div className="home-entry-grid">
          {homeQuickEntries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`home-entry-tile ${restoredPanel === entry.id ? 'active' : ''}`}
              onClick={() => openQuickEntry(entry.id)}
            >
              <span className="home-entry-badge">{entry.badge}</span>
              <strong>{entry.title}</strong>
              <span>{entry.detail}</span>
            </button>
          ))}
        </div>
        <div className="restored-panel-switcher" ref={restoredPanelRef}>
          <button
            type="button"
            className={`restored-panel-tab ${restoredPanel === 'announcements' ? 'active' : ''}`}
            onClick={() => openRestoredPanel('announcements')}
          >
            公告
          </button>
          <button
            type="button"
            className={`restored-panel-tab ${restoredPanel === 'academy' ? 'active' : ''}`}
            onClick={() => openRestoredPanel('academy')}
          >
            学院概览
          </button>
          <button
            type="button"
            className={`restored-panel-tab ${restoredPanel === 'digital' ? 'active' : ''}`}
            onClick={() => openRestoredPanel('digital')}
          >
            数字教育
          </button>
        </div>
        <article className="restored-detail-panel">
          <div className="restored-detail-header">
            <div>
              <span className="announcement-board-label">{activeRestoredPanel.eyebrow}</span>
              <strong>{activeRestoredPanel.title}</strong>
              <p>{activeRestoredPanel.detail}</p>
            </div>
            <button type="button" className="primary-btn compact-btn" onClick={activeRestoredPanel.primaryAction}>
              {activeRestoredPanel.primaryLabel}
            </button>
          </div>
          <div className="restored-detail-grid">
            {activeRestoredPanel.items.map((item) => (
              <article key={item.id} className="restored-detail-card">
                <span className="restored-detail-meta">{item.eyebrow ?? activeRestoredPanel.eyebrow}</span>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
                <button type="button" className="secondary-btn compact-btn" onClick={() => openPanelAction(item)}>
                  {item.actionLabel}
                </button>
              </article>
            ))}
          </div>
        </article>
        <article className="vision-card">
          <div className="module-header">
            <div>
              <p className="eyebrow">Three Visions</p>
              <h2>三大异象</h2>
            </div>
            <button type="button" className="primary-btn compact-btn" onClick={onOpenProfile}>
              打开学习工作台
            </button>
          </div>
          <div className="vision-list">
            {homeVisionPoints.map((point, index) => (
              <article key={point} className="vision-item">
                <span className="vision-index">{index + 1}</span>
                <p>{point}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      {renderRestoredSupport()}

      <section className="summary-grid">
        <article className="summary-card">
          <span className="summary-label">进行中课程</span>
          <strong>{learningOverview.activeCourseCount}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">已完成课时</span>
          <strong>{learningOverview.completedLessonCount}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">课程资料联动</span>
          <strong>{learningOverview.linkedMaterialCount}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">阅读中 / 已下载</span>
          <strong>{learningOverview.inProgressMaterialCount} / {learningOverview.downloadedMaterialCount}</strong>
        </article>
      </section>

      <section className="content-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Today Snapshot</p>
            <h2>今日冲刺总览</h2>
          </div>
        </div>
        <div className="summary-grid">
          <article className="summary-card">
            <span className="summary-label">剩余待办</span>
            <strong>{todayOverview.total}</strong>
          </article>
          <article className="summary-card">
            <span className="summary-label">冲刺步骤</span>
            <strong>{sprintSummary.remainingSteps}</strong>
          </article>
          <article className="summary-card">
            <span className="summary-label">今日已处理</span>
            <strong>{processedSummary.totalActions}</strong>
          </article>
        </div>
        <article className="goal-progress-card">
          <div className="goal-progress-header">
            <div>
              <span className="detail-summary-label">当前下一步</span>
              <strong>{sprintSummary.nextStepTitle}</strong>
            </div>
            <span className="post-badge">{sprintSummary.completedSteps}/{sprintSummary.totalSteps || 1}</span>
          </div>
          <p className="backup-feedback">{sprintSummary.nextStepDetail}</p>
          <div className="hero-actions">
            <button type="button" className="primary-btn compact-btn" onClick={openSprintStep}>
              {nextSprintStep ? '开始当前步骤' : '打开个人中心'}
            </button>
            <button type="button" className="secondary-btn compact-btn" onClick={onOpenProfile}>
              查看完整冲刺
            </button>
          </div>
        </article>
        <div className="profile-highlight-grid">
          <article className="detail-summary-card">
            <span className="detail-summary-label">推荐学习重点</span>
            <strong>{actionCoach.recommendedStudy?.title ?? '先回到个人中心看全局'}</strong>
            <span>
              {actionCoach.recommendedStudy?.detail ?? '当前没有明确学习优先级时，可以先从完整冲刺面板查看今天的推进顺序。'}
            </span>
            <div className="coach-card-actions">
              <button type="button" className="secondary-btn compact-btn" onClick={openRecommendedStudy}>
                {actionCoach.recommendedStudy?.ctaLabel ?? '打开个人中心'}
              </button>
            </div>
          </article>
          <article className="detail-summary-card">
            <span className="detail-summary-label">优先提醒来源</span>
            <strong>{actionCoach.recommendedReminder?.title ?? '当前没有提醒压力'}</strong>
            <span>
              {actionCoach.recommendedReminder?.detail ?? '消息和通知都比较干净，可以把注意力先放回课程推进。'}
            </span>
            <div className="coach-card-actions">
              <button type="button" className="secondary-btn compact-btn" onClick={openRecommendedReminder}>
                {actionCoach.recommendedReminder?.ctaLabel ?? '查看完整冲刺'}
              </button>
            </div>
          </article>
          <article className="detail-summary-card">
            <span className="detail-summary-label">今日完成率</span>
            <strong>{sprintSummary.totalSteps > 0 ? `${Math.round((sprintSummary.completedSteps / sprintSummary.totalSteps) * 100)}%` : '0%'}</strong>
            <span>
              {sprintSummary.remainingSteps > 0
                ? `还有 ${sprintSummary.remainingSteps} 步待完成，继续按当前顺序推进即可。`
                : '今天的冲刺步骤已经完成，可以进入日报收尾或继续自由学习。'}
            </span>
          </article>
        </div>
        <article className="wrapup-report-card">
          <span className="detail-summary-label">今日学习播报</span>
          <strong>{dailyWrapUp.headline}</strong>
          <p className="wrapup-report-body">{dailyWrapUp.body}</p>
          <div className="coach-card-actions">
            <button type="button" className="primary-btn compact-btn" onClick={onOpenProfile}>
              打开今日日报
            </button>
            <button type="button" className="secondary-btn compact-btn" onClick={handleCopyDailyWrapUp}>
              复制今日播报
            </button>
          </div>
        </article>
        {wrapUpNotice && <p className="backup-feedback">{wrapUpNotice}</p>}
      </section>

      {continueLearningCourses.length > 0 && (
        <section className="continue-learning-card">
          <div className="module-header">
            <div>
              <p className="eyebrow">Recent Study</p>
              <h2>最近学习</h2>
              <p className="backup-feedback">从这里可以继续课程，也能直接回到当前最匹配的课程资料。</p>
            </div>
          </div>
          <div className="continue-learning-grid">
            {continueLearningCourses.map((course) => (
              <article key={course.id} className="continue-learning-item">
                <span className="continue-learning-title">{course.title}</span>
                <span className="continue-learning-subtitle">{course.recentLessonLabel}</span>
                <span className="continue-learning-meta">{course.lastStudiedLabel}</span>
                {course.primaryLinkedResource && (
                  <span className="continue-learning-meta">
                    资料：{course.primaryLinkedResource.resourceTitle} · {course.primaryLinkedResource.meta}
                  </span>
                )}
                <div className="lesson-actions">
                  <button type="button" className="primary-btn compact-btn" onClick={() => onOpenCourse(course.id)}>
                    继续课程
                  </button>
                  {course.primaryLinkedResource && (
                    <button
                      type="button"
                      className="secondary-btn compact-btn"
                      onClick={() => onOpenResource(course.primaryLinkedResource!.resourceId)}
                    >
                      {course.primaryLinkedResource.ctaLabel}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {recentViewedResources.length > 0 && (
        <section className="content-card">
          <div className="module-header">
            <div>
              <p className="eyebrow">Recent Resources</p>
              <h2>最近查看资源</h2>
            </div>
          </div>
          <div className="archive-list">
            {recentViewedResources.map((resource) => (
              <button key={resource.id} type="button" className="archive-item" onClick={() => onOpenResource(resource.id)}>
                <div>
                  <p className="post-author">{resource.title}</p>
                  <p className="post-role">
                    {resource.author} · {resource.format}
                  </p>
                </div>
                <div className="archive-meta">
                  <strong>{(libraryRuntimeRecord[resource.id]?.progressPercent ?? 0) > 0 ? `${libraryRuntimeRecord[resource.id]?.progressPercent ?? 0}%` : resource.updatedAt}</strong>
                  <span>
                    {(libraryRuntimeRecord[resource.id]?.progressPercent ?? 0) > 0
                      ? `${getLibraryProgressLabel(libraryRuntimeRecord[resource.id]?.progressPercent ?? 0)} · ${
                          libraryRuntimeRecord[resource.id]?.downloaded ? '已加入离线资料夹' : '返回图书馆可继续阅读'
                        }`
                      : resource.relatedCourseId
                        ? '可联动到相关课程资料'
                        : '返回图书馆可继续查看详情与收藏状态'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="milestone-grid">
        {rebuildMilestones.map((item) => (
          <article className="milestone-card" key={item.title}>
            <p className="milestone-title">{item.title}</p>
            <p className="milestone-detail">{item.detail}</p>
          </article>
        ))}
      </section>

      <section className="panel-grid">
        {modules.map((module) => (
          <article className="module-card" key={module.id}>
            <div className="module-header">
              <h2>{module.title}</h2>
              <StatusBadge status={module.status} />
            </div>
            <p>{module.summary}</p>
          </article>
        ))}
      </section>
    </>
  );
}
