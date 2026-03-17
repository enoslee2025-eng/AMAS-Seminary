import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, Dispatch, SetStateAction } from 'react';
import { DisplayCourse, LearningOverview } from '../courses/courseState';
import {
  AppBackupPayload,
  CommunityNotification,
  CommunityPostPreview,
  ConversationPreview,
  LibraryResource,
  LibraryRuntimeRecord,
  ProfileState,
} from '../../types/app';
import { downloadAppBackup, parseAppBackupFile } from '../../services/appBackup';
import {
  buildDailyWrapUpReport,
  buildLearningActivities,
  buildPendingDiscussionTasks,
  buildProfileResourceFocus,
  buildProfileSprintPlan,
  buildProfileTodayTasks,
  createProcessedQueueLogItem,
  buildProcessedQueueRhythm,
  getLocalDateKey,
  getProfileActionCoachSummary,
  getProfileSprintSummary,
  getProfileTodayTaskOverview,
  getProcessedQueueRhythmSummary,
  getProcessedQueueSummary,
  getTodayProcessedQueueLog,
  getWeeklyGoalSummary,
  LearningActivityFilter,
  ProfileSprintStep,
  ProfileTodayTaskItem,
} from './profileState';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useProcessedQueueLog } from './useProcessedQueueLog';

const learningActivityFilterOptions: Array<{ id: LearningActivityFilter; label: string }> = [
  { id: 'all', label: '全部轨迹' },
  { id: 'course', label: '我的课程' },
  { id: 'resource', label: '我的资料' },
  { id: 'community', label: '我的讨论' },
];

const learningActivityKindLabel: Record<Exclude<LearningActivityFilter, 'all'>, string> = {
  course: '课程学习',
  resource: '资料阅读',
  community: '课程讨论',
};

const learningActivityFilterCopy: Record<LearningActivityFilter, string> = {
  all: '汇总课程学习、资料阅读和课程讨论，方便你快速回到最近的学习现场。',
  course: '这里只保留课程学习节点，适合直接回到最近推进过的课程。',
  resource: '这里只保留资料阅读记录，方便继续翻回最近打开过的资源。',
  community: '这里只保留你发布和参与过的课程讨论，方便跟进互动。',
};

const learningActivityEmptyState: Record<LearningActivityFilter, { title: string; detail: string }> = {
  all: {
    title: '还没有可汇总的学习轨迹',
    detail: '继续学习课程、阅读资料或发布课程感悟后，这里会自动生成记录。',
  },
  course: {
    title: '还没有课程学习记录',
    detail: '从课程页继续学习后，这里会自动保留你的最近学习节点。',
  },
  resource: {
    title: '还没有资料阅读记录',
    detail: '打开图书馆资源后，这里会自动汇总你的阅读轨迹。',
  },
  community: {
    title: '还没有课程讨论记录',
    detail: '发布课程感悟或参与讨论后，这里会自动同步到个人中心。',
  },
};

export function ProfileView({
  profile,
  onUpdateProfile,
  displayCourses,
  libraryRuntimeRecord,
  rebuildMilestones,
  continueLearningCourses,
  learningOverview,
  recentViewedResources,
  communityPosts,
  conversations,
  notifications,
  recentCommunityPosts,
  libraryViewedCount,
  libraryFavoriteCount,
  createBackupPayload,
  onRestoreBackup,
  onOpenCourse,
  onOpenResource,
  onOpenCommunityCourse,
  onOpenCommunityInbox,
  onQuickCompleteCourseTask,
  onMarkConversationRead,
  onMarkNotificationRead,
  onClearReminderTasks,
}: {
  profile: ProfileState;
  onUpdateProfile: Dispatch<SetStateAction<ProfileState>>;
  displayCourses: DisplayCourse[];
  libraryRuntimeRecord: LibraryRuntimeRecord;
  rebuildMilestones: Array<{ title: string; detail: string }>;
  continueLearningCourses: DisplayCourse[];
  learningOverview: LearningOverview;
  recentViewedResources: LibraryResource[];
  communityPosts: CommunityPostPreview[];
  conversations: ConversationPreview[];
  notifications: CommunityNotification[];
  recentCommunityPosts: CommunityPostPreview[];
  libraryViewedCount: number;
  libraryFavoriteCount: number;
  createBackupPayload: () => AppBackupPayload;
  onRestoreBackup: (payload: AppBackupPayload) => void;
  onOpenCourse: (courseId: string) => void;
  onOpenResource: (resourceId: string) => void;
  onOpenCommunityCourse: (courseId: string, options?: { mode?: 'feed' | 'compose'; draft?: string }) => void;
  onOpenCommunityInbox: (options?: { section?: 'conversations' | 'notifications'; conversationId?: string; notificationId?: string }) => void;
  onQuickCompleteCourseTask: (courseId: string) => void;
  onMarkConversationRead: (conversationId: string) => void;
  onMarkNotificationRead: (notificationId: string) => void;
  onClearReminderTasks: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(profile);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState<LearningActivityFilter>('all');
  const [todayQueueNotice, setTodayQueueNotice] = useState<string | null>(null);
  const [dailyWrapUpNotice, setDailyWrapUpNotice] = useState<string | null>(null);
  const [lastHandledTask, setLastHandledTask] = useState<ProfileTodayTaskItem | null>(null);
  const [processedQueueLog, , appendProcessedQueueLog] = useProcessedQueueLog();
  const [dailySprintState, setDailySprintState] = usePersistentState<{ dateKey: string; completedStepIds: string[] }>(
    'amas_profile_daily_sprint_state',
    {
      dateKey: '',
      completedStepIds: [],
    },
  );
  const importInputRef = useRef<HTMLInputElement>(null);
  const latestCourse = useMemo(() => continueLearningCourses[0] ?? null, [continueLearningCourses]);
  const profileInitials = useMemo(
    () =>
      profile.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('') || 'AM',
    [profile.name],
  );
  const learningArchive = useMemo(
    () =>
      [...displayCourses]
        .sort((left, right) => {
          const leftTime = left.runtime.lastStudiedAt ? new Date(left.runtime.lastStudiedAt).getTime() : 0;
          const rightTime = right.runtime.lastStudiedAt ? new Date(right.runtime.lastStudiedAt).getTime() : 0;
          return rightTime - leftTime;
        })
        .slice(0, 4),
    [displayCourses],
  );
  const workspaceCourses = useMemo(() => {
    if (continueLearningCourses.length > 0) {
      return continueLearningCourses.slice(0, 3);
    }

    return [...displayCourses].sort((left, right) => right.progressValue - left.progressValue).slice(0, 3);
  }, [continueLearningCourses, displayCourses]);
  const learningActivities = useMemo(
    () =>
      buildLearningActivities({
        displayCourses,
        libraryRuntimeRecord,
        communityPosts,
        profileName: profile.name,
      }),
    [communityPosts, displayCourses, libraryRuntimeRecord, profile.name],
  );
  const resourceFocusItems = useMemo(() => buildProfileResourceFocus(libraryRuntimeRecord), [libraryRuntimeRecord]);
  const todayTasks = useMemo(
    () =>
      buildProfileTodayTasks({
        displayCourses,
        conversations,
        notifications,
      }),
    [conversations, displayCourses, notifications],
  );
  const todayTaskOverview = useMemo(
    () => getProfileTodayTaskOverview(displayCourses, conversations, notifications),
    [conversations, displayCourses, notifications],
  );
  const todayProcessedItems = useMemo(() => getTodayProcessedQueueLog(processedQueueLog), [processedQueueLog]);
  const processedQueueRhythm = useMemo(() => buildProcessedQueueRhythm(processedQueueLog), [processedQueueLog]);
  const processedQueueRhythmSummary = useMemo(() => getProcessedQueueRhythmSummary(processedQueueLog), [processedQueueLog]);
  const processedQueueSummary = useMemo(() => getProcessedQueueSummary(processedQueueLog), [processedQueueLog]);
  const profileActionCoach = useMemo(
    () =>
      getProfileActionCoachSummary({
        displayCourses,
        conversations,
        notifications,
        todayOverview: todayTaskOverview,
        processedSummary: processedQueueSummary,
      }),
    [conversations, displayCourses, notifications, processedQueueSummary, todayTaskOverview],
  );
  const todayDateKey = getLocalDateKey();
  const nextTodayTask = todayTasks[0] ?? null;
  const reminderTaskCount = todayTaskOverview.unreadMessages + todayTaskOverview.unreadNotifications;
  const sprintPlan = useMemo(
    () =>
      buildProfileSprintPlan({
        recommendedCourse: profileActionCoach.recommendedCourse,
        recommendedReminder: profileActionCoach.recommendedReminder,
        nextTodayTask,
      }),
    [nextTodayTask, profileActionCoach.recommendedCourse, profileActionCoach.recommendedReminder],
  );
  const activeSprintState = dailySprintState.dateKey === todayDateKey ? dailySprintState : { dateKey: todayDateKey, completedStepIds: [] };
  const sprintSummary = useMemo(
    () => getProfileSprintSummary(sprintPlan, activeSprintState.completedStepIds),
    [activeSprintState.completedStepIds, sprintPlan],
  );
  const weeklyGoalSummary = useMemo(
    () =>
      getWeeklyGoalSummary({
        items: processedQueueLog,
        todayOverview: todayTaskOverview,
      }),
    [processedQueueLog, todayTaskOverview],
  );
  const dailyWrapUpReport = useMemo(
    () =>
      buildDailyWrapUpReport({
        profileName: profile.name,
        todayOverview: todayTaskOverview,
        processedSummary: processedQueueSummary,
        weeklyGoalSummary,
        actionCoach: profileActionCoach,
      }),
    [processedQueueSummary, profile.name, profileActionCoach, todayTaskOverview, weeklyGoalSummary],
  );
  const processedQueueRhythmPeak = useMemo(
    () => Math.max(...processedQueueRhythm.map((item) => item.totalActions), 1),
    [processedQueueRhythm],
  );
  const pendingDiscussionTasks = useMemo(
    () =>
      buildPendingDiscussionTasks({
        notifications,
        communityPosts,
        profileName: profile.name,
      }),
    [communityPosts, notifications, profile.name],
  );
  const learningActivityCounts = useMemo(
    () =>
      learningActivities.reduce(
        (summary, activity) => {
          summary[activity.kind] += 1;
          return summary;
        },
        { course: 0, resource: 0, community: 0 },
      ),
    [learningActivities],
  );
  const filteredLearningActivities = useMemo(
    () =>
      learningActivities.filter((activity) => {
        if (activityFilter === 'all') {
          return true;
        }

        return activity.kind === activityFilter;
      }),
    [activityFilter, learningActivities],
  );
  const visibleLearningActivities = useMemo(() => filteredLearningActivities.slice(0, 8), [filteredLearningActivities]);
  const visibleLearningActivityCountLabel = useMemo(() => {
    if (filteredLearningActivities.length <= visibleLearningActivities.length) {
      return `共 ${filteredLearningActivities.length} 条记录`;
    }

    return `显示最近 ${visibleLearningActivities.length} / ${filteredLearningActivities.length} 条`;
  }, [filteredLearningActivities.length, visibleLearningActivities.length]);
  const nextSprintStep = sprintPlan.find((step) => !activeSprintState.completedStepIds.includes(step.id)) ?? null;

  const openTodayTask = (task: ProfileTodayTaskItem) => {
    if (task.courseId) {
      onOpenCourse(task.courseId);
      return;
    }

    if (task.conversationId) {
      onOpenCommunityInbox({
        section: 'conversations',
        conversationId: task.conversationId,
      });
      return;
    }

    if (task.notificationId) {
      onOpenCommunityInbox({
        section: 'notifications',
        notificationId: task.notificationId,
      });
    }
  };

  const openSprintStep = (step: ProfileSprintStep) => {
    if (step.courseId) {
      onOpenCourse(step.courseId);
      return;
    }

    if (step.conversationId || step.notificationId) {
      onOpenCommunityInbox({
        section: step.conversationId ? 'conversations' : 'notifications',
        ...(step.conversationId ? { conversationId: step.conversationId } : {}),
        ...(step.notificationId ? { notificationId: step.notificationId } : {}),
      });
    }
  };

  const markSprintStepCompleted = (step: ProfileSprintStep) => {
    setDailySprintState((current) => {
      const baseState = current.dateKey === todayDateKey ? current : { dateKey: todayDateKey, completedStepIds: [] };
      if (baseState.completedStepIds.includes(step.id)) {
        return baseState;
      }

      return {
        dateKey: todayDateKey,
        completedStepIds: [...baseState.completedStepIds, step.id],
      };
    });
  };

  const markSprintStepsFromTargets = (targets: { courseId?: string; conversationId?: string; notificationId?: string }) => {
    const matchingIds = sprintPlan
      .filter((step) => {
        if (targets.courseId && step.courseId === targets.courseId) {
          return true;
        }
        if (targets.conversationId && step.conversationId === targets.conversationId) {
          return true;
        }
        if (targets.notificationId && step.notificationId === targets.notificationId) {
          return true;
        }

        return false;
      })
      .map((step) => step.id);

    if (matchingIds.length === 0) {
      return;
    }

    setDailySprintState((current) => {
      const baseState = current.dateKey === todayDateKey ? current : { dateKey: todayDateKey, completedStepIds: [] };
      return {
        dateKey: todayDateKey,
        completedStepIds: Array.from(new Set([...baseState.completedStepIds, ...matchingIds])),
      };
    });
  };

  const markReminderSprintStepsCompleted = () => {
    const matchingIds = sprintPlan
      .filter((step) => step.conversationId || step.notificationId)
      .map((step) => step.id);

    if (matchingIds.length === 0) {
      return;
    }

    setDailySprintState((current) => {
      const baseState = current.dateKey === todayDateKey ? current : { dateKey: todayDateKey, completedStepIds: [] };
      return {
        dateKey: todayDateKey,
        completedStepIds: Array.from(new Set([...baseState.completedStepIds, ...matchingIds])),
      };
    });
  };

  useEffect(() => {
    if (!todayQueueNotice) {
      return;
    }

    const cleanup = window.setTimeout(() => {
      setTodayQueueNotice(null);
    }, 2800);

    return () => {
      window.clearTimeout(cleanup);
    };
  }, [todayQueueNotice]);

  useEffect(() => {
    if (!dailyWrapUpNotice) {
      return;
    }

    const cleanup = window.setTimeout(() => {
      setDailyWrapUpNotice(null);
    }, 2400);

    return () => {
      window.clearTimeout(cleanup);
    };
  }, [dailyWrapUpNotice]);

  useEffect(() => {
    if (dailySprintState.dateKey === todayDateKey) {
      return;
    }

    setDailySprintState({
      dateKey: todayDateKey,
      completedStepIds: [],
    });
  }, [dailySprintState.dateKey, setDailySprintState, todayDateKey]);

  const handleQuickProcessTodayTask = (task: ProfileTodayTaskItem) => {
    if (task.courseId) {
      onQuickCompleteCourseTask(task.courseId);
      setTodayQueueNotice(`已将“${task.title}”推进一个课时。`);
      setLastHandledTask(task);
      markSprintStepsFromTargets({ courseId: task.courseId });
      appendProcessedQueueLog(
        createProcessedQueueLogItem({
          category: 'learning',
          title: task.title,
          detail: task.detail,
          actionLabel: '完成当前课时',
        }),
      );
      return;
    }

    if (task.conversationId) {
      onMarkConversationRead(task.conversationId);
      setTodayQueueNotice(`已清空“${task.title}”的未读消息。`);
      setLastHandledTask(task);
      markSprintStepsFromTargets({ conversationId: task.conversationId });
      appendProcessedQueueLog(
        createProcessedQueueLogItem({
          category: 'reminder',
          title: task.title,
          detail: task.detail,
          actionLabel: '清空未读',
        }),
      );
      return;
    }

    if (task.notificationId) {
      onMarkNotificationRead(task.notificationId);
      setTodayQueueNotice(`已将“${task.title}”标记为已读。`);
      setLastHandledTask(task);
      markSprintStepsFromTargets({ notificationId: task.notificationId });
      appendProcessedQueueLog(
        createProcessedQueueLogItem({
          category: 'reminder',
          title: task.title,
          detail: task.detail,
          actionLabel: '标记已读',
        }),
      );
    }
  };

  const handleStartEdit = () => {
    setDraft(profile);
    setIsEditing(true);
  };

  const handleSave = () => {
    onUpdateProfile(draft);
    setIsEditing(false);
  };

  const handleExportBackup = () => {
    const payload = createBackupPayload();

    downloadAppBackup(payload);
    setBackupError(null);
    setBackupNotice(`已导出学习存档：${new Date(payload.exportedAt).toLocaleString('zh-CN')}`);
  };

  const handleImportBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const payload = await parseAppBackupFile(file);
      onRestoreBackup(payload);
      setBackupError(null);
      setBackupNotice(`已从 ${file.name} 恢复学习存档。`);
    } catch (error) {
      setBackupNotice(null);
      setBackupError(error instanceof Error ? error.message : '导入失败，请检查备份文件。');
    } finally {
      event.target.value = '';
    }
  };

  const handleCopyDailyWrapUp = () => {
    if (!navigator.clipboard?.writeText) {
      setDailyWrapUpNotice('当前环境暂不支持直接复制，可以先手动查看下面的日报内容。');
      return;
    }

    void navigator.clipboard
      .writeText(dailyWrapUpReport.text)
      .then(() => {
        setDailyWrapUpNotice('今日日报已复制，可以直接发给团队或保存复盘。');
      })
      .catch(() => {
        setDailyWrapUpNotice('复制失败了，但日报内容已经生成在下方。');
      });
  };

  return (
    <div className="profile-layout">
      <section className="content-card profile-hero-card">
        <div className="profile-identity">
          <div className="profile-avatar">{profileInitials}</div>
          <div>
            <p className="eyebrow">Profile Recovery</p>
            <h2>{profile.name}</h2>
            <p className="profile-role">{profile.role}</p>
          </div>
        </div>
        <p className="hero-copy">{profile.bio}</p>
        <div className="profile-meta-list">
          <span>{profile.email}</span>
          <span>{profile.location}</span>
        </div>
        <div className="hero-actions">
          <button type="button" className="secondary-btn compact-btn" onClick={handleStartEdit}>
            编辑资料
          </button>
          {latestCourse && (
            <button type="button" className="primary-btn compact-btn" onClick={() => onOpenCourse(latestCourse.id)}>
              回到最近课程
            </button>
          )}
        </div>
      </section>

      {isEditing && (
        <section className="content-card profile-edit-card">
          <div className="module-header">
            <div>
              <p className="eyebrow">Edit Profile</p>
              <h2>资料编辑</h2>
            </div>
          </div>
          <div className="profile-form-grid">
            <label className="search-field" htmlFor="profile-name">
              <span>姓名</span>
              <input id="profile-name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label className="search-field" htmlFor="profile-role">
              <span>身份</span>
              <input id="profile-role" value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value }))} />
            </label>
            <label className="search-field" htmlFor="profile-email">
              <span>邮箱</span>
              <input id="profile-email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} />
            </label>
            <label className="search-field" htmlFor="profile-location">
              <span>位置</span>
              <input id="profile-location" value={draft.location} onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))} />
            </label>
            <label className="chat-input-field" htmlFor="profile-bio">
              <span>简介</span>
              <textarea
                id="profile-bio"
                rows={4}
                value={draft.bio}
                onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))}
              />
            </label>
          </div>
          <div className="chat-input-actions">
            <button type="button" className="secondary-btn compact-btn" onClick={() => setIsEditing(false)}>
              取消
            </button>
            <button type="button" className="primary-btn compact-btn" onClick={handleSave}>
              保存资料
            </button>
          </div>
        </section>
      )}

      <section className="content-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Backup Center</p>
            <h2>学习存档</h2>
          </div>
        </div>
        <p className="hero-copy">现在可以把课程进度、图书馆状态和个人资料导出成 JSON 备份，也可以从备份文件直接恢复。</p>
        <div className="hero-actions">
          <button type="button" className="secondary-btn compact-btn" onClick={handleExportBackup}>
            导出学习存档
          </button>
          <button type="button" className="primary-btn compact-btn" onClick={() => importInputRef.current?.click()}>
            导入学习存档
          </button>
        </div>
        <input ref={importInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleImportBackup} />
        <div className="detail-chip-row">
          <span className="post-badge">课程运行时 {displayCourses.length} 门</span>
          <span className="post-badge">资源已查看 {libraryViewedCount}</span>
          <span className="post-badge">资源已收藏 {libraryFavoriteCount}</span>
        </div>
        {backupNotice && <p className="backup-feedback">{backupNotice}</p>}
        {backupError && <p className="backup-feedback backup-feedback-error">{backupError}</p>}
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
          <span className="summary-label">资源已查看</span>
          <strong>{libraryViewedCount}</strong>
        </article>
      </section>

      <section className="content-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Today Queue</p>
            <h2>今日待处理</h2>
          </div>
        </div>
        <div className="detail-chip-row">
          <span className="post-badge">待处理 {todayTaskOverview.total} 项</span>
          <span className="post-badge">待完成课时 {todayTaskOverview.pendingLessons}</span>
          <span className="post-badge">未读消息 {todayTaskOverview.unreadMessages}</span>
          <span className="post-badge">未读通知 {todayTaskOverview.unreadNotifications}</span>
        </div>
        <div className="today-queue-toolbar">
          <p className="archive-section-copy">从这里可以连续处理课程推进、会话未读和通知提醒，不必先跳到别的模块。</p>
          <div className="contact-card-actions">
            {nextTodayTask && (
              <button type="button" className="primary-btn compact-btn" onClick={() => handleQuickProcessTodayTask(nextTodayTask)}>
                处理下一条
              </button>
            )}
            {nextTodayTask && (
              <button type="button" className="secondary-btn compact-btn" onClick={() => openTodayTask(nextTodayTask)}>
                打开当前首项
              </button>
            )}
            {reminderTaskCount > 0 && (
              <button
                type="button"
                className="secondary-btn compact-btn"
                onClick={() => {
                  onClearReminderTasks();
                  markReminderSprintStepsCompleted();
                  setTodayQueueNotice(`已清空 ${reminderTaskCount} 条提醒类待办。`);
                  setLastHandledTask(null);
                  appendProcessedQueueLog(
                    createProcessedQueueLogItem({
                      category: 'reminder',
                      title: '批量清空提醒类待办',
                      detail: '一次性处理了所有未读消息和未读通知。',
                      actionLabel: '批量清空',
                      impactCount: reminderTaskCount,
                    }),
                  );
                }}
              >
                清空提醒类待办
              </button>
            )}
            {lastHandledTask && (
              <button type="button" className="secondary-btn compact-btn" onClick={() => openTodayTask(lastHandledTask)}>
                回到上一条待办
              </button>
            )}
          </div>
        </div>
        {todayQueueNotice && <p className="backup-feedback">{todayQueueNotice}</p>}
        <div className="archive-list">
          {todayTasks.length > 0 ? (
            todayTasks.map((task) => (
              <article
                key={task.id}
                className={`archive-item activity-item${task.kind === 'conversation' || task.kind === 'notification' ? ' actionable-item' : ''}`}
              >
                <div>
                  <p className="post-author">{task.title}</p>
                  <p className="post-role">{task.detail}</p>
                  <div className="archive-actions">
                    <button type="button" className="secondary-btn compact-btn" onClick={() => openTodayTask(task)}>
                      打开
                    </button>
                    <button type="button" className="primary-btn compact-btn" onClick={() => handleQuickProcessTodayTask(task)}>
                      {task.kind === 'course' ? '完成当前课时' : task.kind === 'conversation' ? '清空未读' : '标记已读'}
                    </button>
                  </div>
                </div>
                <div className="archive-meta">
                  <strong>
                    {task.kind === 'course' ? '课程待办' : task.kind === 'conversation' ? '最近消息' : '通知提醒'}
                  </strong>
                  <span>{task.meta}</span>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state-card">
              <strong>今天的待处理已经清空</strong>
              <span>新的课程推进、未读消息或通知到来时，这里会自动补进待办队列。</span>
            </div>
          )}
        </div>
      </section>

      <section className="content-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Daily Sprint</p>
            <h2>今日冲刺</h2>
          </div>
        </div>
        <div className="summary-grid">
          <article className="summary-card">
            <span className="summary-label">冲刺步骤</span>
            <strong>{sprintSummary.totalSteps}</strong>
          </article>
          <article className="summary-card">
            <span className="summary-label">已完成</span>
            <strong>{sprintSummary.completedSteps}</strong>
          </article>
          <article className="summary-card">
            <span className="summary-label">剩余步骤</span>
            <strong>{sprintSummary.remainingSteps}</strong>
          </article>
        </div>
        <div className="today-queue-toolbar">
          <p className="archive-section-copy">
            {sprintSummary.totalSteps > 0
              ? `${sprintSummary.nextStepTitle}：${sprintSummary.nextStepDetail}`
              : '当前没有可生成的冲刺步骤，可以先从待办队列或课程页开始。'}
          </p>
          <div className="contact-card-actions">
            {nextSprintStep && (
              <button type="button" className="primary-btn compact-btn" onClick={() => openSprintStep(nextSprintStep)}>
                开始今日冲刺
              </button>
            )}
            {nextSprintStep && (
              <button
                type="button"
                className="secondary-btn compact-btn"
                onClick={() => {
                  markSprintStepCompleted(nextSprintStep);
                  setTodayQueueNotice(`已完成冲刺步骤：${nextSprintStep.title}`);
                }}
              >
                完成当前步骤
              </button>
            )}
          </div>
        </div>
        <div className="archive-list">
          {sprintPlan.length > 0 ? (
            sprintPlan.map((step, index) => {
              const completed = activeSprintState.completedStepIds.includes(step.id);

              return (
                <article
                  key={step.id}
                  className={`archive-item activity-item${completed ? ' completed-item static-item' : ' actionable-item'}`}
                >
                  <div>
                    <span className="coach-step-order">STEP {index + 1}</span>
                    <p className="post-author">{step.title}</p>
                    <p className="post-role">{step.detail}</p>
                    {!completed && (
                      <div className="archive-actions">
                        <button type="button" className="secondary-btn compact-btn" onClick={() => openSprintStep(step)}>
                          {step.ctaLabel}
                        </button>
                        <button
                          type="button"
                          className="primary-btn compact-btn"
                          onClick={() => {
                            markSprintStepCompleted(step);
                            setTodayQueueNotice(`已完成冲刺步骤：${step.title}`);
                          }}
                        >
                          标记完成
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="archive-meta">
                    <strong>{completed ? '已完成' : '待执行'}</strong>
                    <span>{completed ? '今天已完成这一步' : '跟着建议一步步推进'}</span>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="empty-state-card">
              <strong>当前还没有冲刺步骤</strong>
              <span>当课程推进、提醒处理或今日待办出现后，这里会自动生成一套建议顺序。</span>
            </div>
          )}
        </div>
      </section>

      <section className="content-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Action Coach</p>
            <h2>行动建议</h2>
          </div>
        </div>
        <div className="profile-highlight-grid">
          <article className="detail-summary-card">
            <span className="detail-summary-label">推荐优先课程</span>
            <strong>{profileActionCoach.recommendedCourse?.title ?? '暂时没有推荐课程'}</strong>
            <span>
              {profileActionCoach.recommendedCourse?.detail ??
                '当前没有进行中的课程待推进，可以先从新的课程学习或资料阅读开始。'}
            </span>
            {profileActionCoach.recommendedCourse && (
              <div className="coach-card-actions">
                <button
                  type="button"
                  className="primary-btn compact-btn"
                  onClick={() => onOpenCourse(profileActionCoach.recommendedCourse!.courseId)}
                >
                  {profileActionCoach.recommendedCourse.ctaLabel}
                </button>
              </div>
            )}
          </article>
          <article className="detail-summary-card">
            <span className="detail-summary-label">优先提醒来源</span>
            <strong>{profileActionCoach.recommendedReminder?.title ?? '当前没有未处理提醒'}</strong>
            <span>
              {profileActionCoach.recommendedReminder?.detail ??
                '消息和通知都已经清空，可以把注意力放回课程推进或资料整理。'}
            </span>
            {profileActionCoach.recommendedReminder && (
              <div className="coach-card-actions">
                <button
                  type="button"
                className="secondary-btn compact-btn"
                onClick={() =>
                  onOpenCommunityInbox({
                    section: profileActionCoach.recommendedReminder!.section,
                    ...(profileActionCoach.recommendedReminder?.conversationId
                      ? { conversationId: profileActionCoach.recommendedReminder.conversationId }
                      : {}),
                    ...(profileActionCoach.recommendedReminder?.notificationId
                      ? { notificationId: profileActionCoach.recommendedReminder.notificationId }
                      : {}),
                    })
                  }
                >
                  {profileActionCoach.recommendedReminder.ctaLabel}
                </button>
              </div>
            )}
          </article>
          <article className="detail-summary-card">
            <span className="detail-summary-label">今日学习总结</span>
            <strong>自动生成</strong>
            <span>{profileActionCoach.dailySummary}</span>
          </article>
        </div>
      </section>

      <section className="content-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Learning Rhythm</p>
            <h2>学习节奏</h2>
          </div>
        </div>
        <div className="summary-grid">
          <article className="summary-card">
            <span className="summary-label">连续处理</span>
            <strong>{processedQueueRhythmSummary.streakDays}</strong>
          </article>
          <article className="summary-card">
            <span className="summary-label">近 7 天动作</span>
            <strong>{processedQueueRhythmSummary.weeklyTotalActions}</strong>
          </article>
          <article className="summary-card">
            <span className="summary-label">近 7 天学习</span>
            <strong>{processedQueueRhythmSummary.weeklyLearningActions}</strong>
          </article>
          <article className="summary-card">
            <span className="summary-label">近 7 天提醒</span>
            <strong>{processedQueueRhythmSummary.weeklyReminderImpact}</strong>
          </article>
        </div>
        <p className="backup-feedback">
          {processedQueueRhythmSummary.activeDays > 0
            ? `最近 7 天有 ${processedQueueRhythmSummary.activeDays} 天保持处理节奏，峰值出现在 ${processedQueueRhythmSummary.peakLabel}。`
            : '开始处理今日待办后，这里会逐步形成你的近 7 天学习节奏。'}
        </p>
        <div className="rhythm-bar-grid">
          {processedQueueRhythm.map((point) => (
            <article key={point.dateKey} className={point.isToday ? 'rhythm-bar-card active' : 'rhythm-bar-card'}>
              <span className="rhythm-bar-label">{point.label}</span>
              <div className="rhythm-bar-track">
                <span
                  className="rhythm-bar-fill"
                  style={{
                    height: `${Math.max(
                      point.totalActions > 0
                        ? Math.round((point.totalActions / processedQueueRhythmPeak) * 100)
                        : 12,
                      12,
                    )}%`,
                  }}
                />
              </div>
              <strong>{point.totalActions}</strong>
              <span className="rhythm-bar-meta">
                学习 {point.learningActions} / 提醒 {point.reminderImpact}
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className="content-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Processed Today</p>
            <h2>今日已处理</h2>
          </div>
        </div>
        <div className="summary-grid">
          <article className="summary-card">
            <span className="summary-label">处理动作</span>
            <strong>{processedQueueSummary.totalActions}</strong>
          </article>
          <article className="summary-card">
            <span className="summary-label">影响项目</span>
            <strong>{processedQueueSummary.totalImpact}</strong>
          </article>
          <article className="summary-card">
            <span className="summary-label">学习动作</span>
            <strong>{processedQueueSummary.learningActions}</strong>
          </article>
          <article className="summary-card">
            <span className="summary-label">清空提醒</span>
            <strong>{processedQueueSummary.reminderActions}</strong>
          </article>
        </div>
        <p className="backup-feedback">
          {processedQueueSummary.totalActions > 0
            ? `最后处理时间：${processedQueueSummary.lastProcessedLabel}`
            : '从上面的待办队列开始处理后，这里会自动生成今日复盘。'}
        </p>
        <div className="archive-list">
          {todayProcessedItems.length > 0 ? (
            todayProcessedItems.slice(0, 6).map((item) => (
              <article key={item.id} className="archive-item static-item activity-item">
                <div>
                  <p className="post-author">{item.title}</p>
                  <p className="post-role">{item.detail}</p>
                </div>
                <div className="archive-meta">
                  <strong>{item.actionLabel}</strong>
                  <span>
                    {item.processedLabel}
                    {item.impactCount > 1 ? ` · ${item.impactCount} 项` : ''}
                  </span>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state-card">
              <strong>今天还没有处理记录</strong>
              <span>从上面的待办队列处理任意一项后，这里会自动生成今日小结。</span>
            </div>
          )}
        </div>
      </section>

      <section className="content-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Daily Wrap-up</p>
            <h2>结束今日学习</h2>
          </div>
        </div>
        <article className="wrapup-report-card">
          <div className="goal-progress-header">
            <div>
              <span className="detail-summary-label">今日日报</span>
              <strong>{dailyWrapUpReport.headline}</strong>
            </div>
            <span className="post-badge">{todayTaskOverview.total > 0 ? `剩余 ${todayTaskOverview.total} 项` : '今日已清空'}</span>
          </div>
          <p className="wrapup-report-body">{dailyWrapUpReport.body}</p>
          <div className="coach-card-actions">
            <button type="button" className="primary-btn compact-btn" onClick={handleCopyDailyWrapUp}>
              复制今日总结
            </button>
            {profileActionCoach.recommendedCourse && (
              <button
                type="button"
                className="secondary-btn compact-btn"
                onClick={() => onOpenCourse(profileActionCoach.recommendedCourse!.courseId)}
              >
                打开推荐课程
              </button>
            )}
            {profileActionCoach.recommendedReminder && (
              <button
                type="button"
                className="secondary-btn compact-btn"
                onClick={() =>
                  onOpenCommunityInbox({
                    section: profileActionCoach.recommendedReminder!.section,
                    ...(profileActionCoach.recommendedReminder?.conversationId
                      ? { conversationId: profileActionCoach.recommendedReminder.conversationId }
                      : {}),
                    ...(profileActionCoach.recommendedReminder?.notificationId
                      ? { notificationId: profileActionCoach.recommendedReminder.notificationId }
                      : {}),
                  })
                }
              >
                处理优先提醒
              </button>
            )}
          </div>
        </article>
        {dailyWrapUpNotice && <p className="backup-feedback">{dailyWrapUpNotice}</p>}
      </section>

      <section className="content-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Weekly Goal</p>
            <h2>本周目标</h2>
          </div>
        </div>
        <article className="goal-progress-card">
          <div className="goal-progress-header">
            <div>
              <span className="detail-summary-label">本周处理目标</span>
              <strong>{weeklyGoalSummary.weeklyCompletedActions} / {weeklyGoalSummary.weeklyTargetActions}</strong>
            </div>
            <span className="post-badge">{weeklyGoalSummary.weeklyCompletionRate}%</span>
          </div>
          <div className="progress-bar goal-progress-bar">
            <span style={{ width: `${Math.max(weeklyGoalSummary.weeklyCompletionRate, 6)}%` }} />
          </div>
          <p className="backup-feedback">
            {weeklyGoalSummary.remainingWeeklyActions > 0
              ? `离本周目标还差 ${weeklyGoalSummary.remainingWeeklyActions} 项处理动作。`
              : '本周处理目标已经完成，可以继续保持节奏。'}
          </p>
        </article>
        <div className="profile-highlight-grid">
          <article className="detail-summary-card">
            <span className="detail-summary-label">今日剩余</span>
            <strong>{weeklyGoalSummary.remainingTodayTasks}</strong>
            <span>{weeklyGoalSummary.remainingTodayTasks > 0 ? '离清空今日待办还差这些项目' : '今日待办已经清空'}</span>
          </article>
          <article className="detail-summary-card">
            <span className="detail-summary-label">本周重心</span>
            <strong>{weeklyGoalSummary.dominantCategoryLabel}</strong>
            <span>{weeklyGoalSummary.dominantCategoryDetail}</span>
          </article>
          <article className="detail-summary-card">
            <span className="detail-summary-label">下一步建议</span>
            <strong>{weeklyGoalSummary.nextStepLabel}</strong>
            <span>{weeklyGoalSummary.nextStepDetail}</span>
          </article>
        </div>
      </section>

      <section className="content-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Personal Workspace</p>
            <h2>个人工作台</h2>
          </div>
        </div>
        <div className="workspace-panel-grid">
          <article className="workspace-panel-card">
            <div className="workspace-panel-header">
              <div>
                <span className="detail-summary-label">继续推进课程</span>
                <p className="hero-copy">把最近推进过或最接近完成的课程放到前面，直接回到课时。</p>
              </div>
              <span className="post-badge">{workspaceCourses.length} 门</span>
            </div>
            <div className="workspace-action-list">
              {workspaceCourses.length > 0 ? (
                workspaceCourses.map((course) => (
                  <button key={course.id} type="button" className="workspace-action-item" onClick={() => onOpenCourse(course.id)}>
                    <div className="workspace-action-copy">
                      <strong>{course.title}</strong>
                      <span>{course.recentLessonLabel}</span>
                    </div>
                    <div className="workspace-action-side">
                      <strong>{course.progressValue}%</strong>
                      <span>{course.lastStudiedLabel}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="workspace-empty-state">
                  <strong>还没有可继续的课程</strong>
                  <span>开始任意一门课程后，这里会优先保留最近学习入口。</span>
                </div>
              )}
            </div>
          </article>

          <article className="workspace-panel-card">
            <div className="workspace-panel-header">
              <div>
                <span className="detail-summary-label">常看资料</span>
                <p className="hero-copy">优先显示你收藏过或最近查看过的资料，方便继续查阅。</p>
              </div>
              <span className="post-badge">{resourceFocusItems.length} 份</span>
            </div>
            <div className="workspace-action-list">
              {resourceFocusItems.length > 0 ? (
                resourceFocusItems.map((resource) => (
                  <button key={resource.id} type="button" className="workspace-action-item" onClick={() => onOpenResource(resource.resourceId)}>
                    <div className="workspace-action-copy">
                      <strong>{resource.title}</strong>
                      <span>{resource.detail}</span>
                    </div>
                    <div className="workspace-action-side">
                      <span>{resource.meta}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="workspace-empty-state">
                  <strong>还没有个人常看资料</strong>
                  <span>查看或收藏图书馆资源后，这里会自动生成快捷入口。</span>
                </div>
              )}
            </div>
          </article>

          <article className="workspace-panel-card">
            <div className="workspace-panel-header">
              <div>
                <span className="detail-summary-label">待跟进讨论</span>
                <p className="hero-copy">把未读互动和需要回看的课程讨论整理到一起，方便直接跟进。</p>
              </div>
              <span className="post-badge">{pendingDiscussionTasks.length} 条</span>
            </div>
            <div className="workspace-action-list">
              {pendingDiscussionTasks.length > 0 ? (
                pendingDiscussionTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className="workspace-action-item"
                    onClick={() => onOpenCommunityCourse(task.courseId)}
                  >
                    <div className="workspace-action-copy">
                      <strong>{task.title}</strong>
                      <span>{task.detail}</span>
                    </div>
                    <div className="workspace-action-side">
                      <span>{task.timeLabel}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="workspace-empty-state">
                  <strong>暂时没有待跟进互动</strong>
                  <span>新的点赞、回复或课程讨论提醒会优先出现在这里。</span>
                </div>
              )}
            </div>
          </article>
        </div>
      </section>

      <section className="content-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Learning Snapshot</p>
            <h2>最近学习概览</h2>
          </div>
        </div>
        <div className="profile-highlight-grid">
          <article className="detail-summary-card">
            <span className="detail-summary-label">最近学习课程</span>
            <strong>{learningOverview.recentCourseTitle}</strong>
            <span>由课程运行时状态自动汇总</span>
          </article>
          <article className="detail-summary-card">
            <span className="detail-summary-label">活跃模块</span>
            <strong>课程 / 校友圈</strong>
            <span>正在恢复真实可用的学习与社区链路</span>
          </article>
          <article className="detail-summary-card">
            <span className="detail-summary-label">下一步</span>
            <strong>资料与社区联动</strong>
            <span>继续让个人资料和课程、动态、聊天数据保持同步</span>
          </article>
          <article className="detail-summary-card">
            <span className="detail-summary-label">资源收藏</span>
            <strong>{libraryFavoriteCount}</strong>
            <span>图书馆状态现在会同步进入个人中心概览</span>
          </article>
        </div>
      </section>

      <section className="content-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Learning Activity</p>
            <h2>学习轨迹</h2>
          </div>
        </div>
        <div className="profile-filter-row" role="tablist" aria-label="学习轨迹筛选">
          {learningActivityFilterOptions.map((option) => {
            const count =
              option.id === 'all'
                ? learningActivities.length
                : learningActivityCounts[option.id];

            return (
              <button
                key={option.id}
                type="button"
                className={`profile-filter-chip${activityFilter === option.id ? ' active' : ''}`}
                onClick={() => setActivityFilter(option.id)}
              >
                <span>{option.label}</span>
                <strong>{count}</strong>
              </button>
            );
          })}
        </div>
        <div className="archive-section-header">
          <p className="archive-section-copy">{learningActivityFilterCopy[activityFilter]}</p>
          <span className="post-badge">{visibleLearningActivityCountLabel}</span>
        </div>
        <div className="archive-list">
          {visibleLearningActivities.length > 0 ? (
            visibleLearningActivities.map((activity) => (
              <button
                key={activity.id}
                type="button"
                className="archive-item activity-item"
                onClick={() => {
                  if (activity.resourceId) {
                    onOpenResource(activity.resourceId);
                    return;
                  }

                  if (activity.kind === 'community' && activity.courseId) {
                    onOpenCommunityCourse(activity.courseId);
                    return;
                  }

                  if (activity.courseId) {
                    onOpenCourse(activity.courseId);
                  }
                }}
              >
                <div>
                  <p className="post-author">{activity.title}</p>
                  <p className="post-role">{activity.detail}</p>
                </div>
                <div className="archive-meta">
                  <strong>{learningActivityKindLabel[activity.kind]}</strong>
                  <span>{activity.timeLabel}</span>
                </div>
              </button>
            ))
          ) : (
            <div className="empty-state-card">
              <strong>{learningActivityEmptyState[activityFilter].title}</strong>
              <span>{learningActivityEmptyState[activityFilter].detail}</span>
            </div>
          )}
        </div>
      </section>

      <section className="content-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Learning Archive</p>
            <h2>学习档案</h2>
          </div>
        </div>
        <div className="archive-list">
          {learningArchive.map((course) => (
            <button key={course.id} type="button" className="archive-item" onClick={() => onOpenCourse(course.id)}>
              <div>
                <p className="post-author">{course.title}</p>
                <p className="post-role">
                  {course.degree} · {course.instructor}
                </p>
              </div>
              <div className="archive-meta">
                <strong>{course.progressValue}%</strong>
                <span>{course.lastStudiedLabel}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="content-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Library Snapshot</p>
            <h2>资料阅读记录</h2>
          </div>
        </div>
        <div className="archive-list">
          {recentViewedResources.length > 0 ? (
            recentViewedResources.map((resource) => (
              <button key={resource.id} type="button" className="archive-item" onClick={() => onOpenResource(resource.id)}>
                <div>
                  <p className="post-author">{resource.title}</p>
                  <p className="post-role">
                    {resource.author} · {resource.format}
                  </p>
                </div>
                <div className="archive-meta">
                  <strong>{resource.updatedAt}</strong>
                  <span>{resource.relatedCourseId ? '已绑定相关课程资料' : '独立资源记录'}</span>
                </div>
              </button>
            ))
          ) : (
            <div className="empty-state-card">
              <strong>还没有最近查看资源</strong>
              <span>图书馆里的查看、下载和收藏状态会在这里汇总。</span>
            </div>
          )}
        </div>
      </section>

      <section className="content-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Recovery Timeline</p>
            <h2>恢复阶段记录</h2>
          </div>
        </div>
        <div className="timeline-list">
          {rebuildMilestones.map((milestone) => (
            <article key={milestone.title} className="timeline-item">
              <span className="timeline-step">{milestone.title}</span>
              <p>{milestone.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="continue-learning-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Continue Learning</p>
            <h2>继续学习</h2>
          </div>
        </div>
        <div className="continue-learning-grid">
          {continueLearningCourses.length > 0 ? (
            continueLearningCourses.map((course) => (
              <button key={course.id} type="button" className="continue-learning-item" onClick={() => onOpenCourse(course.id)}>
                <span className="continue-learning-title">{course.title}</span>
                <span className="continue-learning-subtitle">{course.recentLessonLabel}</span>
                <span className="continue-learning-meta">
                  {course.completedLessonsCount}/{course.syllabus.length} 课时完成 · {course.lastStudiedLabel}
                </span>
              </button>
            ))
          ) : (
            <div className="empty-state-card">
              <strong>还没有最近学习记录</strong>
              <span>先从课程模块开始，运行时状态会自动同步到这里。</span>
            </div>
          )}
        </div>
      </section>

      <section className="content-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Community Sync</p>
            <h2>最近关联动态</h2>
          </div>
        </div>
        <div className="profile-feed-list">
          {recentCommunityPosts.length > 0 ? (
            recentCommunityPosts.map((post) => (
              <article className="profile-feed-item" key={post.id}>
                <div>
                  <p className="post-author">{post.author}</p>
                  <p className="post-role">{post.role}</p>
                </div>
                <span className="course-updated">{post.time}</span>
                <p className="post-content">{post.content}</p>
              </article>
            ))
          ) : (
            <div className="empty-state-card">
              <strong>还没有社区动态</strong>
              <span>发布新的课程感悟或恢复记录后，这里会自动同步显示。</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
