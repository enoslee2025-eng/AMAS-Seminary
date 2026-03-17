import { useEffect, useState } from 'react';
import { ConversationPreview, CommunityNotification, LibraryResource } from '../../types/app';
import { StatusBadge } from '../../components/common/StatusBadge';
import { modules, rebuildMilestones } from '../../data/mockData';
import { DisplayCourse, LearningOverview } from '../courses/courseState';
import { usePersistentState } from '../../hooks/usePersistentState';
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

export function HomeView({
  profileName,
  displayCourses,
  continueLearningCourses,
  learningOverview,
  recentViewedResources,
  libraryViewedCount,
  conversations,
  notifications,
  onOpenCourse,
  onOpenResource,
  onOpenProfile,
  onOpenCommunityInbox,
}: {
  profileName: string;
  displayCourses: DisplayCourse[];
  continueLearningCourses: DisplayCourse[];
  learningOverview: LearningOverview;
  recentViewedResources: LibraryResource[];
  libraryViewedCount: number;
  conversations: ConversationPreview[];
  notifications: CommunityNotification[];
  onOpenCourse: (courseId: string) => void;
  onOpenResource: (resourceId: string) => void;
  onOpenProfile: () => void;
  onOpenCommunityInbox: (options?: { section?: 'conversations' | 'notifications'; conversationId?: string; notificationId?: string }) => void;
}) {
  const [processedQueueLog] = useProcessedQueueLog();
  const [dailySprintState] = usePersistentState<{ dateKey: string; completedStepIds: string[] }>('amas_profile_daily_sprint_state', {
    dateKey: '',
    completedStepIds: [],
  });
  const [wrapUpNotice, setWrapUpNotice] = useState<string | null>(null);
  const todayOverview = getProfileTodayTaskOverview(displayCourses, conversations, notifications);
  const processedSummary = getProcessedQueueSummary(processedQueueLog);
  const actionCoach = getProfileActionCoachSummary({
    displayCourses,
    conversations,
    notifications,
    todayOverview,
    processedSummary,
  });
  const nextTodayTask = buildProfileTodayTasks({
    displayCourses,
    conversations,
    notifications,
    limit: 1,
  })[0] ?? null;
  const sprintPlan = buildProfileSprintPlan({
    recommendedCourse: actionCoach.recommendedCourse,
    recommendedReminder: actionCoach.recommendedReminder,
    nextTodayTask,
  });
  const sprintState = dailySprintState.dateKey === getLocalDateKey() ? dailySprintState : { dateKey: getLocalDateKey(), completedStepIds: [] };
  const sprintSummary = getProfileSprintSummary(sprintPlan, sprintState.completedStepIds);
  const nextSprintStep = sprintPlan.find((step) => !sprintState.completedStepIds.includes(step.id)) ?? null;
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
      dominantCategoryLabel: actionCoach.recommendedCourse ? '学习推进优先' : '提醒处理优先',
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

    if (nextSprintStep.courseId) {
      onOpenCourse(nextSprintStep.courseId);
      return;
    }

    onOpenCommunityInbox({
      section: nextSprintStep.conversationId ? 'conversations' : 'notifications',
      ...(nextSprintStep.conversationId ? { conversationId: nextSprintStep.conversationId } : {}),
      ...(nextSprintStep.notificationId ? { notificationId: nextSprintStep.notificationId } : {}),
    });
  };

  const openRecommendedCourse = () => {
    if (actionCoach.recommendedCourse) {
      onOpenCourse(actionCoach.recommendedCourse.courseId);
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

  return (
    <>
      <section className="hero-card">
        <div>
          <p className="eyebrow">AMAS Seminary</p>
          <h2>源码恢复工作区已建立</h2>
          <p className="hero-copy">
            当前仓库已经从“只有运行包”恢复为“可继续开发”的源码工程。课程模块已经进入可交互状态，接下来会继续恢复校友圈、聊天和个人中心。
          </p>
        </div>
        <div className="hero-actions">
          <a className="primary-btn" href="./recovered/index.html">
            打开恢复快照
          </a>
          <a className="secondary-btn" href="https://github.com/new" target="_blank" rel="noreferrer">
            创建远程仓库
          </a>
        </div>
      </section>

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
          <span className="summary-label">已读资料</span>
          <strong>{learningOverview.viewedMaterialCount}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">图书馆已查看</span>
          <strong>{libraryViewedCount}</strong>
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
            <span className="detail-summary-label">推荐优先课程</span>
            <strong>{actionCoach.recommendedCourse?.title ?? '先回到个人中心看全局'}</strong>
            <span>
              {actionCoach.recommendedCourse?.detail ?? '当前没有明确课程优先级时，可以先从完整冲刺面板查看今天的推进顺序。'}
            </span>
            <div className="coach-card-actions">
              <button type="button" className="secondary-btn compact-btn" onClick={openRecommendedCourse}>
                {actionCoach.recommendedCourse?.ctaLabel ?? '打开个人中心'}
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
            </div>
          </div>
          <div className="continue-learning-grid">
            {continueLearningCourses.map((course) => (
              <button key={course.id} type="button" className="continue-learning-item" onClick={() => onOpenCourse(course.id)}>
                <span className="continue-learning-title">{course.title}</span>
                <span className="continue-learning-subtitle">{course.recentLessonLabel}</span>
                <span className="continue-learning-meta">{course.lastStudiedLabel}</span>
              </button>
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
                  <strong>{resource.updatedAt}</strong>
                  <span>{resource.relatedCourseId ? '可联动到相关课程资料' : '返回图书馆可继续查看详情与收藏状态'}</span>
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
