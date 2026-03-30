import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, SetStateAction } from 'react';
import { DisplayCourse, LearningOverview } from '../courses/courseState';
import {
  AppBackupPayload,
  CommunityNotification,
  CommunityPostPreview,
  ConversationPreview,
  LibraryResource,
  LibraryRuntimeRecord,
  ProfileState,
  WorkspaceSessionProbeHistoryItem,
  WorkspaceSessionProbeStatus,
  WorkspaceStatus,
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
import { useScopedPersistentState } from '../../hooks/usePersistentState';
import { useProcessedQueueLog } from './useProcessedQueueLog';
import { getLibraryProgressLabel } from '../library/libraryState';

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

type PendingReplayHistoryFilter = 'all' | 'success' | 'error' | 'network' | 'authentication' | 'remote';

const pendingReplayHistoryFilterOptions: Array<{ id: PendingReplayHistoryFilter; label: string }> = [
  { id: 'all', label: '全部记录' },
  { id: 'error', label: '失败项' },
  { id: 'success', label: '成功项' },
  { id: 'network', label: '网络异常' },
  { id: 'authentication', label: '登录过期' },
  { id: 'remote', label: '远端写入' },
];

const pendingReplayFailureKindLabel: Record<'network' | 'authentication' | 'remote', string> = {
  network: '网络异常',
  authentication: '登录过期',
  remote: '远端写入',
};

const workspaceProbeToneLabel: Record<WorkspaceSessionProbeHistoryItem['tone'], string> = {
  healthy: '探活正常',
  warning: '即将过期',
  unreachable: '远端未响应',
  expired: '登录已过期',
};

type WorkspaceProbeHistoryFilter = 'all' | 'healthy' | 'warning' | 'unreachable' | 'expired' | 'auto' | 'manual';

const workspaceProbeHistoryFilterOptions: Array<{ id: WorkspaceProbeHistoryFilter; label: string }> = [
  { id: 'all', label: '全部探活' },
  { id: 'healthy', label: '探活正常' },
  { id: 'warning', label: '即将过期' },
  { id: 'unreachable', label: '远端未响应' },
  { id: 'expired', label: '登录过期' },
  { id: 'auto', label: '自动探活' },
  { id: 'manual', label: '手动检查' },
];

function formatPendingReplayTimestamp(value: string) {
  return new Date(value).toLocaleString('zh-CN');
}

export function ProfileView({
  profile,
  storageScopeKey,
  onUpdateProfile,
  workspaceStatus,
  workspaceSessionProbeStatus,
  workspaceSessionProbeHistoryItems,
  workspaceModeLabel,
  workspaceReason,
  workspaceLastSyncedAt,
  workspacePendingSync,
  pendingAuthReplayCount,
  pendingAuthReplayItems,
  pendingAuthReplayHistoryItems,
  pendingAuthReplayStatus,
  isReplayingPendingAuthQueue = false,
  isCheckingWorkspaceSession = false,
  isRefreshingWorkspaceSession = false,
  onRetryWorkspaceSync,
  onCheckWorkspaceSession,
  onRefreshWorkspaceSession,
  onClearWorkspaceSessionProbeHistory,
  onReplayPendingAuthQueue,
  onClearPendingAuthReplayQueue,
  onRetryPendingAuthReplayHistoryItem,
  onClearSuccessfulPendingAuthReplayHistory,
  onClearPendingAuthReplayHistory,
  isRetryingWorkspaceSync = false,
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
  onQuickAdvanceLibraryTask,
  onMarkConversationRead,
  onMarkNotificationRead,
  onClearReminderTasks,
  onLogout,
}: {
  profile: ProfileState;
  storageScopeKey: string;
  onUpdateProfile: (value: SetStateAction<ProfileState>) => Promise<void>;
  workspaceStatus: WorkspaceStatus | null;
  workspaceSessionProbeStatus: WorkspaceSessionProbeStatus | null;
  workspaceSessionProbeHistoryItems: WorkspaceSessionProbeHistoryItem[];
  workspaceModeLabel: string;
  workspaceReason: string;
  workspaceLastSyncedAt: string | null;
  workspacePendingSync: boolean;
  pendingAuthReplayCount: number;
  pendingAuthReplayItems: Array<{ id: string; title: string; detail: string }>;
  pendingAuthReplayHistoryItems: Array<{
    id: string;
    outcome: 'success' | 'error';
    failureKind: 'network' | 'authentication' | 'remote' | null;
    trigger: 'auto' | 'manual';
    title: string;
    detail: string;
    message: string;
    processedAt: string;
    retryable: boolean;
  }>;
  pendingAuthReplayStatus: { tone: 'syncing' | 'success' | 'error'; message: string } | null;
  isReplayingPendingAuthQueue?: boolean;
  isCheckingWorkspaceSession?: boolean;
  isRefreshingWorkspaceSession?: boolean;
  onRetryWorkspaceSync: () => void;
  onCheckWorkspaceSession: () => void;
  onRefreshWorkspaceSession: () => void;
  onClearWorkspaceSessionProbeHistory: () => void;
  onReplayPendingAuthQueue: () => void;
  onClearPendingAuthReplayQueue: () => void;
  onRetryPendingAuthReplayHistoryItem: (historyId: string) => void;
  onClearSuccessfulPendingAuthReplayHistory: () => void;
  onClearPendingAuthReplayHistory: () => void;
  isRetryingWorkspaceSync?: boolean;
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
  onRestoreBackup: (payload: AppBackupPayload) => Promise<void>;
  onOpenCourse: (courseId: string) => void;
  onOpenResource: (resourceId: string) => void;
  onOpenCommunityCourse: (courseId: string, options?: { mode?: 'feed' | 'compose'; draft?: string }) => void;
  onOpenCommunityInbox: (options?: { section?: 'conversations' | 'notifications'; conversationId?: string; notificationId?: string }) => void;
  onQuickCompleteCourseTask: (courseId: string) => void;
  onQuickAdvanceLibraryTask: (resourceId: string) => void;
  onMarkConversationRead: (conversationId: string) => void;
  onMarkNotificationRead: (notificationId: string) => void;
  onClearReminderTasks: () => void;
  onLogout: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(profile);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [profileSaveNotice, setProfileSaveNotice] = useState<string | null>(null);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [activityFilter, setActivityFilter] = useScopedPersistentState<LearningActivityFilter>(
    'amas_profile_activity_filter',
    storageScopeKey,
    'all',
  );
  const [pendingReplayHistoryFilter, setPendingReplayHistoryFilter] = useScopedPersistentState<PendingReplayHistoryFilter>(
    'amas_profile_pending_replay_history_filter',
    storageScopeKey,
    'all',
  );
  const [workspaceProbeHistoryFilter, setWorkspaceProbeHistoryFilter] = useScopedPersistentState<WorkspaceProbeHistoryFilter>(
    'amas_profile_workspace_probe_history_filter',
    storageScopeKey,
    'all',
  );
  const [todayQueueNotice, setTodayQueueNotice] = useState<string | null>(null);
  const [dailyWrapUpNotice, setDailyWrapUpNotice] = useState<string | null>(null);
  const [lastHandledTask, setLastHandledTask] = useState<ProfileTodayTaskItem | null>(null);
  const [processedQueueLog, , appendProcessedQueueLog] = useProcessedQueueLog(storageScopeKey);
  const [dailySprintState, setDailySprintState] = useScopedPersistentState<{ dateKey: string; completedStepIds: string[] }>(
    'amas_profile_daily_sprint_state',
    storageScopeKey,
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
          const leftTime = left.lastActivityAt ? new Date(left.lastActivityAt).getTime() : 0;
          const rightTime = right.lastActivityAt ? new Date(right.lastActivityAt).getTime() : 0;
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
        libraryRuntimeRecord,
        conversations,
        notifications,
      }),
    [conversations, displayCourses, libraryRuntimeRecord, notifications],
  );
  const todayTaskOverview = useMemo(
    () => getProfileTodayTaskOverview(displayCourses, libraryRuntimeRecord, conversations, notifications),
    [conversations, displayCourses, libraryRuntimeRecord, notifications],
  );
  const todayProcessedItems = useMemo(() => getTodayProcessedQueueLog(processedQueueLog), [processedQueueLog]);
  const processedQueueRhythm = useMemo(() => buildProcessedQueueRhythm(processedQueueLog), [processedQueueLog]);
  const processedQueueRhythmSummary = useMemo(() => getProcessedQueueRhythmSummary(processedQueueLog), [processedQueueLog]);
  const processedQueueSummary = useMemo(() => getProcessedQueueSummary(processedQueueLog), [processedQueueLog]);
  const profileActionCoach = useMemo(
    () =>
      getProfileActionCoachSummary({
        displayCourses,
        libraryRuntimeRecord,
        conversations,
        notifications,
        todayOverview: todayTaskOverview,
        processedSummary: processedQueueSummary,
      }),
    [conversations, displayCourses, libraryRuntimeRecord, notifications, processedQueueSummary, todayTaskOverview],
  );
  const todayDateKey = getLocalDateKey();
  const nextTodayTask = todayTasks[0] ?? null;
  const reminderTaskCount = todayTaskOverview.unreadMessages + todayTaskOverview.unreadNotifications;
  const sprintPlan = useMemo(
    () =>
      buildProfileSprintPlan({
        recommendedStudy: profileActionCoach.recommendedStudy,
        recommendedReminder: profileActionCoach.recommendedReminder,
        nextTodayTask,
      }),
    [nextTodayTask, profileActionCoach.recommendedReminder, profileActionCoach.recommendedStudy],
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
  const workspaceToneLabel = workspaceStatus
    ? {
        local: '本地工作区',
        connected: '远端已连接',
        bootstrapped: '远端已补齐',
        degraded: '远端已降级',
        expired: '会话已过期',
      }[workspaceStatus.tone]
    : '等待同步';
  const workspaceLastSyncedLabel = workspaceLastSyncedAt
    ? new Date(workspaceLastSyncedAt).toLocaleString('zh-CN')
    : '尚未完成同步';
  const workspaceProbeLabel = workspaceSessionProbeStatus
    ? {
        healthy: '远端已确认',
        warning: '即将过期',
        checking: '探活中',
        unreachable: '探活失败',
        expired: '登录已过期',
      }[workspaceSessionProbeStatus.tone]
    : '等待探活';
  const workspaceProbeTimeLabel = workspaceSessionProbeStatus?.checkedAt
    ? formatPendingReplayTimestamp(workspaceSessionProbeStatus.checkedAt)
    : '尚未完成远端登录态探测';
  const workspaceStatusDetail = workspacePendingSync
    ? '离线期间产生的核心学习变更正在等待回推到远端工作区。'
    : pendingAuthReplayCount > 0
      ? `当前有 ${pendingAuthReplayCount} 项核心学习动作在等待重新登录后补发到远端。`
    : workspaceStatus?.detail ?? '当前正在使用统一服务层管理账号、资料、课程进度和图书馆状态。';
  const pendingReplayHistorySummary = useMemo(() => {
    return pendingAuthReplayHistoryItems.reduce(
      (summary, item) => {
        summary.total += 1;
        summary[item.outcome] += 1;
        summary[item.trigger] += 1;
        return summary;
      },
      {
        total: 0,
        success: 0,
        error: 0,
        manual: 0,
        auto: 0,
      },
    );
  }, [pendingAuthReplayHistoryItems]);
  const workspaceProbeHistorySummary = useMemo(() => {
    return workspaceSessionProbeHistoryItems.reduce(
      (summary, item) => {
        summary.total += 1;
        summary[item.tone] += 1;
        summary[item.trigger] += 1;
        return summary;
      },
      {
        total: 0,
        healthy: 0,
        warning: 0,
        unreachable: 0,
        expired: 0,
        auto: 0,
        manual: 0,
      },
    );
  }, [workspaceSessionProbeHistoryItems]);
  const filteredWorkspaceProbeHistoryItems = useMemo(
    () =>
      workspaceSessionProbeHistoryItems.filter((item) => {
        if (workspaceProbeHistoryFilter === 'all') {
          return true;
        }

        if (workspaceProbeHistoryFilter === 'auto' || workspaceProbeHistoryFilter === 'manual') {
          return item.trigger === workspaceProbeHistoryFilter;
        }

        return item.tone === workspaceProbeHistoryFilter;
      }),
    [workspaceProbeHistoryFilter, workspaceSessionProbeHistoryItems],
  );
  const latestReplayResult = useMemo(
    () => pendingAuthReplayHistoryItems[0] ?? null,
    [pendingAuthReplayHistoryItems],
  );
  const latestReplaySuccess = useMemo(
    () => pendingAuthReplayHistoryItems.find((item) => item.outcome === 'success') ?? null,
    [pendingAuthReplayHistoryItems],
  );
  const latestReplayError = useMemo(
    () => pendingAuthReplayHistoryItems.find((item) => item.outcome === 'error') ?? null,
    [pendingAuthReplayHistoryItems],
  );
  const hasSuccessfulPendingReplayHistory = useMemo(
    () => pendingAuthReplayHistoryItems.some((item) => item.outcome === 'success'),
    [pendingAuthReplayHistoryItems],
  );
  const workspaceRecoveryGuidance = useMemo(() => {
    if (workspaceStatus?.tone === 'expired') {
      return '先重新登录，再回到这里执行补发；失败项也可以直接从历史里重新加入队列。';
    }

    if (workspaceSessionProbeStatus?.tone === 'warning') {
      return '远端会话已经接近过期，系统会优先尝试自动延长；如果仍保持预警，再手动点“延长远端会话”或重新登录会更稳。';
    }

    if (workspaceStatus?.tone === 'degraded') {
      return '先点“重新同步工作区”确认远端已经恢复，再执行待补发动作会更稳。';
    }

    if (workspaceProbeHistorySummary.expired > 0) {
      return '最近探活已经出现登录过期，先重新登录并确认远端会话稳定，再继续课程和资料同步会更安全。';
    }

    if (workspaceProbeHistorySummary.warning > 0) {
      return '最近探活已经提示过会话接近过期，建议在下一轮核心学习动作前先重新登录，避免同步中断。';
    }

    if (workspaceProbeHistorySummary.unreachable > 1) {
      return '最近多次探活没有拿到远端响应，说明远端连接可能不稳定；建议先观察探活记录，再决定是否立即补发。';
    }

    if (latestReplayError?.failureKind === 'network') {
      return '最近失败主要是网络异常，优先恢复远端连接；连接恢复后可手动补发，也可等待系统自动补发。';
    }

    if (latestReplayError?.failureKind === 'authentication') {
      return '最近失败主要是登录态过期，重新登录后再补发即可；如果仍失败，再从历史项单独重试。';
    }

    if (latestReplayError?.failureKind === 'remote') {
      return '最近失败来自远端写入响应，建议稍后重试；若持续失败，需要继续检查后端返回内容。';
    }

    if (pendingAuthReplayCount > 0) {
      return '当前待补发队列已经准备好，可以手动立即补发，也可以保持页面让系统自动恢复。';
    }

    if (workspaceProbeHistorySummary.healthy > 0) {
      return '最近探活记录保持正常，当前远端工作区处于相对稳定状态，可以继续推进核心学习操作。';
    }

    if (pendingReplayHistorySummary.total > 0) {
      return '最近补发结果已经沉淀到历史区，可按成功/失败筛选复盘，确认工作区恢复是否稳定。';
    }

    return '当前工作区补发链路运行正常，后续只需要关注远端连接和登录态是否持续稳定。';
  }, [
    latestReplayError?.failureKind,
    pendingAuthReplayCount,
    pendingReplayHistorySummary.total,
    workspaceSessionProbeStatus?.tone,
    workspaceProbeHistorySummary.expired,
    workspaceProbeHistorySummary.healthy,
    workspaceProbeHistorySummary.warning,
    workspaceProbeHistorySummary.unreachable,
    workspaceStatus?.tone,
  ]);
  const recentReplayStatusCards = useMemo(() => {
    const latestResultCard = latestReplayResult
      ? {
          id: 'latest-result',
          label: '最近一次补发',
          title: latestReplayResult.title,
          detail: `${latestReplayResult.outcome === 'success' ? '恢复成功' : '恢复失败'} · ${
            latestReplayResult.trigger === 'manual' ? '手动补发' : '自动补发'
          } · ${formatPendingReplayTimestamp(latestReplayResult.processedAt)}`,
          tone: latestReplayResult.outcome,
        }
      : {
          id: 'latest-result',
          label: '最近一次补发',
          title: '暂无补发记录',
          detail: '第一次补发后，这里会显示最近恢复结果。',
          tone: 'neutral' as const,
        };
    const latestFocusCard = latestReplayError
      ? {
          id: 'latest-error',
          label: '最近一次异常',
          title: latestReplayError.failureKind ? pendingReplayFailureKindLabel[latestReplayError.failureKind] : latestReplayError.title,
          detail: `${latestReplayError.message} · ${formatPendingReplayTimestamp(latestReplayError.processedAt)}`,
          tone: 'error' as const,
        }
      : latestReplaySuccess
        ? {
            id: 'latest-success',
            label: '最近一次稳定恢复',
            title: latestReplaySuccess.title,
            detail: `${latestReplaySuccess.message} · ${formatPendingReplayTimestamp(latestReplaySuccess.processedAt)}`,
            tone: 'success' as const,
          }
        : {
            id: 'latest-success',
            label: '最近一次稳定恢复',
            title: '暂无成功记录',
            detail: '补发成功后，这里会保留最近一次稳定恢复信息。',
            tone: 'neutral' as const,
          };

    return [latestResultCard, latestFocusCard];
  }, [latestReplayError, latestReplayResult, latestReplaySuccess]);
  const filteredPendingReplayHistoryItems = useMemo(
    () =>
      pendingAuthReplayHistoryItems.filter((item) => {
        if (pendingReplayHistoryFilter === 'all') {
          return true;
        }

        if (pendingReplayHistoryFilter === 'success' || pendingReplayHistoryFilter === 'error') {
          return item.outcome === pendingReplayHistoryFilter;
        }

        return item.failureKind === pendingReplayHistoryFilter;
      }),
    [pendingAuthReplayHistoryItems, pendingReplayHistoryFilter],
  );

  const openTodayTask = (task: ProfileTodayTaskItem) => {
    if (task.entryTarget === 'resource' && task.resourceId) {
      onOpenResource(task.resourceId);
      return;
    }

    if (task.courseId) {
      onOpenCourse(task.courseId);
      return;
    }

    if (task.resourceId) {
      onOpenResource(task.resourceId);
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
    if (step.entryTarget === 'resource' && step.resourceId) {
      onOpenResource(step.resourceId);
      return;
    }

    if (step.courseId) {
      onOpenCourse(step.courseId);
      return;
    }

    if (step.resourceId) {
      onOpenResource(step.resourceId);
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

  const markSprintStepsFromTargets = (targets: { courseId?: string; resourceId?: string; conversationId?: string; notificationId?: string }) => {
    const matchingIds = sprintPlan
      .filter((step) => {
        if (targets.courseId && step.courseId === targets.courseId) {
          return true;
        }
        if (targets.resourceId && step.resourceId === targets.resourceId) {
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

  const isResourceEntryTodayTask = (task: ProfileTodayTaskItem) => task.entryTarget === 'resource' && Boolean(task.resourceId);

  const getTodayTaskQuickActionLabel = (task: ProfileTodayTaskItem) => {
    if (task.kind === 'course') {
      return isResourceEntryTodayTask(task) ? '推进资料进度' : '完成当前课时';
    }

    if (task.kind === 'resource') {
      return '推进进度';
    }

    if (task.kind === 'conversation') {
      return '清空未读';
    }

    return '标记已读';
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
    if (!profileSaveNotice && !profileSaveError) {
      return;
    }

    const cleanup = window.setTimeout(() => {
      setProfileSaveNotice(null);
      setProfileSaveError(null);
    }, 2400);

    return () => {
      window.clearTimeout(cleanup);
    };
  }, [profileSaveError, profileSaveNotice]);

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
    if (task.entryTarget === 'resource' && task.resourceId) {
      onQuickAdvanceLibraryTask(task.resourceId);
      setTodayQueueNotice(
        task.kind === 'course' ? `已通过资料推进“${task.title}”。` : `已推进“${task.title}”的阅读进度。`,
      );
      setLastHandledTask(task);
      markSprintStepsFromTargets({
        ...(task.courseId ? { courseId: task.courseId } : {}),
        resourceId: task.resourceId,
      });
      appendProcessedQueueLog(
        createProcessedQueueLogItem({
          category: 'learning',
          title: task.title,
          detail: task.detail,
          actionLabel: task.kind === 'course' ? '推进资料进度' : '推进进度',
        }),
      );
      return;
    }

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

    if (task.resourceId) {
      onQuickAdvanceLibraryTask(task.resourceId);
      setTodayQueueNotice(`已推进“${task.title}”的阅读进度。`);
      setLastHandledTask(task);
      markSprintStepsFromTargets({ resourceId: task.resourceId });
      appendProcessedQueueLog(
        createProcessedQueueLogItem({
          category: 'learning',
          title: task.title,
          detail: task.detail,
          actionLabel: '推进进度',
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

  const openRecommendedStudy = () => {
    if (profileActionCoach.recommendedStudy?.entryTarget === 'resource' && profileActionCoach.recommendedStudy.resourceId) {
      onOpenResource(profileActionCoach.recommendedStudy.resourceId);
      return;
    }

    if (profileActionCoach.recommendedStudy?.courseId) {
      onOpenCourse(profileActionCoach.recommendedStudy.courseId);
      return;
    }

    if (profileActionCoach.recommendedStudy?.resourceId) {
      onOpenResource(profileActionCoach.recommendedStudy.resourceId);
      return;
    }
  };

  const handleStartEdit = () => {
    setDraft(profile);
    setIsEditing(true);
  };

  const handleSave = async () => {
    setIsSavingProfile(true);
    setProfileSaveError(null);

    try {
      await onUpdateProfile(draft);
      setProfileSaveNotice('资料已保存，当前工作区状态已更新。');
      setIsEditing(false);
    } catch {
      setProfileSaveError('资料保存失败，请稍后重试。');
    } finally {
      setIsSavingProfile(false);
    }
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
      await onRestoreBackup(payload);
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
          <button type="button" className="secondary-btn compact-btn" onClick={onLogout}>
            退出登录
          </button>
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
            <button type="button" className="primary-btn compact-btn" onClick={() => void handleSave()} disabled={isSavingProfile}>
              {isSavingProfile ? '保存中...' : '保存资料'}
            </button>
          </div>
          {profileSaveNotice && <p className="backup-feedback">{profileSaveNotice}</p>}
          {profileSaveError && <p className="backup-feedback backup-feedback-error">{profileSaveError}</p>}
        </section>
      )}

      <section className="content-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Backup Center</p>
            <h2>学习存档</h2>
          </div>
        </div>
        <p className="hero-copy">现在可以把个人资料、课程进度、图书馆状态和社区数据导出成 JSON 备份，也可以从备份文件直接恢复。</p>
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
          <span className="post-badge">社区动态 {communityPosts.length} 条</span>
          <span className="post-badge">会话 {conversations.length} 个</span>
          <span className="post-badge">通知 {notifications.length} 条</span>
        </div>
        {backupNotice && <p className="backup-feedback">{backupNotice}</p>}
        {backupError && <p className="backup-feedback backup-feedback-error">{backupError}</p>}
      </section>

      <section className="content-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Workspace Sync</p>
            <h2>工作区同步</h2>
          </div>
          <div className="detail-chip-row">
            <span className="post-badge">{workspaceModeLabel}</span>
            {workspacePendingSync && <span className="post-badge">待回推远端</span>}
            {pendingAuthReplayCount > 0 && <span className="post-badge">待补发 {pendingAuthReplayCount} 项</span>}
          </div>
        </div>
        <p className="hero-copy">
          {workspaceStatusDetail}
        </p>
        <div className="detail-summary-row">
          <article className="detail-summary-card">
            <span className="detail-summary-label">当前状态</span>
            <strong>{workspaceToneLabel}</strong>
            <span>{workspaceStatus?.title ?? '等待工作区初始化'}</span>
          </article>
          <article className="detail-summary-card">
            <span className="detail-summary-label">最近同步</span>
            <strong>{workspaceLastSyncedLabel}</strong>
            <span>
              {workspacePendingSync
                ? '等待下次连上远端后自动补同步。'
                : workspaceStatus?.tone === 'degraded'
                  ? '当前显示的是最近一次可用快照。'
                  : workspaceStatus?.tone === 'expired'
                    ? '请重新登录后再继续写回远端核心学习状态。'
                  : '核心学习状态会按当前工作区持续写回。'}
            </span>
          </article>
          <article className="detail-summary-card">
            <span className="detail-summary-label">连接来源</span>
            <strong>{workspaceModeLabel}</strong>
            <span>{workspaceReason}</span>
          </article>
          <article className="detail-summary-card">
            <span className="detail-summary-label">远端探活</span>
            <strong>{workspaceProbeLabel}</strong>
            <span>
              {workspaceSessionProbeStatus
                ? `${workspaceSessionProbeStatus.detail} · ${workspaceProbeTimeLabel}`
                : workspaceProbeTimeLabel}
            </span>
          </article>
        </div>
        <div className="pending-replay-summary-grid">
          <article className="detail-summary-card">
            <span className="detail-summary-label">补发历史</span>
            <strong>{pendingReplayHistorySummary.total}</strong>
            <span>最近记录总数</span>
          </article>
          <article className="detail-summary-card">
            <span className="detail-summary-label">成功 / 失败</span>
            <strong>{pendingReplayHistorySummary.success} / {pendingReplayHistorySummary.error}</strong>
            <span>便于快速判断稳定度</span>
          </article>
          <article className="detail-summary-card">
            <span className="detail-summary-label">自动 / 手动</span>
            <strong>{pendingReplayHistorySummary.auto} / {pendingReplayHistorySummary.manual}</strong>
            <span>最近补发触发来源</span>
          </article>
        </div>
        {workspaceSessionProbeHistoryItems.length > 0 && (
          <>
            <div className="pending-replay-summary-grid">
              <article className="detail-summary-card">
                <span className="detail-summary-label">探活记录</span>
                <strong>{workspaceProbeHistorySummary.total}</strong>
                <span>最近探活总数</span>
              </article>
              <article className="detail-summary-card">
                <span className="detail-summary-label">稳定 / 风险</span>
                <strong>
                  {workspaceProbeHistorySummary.healthy} / {workspaceProbeHistorySummary.warning + workspaceProbeHistorySummary.unreachable + workspaceProbeHistorySummary.expired}
                </strong>
                <span>风险包含即将过期、未响应和已过期</span>
              </article>
              <article className="detail-summary-card">
                <span className="detail-summary-label">自动 / 手动</span>
                <strong>{workspaceProbeHistorySummary.auto} / {workspaceProbeHistorySummary.manual}</strong>
                <span>最近探活触发来源</span>
              </article>
            </div>
            <div className="workspace-probe-history-section">
              <div className="module-header">
                <div>
                  <p className="eyebrow">Remote Probe History</p>
                  <h3>远端探活记录</h3>
                </div>
              </div>
              <div className="pending-replay-history-toolbar">
                <div className="detail-chip-row">
                  {workspaceProbeHistoryFilterOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={workspaceProbeHistoryFilter === option.id ? 'profile-filter-chip active' : 'profile-filter-chip'}
                      onClick={() => setWorkspaceProbeHistoryFilter(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="pending-replay-history-toolbar-actions">
                  <button
                    type="button"
                    className="secondary-btn compact-btn"
                    onClick={onClearWorkspaceSessionProbeHistory}
                    disabled={isCheckingWorkspaceSession}
                  >
                    清空探活记录
                  </button>
                </div>
              </div>
              <div className="workspace-probe-history">
                {filteredWorkspaceProbeHistoryItems.map((item) => (
                  <article key={item.id} className={`workspace-probe-history-card ${item.tone}`}>
                    <div className="workspace-probe-history-meta">
                      <strong>{item.title}</strong>
                      <span>
                        {workspaceProbeToneLabel[item.tone]} · {item.trigger === 'manual' ? '手动检查' : '自动探活'}
                      </span>
                    </div>
                    <p>{item.detail}</p>
                    <span className="pending-replay-history-time">{formatPendingReplayTimestamp(item.checkedAt)}</span>
                  </article>
                ))}
                {filteredWorkspaceProbeHistoryItems.length === 0 && (
                  <p className="backup-feedback">当前筛选条件下还没有远端探活记录。</p>
                )}
              </div>
            </div>
          </>
        )}
        <div className="workspace-guidance-card">
          <span className="detail-summary-label">恢复建议</span>
          <p>{workspaceRecoveryGuidance}</p>
        </div>
        <div className="recent-recovery-grid">
          {recentReplayStatusCards.map((item) => (
            <article key={item.id} className={`detail-summary-card recent-recovery-card ${item.tone}`}>
              <span className="detail-summary-label">{item.label}</span>
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
            </article>
          ))}
        </div>
        <div className="hero-actions">
          <button type="button" className="secondary-btn compact-btn" onClick={onRetryWorkspaceSync} disabled={isRetryingWorkspaceSync}>
            {isRetryingWorkspaceSync ? '重新同步中...' : '重新同步工作区'}
          </button>
          {workspaceModeLabel === '远端模式' && (
            <button
              type="button"
              className="primary-btn compact-btn"
              onClick={onRefreshWorkspaceSession}
              disabled={
                workspaceSessionProbeStatus?.tone !== 'warning' ||
                isRefreshingWorkspaceSession ||
                isCheckingWorkspaceSession ||
                isRetryingWorkspaceSync ||
                workspaceStatus?.tone === 'expired'
              }
            >
              {isRefreshingWorkspaceSession ? '延长中...' : '延长远端会话'}
            </button>
          )}
          {workspaceModeLabel === '远端模式' && (
            <button
              type="button"
              className="secondary-btn compact-btn"
              onClick={onCheckWorkspaceSession}
              disabled={isCheckingWorkspaceSession || isRetryingWorkspaceSync || isRefreshingWorkspaceSession || workspaceStatus?.tone === 'expired'}
            >
              {isCheckingWorkspaceSession ? '检查中...' : '检查远端登录态'}
            </button>
          )}
          {pendingAuthReplayCount > 0 && (
            <button
              type="button"
              className="primary-btn compact-btn"
              onClick={onReplayPendingAuthQueue}
              disabled={isReplayingPendingAuthQueue || isRetryingWorkspaceSync || workspaceStatus?.tone === 'expired'}
            >
              {isReplayingPendingAuthQueue ? '补发中...' : '立即补发待同步动作'}
            </button>
          )}
          {pendingAuthReplayCount > 0 && (
            <button
              type="button"
              className="secondary-btn compact-btn"
              onClick={onClearPendingAuthReplayQueue}
              disabled={isReplayingPendingAuthQueue || isRetryingWorkspaceSync}
            >
              清空待补发队列
            </button>
          )}
        </div>
        {pendingAuthReplayItems.length > 0 && (
          <div className="pending-replay-list">
            {pendingAuthReplayItems.map((item) => (
              <article key={item.id} className="pending-replay-card">
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        )}
        {pendingAuthReplayHistoryItems.length > 0 && (
          <div className="pending-replay-history-section">
            <div className="pending-replay-history-toolbar">
              <div className="detail-chip-row">
                {pendingReplayHistoryFilterOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={pendingReplayHistoryFilter === option.id ? 'profile-filter-chip active' : 'profile-filter-chip'}
                    onClick={() => setPendingReplayHistoryFilter(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="pending-replay-history-toolbar-actions">
                {hasSuccessfulPendingReplayHistory && (
                  <button
                    type="button"
                    className="secondary-btn compact-btn"
                    onClick={onClearSuccessfulPendingAuthReplayHistory}
                    disabled={isReplayingPendingAuthQueue}
                  >
                    清理成功记录
                  </button>
                )}
                <button
                  type="button"
                  className="secondary-btn compact-btn"
                  onClick={onClearPendingAuthReplayHistory}
                  disabled={isReplayingPendingAuthQueue}
                >
                  清空全部历史
                </button>
              </div>
            </div>
            <div className="pending-replay-history">
              {filteredPendingReplayHistoryItems.map((item) => (
              <article
                key={item.id}
                className={item.outcome === 'success' ? 'pending-replay-history-card success' : 'pending-replay-history-card error'}
              >
                <div className="pending-replay-history-meta">
                  <strong>{item.title}</strong>
                  <span>
                    {item.trigger === 'manual' ? '手动补发' : '自动补发'}
                    {item.failureKind ? ` · ${pendingReplayFailureKindLabel[item.failureKind]}` : ''}
                  </span>
                </div>
                <p>{item.detail}</p>
                <p>{item.message}</p>
                {item.retryable && (
                  <div className="pending-replay-history-actions">
                    <button
                      type="button"
                      className="secondary-btn compact-btn"
                      onClick={() => onRetryPendingAuthReplayHistoryItem(item.id)}
                      disabled={isReplayingPendingAuthQueue}
                    >
                      重新加入补发队列
                    </button>
                  </div>
                )}
                <span className="pending-replay-history-time">{formatPendingReplayTimestamp(item.processedAt)}</span>
              </article>
              ))}
              {filteredPendingReplayHistoryItems.length === 0 && (
                <p className="backup-feedback">当前筛选条件下还没有补发历史。</p>
              )}
            </div>
          </div>
        )}
        {pendingAuthReplayStatus && (
          <p
            className={`backup-feedback ${
              pendingAuthReplayStatus.tone === 'syncing'
                ? 'backup-feedback-syncing'
                : pendingAuthReplayStatus.tone === 'success'
                  ? 'backup-feedback-success'
                  : 'backup-feedback-error'
            }`}
          >
            {pendingAuthReplayStatus.message}
          </p>
        )}
        {(workspaceStatus?.tone === 'degraded' || workspaceStatus?.tone === 'expired') && (
          <p className="backup-feedback backup-feedback-error">
            {workspaceStatus.tone === 'expired'
              ? '远端登录态失效后，系统会先回到登录入口，并保留本地恢复区内容，避免当前页面直接丢空。'
              : '远端暂不可达时，系统会继续保留本地核心学习快照，避免课程和资料状态丢失。'}
          </p>
        )}
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
            <p className="eyebrow">Today Queue</p>
            <h2>今日待处理</h2>
          </div>
        </div>
        <div className="detail-chip-row">
          <span className="post-badge">待处理 {todayTaskOverview.total} 项</span>
          <span className="post-badge">待完成课时 {todayTaskOverview.pendingLessons}</span>
          <span className="post-badge">待续读资料 {todayTaskOverview.pendingResources}</span>
          <span className="post-badge">未读消息 {todayTaskOverview.unreadMessages}</span>
          <span className="post-badge">未读通知 {todayTaskOverview.unreadNotifications}</span>
        </div>
        <div className="today-queue-toolbar">
          <p className="archive-section-copy">从这里可以连续处理课程推进、资料续读、会话未读和通知提醒，不必先跳到别的模块。</p>
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
                      {getTodayTaskQuickActionLabel(task)}
                    </button>
                  </div>
                </div>
                <div className="archive-meta">
                  <strong>
                    {task.kind === 'course'
                      ? '课程待办'
                      : task.kind === 'resource'
                        ? '资料待办'
                        : task.kind === 'conversation'
                          ? '最近消息'
                          : '通知提醒'}
                  </strong>
                  <span>{task.meta}</span>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state-card">
              <strong>今天的待处理已经清空</strong>
              <span>新的课程推进、资料阅读进度、未读消息或通知到来时，这里会自动补进待办队列。</span>
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
              : '当前没有可生成的冲刺步骤，可以先从待办队列、课程页或图书馆开始。'}
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
              <span>当课程推进、资料续读、提醒处理或今日待办出现后，这里会自动生成一套建议顺序。</span>
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
            <span className="detail-summary-label">推荐学习重点</span>
            <strong>{profileActionCoach.recommendedStudy?.title ?? '暂时没有推荐重点'}</strong>
            <span>
              {profileActionCoach.recommendedStudy?.detail ??
                '当前没有明确的课程或资料待推进，可以先从新的课程学习或图书馆阅读开始。'}
            </span>
            {profileActionCoach.recommendedStudy && (
              <div className="coach-card-actions">
                <button
                  type="button"
                  className="primary-btn compact-btn"
                  onClick={openRecommendedStudy}
                >
                  {profileActionCoach.recommendedStudy.ctaLabel}
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
            {profileActionCoach.recommendedStudy && (
              <button
                type="button"
                className="secondary-btn compact-btn"
                onClick={openRecommendedStudy}
              >
                {profileActionCoach.recommendedStudy.ctaLabel}
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
                  <strong>
                    {(libraryRuntimeRecord[resource.id]?.progressPercent ?? 0) > 0
                      ? `${libraryRuntimeRecord[resource.id]?.progressPercent ?? 0}%`
                      : resource.updatedAt}
                  </strong>
                  <span>
                    {(libraryRuntimeRecord[resource.id]?.progressPercent ?? 0) > 0
                      ? `${getLibraryProgressLabel(libraryRuntimeRecord[resource.id]?.progressPercent ?? 0)} · ${
                          libraryRuntimeRecord[resource.id]?.downloaded ? '已加入离线资料夹' : '继续回到图书馆可推进进度'
                        }`
                      : resource.relatedCourseId
                        ? '已绑定相关课程资料'
                        : '独立资源记录'}
                  </span>
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
            <p className="backup-feedback">课程和已接入图书馆的资料都可以从这里直接续上。</p>
          </div>
        </div>
        <div className="continue-learning-grid">
          {continueLearningCourses.length > 0 ? (
            continueLearningCourses.map((course) => (
              <article key={course.id} className="continue-learning-item">
                <span className="continue-learning-title">{course.title}</span>
                <span className="continue-learning-subtitle">{course.recentLessonLabel}</span>
                <span className="continue-learning-meta">
                  {course.completedLessonsCount}/{course.syllabus.length} 课时完成 · {course.lastStudiedLabel}
                </span>
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
