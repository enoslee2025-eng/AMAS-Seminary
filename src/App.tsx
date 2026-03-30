import { SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppHeader } from './components/layout/AppHeader';
import { BottomNav } from './components/layout/BottomNav';
import { WorkspaceStatusBanner } from './components/common/WorkspaceStatusBanner';
import { AuthGateway } from './features/auth/AuthGateway';
import { HomeView } from './features/home/HomeView';
import { CoursesView } from './features/courses/CoursesView';
import { CommunityView } from './features/community/CommunityView';
import { LibraryView } from './features/library/LibraryView';
import { ProfileView } from './features/profile/ProfileView';
import { usePersistentState, useScopedPersistentState } from './hooks/usePersistentState';
import {
  AppBackupPayload,
  AppDomainSnapshot,
  AuthSession,
  AuthResumeContext,
  AuthDegree,
  CourseRuntimeState,
  LibraryRuntimeState,
  PendingAuthReplay,
  PendingAuthReplayDraft,
  PendingAuthReplayHistoryItem,
  ProfileState,
  RuntimeSyncState,
  TabKey,
  WorkspaceSessionProbeHistoryItem,
  WorkspaceSessionProbeStatus,
  WorkspaceStatus,
} from './types/app';
import {
  courses,
  defaultProfile,
  rebuildMilestones,
  libraryResources,
} from './data/mockData';
import {
  buildDisplayCourses,
  completeNextPendingLesson,
  getContinueLearningCourses,
  getLearningOverview,
} from './features/courses/courseState';
import { getLibraryOverview, getRecentViewedResources } from './features/library/libraryState';
import { createAppBackupPayload } from './services/appBackup';
import { ProfessorApplicationInput, StudentAuthInput } from './services/appContracts';
import { appGateway, appGatewayInfo } from './services/appGateway';
import { localAppGateway } from './services/localAppGateway';
import { createDefaultAppDomainSnapshot, readAppDomainSnapshot, useAppDomainState } from './services/appRepository';
import { resolveStartupSnapshot, shouldBootstrapRemoteCore } from './services/appSyncBootstrap';

type CommunityCourseFocus = {
  courseId: string;
  token: number;
  mode: 'feed' | 'compose';
  draft?: string;
};

type CommunityInboxIntent = {
  token: number;
  section: 'conversations' | 'notifications';
  conversationId?: string;
  notificationId?: string;
};

const degreeRoleLabels: Record<AuthDegree, string> = {
  'B.Th': '神学学士 B.Th 学员',
  'M.Div': '道学硕士 M.Div 学员',
  'M.P.Th': '教牧学研究硕士 M.P.Th 学员',
  'D.Min': '教牧学博士 D.Min 学员',
  'Ph.D.': '哲学博士 Ph.D. 研究员',
};
const sessionExpiryWarningThresholdMs = 1000 * 60 * 15;
const autoWorkspaceSessionRefreshCooldownMs = 1000 * 60 * 5;

function normalizeAccount(account: string) {
  const normalized = account.trim();
  if (normalized.includes('@')) {
    return normalized;
  }

  return `${normalized.toLowerCase()}@amas.local`;
}

function resolveSetStateAction<T>(value: SetStateAction<T>, current: T): T {
  return typeof value === 'function' ? (value as (previous: T) => T)(current) : value;
}

function createConnectedWorkspaceStatus(): WorkspaceStatus {
  return {
    tone: 'connected',
    title: '远端工作区连接正常',
    detail: '认证、资料、课程进度和图书馆状态会优先同步到远端；社区恢复区也会通过统一快照跟随账号写回，但独立互动服务仍保持本地沙盒节奏。',
  };
}

function createBootstrappedWorkspaceStatus(): WorkspaceStatus {
  return {
    tone: 'bootstrapped',
    title: '远端工作区已补齐核心学习数据',
    detail: '本地的账号、资料、课程进度和图书馆状态已经安全写入远端工作区，社区恢复区也会继续通过统一快照保留当前进度。',
  };
}

function createRecoveredWorkspaceStatus(): WorkspaceStatus {
  return {
    tone: 'connected',
    title: '本地变更已重新同步到远端',
    detail: '离线期间保存在本地的账号、资料、课程进度、图书馆和社区恢复数据，已经重新写回远端工作区。',
  };
}

function createDegradedWorkspaceStatus(): WorkspaceStatus {
  return {
    tone: 'degraded',
    title: '远端工作区暂时不可达',
    detail: '当前已回退到本地学习快照；新的账号、资料、课程进度、图书馆和社区恢复数据会先保存在本地，远端恢复后可重新同步。',
  };
}

function createExpiredWorkspaceStatus(): WorkspaceStatus {
  return {
    tone: 'expired',
    title: '远端登录态已过期',
    detail: '远端会话已经失效，核心学习区会先回到登录入口；社区恢复区会继续保留在本地，重新登录后可再写回远端。',
  };
}

function formatSessionExpiryHint(session?: AuthSession | null) {
  if (!session?.expiresAt) {
    return '';
  }

  const expiresAt = Date.parse(session.expiresAt);
  if (!Number.isFinite(expiresAt)) {
    return '';
  }

  const remainingMs = expiresAt - Date.now();
  if (remainingMs <= 0) {
    return ' 远端会话已到达过期时间。';
  }

  const remainingMinutes = Math.round(remainingMs / (1000 * 60));
  if (remainingMinutes < 60) {
    return ` 预计还可保持约 ${Math.max(remainingMinutes, 1)} 分钟。`;
  }

  const remainingHours = Math.round((remainingMinutes / 60) * 10) / 10;
  return ` 预计还可保持约 ${remainingHours} 小时。`;
}

function isSessionExpiringSoon(session?: AuthSession | null) {
  if (!session?.expiresAt) {
    return false;
  }

  const expiresAt = Date.parse(session.expiresAt);
  if (!Number.isFinite(expiresAt)) {
    return false;
  }

  return expiresAt - Date.now() <= sessionExpiryWarningThresholdMs;
}

function createHealthyWorkspaceSessionProbeStatus(
  trigger: 'auto' | 'manual',
  session?: AuthSession | null,
): WorkspaceSessionProbeStatus {
  const expiryHint = formatSessionExpiryHint(session);
  return {
    tone: 'healthy',
    trigger,
    checkedAt: new Date().toISOString(),
    title: trigger === 'manual' ? '远端登录态已确认' : '远端登录态持续正常',
    detail:
      trigger === 'manual'
        ? `刚刚已手动确认当前账号的远端会话仍然有效。${expiryHint}`
        : `系统已确认当前账号的远端会话仍然有效。${expiryHint}`,
  };
}

function createWarningWorkspaceSessionProbeStatus(
  trigger: 'auto' | 'manual',
  session?: AuthSession | null,
): WorkspaceSessionProbeStatus {
  const expiryHint = formatSessionExpiryHint(session);
  return {
    tone: 'warning',
    trigger,
    checkedAt: new Date().toISOString(),
    title: trigger === 'manual' ? '远端会话即将过期' : '远端会话接近过期',
    detail:
      trigger === 'manual'
        ? `刚刚已确认当前账号仍在线，但远端会话接近过期。建议先保存当前进度并尽快重新登录。${expiryHint}`
        : `系统检测到当前账号的远端会话接近过期。建议先保存当前进度并尽快重新登录。${expiryHint}`,
  };
}

function createRefreshedWorkspaceSessionProbeStatus(
  trigger: 'auto' | 'manual',
  session?: AuthSession | null,
): WorkspaceSessionProbeStatus {
  const expiryHint = formatSessionExpiryHint(session);

  if (isSessionExpiringSoon(session)) {
    return {
      tone: 'warning',
      trigger,
      checkedAt: new Date().toISOString(),
      title: trigger === 'manual' ? '远端会话已延长，但仍接近过期' : '系统已尝试自动延长会话',
      detail:
        trigger === 'manual'
          ? `刚刚已延长当前账号的远端会话，但它仍接近过期。建议尽快重新登录。${expiryHint}`
          : `系统刚刚自动延长当前账号的远端会话，但它仍接近过期。建议尽快重新登录。${expiryHint}`,
    };
  }

  return {
    tone: 'healthy',
    trigger,
    checkedAt: new Date().toISOString(),
    title: trigger === 'manual' ? '远端会话已延长' : '系统已自动延长会话',
    detail:
      trigger === 'manual'
        ? `刚刚已延长当前账号的远端会话。${expiryHint}`
        : `系统刚刚自动延长当前账号的远端会话。${expiryHint}`,
  };
}

function createCheckingWorkspaceSessionProbeStatus(
  trigger: 'auto' | 'manual',
  checkedAt: string | null,
): WorkspaceSessionProbeStatus {
  return {
    tone: 'checking',
    trigger,
    checkedAt,
    title: trigger === 'manual' ? '正在检查远端登录态' : '正在后台确认远端登录态',
    detail: trigger === 'manual' ? '正在手动检查当前账号的远端会话。' : '系统正在后台确认当前账号的远端会话。',
  };
}

function createUnreachableWorkspaceSessionProbeStatus(trigger: 'auto' | 'manual'): WorkspaceSessionProbeStatus {
  return {
    tone: 'unreachable',
    trigger,
    checkedAt: new Date().toISOString(),
    title: trigger === 'manual' ? '暂时无法确认远端登录态' : '远端登录态探活暂时失败',
    detail: trigger === 'manual' ? '本次手动检查没有拿到远端响应，可以稍后再次尝试。' : '后台探活没有拿到远端响应，稍后会继续自动检查。',
  };
}

function createExpiredWorkspaceSessionProbeStatus(trigger: 'auto' | 'manual'): WorkspaceSessionProbeStatus {
  return {
    tone: 'expired',
    trigger,
    checkedAt: new Date().toISOString(),
    title: '远端登录态已失效',
    detail: trigger === 'manual' ? '本次检查确认远端会话已经过期，请重新登录。' : '系统确认远端会话已经过期，请重新登录后继续恢复。',
  };
}

function isAuthenticationRequiredError(error: unknown) {
  return error instanceof Error && error.message.includes('Authentication required');
}

function stripResumeCourseFocus(
  focus: CommunityCourseFocus | null,
): AuthResumeContext['communityCourseFocus'] {
  if (!focus) {
    return null;
  }

  return {
    courseId: focus.courseId,
    mode: focus.mode,
    ...(focus.draft ? { draft: focus.draft } : undefined),
  };
}

function stripResumeInboxIntent(
  intent: CommunityInboxIntent | null,
): AuthResumeContext['communityInboxIntent'] {
  if (!intent) {
    return null;
  }

  return {
    section: intent.section,
    ...(intent.conversationId ? { conversationId: intent.conversationId } : undefined),
    ...(intent.notificationId ? { notificationId: intent.notificationId } : undefined),
  };
}

function createPendingAuthReplayTimestamp() {
  return new Date().toISOString();
}

function getPendingAuthReplayKey(replay: PendingAuthReplayDraft | PendingAuthReplay) {
  if (replay.kind === 'course') {
    return `${replay.kind}:${replay.courseId}:${replay.source}`;
  }

  if (replay.kind === 'library') {
    return `${replay.kind}:${replay.resourceId}:${replay.source}`;
  }

  return `${replay.kind}:${replay.accountHint ?? 'anonymous'}`;
}

function getPendingAuthReplayPriority(replay: PendingAuthReplay) {
  if (replay.kind === 'profile') {
    return 0;
  }

  if (replay.kind === 'course') {
    return 1;
  }

  return 2;
}

function getPendingAuthReplaySortValue(replay: PendingAuthReplay) {
  const parsed = Date.parse(replay.createdAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getPendingAuthReplayFailureMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return '待补发动作暂时没有成功，稍后可以再次尝试。';
  }

  if (error.message.includes('Failed to fetch')) {
    return '远端暂时不可达，待补发动作会继续保留在队列里。';
  }

  return error.message.trim() ? `补发失败：${error.message}` : '待补发动作暂时没有成功，稍后可以再次尝试。';
}

function getPendingAuthReplayFailureKind(error: unknown): PendingAuthReplayHistoryItem['failureKind'] {
  if (!(error instanceof Error)) {
    return 'remote';
  }

  if (error.message.includes('Authentication required')) {
    return 'authentication';
  }

  if (error.message.includes('Failed to fetch')) {
    return 'network';
  }

  return 'remote';
}

function describePendingAuthReplay(replay: PendingAuthReplay) {
  if (replay.kind === 'profile') {
    return {
      title: '个人资料保存',
      detail: `等待把 ${replay.profile.name} 的资料更新重新写回远端。`,
    };
  }

  if (replay.kind === 'course') {
    const courseTitle = courses.find((item) => item.id === replay.courseId)?.title ?? '当前课程';
    return {
      title: replay.source === 'quick_action' ? '课程冲刺补发' : '课程进度补发',
      detail:
        replay.source === 'quick_action'
          ? `等待把《${courseTitle}》的最新冲刺结果重新写回远端。`
          : `等待把《${courseTitle}》的当前课时进度重新写回远端。`,
    };
  }

  const resourceTitle = libraryResources.find((item) => item.id === replay.resourceId)?.title ?? '当前资料';
  return {
    title: '资料状态补发',
    detail: `等待把《${resourceTitle}》的查看/收藏状态重新写回远端。`,
  };
}

function toPendingAuthReplayDraft(replay: PendingAuthReplay): PendingAuthReplayDraft {
  if (replay.kind === 'profile') {
    return {
      kind: replay.kind,
      accountHint: replay.accountHint,
      profile: replay.profile,
    };
  }

  if (replay.kind === 'course') {
    return {
      kind: replay.kind,
      accountHint: replay.accountHint,
      courseId: replay.courseId,
      source: replay.source,
      runtime: replay.runtime,
    };
  }

  return {
    kind: replay.kind,
    accountHint: replay.accountHint,
    resourceId: replay.resourceId,
    source: replay.source,
    runtime: replay.runtime,
  };
}

function matchesReplayAccount(accountHint: string | null, activeAccount: string | null) {
  if (!activeAccount) {
    return true;
  }

  return !accountHint || accountHint === activeAccount;
}

function App() {
  const [communityCourseFocus, setCommunityCourseFocus] = useState<CommunityCourseFocus | null>(null);
  const [communityInboxIntent, setCommunityInboxIntent] = useState<CommunityInboxIntent | null>(null);
  const {
    snapshot: appDomain,
    setSnapshot,
    setAuthSession,
    setProfile,
    setCourseRuntime,
    setLibraryRuntime,
  } = useAppDomainState();
  const {
    authSession,
    profile,
    courseRuntime: runtimeRecord,
    libraryRuntime: libraryRuntimeRecord,
    posts,
    conversations,
    notifications,
    chatMessages,
    voiceRooms,
  } = appDomain;
  const persistentUiScopeKey = authSession?.account ?? null;
  const [activeTab, setActiveTab] = useScopedPersistentState<TabKey>('amas_rebuild_active_tab', persistentUiScopeKey, 'home');
  const [selectedCourseId, setSelectedCourseId] = useScopedPersistentState<string | null>(
    'amas_courses_selected_course',
    persistentUiScopeKey,
    null,
  );
  const [selectedResourceId, setSelectedResourceId] = useScopedPersistentState<string | null>(
    'amas_library_selected_resource',
    persistentUiScopeKey,
    null,
  );
  const [authResumeContext, setAuthResumeContext] = usePersistentState<AuthResumeContext | null>('amas_auth_resume_context', null);
  const [pendingAuthReplayQueue, setPendingAuthReplayQueue] = usePersistentState<PendingAuthReplay[]>(
    'amas_pending_auth_replay_queue_v1',
    [],
  );
  const [pendingAuthReplayHistory, setPendingAuthReplayHistory] = usePersistentState<PendingAuthReplayHistoryItem[]>(
    'amas_pending_auth_replay_history_v1',
    [],
  );
  const [workspaceSessionProbeHistory, setWorkspaceSessionProbeHistory] = usePersistentState<WorkspaceSessionProbeHistoryItem[]>(
    'amas_workspace_session_probe_history_v1',
    [],
  );
  const [isSyncReady, setIsSyncReady] = useState(false);
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus | null>(null);
  const [workspaceLastSyncedAt, setWorkspaceLastSyncedAt] = useState<string | null>(null);
  const [isRetryingWorkspaceSync, setIsRetryingWorkspaceSync] = useState(false);
  const [hasPendingRemoteCoreSync, setHasPendingRemoteCoreSync] = useState(false);
  const [pendingRemoteCommunitySyncAccount, setPendingRemoteCommunitySyncAccount] = usePersistentState<string | null>(
    'amas_pending_remote_community_sync_account_v1',
    null,
  );
  const [courseSyncState, setCourseSyncState] = useState<RuntimeSyncState | null>(null);
  const [librarySyncState, setLibrarySyncState] = useState<RuntimeSyncState | null>(null);
  const [pendingAuthReplayStatus, setPendingAuthReplayStatus] = useState<RuntimeSyncState | null>(null);
  const [isReplayingPendingAuthQueue, setIsReplayingPendingAuthQueue] = useState(false);
  const [workspaceSessionProbeStatus, setWorkspaceSessionProbeStatus] = useState<WorkspaceSessionProbeStatus | null>(null);
  const [isCheckingWorkspaceSession, setIsCheckingWorkspaceSession] = useState(false);
  const [isRefreshingWorkspaceSession, setIsRefreshingWorkspaceSession] = useState(false);
  const appDomainRef = useRef(appDomain);
  const courseRuntimeRef = useRef(runtimeRecord);
  const libraryRuntimeRef = useRef(libraryRuntimeRecord);
  const courseSyncOperationRef = useRef(0);
  const librarySyncOperationRef = useRef(0);
  const communitySyncOperationRef = useRef(0);
  const hasPendingRemoteCoreSyncRef = useRef(hasPendingRemoteCoreSync);
  const pendingRemoteCommunitySyncAccountRef = useRef(pendingRemoteCommunitySyncAccount);
  const isReplayingPendingAuthRef = useRef(false);
  const isProbingWorkspaceSessionRef = useRef(false);
  const lastWorkspaceSessionProbeAtRef = useRef(0);
  const lastWorkspaceSessionRefreshAtRef = useRef(0);
  const workspaceSessionProbeFailureStreakRef = useRef(0);

  const displayCourses = useMemo(
    () => buildDisplayCourses(courses, runtimeRecord, libraryRuntimeRecord),
    [libraryRuntimeRecord, runtimeRecord],
  );
  const continueLearningCourses = useMemo(() => getContinueLearningCourses(displayCourses, 3), [displayCourses]);
  const learningOverview = useMemo(() => getLearningOverview(displayCourses), [displayCourses]);
  const recentViewedResources = useMemo(() => getRecentViewedResources(libraryResources, libraryRuntimeRecord), [libraryRuntimeRecord]);
  const libraryOverview = useMemo(() => getLibraryOverview(libraryRuntimeRecord), [libraryRuntimeRecord]);
  const communityUnreadCount = useMemo(
    () => conversations.reduce((sum, item) => sum + item.unread, 0) + notifications.filter((item) => !item.read).length,
    [conversations, notifications],
  );
  const getBackupPayload = () =>
    createAppBackupPayload(appDomain);
  const runtimeWorkspaceLabel = appGatewayInfo.mode === 'remote' ? '远端工作区' : '本地工作区';
  const isWorkspaceDegraded = appGatewayInfo.mode === 'remote' && workspaceStatus?.tone === 'degraded';
  const hasPendingRemoteCommunitySync = Boolean(
    authSession?.account && pendingRemoteCommunitySyncAccount === authSession.account,
  );
  const shouldAttemptWorkspaceRecovery =
    appGatewayInfo.mode === 'remote' &&
    !isRetryingWorkspaceSync &&
    (hasPendingRemoteCoreSync || hasPendingRemoteCommunitySync || workspaceStatus?.tone === 'degraded');
  const visiblePendingAuthReplayQueue = useMemo(
    () =>
      authSession
        ? pendingAuthReplayQueue
            .filter((item) => matchesReplayAccount(item.accountHint, authSession.account))
            .sort((left, right) => {
              const priorityDifference = getPendingAuthReplayPriority(left) - getPendingAuthReplayPriority(right);
              if (priorityDifference !== 0) {
                return priorityDifference;
              }

              return getPendingAuthReplaySortValue(left) - getPendingAuthReplaySortValue(right);
            })
        : [...pendingAuthReplayQueue].sort((left, right) => {
            const priorityDifference = getPendingAuthReplayPriority(left) - getPendingAuthReplayPriority(right);
            if (priorityDifference !== 0) {
              return priorityDifference;
            }

            return getPendingAuthReplaySortValue(left) - getPendingAuthReplaySortValue(right);
          }),
    [authSession, pendingAuthReplayQueue],
  );
  const currentPendingAuthReplay = visiblePendingAuthReplayQueue[0] ?? null;
  const visiblePendingAuthReplayCount = useMemo(
    () => visiblePendingAuthReplayQueue.length,
    [visiblePendingAuthReplayQueue],
  );
  const canProbeWorkspaceSession =
    appGatewayInfo.mode === 'remote' &&
    Boolean(authSession) &&
    isSyncReady &&
    workspaceStatus?.tone !== 'expired';
  const visibleWorkspaceSessionProbeHistory = useMemo(
    () =>
      (authSession
        ? workspaceSessionProbeHistory.filter((item) => matchesReplayAccount(item.accountHint, authSession.account))
        : workspaceSessionProbeHistory
      ).slice(0, 6),
    [authSession, workspaceSessionProbeHistory],
  );
  const shouldProbeWorkspaceSession =
    canProbeWorkspaceSession &&
    !hasPendingRemoteCoreSync &&
    !hasPendingRemoteCommunitySync &&
    visiblePendingAuthReplayCount === 0 &&
    workspaceStatus?.tone !== 'degraded';
  const authResumeHint = useMemo(() => {
    if (!authResumeContext) {
      return null;
    }

    if (authResumeContext.activeTab === 'courses' && authResumeContext.selectedCourseId) {
      return courses.find((item) => item.id === authResumeContext.selectedCourseId)?.title ?? '刚才查看的课程';
    }

    if (authResumeContext.activeTab === 'library' && authResumeContext.selectedResourceId) {
      return libraryResources.find((item) => item.id === authResumeContext.selectedResourceId)?.title ?? '刚才查看的资料';
    }

    if (authResumeContext.activeTab === 'community') {
      if (authResumeContext.communityCourseFocus) {
        const courseTitle =
          courses.find((item) => item.id === authResumeContext.communityCourseFocus?.courseId)?.title ?? '对应课程';
        return `社区讨论 · ${courseTitle}`;
      }

      if (authResumeContext.communityInboxIntent?.section === 'notifications') {
        return '社区通知';
      }

      if (authResumeContext.communityInboxIntent?.conversationId) {
        const conversationName =
          conversations.find((item) => item.id === authResumeContext.communityInboxIntent?.conversationId)?.name ?? '最近会话';
        return `会话 · ${conversationName}`;
      }

      return '社区页';
    }

    if (authResumeContext.activeTab === 'profile') {
      return '个人中心';
    }

    return '首页';
  }, [authResumeContext, conversations]);
  const pendingReplayHint = useMemo(() => {
    if (!currentPendingAuthReplay) {
      return null;
    }

    if (currentPendingAuthReplay.kind === 'course') {
      const courseTitle = courses.find((item) => item.id === currentPendingAuthReplay.courseId)?.title ?? '当前课程';
      const baseHint =
        currentPendingAuthReplay.source === 'quick_action'
        ? `恢复《${courseTitle}》的课程冲刺同步`
        : `恢复《${courseTitle}》的课程进度同步`;
      return visiblePendingAuthReplayCount > 1 ? `${baseHint}（另有 ${visiblePendingAuthReplayCount - 1} 项待补发）` : baseHint;
    }

    if (currentPendingAuthReplay.kind === 'library') {
      const resourceTitle = libraryResources.find((item) => item.id === currentPendingAuthReplay.resourceId)?.title ?? '当前资料';
      const baseHint = `恢复《${resourceTitle}》的资料状态同步`;
      return visiblePendingAuthReplayCount > 1 ? `${baseHint}（另有 ${visiblePendingAuthReplayCount - 1} 项待补发）` : baseHint;
    }

    return visiblePendingAuthReplayCount > 1 ? `恢复刚才未完成的资料保存（另有 ${visiblePendingAuthReplayCount - 1} 项待补发）` : '恢复刚才未完成的资料保存';
  }, [currentPendingAuthReplay, visiblePendingAuthReplayCount]);
  const authResumePrompt = useMemo(() => {
    if (authResumeHint && pendingReplayHint) {
      return `${authResumeHint}，并${pendingReplayHint}`;
    }

    return authResumeHint ?? pendingReplayHint;
  }, [authResumeHint, pendingReplayHint]);
  const pendingAuthReplayItems = useMemo(
    () =>
      visiblePendingAuthReplayQueue.slice(0, 4).map((replay) => ({
        id: replay.createdAt,
        ...describePendingAuthReplay(replay),
      })),
    [visiblePendingAuthReplayQueue],
  );
  const visiblePendingAuthReplayHistory = useMemo(
    () =>
      (authSession
        ? pendingAuthReplayHistory.filter((item) => matchesReplayAccount(item.accountHint, authSession.account))
        : pendingAuthReplayHistory
      ).slice(0, 8),
    [authSession, pendingAuthReplayHistory],
  );
  const pendingAuthReplayHistoryItems = useMemo(
    () =>
      visiblePendingAuthReplayHistory.map((item) => ({
        id: item.id,
        outcome: item.outcome,
        failureKind: item.failureKind,
        trigger: item.trigger,
        title: item.title,
        detail: item.detail,
        message: item.message,
        processedAt: item.processedAt,
        retryable: item.outcome === 'error' && Boolean(item.retryReplay),
      })),
    [visiblePendingAuthReplayHistory],
  );

  useEffect(() => {
    hasPendingRemoteCoreSyncRef.current = hasPendingRemoteCoreSync;
  }, [hasPendingRemoteCoreSync]);

  useEffect(() => {
    pendingRemoteCommunitySyncAccountRef.current = pendingRemoteCommunitySyncAccount;
  }, [pendingRemoteCommunitySyncAccount]);

  useEffect(() => {
    appDomainRef.current = appDomain;
  }, [appDomain]);

  useEffect(() => {
    courseRuntimeRef.current = runtimeRecord;
  }, [runtimeRecord]);

  useEffect(() => {
    libraryRuntimeRef.current = libraryRuntimeRecord;
  }, [libraryRuntimeRecord]);

  useEffect(() => {
    if (!courseSyncState) {
      return;
    }

    const timeout = window.setTimeout(
      () => setCourseSyncState(null),
      courseSyncState.tone === 'error' ? 4200 : 2400,
    );

    return () => window.clearTimeout(timeout);
  }, [courseSyncState]);

  useEffect(() => {
    if (!librarySyncState) {
      return;
    }

    const timeout = window.setTimeout(
      () => setLibrarySyncState(null),
      librarySyncState.tone === 'error' ? 4200 : 2400,
    );

    return () => window.clearTimeout(timeout);
  }, [librarySyncState]);

  useEffect(() => {
    if (!pendingAuthReplayStatus) {
      return;
    }

    const timeout = window.setTimeout(
      () => setPendingAuthReplayStatus(null),
      pendingAuthReplayStatus.tone === 'error' ? 4200 : 2800,
    );

    return () => window.clearTimeout(timeout);
  }, [pendingAuthReplayStatus]);

  const markWorkspaceLocallySaved = useCallback(() => {
    setWorkspaceLastSyncedAt(new Date().toISOString());
    if (appGatewayInfo.mode === 'remote') {
      setHasPendingRemoteCoreSync(true);
      setWorkspaceStatus(createDegradedWorkspaceStatus());
      return;
    }

    setWorkspaceStatus({
      tone: 'local',
      title: '当前使用本地工作区',
      detail: appGatewayInfo.reason,
    });
  }, []);

  const markWorkspaceSynced = useCallback((status?: WorkspaceStatus) => {
    setWorkspaceLastSyncedAt(new Date().toISOString());
    setHasPendingRemoteCoreSync(false);
    if (appGatewayInfo.mode === 'remote') {
      setWorkspaceStatus(status ?? createConnectedWorkspaceStatus());
      return;
    }

    setWorkspaceStatus({
      tone: 'local',
      title: '当前使用本地工作区',
      detail: appGatewayInfo.reason,
    });
  }, []);

  const queuePendingCommunitySync = useCallback(
    (accountHint?: string | null) => {
      if (appGatewayInfo.mode !== 'remote') {
        return;
      }

      const normalizedAccount = accountHint?.trim() || pendingRemoteCommunitySyncAccountRef.current;
      if (normalizedAccount) {
        setPendingRemoteCommunitySyncAccount(normalizedAccount);
      }
    },
    [setPendingRemoteCommunitySyncAccount],
  );

  const updatePosts = useCallback(
    (value: SetStateAction<AppDomainSnapshot['posts']>) => {
      setSnapshot((current) => ({
        ...current,
        posts: resolveSetStateAction(value, current.posts),
      }));
      queuePendingCommunitySync(authSession?.account ?? null);
    },
    [authSession?.account, queuePendingCommunitySync, setSnapshot],
  );

  const updateConversations = useCallback(
    (value: SetStateAction<AppDomainSnapshot['conversations']>) => {
      setSnapshot((current) => ({
        ...current,
        conversations: resolveSetStateAction(value, current.conversations),
      }));
      queuePendingCommunitySync(authSession?.account ?? null);
    },
    [authSession?.account, queuePendingCommunitySync, setSnapshot],
  );

  const updateNotifications = useCallback(
    (value: SetStateAction<AppDomainSnapshot['notifications']>) => {
      setSnapshot((current) => ({
        ...current,
        notifications: resolveSetStateAction(value, current.notifications),
      }));
      queuePendingCommunitySync(authSession?.account ?? null);
    },
    [authSession?.account, queuePendingCommunitySync, setSnapshot],
  );

  const updateChatMessages = useCallback(
    (value: SetStateAction<AppDomainSnapshot['chatMessages']>) => {
      setSnapshot((current) => ({
        ...current,
        chatMessages: resolveSetStateAction(value, current.chatMessages),
      }));
      queuePendingCommunitySync(authSession?.account ?? null);
    },
    [authSession?.account, queuePendingCommunitySync, setSnapshot],
  );

  const updateVoiceRooms = useCallback(
    (value: SetStateAction<AppDomainSnapshot['voiceRooms']>) => {
      setSnapshot((current) => ({
        ...current,
        voiceRooms: resolveSetStateAction(value, current.voiceRooms),
      }));
      queuePendingCommunitySync(authSession?.account ?? null);
    },
    [authSession?.account, queuePendingCommunitySync, setSnapshot],
  );

  const createFallbackLoggedOutSnapshot = useCallback(() => {
    const fallbackSnapshot = createDefaultAppDomainSnapshot();

    return {
      ...fallbackSnapshot,
      posts,
      conversations,
      notifications,
      chatMessages,
      voiceRooms,
    };
  }, [chatMessages, conversations, notifications, posts, voiceRooms]);

  const createFallbackAuthenticatedSnapshot = useCallback(
    (session: NonNullable<typeof authSession>, displayName: string) => {
      const fallbackSnapshot = createDefaultAppDomainSnapshot();

      return {
        ...fallbackSnapshot,
        posts,
        conversations,
        notifications,
        chatMessages,
        voiceRooms,
        authSession: session,
        profile: {
          ...fallbackSnapshot.profile,
          name: displayName,
          role: degreeRoleLabels[session.degree],
          email: session.account,
        },
      };
    },
    [chatMessages, conversations, notifications, posts, voiceRooms],
  );

  const buildAuthResumeContext = useCallback(
    (accountHint?: string | null): AuthResumeContext => ({
      activeTab,
      selectedCourseId,
      selectedResourceId,
      communityCourseFocus: stripResumeCourseFocus(communityCourseFocus),
      communityInboxIntent: stripResumeInboxIntent(communityInboxIntent),
      accountHint: accountHint ?? authSession?.account ?? profile.email ?? null,
      capturedAt: new Date().toISOString(),
    }),
    [
      activeTab,
      authSession?.account,
      communityCourseFocus,
      communityInboxIntent,
      profile.email,
      selectedCourseId,
      selectedResourceId,
    ],
  );

  const restoreAuthResumeContext = useCallback(
    (session: NonNullable<typeof authSession>) => {
      const shouldRestore =
        authResumeContext && (!authResumeContext.accountHint || authResumeContext.accountHint === session.account);

      if (!shouldRestore) {
        setActiveTab('home');
        setSelectedCourseId(null);
        setSelectedResourceId(null);
        setCommunityCourseFocus(null);
        setCommunityInboxIntent(null);
        setAuthResumeContext(null);
        return;
      }

      setSelectedCourseId(authResumeContext.selectedCourseId);
      setSelectedResourceId(authResumeContext.selectedResourceId);
      setCommunityCourseFocus(
        authResumeContext.communityCourseFocus
          ? {
              ...authResumeContext.communityCourseFocus,
              token: Date.now(),
            }
          : null,
      );
      setCommunityInboxIntent(
        authResumeContext.communityInboxIntent
          ? {
              ...authResumeContext.communityInboxIntent,
              token: Date.now() + 1,
            }
          : null,
      );
      setActiveTab(authResumeContext.activeTab);
      setAuthResumeContext(null);
    },
    [authResumeContext, setActiveTab, setAuthResumeContext, setSelectedCourseId, setSelectedResourceId],
  );

  const handleExpiredWorkspaceSession = useCallback((accountHint?: string | null) => {
    setAuthResumeContext(buildAuthResumeContext(accountHint));
    setSnapshot(createFallbackLoggedOutSnapshot());
    setHasPendingRemoteCoreSync(false);
    setWorkspaceStatus(createExpiredWorkspaceStatus());
    setWorkspaceSessionProbeStatus(createExpiredWorkspaceSessionProbeStatus('auto'));
    setIsCheckingWorkspaceSession(false);
    lastWorkspaceSessionProbeAtRef.current = 0;
    workspaceSessionProbeFailureStreakRef.current = 0;
    setActiveTab('home');
    setSelectedCourseId(null);
    setSelectedResourceId(null);
    setCommunityCourseFocus(null);
    setCommunityInboxIntent(null);
  }, [
    buildAuthResumeContext,
    createFallbackLoggedOutSnapshot,
    setActiveTab,
    setAuthResumeContext,
    setSelectedCourseId,
    setSelectedResourceId,
    setSnapshot,
  ]);

  const queuePendingAuthReplay = useCallback(
    (replay: PendingAuthReplayDraft) => {
      const nextReplay = {
        ...replay,
        createdAt: createPendingAuthReplayTimestamp(),
      } as PendingAuthReplay;
      const nextKey = getPendingAuthReplayKey(nextReplay);

      setPendingAuthReplayQueue((current) => {
        const filtered = current.filter((item) => getPendingAuthReplayKey(item) !== nextKey);
        return [...filtered, nextReplay];
      });
    },
    [setPendingAuthReplayQueue],
  );

  const clearPendingAuthReplayQueue = useCallback(() => {
    setPendingAuthReplayQueue([]);
    setPendingAuthReplayStatus(null);
  }, [setPendingAuthReplayQueue]);

  const clearVisiblePendingAuthReplayQueue = useCallback(() => {
    const activeAccount = authSession?.account ?? null;
    setPendingAuthReplayQueue((current) =>
      activeAccount ? current.filter((item) => !matchesReplayAccount(item.accountHint, activeAccount)) : [],
    );
    setPendingAuthReplayStatus({
      tone: 'success',
      message: activeAccount ? '已清空当前账号的待补发队列。' : '已清空待补发队列。',
    });
  }, [authSession?.account, setPendingAuthReplayQueue]);

  const clearSuccessfulPendingAuthReplayHistory = useCallback(() => {
    const activeAccount = authSession?.account ?? null;
    setPendingAuthReplayHistory((current) =>
      current.filter((item) => !matchesReplayAccount(item.accountHint, activeAccount) || item.outcome !== 'success'),
    );
    setPendingAuthReplayStatus({
      tone: 'success',
      message: activeAccount ? '已清理当前账号的成功补发记录。' : '已清理成功补发记录。',
    });
  }, [authSession?.account, setPendingAuthReplayHistory]);

  const clearPendingAuthReplayHistory = useCallback(() => {
    const activeAccount = authSession?.account ?? null;
    setPendingAuthReplayHistory((current) =>
      activeAccount ? current.filter((item) => !matchesReplayAccount(item.accountHint, activeAccount)) : [],
    );
    setPendingAuthReplayStatus({
      tone: 'success',
      message: activeAccount ? '已清空当前账号的补发历史。' : '已清空补发历史。',
    });
  }, [authSession?.account, setPendingAuthReplayHistory]);

  const appendPendingAuthReplayHistory = useCallback(
    (entry: Omit<PendingAuthReplayHistoryItem, 'id' | 'processedAt'>) => {
      setPendingAuthReplayHistory((current) => [
        {
          ...entry,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          processedAt: new Date().toISOString(),
        },
        ...current,
      ].slice(0, 8));
    },
    [setPendingAuthReplayHistory],
  );

  const appendWorkspaceSessionProbeHistory = useCallback(
    (entry: Omit<WorkspaceSessionProbeHistoryItem, 'id'>) => {
      setWorkspaceSessionProbeHistory((current) => {
        const nextEntry: WorkspaceSessionProbeHistoryItem = {
          ...entry,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        };
        const latest = current[0] ?? null;
        if (
          latest &&
          latest.accountHint === nextEntry.accountHint &&
          latest.tone === nextEntry.tone &&
          latest.trigger === nextEntry.trigger &&
          Date.parse(nextEntry.checkedAt) - Date.parse(latest.checkedAt) < 120000
        ) {
          return [nextEntry, ...current.slice(1)].slice(0, 8);
        }

        return [nextEntry, ...current].slice(0, 8);
      });
    },
    [setWorkspaceSessionProbeHistory],
  );

  const clearWorkspaceSessionProbeHistory = useCallback(() => {
    const activeAccount = authSession?.account ?? null;
    setWorkspaceSessionProbeHistory((current) =>
      activeAccount ? current.filter((item) => !matchesReplayAccount(item.accountHint, activeAccount)) : [],
    );
    setWorkspaceSessionProbeStatus(null);
  }, [authSession?.account, setWorkspaceSessionProbeHistory]);

  const replayPendingAuthMutation = useCallback(
    async (session: NonNullable<typeof authSession>, replay: PendingAuthReplay) => {
      if (!replay) {
        return false;
      }

      if (replay.accountHint && replay.accountHint !== session.account) {
        return false;
      }

      if (replay.kind === 'course') {
        const nextRecord = await appGateway.learning.updateCourseRuntime({
          courseId: replay.courseId,
          runtime: replay.runtime,
          source: replay.source,
        });

        setCourseRuntime(nextRecord);
        setCourseSyncState({
          tone: 'success',
          message:
            replay.source === 'quick_action'
              ? '已补回刚才未完成的课程冲刺同步。'
              : '已补回刚才未完成的课程进度同步。',
        });
        setPendingAuthReplayQueue((current) => current.filter((item) => item.createdAt !== replay.createdAt));
        return true;
      }

      if (replay.kind === 'library') {
        const nextRecord = await appGateway.library.updateLibraryRuntime({
          resourceId: replay.resourceId,
          runtime: replay.runtime,
          source: replay.source,
        });

        setLibraryRuntime(nextRecord);
        setLibrarySyncState({
          tone: 'success',
          message: '已补回刚才未完成的资料状态同步。',
        });
        setPendingAuthReplayQueue((current) => current.filter((item) => item.createdAt !== replay.createdAt));
        return true;
      }

      const savedProfile = await appGateway.profile.update(replay.profile);
      setProfile(savedProfile);
      setPendingAuthReplayQueue((current) => current.filter((item) => item.createdAt !== replay.createdAt));
      return true;
    },
    [setCourseRuntime, setLibraryRuntime, setPendingAuthReplayQueue, setProfile],
  );

  const runPendingAuthReplayQueue = useCallback(
    async (trigger: 'auto' | 'manual') => {
      if (
        appGatewayInfo.mode !== 'remote' ||
        !authSession ||
        visiblePendingAuthReplayQueue.length === 0 ||
        isReplayingPendingAuthRef.current
      ) {
        return;
      }

      if (workspaceStatus?.tone === 'degraded') {
        if (trigger === 'manual') {
          setPendingAuthReplayStatus({
            tone: 'error',
            message: '远端连接还没恢复，请先重新同步工作区。',
          });
        }
        return;
      }

      if (workspaceStatus?.tone === 'expired') {
        setPendingAuthReplayStatus({
          tone: 'error',
          message: '远端登录已过期，请重新登录后再补发这些动作。',
        });
        handleExpiredWorkspaceSession(authSession.account);
        return;
      }

      isReplayingPendingAuthRef.current = true;
      setIsReplayingPendingAuthQueue(true);
      setPendingAuthReplayStatus({
        tone: 'syncing',
        message:
          visiblePendingAuthReplayQueue.length > 1
            ? `正在依次补发 ${visiblePendingAuthReplayQueue.length} 项待同步动作...`
            : '正在补发 1 项待同步动作...',
      });

      let processedCount = 0;
      let activeReplay: PendingAuthReplay | null = null;

      try {
        for (const replay of visiblePendingAuthReplayQueue) {
          activeReplay = replay;
          const didReplay = await replayPendingAuthMutation(authSession, replay);
          if (didReplay) {
            processedCount += 1;
            appendPendingAuthReplayHistory({
              accountHint: authSession.account,
              outcome: 'success',
              failureKind: null,
              trigger,
              ...describePendingAuthReplay(replay),
              message: '该动作已经成功补发到远端工作区。',
              retryReplay: null,
            });
          }
        }

        if (processedCount > 0) {
          markWorkspaceSynced(createRecoveredWorkspaceStatus());
          setPendingAuthReplayStatus({
            tone: 'success',
            message:
              processedCount > 1
                ? `已补发 ${processedCount} 项待同步动作。`
                : '已补发 1 项待同步动作。',
          });
        }
      } catch (error) {
        if (isAuthenticationRequiredError(error)) {
          if (activeReplay) {
            appendPendingAuthReplayHistory({
              accountHint: authSession.account,
              outcome: 'error',
              failureKind: 'authentication',
              trigger,
              ...describePendingAuthReplay(activeReplay),
              message: '补发过程中远端登录再次过期，请重新登录后继续。',
              retryReplay: toPendingAuthReplayDraft(activeReplay),
            });
          }
          setPendingAuthReplayStatus({
            tone: 'error',
            message: '补发过程中远端登录再次过期，请重新登录后继续。',
          });
          handleExpiredWorkspaceSession(authSession.account);
          return;
        }

        setWorkspaceStatus(createDegradedWorkspaceStatus());
        if (activeReplay) {
          appendPendingAuthReplayHistory({
            accountHint: authSession.account,
            outcome: 'error',
            failureKind: getPendingAuthReplayFailureKind(error),
            trigger,
            ...describePendingAuthReplay(activeReplay),
            message: getPendingAuthReplayFailureMessage(error),
            retryReplay: toPendingAuthReplayDraft(activeReplay),
          });
        }
        setPendingAuthReplayStatus({
          tone: 'error',
          message: getPendingAuthReplayFailureMessage(error),
        });
      } finally {
        isReplayingPendingAuthRef.current = false;
        setIsReplayingPendingAuthQueue(false);
      }
    },
    [
      appendPendingAuthReplayHistory,
      authSession,
      handleExpiredWorkspaceSession,
      markWorkspaceSynced,
      replayPendingAuthMutation,
      visiblePendingAuthReplayQueue,
      workspaceStatus?.tone,
    ],
  );

  const syncWorkspace = useCallback(async () => {
    const localSnapshot = readAppDomainSnapshot();

    if (appGatewayInfo.mode === 'local') {
      setSnapshot(localSnapshot);
      setWorkspaceSessionProbeStatus(null);
      setIsCheckingWorkspaceSession(false);
      workspaceSessionProbeFailureStreakRef.current = 0;
      markWorkspaceSynced();
      return;
    }

    try {
      const remoteSnapshot = await appGateway.sync.readSnapshot();
      const mergedSnapshot = resolveStartupSnapshot({
        gatewayMode: appGatewayInfo.mode,
        localSnapshot,
        remoteSnapshot,
      });
      const didExpireRemoteSession = Boolean(
        localSnapshot.authSession &&
          (!remoteSnapshot.authSession || remoteSnapshot.authSession.account !== localSnapshot.authSession.account),
      );
      const needsBootstrap = shouldBootstrapRemoteCore({
        gatewayMode: appGatewayInfo.mode,
        localSnapshot,
        remoteSnapshot,
      });
      const shouldPushLocalCore = needsBootstrap || hasPendingRemoteCoreSyncRef.current;
      const shouldPushLocalCommunity = Boolean(
        pendingRemoteCommunitySyncAccountRef.current &&
          localSnapshot.authSession &&
          remoteSnapshot.authSession &&
          pendingRemoteCommunitySyncAccountRef.current === localSnapshot.authSession.account &&
          pendingRemoteCommunitySyncAccountRef.current === remoteSnapshot.authSession.account,
      );

      if (didExpireRemoteSession) {
        handleExpiredWorkspaceSession(localSnapshot.authSession?.account ?? localSnapshot.profile.email ?? null);
        return;
      }

      if (shouldPushLocalCore || shouldPushLocalCommunity) {
        const persistedSnapshot = await appGateway.sync.writeSnapshot({
          ...remoteSnapshot,
          authSession: localSnapshot.authSession,
          profile: shouldPushLocalCore ? localSnapshot.profile : remoteSnapshot.profile,
          courseRuntime: shouldPushLocalCore ? localSnapshot.courseRuntime : remoteSnapshot.courseRuntime,
          libraryRuntime: shouldPushLocalCore ? localSnapshot.libraryRuntime : remoteSnapshot.libraryRuntime,
          posts: shouldPushLocalCommunity ? localSnapshot.posts : remoteSnapshot.posts,
          conversations: shouldPushLocalCommunity ? localSnapshot.conversations : remoteSnapshot.conversations,
          notifications: shouldPushLocalCommunity ? localSnapshot.notifications : remoteSnapshot.notifications,
          chatMessages: shouldPushLocalCommunity ? localSnapshot.chatMessages : remoteSnapshot.chatMessages,
          voiceRooms: shouldPushLocalCommunity ? localSnapshot.voiceRooms : remoteSnapshot.voiceRooms,
        });

        setSnapshot({
          ...mergedSnapshot,
          authSession: persistedSnapshot.authSession,
          profile: shouldPushLocalCore ? persistedSnapshot.profile : mergedSnapshot.profile,
          courseRuntime: shouldPushLocalCore ? persistedSnapshot.courseRuntime : mergedSnapshot.courseRuntime,
          libraryRuntime: shouldPushLocalCore ? persistedSnapshot.libraryRuntime : mergedSnapshot.libraryRuntime,
          posts: shouldPushLocalCommunity ? localSnapshot.posts : mergedSnapshot.posts,
          conversations: shouldPushLocalCommunity ? localSnapshot.conversations : mergedSnapshot.conversations,
          notifications: shouldPushLocalCommunity ? localSnapshot.notifications : mergedSnapshot.notifications,
          chatMessages: shouldPushLocalCommunity ? localSnapshot.chatMessages : mergedSnapshot.chatMessages,
          voiceRooms: shouldPushLocalCommunity ? localSnapshot.voiceRooms : mergedSnapshot.voiceRooms,
        });
        if (shouldPushLocalCommunity) {
          setPendingRemoteCommunitySyncAccount((current) =>
            current === localSnapshot.authSession?.account ? null : current,
          );
        }
        if (localSnapshot.authSession) {
          setWorkspaceSessionProbeStatus(
            isSessionExpiringSoon(persistedSnapshot.authSession)
              ? createWarningWorkspaceSessionProbeStatus('auto', persistedSnapshot.authSession)
              : createHealthyWorkspaceSessionProbeStatus('auto', persistedSnapshot.authSession),
          );
          setIsCheckingWorkspaceSession(false);
          lastWorkspaceSessionProbeAtRef.current = Date.now();
          workspaceSessionProbeFailureStreakRef.current = 0;
        }
        markWorkspaceSynced(needsBootstrap ? createBootstrappedWorkspaceStatus() : createRecoveredWorkspaceStatus());
        return;
      }

      setSnapshot(mergedSnapshot);
      if (remoteSnapshot.authSession) {
        setWorkspaceSessionProbeStatus(
          isSessionExpiringSoon(remoteSnapshot.authSession)
            ? createWarningWorkspaceSessionProbeStatus('auto', remoteSnapshot.authSession)
            : createHealthyWorkspaceSessionProbeStatus('auto', remoteSnapshot.authSession),
        );
        setIsCheckingWorkspaceSession(false);
        lastWorkspaceSessionProbeAtRef.current = Date.now();
        workspaceSessionProbeFailureStreakRef.current = 0;
      }
      markWorkspaceSynced(createConnectedWorkspaceStatus());
    } catch {
      setSnapshot(localSnapshot);
      if (localSnapshot.authSession) {
        setWorkspaceSessionProbeStatus(createUnreachableWorkspaceSessionProbeStatus('auto'));
        setIsCheckingWorkspaceSession(false);
        lastWorkspaceSessionProbeAtRef.current = Date.now();
      }
      setWorkspaceStatus(createDegradedWorkspaceStatus());
    }
  }, [handleExpiredWorkspaceSession, markWorkspaceSynced, setPendingRemoteCommunitySyncAccount, setSnapshot]);

  const probeWorkspaceSession = useCallback(
    async (options?: { force?: boolean; trigger?: 'auto' | 'manual' }) => {
      const trigger = options?.trigger ?? 'auto';
      const canRunProbe = trigger === 'manual' ? canProbeWorkspaceSession : shouldProbeWorkspaceSession;

      if (!authSession || !canRunProbe || isProbingWorkspaceSessionRef.current) {
        return;
      }

      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }

      const now = Date.now();
      if (!options?.force && now - lastWorkspaceSessionProbeAtRef.current < 15000) {
        return;
      }

      isProbingWorkspaceSessionRef.current = true;
      setIsCheckingWorkspaceSession(true);
      setWorkspaceSessionProbeStatus((current) =>
        createCheckingWorkspaceSessionProbeStatus(trigger, current?.checkedAt ?? null),
      );

      try {
        const remoteSession = await appGateway.auth.readSession();
        lastWorkspaceSessionProbeAtRef.current = now;

        if (!remoteSession || remoteSession.account !== authSession.account) {
          const expiredProbeStatus = createExpiredWorkspaceSessionProbeStatus(trigger);
          setWorkspaceSessionProbeStatus(expiredProbeStatus);
          appendWorkspaceSessionProbeHistory({
            accountHint: authSession.account,
            tone: 'expired',
            trigger,
            checkedAt: expiredProbeStatus.checkedAt ?? new Date().toISOString(),
            title: expiredProbeStatus.title,
            detail: expiredProbeStatus.detail,
          });
          handleExpiredWorkspaceSession(authSession.account);
          return;
        }

        const nextProbeTone: 'healthy' | 'warning' = isSessionExpiringSoon(remoteSession) ? 'warning' : 'healthy';
        const nextProbeStatus =
          nextProbeTone === 'warning'
            ? createWarningWorkspaceSessionProbeStatus(trigger, remoteSession)
            : createHealthyWorkspaceSessionProbeStatus(trigger, remoteSession);
        setWorkspaceSessionProbeStatus(nextProbeStatus);
        workspaceSessionProbeFailureStreakRef.current = 0;
        appendWorkspaceSessionProbeHistory({
          accountHint: authSession.account,
          tone: nextProbeTone,
          trigger,
          checkedAt: nextProbeStatus.checkedAt ?? new Date().toISOString(),
          title: nextProbeStatus.title,
          detail: nextProbeStatus.detail,
        });
        if (
          trigger === 'manual' &&
          !isRetryingWorkspaceSync &&
          (
            workspaceStatus?.tone === 'degraded' ||
            hasPendingRemoteCoreSyncRef.current ||
            pendingRemoteCommunitySyncAccountRef.current === authSession.account ||
            visiblePendingAuthReplayCount > 0
          )
        ) {
          setIsRetryingWorkspaceSync(true);
          try {
            await syncWorkspace();
          } finally {
            setIsRetryingWorkspaceSync(false);
          }
        }
      } catch (error) {
        if (isAuthenticationRequiredError(error)) {
          const expiredProbeStatus = createExpiredWorkspaceSessionProbeStatus(trigger);
          setWorkspaceSessionProbeStatus(expiredProbeStatus);
          appendWorkspaceSessionProbeHistory({
            accountHint: authSession.account,
            tone: 'expired',
            trigger,
            checkedAt: expiredProbeStatus.checkedAt ?? new Date().toISOString(),
            title: expiredProbeStatus.title,
            detail: expiredProbeStatus.detail,
          });
          handleExpiredWorkspaceSession(authSession.account);
          return;
        }

        const unreachableProbeStatus = createUnreachableWorkspaceSessionProbeStatus(trigger);
        setWorkspaceSessionProbeStatus(unreachableProbeStatus);
        workspaceSessionProbeFailureStreakRef.current += 1;
        if (trigger === 'manual' || workspaceSessionProbeFailureStreakRef.current >= 2) {
          setWorkspaceStatus(createDegradedWorkspaceStatus());
        }
        appendWorkspaceSessionProbeHistory({
          accountHint: authSession.account,
          tone: 'unreachable',
          trigger,
          checkedAt: unreachableProbeStatus.checkedAt ?? new Date().toISOString(),
          title: unreachableProbeStatus.title,
          detail: unreachableProbeStatus.detail,
        });
      } finally {
        isProbingWorkspaceSessionRef.current = false;
        setIsCheckingWorkspaceSession(false);
      }
    },
    [
      appendWorkspaceSessionProbeHistory,
      authSession,
      canProbeWorkspaceSession,
      handleExpiredWorkspaceSession,
      isRetryingWorkspaceSync,
      shouldProbeWorkspaceSession,
      syncWorkspace,
      visiblePendingAuthReplayCount,
      workspaceStatus?.tone,
    ],
  );

  useEffect(() => {
    let active = true;
    void syncWorkspace().finally(() => {
      if (active) {
        setIsSyncReady(true);
      }
    });

    return () => {
      active = false;
    };
  }, [syncWorkspace]);

  useEffect(() => {
    if (
      appGatewayInfo.mode !== 'remote' ||
      !isSyncReady ||
      !authSession ||
      !hasPendingRemoteCommunitySync ||
      workspaceStatus?.tone === 'degraded' ||
      workspaceStatus?.tone === 'expired' ||
      isRetryingWorkspaceSync ||
      hasPendingRemoteCoreSync ||
      visiblePendingAuthReplayCount > 0
    ) {
      return;
    }

    const operationId = communitySyncOperationRef.current + 1;
    communitySyncOperationRef.current = operationId;

    const timeoutId = window.setTimeout(() => {
      void appGateway.sync
        .writeSnapshot({
          ...appDomainRef.current,
          authSession,
        })
        .then(() => {
          if (communitySyncOperationRef.current !== operationId) {
            return;
          }

          setPendingRemoteCommunitySyncAccount((current) => (current === authSession.account ? null : current));
          setWorkspaceLastSyncedAt(new Date().toISOString());
          if (!hasPendingRemoteCoreSyncRef.current) {
            setWorkspaceStatus(createConnectedWorkspaceStatus());
          }
        })
        .catch((error) => {
          if (communitySyncOperationRef.current !== operationId) {
            return;
          }

          if (isAuthenticationRequiredError(error)) {
            handleExpiredWorkspaceSession(authSession.account);
            return;
          }

          setWorkspaceStatus(createDegradedWorkspaceStatus());
        });
    }, 360);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    authSession,
    handleExpiredWorkspaceSession,
    hasPendingRemoteCommunitySync,
    hasPendingRemoteCoreSync,
    isRetryingWorkspaceSync,
    isSyncReady,
    setPendingRemoteCommunitySyncAccount,
    visiblePendingAuthReplayCount,
    workspaceStatus?.tone,
  ]);

  const handleRetryWorkspaceSync = useCallback(() => {
    if (isRetryingWorkspaceSync) {
      return;
    }

    setIsRetryingWorkspaceSync(true);
    void syncWorkspace().finally(() => {
      setIsRetryingWorkspaceSync(false);
    });
  }, [isRetryingWorkspaceSync, syncWorkspace]);

  useEffect(() => {
    if (!shouldAttemptWorkspaceRecovery) {
      return;
    }

    const handleWorkspaceRecoveryTrigger = () => {
      if (document.visibilityState === 'hidden') {
        return;
      }

      handleRetryWorkspaceSync();
    };

    window.addEventListener('online', handleWorkspaceRecoveryTrigger);
    window.addEventListener('focus', handleWorkspaceRecoveryTrigger);
    document.addEventListener('visibilitychange', handleWorkspaceRecoveryTrigger);

    return () => {
      window.removeEventListener('online', handleWorkspaceRecoveryTrigger);
      window.removeEventListener('focus', handleWorkspaceRecoveryTrigger);
      document.removeEventListener('visibilitychange', handleWorkspaceRecoveryTrigger);
    };
  }, [handleRetryWorkspaceSync, shouldAttemptWorkspaceRecovery]);

  useEffect(() => {
    if (!shouldProbeWorkspaceSession) {
      setIsCheckingWorkspaceSession(false);
      if (workspaceStatus?.tone !== 'expired' && workspaceStatus?.tone !== 'degraded') {
        setWorkspaceSessionProbeStatus(null);
      }
      return;
    }

    const handleWorkspaceSessionProbe = () => {
      if (document.visibilityState === 'hidden') {
        return;
      }

      void probeWorkspaceSession({ trigger: 'auto' });
    };

    void probeWorkspaceSession({ force: true, trigger: 'auto' });
    window.addEventListener('online', handleWorkspaceSessionProbe);
    window.addEventListener('focus', handleWorkspaceSessionProbe);
    document.addEventListener('visibilitychange', handleWorkspaceSessionProbe);

    return () => {
      window.removeEventListener('online', handleWorkspaceSessionProbe);
      window.removeEventListener('focus', handleWorkspaceSessionProbe);
      document.removeEventListener('visibilitychange', handleWorkspaceSessionProbe);
    };
  }, [probeWorkspaceSession, shouldProbeWorkspaceSession, workspaceStatus?.tone]);

  useEffect(() => {
    if (!shouldProbeWorkspaceSession) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void probeWorkspaceSession({ trigger: 'auto' });
    }, 45000);

    return () => window.clearInterval(intervalId);
  }, [probeWorkspaceSession, shouldProbeWorkspaceSession]);

  const handleCheckWorkspaceSession = useCallback(() => {
    void probeWorkspaceSession({ force: true, trigger: 'manual' });
  }, [probeWorkspaceSession]);

  const refreshWorkspaceSession = useCallback((trigger: 'auto' | 'manual') => {
    if (appGatewayInfo.mode !== 'remote' || !authSession || isRefreshingWorkspaceSession) {
      return;
    }

    lastWorkspaceSessionRefreshAtRef.current = Date.now();
    setIsRefreshingWorkspaceSession(true);
    void appGateway.auth
      .refreshSession()
      .then(async (nextSession) => {
        const nextProbeTone: 'healthy' | 'warning' = isSessionExpiringSoon(nextSession) ? 'warning' : 'healthy';
        const nextProbeStatus = createRefreshedWorkspaceSessionProbeStatus(trigger, nextSession);

        setAuthSession(nextSession);
        setWorkspaceSessionProbeStatus(nextProbeStatus);
        appendWorkspaceSessionProbeHistory({
          accountHint: nextSession.account,
          tone: nextProbeTone,
          trigger,
          checkedAt: nextProbeStatus.checkedAt ?? new Date().toISOString(),
          title: nextProbeStatus.title,
          detail: nextProbeStatus.detail,
        });
        lastWorkspaceSessionProbeAtRef.current = Date.now();
        workspaceSessionProbeFailureStreakRef.current = 0;

        if (
          workspaceStatus?.tone === 'degraded' ||
          hasPendingRemoteCoreSyncRef.current ||
          pendingRemoteCommunitySyncAccountRef.current === nextSession.account ||
          visiblePendingAuthReplayCount > 0
        ) {
          setIsRetryingWorkspaceSync(true);
          try {
            await syncWorkspace();
          } finally {
            setIsRetryingWorkspaceSync(false);
          }
        } else {
          setWorkspaceStatus(createConnectedWorkspaceStatus());
        }
      })
      .catch((error) => {
        if (isAuthenticationRequiredError(error)) {
          const expiredProbeStatus = createExpiredWorkspaceSessionProbeStatus(trigger);
          setWorkspaceSessionProbeStatus(expiredProbeStatus);
          appendWorkspaceSessionProbeHistory({
            accountHint: authSession.account,
            tone: 'expired',
            trigger,
            checkedAt: expiredProbeStatus.checkedAt ?? new Date().toISOString(),
            title: expiredProbeStatus.title,
            detail: expiredProbeStatus.detail,
          });
          handleExpiredWorkspaceSession(authSession.account);
          return;
        }

        const unreachableProbeStatus = createUnreachableWorkspaceSessionProbeStatus(trigger);
        setWorkspaceSessionProbeStatus(unreachableProbeStatus);
        appendWorkspaceSessionProbeHistory({
          accountHint: authSession.account,
          tone: 'unreachable',
          trigger,
          checkedAt: unreachableProbeStatus.checkedAt ?? new Date().toISOString(),
          title: unreachableProbeStatus.title,
          detail: unreachableProbeStatus.detail,
        });
        if (trigger === 'manual') {
          setWorkspaceStatus(createDegradedWorkspaceStatus());
        }
      })
      .finally(() => {
        setIsRefreshingWorkspaceSession(false);
      });
  }, [
    appendWorkspaceSessionProbeHistory,
    authSession,
    handleExpiredWorkspaceSession,
    isRefreshingWorkspaceSession,
    setAuthSession,
    syncWorkspace,
    visiblePendingAuthReplayCount,
    workspaceStatus?.tone,
  ]);

  const handleRefreshWorkspaceSession = useCallback(() => {
    refreshWorkspaceSession('manual');
  }, [refreshWorkspaceSession]);

  useEffect(() => {
    if (
      appGatewayInfo.mode !== 'remote' ||
      !authSession ||
      workspaceStatus?.tone === 'expired' ||
      workspaceStatus?.tone === 'degraded' ||
      workspaceSessionProbeStatus?.tone !== 'warning' ||
      isRefreshingWorkspaceSession ||
      isCheckingWorkspaceSession ||
      isRetryingWorkspaceSync ||
      hasPendingRemoteCoreSync ||
      hasPendingRemoteCommunitySync ||
      visiblePendingAuthReplayCount > 0
    ) {
      return;
    }

    if (Date.now() - lastWorkspaceSessionRefreshAtRef.current < autoWorkspaceSessionRefreshCooldownMs) {
      return;
    }

    refreshWorkspaceSession('auto');
  }, [
    authSession,
    hasPendingRemoteCommunitySync,
    hasPendingRemoteCoreSync,
    isCheckingWorkspaceSession,
    isRefreshingWorkspaceSession,
    isRetryingWorkspaceSync,
    refreshWorkspaceSession,
    visiblePendingAuthReplayCount,
    workspaceSessionProbeStatus?.tone,
    workspaceStatus?.tone,
  ]);

  useEffect(() => {
    if (
      appGatewayInfo.mode !== 'remote' ||
      !authSession?.expiresAt ||
      workspaceStatus?.tone === 'expired' ||
      workspaceStatus?.tone === 'degraded' ||
      isRefreshingWorkspaceSession ||
      isCheckingWorkspaceSession ||
      isRetryingWorkspaceSync ||
      hasPendingRemoteCoreSync ||
      hasPendingRemoteCommunitySync ||
      visiblePendingAuthReplayCount > 0
    ) {
      return;
    }

    const expiresAt = Date.parse(authSession.expiresAt);
    if (!Number.isFinite(expiresAt)) {
      return;
    }

    const delay = Math.max(expiresAt - Date.now() - sessionExpiryWarningThresholdMs, 0);
    const timeoutId = window.setTimeout(() => {
      if (Date.now() - lastWorkspaceSessionRefreshAtRef.current < autoWorkspaceSessionRefreshCooldownMs) {
        return;
      }

      refreshWorkspaceSession('auto');
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [
    authSession?.expiresAt,
    hasPendingRemoteCommunitySync,
    hasPendingRemoteCoreSync,
    isCheckingWorkspaceSession,
    isRefreshingWorkspaceSession,
    isRetryingWorkspaceSync,
    refreshWorkspaceSession,
    visiblePendingAuthReplayCount,
    workspaceStatus?.tone,
  ]);

  useEffect(() => {
    if (
      appGatewayInfo.mode !== 'remote' ||
      !isSyncReady ||
      !authSession ||
      !currentPendingAuthReplay ||
      workspaceStatus?.tone === 'degraded' ||
      workspaceStatus?.tone === 'expired' ||
      isReplayingPendingAuthRef.current
    ) {
      return;
    }

    void runPendingAuthReplayQueue('auto');
  }, [
    authSession,
    currentPendingAuthReplay,
    isSyncReady,
    runPendingAuthReplayQueue,
    workspaceStatus?.tone,
  ]);

  const handleReplayPendingAuthQueue = useCallback(() => {
    void runPendingAuthReplayQueue('manual');
  }, [runPendingAuthReplayQueue]);

  const handleRetryPendingAuthReplayHistoryItem = useCallback(
    (historyId: string) => {
      const target = pendingAuthReplayHistory.find((item) => item.id === historyId) ?? null;
      if (!target?.retryReplay) {
        return;
      }

      queuePendingAuthReplay(target.retryReplay);
      setPendingAuthReplayStatus({
        tone: 'success',
        message: '已把失败动作重新加入待补发队列。',
      });

      if (
        appGatewayInfo.mode === 'remote' &&
        authSession &&
        workspaceStatus?.tone !== 'degraded' &&
        workspaceStatus?.tone !== 'expired' &&
        !isReplayingPendingAuthRef.current
      ) {
        void runPendingAuthReplayQueue('manual');
      }
    },
    [authSession, pendingAuthReplayHistory, queuePendingAuthReplay, runPendingAuthReplayQueue, workspaceStatus?.tone],
  );

  const openCourse = (courseId: string) => {
    setActiveTab('courses');
    setSelectedCourseId(courseId);
  };

  const openResource = (resourceId: string) => {
    setActiveTab('library');
    setSelectedResourceId(resourceId);
  };

  const openProfile = () => {
    setActiveTab('profile');
  };

  const openCommunityForCourse = (
    courseId: string,
    options: {
      mode?: CommunityCourseFocus['mode'];
      draft?: string;
    } = {},
  ) => {
    setCommunityInboxIntent(null);
    setCommunityCourseFocus({
      courseId,
      token: Date.now(),
      mode: options.mode ?? 'feed',
      ...(options.draft ? { draft: options.draft } : undefined),
    });
    setActiveTab('community');
  };

  const openCommunityInbox = (
    options: {
      section?: CommunityInboxIntent['section'];
      conversationId?: string;
      notificationId?: string;
    } = {},
  ) => {
    setCommunityCourseFocus(null);
    setCommunityInboxIntent({
      token: Date.now(),
      section: options.section ?? 'notifications',
      ...(options.conversationId ? { conversationId: options.conversationId } : undefined),
      ...(options.notificationId ? { notificationId: options.notificationId } : undefined),
    });
    setActiveTab('community');
  };

  const updateCourseRuntime = (courseId: string, updater: (current: CourseRuntimeState) => CourseRuntimeState) => {
    const previousRecord = courseRuntimeRef.current;
    const currentRuntime = previousRecord[courseId];
    if (!currentRuntime || !courses.find((item) => item.id === courseId)) {
      return;
    }

    const nextRuntime = updater(currentRuntime);
    const nextRecord = {
      ...previousRecord,
      [courseId]: nextRuntime,
    };
    const operationId = courseSyncOperationRef.current + 1;

    courseSyncOperationRef.current = operationId;

    setCourseRuntime(nextRecord);
    if (isWorkspaceDegraded) {
      markWorkspaceLocallySaved();
      setCourseSyncState({
        tone: 'success',
        message: '课程进度已保存到本地工作区，远端恢复后可重新同步。',
      });
      return;
    }

    setCourseSyncState({
      tone: 'syncing',
      message: `正在同步课程进度到${runtimeWorkspaceLabel}...`,
    });
    void appGateway.learning
      .updateCourseRuntime({
        courseId,
        runtime: nextRuntime,
        source: 'manual',
      })
      .then((record) => {
        if (courseSyncOperationRef.current !== operationId) {
          return;
        }

        setCourseRuntime(record);
        markWorkspaceSynced();
        setCourseSyncState({
          tone: 'success',
          message: `课程进度已同步到${runtimeWorkspaceLabel}。`,
        });
      })
      .catch((error) => {
        if (courseSyncOperationRef.current !== operationId) {
          return;
        }

        setCourseRuntime(previousRecord);
        if (isAuthenticationRequiredError(error)) {
          queuePendingAuthReplay({
            kind: 'course',
            accountHint: authSession?.account ?? profile.email ?? null,
            courseId,
            source: 'manual',
            runtime: nextRuntime,
          });
          handleExpiredWorkspaceSession(authSession?.account ?? profile.email ?? null);
          setCourseSyncState({
            tone: 'error',
            message: '远端登录已过期，请重新登录后继续同步课程进度。',
          });
          return;
        }

        setWorkspaceStatus(createDegradedWorkspaceStatus());
        setCourseSyncState({
          tone: 'error',
          message: '课程进度同步失败，已恢复到上一次保存状态。',
        });
      });
  };

  const updateLibraryRuntime = (
    resourceId: string,
    updater: (current: LibraryRuntimeState) => LibraryRuntimeState,
    source: 'view' | 'favorite' | 'download' | 'restore' = 'view',
  ) => {
    const previousRecord = libraryRuntimeRef.current;
    const currentRuntime =
      previousRecord[resourceId] ?? {
        favorite: false,
        viewed: false,
        progressPercent: 0,
        downloaded: false,
        lastViewedAt: null,
      };

    const nextRuntime = updater(currentRuntime);
    const nextRecord = {
      ...previousRecord,
      [resourceId]: nextRuntime,
    };
    const operationId = librarySyncOperationRef.current + 1;

    librarySyncOperationRef.current = operationId;

    setLibraryRuntime(nextRecord);
    if (isWorkspaceDegraded) {
      markWorkspaceLocallySaved();
      setLibrarySyncState({
        tone: 'success',
        message: '资料状态已保存到本地工作区，远端恢复后可重新同步。',
      });
      return;
    }

    setLibrarySyncState({
      tone: 'syncing',
      message: `正在同步资料状态到${runtimeWorkspaceLabel}...`,
    });
    void appGateway.library
      .updateLibraryRuntime({
        resourceId,
        runtime: nextRuntime,
        source,
      })
      .then((record) => {
        if (librarySyncOperationRef.current !== operationId) {
          return;
        }

        setLibraryRuntime(record);
        markWorkspaceSynced();
        setLibrarySyncState({
          tone: 'success',
          message: `资料状态已同步到${runtimeWorkspaceLabel}。`,
        });
      })
      .catch((error) => {
        if (librarySyncOperationRef.current !== operationId) {
          return;
        }

        setLibraryRuntime(previousRecord);
        if (isAuthenticationRequiredError(error)) {
          queuePendingAuthReplay({
            kind: 'library',
            accountHint: authSession?.account ?? profile.email ?? null,
            resourceId,
            source,
            runtime: nextRuntime,
          });
          handleExpiredWorkspaceSession(authSession?.account ?? profile.email ?? null);
          setLibrarySyncState({
            tone: 'error',
            message: '远端登录已过期，请重新登录后继续同步资料状态。',
          });
          return;
        }

        setWorkspaceStatus(createDegradedWorkspaceStatus());
        setLibrarySyncState({
          tone: 'error',
          message: '资料状态同步失败，已恢复到上一次保存状态。',
        });
      });
  };

  const quickCompleteCourseTask = (courseId: string) => {
    const course = courses.find((item) => item.id === courseId);
    if (!course) {
      return;
    }

    const previousRecord = courseRuntimeRef.current;
    const currentRuntime = previousRecord[courseId];
    if (!currentRuntime) {
      return;
    }

    const nextRuntime = completeNextPendingLesson(course, currentRuntime);
    const nextRecord = {
      ...previousRecord,
      [courseId]: nextRuntime,
    };
    const operationId = courseSyncOperationRef.current + 1;

    courseSyncOperationRef.current = operationId;

    setCourseRuntime(nextRecord);
    if (isWorkspaceDegraded) {
      markWorkspaceLocallySaved();
      setCourseSyncState({
        tone: 'success',
        message: '课程冲刺结果已保存到本地工作区，远端恢复后可重新同步。',
      });
      return;
    }

    setCourseSyncState({
      tone: 'syncing',
      message: `正在同步课程冲刺到${runtimeWorkspaceLabel}...`,
    });
    void appGateway.learning
      .updateCourseRuntime({
        courseId,
        runtime: nextRuntime,
        source: 'quick_action',
      })
      .then((record) => {
        if (courseSyncOperationRef.current !== operationId) {
          return;
        }

        setCourseRuntime(record);
        markWorkspaceSynced();
        setCourseSyncState({
          tone: 'success',
          message: `课程冲刺结果已同步到${runtimeWorkspaceLabel}。`,
        });
      })
      .catch((error) => {
        if (courseSyncOperationRef.current !== operationId) {
          return;
        }

        setCourseRuntime(previousRecord);
        if (isAuthenticationRequiredError(error)) {
          queuePendingAuthReplay({
            kind: 'course',
            accountHint: authSession?.account ?? profile.email ?? null,
            courseId,
            source: 'quick_action',
            runtime: nextRuntime,
          });
          handleExpiredWorkspaceSession(authSession?.account ?? profile.email ?? null);
          setCourseSyncState({
            tone: 'error',
            message: '远端登录已过期，请重新登录后继续课程冲刺。',
          });
          return;
        }

        setWorkspaceStatus(createDegradedWorkspaceStatus());
        setCourseSyncState({
          tone: 'error',
          message: '课程冲刺同步失败，已恢复到上一次保存状态。',
        });
      });
  };

  const quickAdvanceLibraryTask = (resourceId: string) => {
    updateLibraryRuntime(
      resourceId,
      (current) => {
        const currentProgress = current.progressPercent ?? 0;
        const nextProgress = currentProgress >= 100 ? 100 : currentProgress <= 0 ? 25 : Math.min(100, currentProgress + 25);

        return {
          ...current,
          viewed: true,
          progressPercent: nextProgress,
          lastViewedAt: new Date().toISOString(),
        };
      },
      'view',
    );
  };

  const markConversationRead = (conversationId: string) => {
    updateConversations((current) => current.map((item) => (item.id === conversationId ? { ...item, unread: 0 } : item)));
    updateNotifications((current) =>
      current.map((item) => (item.conversationId === conversationId ? { ...item, read: true } : item)),
    );
  };

  const markNotificationRead = (notificationId: string) => {
    updateNotifications((current) => current.map((item) => (item.id === notificationId ? { ...item, read: true } : item)));
  };

  const clearReminderTasks = () => {
    updateConversations((current) => current.map((item) => ({ ...item, unread: 0 })));
    updateNotifications((current) => current.map((item) => ({ ...item, read: true })));
  };

  const restoreBackup = async (payload: AppBackupPayload) => {
    const nextSnapshot = {
      ...appDomain,
      profile: payload.snapshot.profile,
      courseRuntime: payload.snapshot.courseRuntime,
      libraryRuntime: payload.snapshot.libraryRuntime,
      ...(payload.scope === 'full_snapshot'
        ? {
            posts: payload.snapshot.posts,
            conversations: payload.snapshot.conversations,
            notifications: payload.snapshot.notifications,
            chatMessages: payload.snapshot.chatMessages,
            voiceRooms: payload.snapshot.voiceRooms,
          }
        : {}),
    };

    if (isWorkspaceDegraded) {
      setSnapshot(nextSnapshot);
      if (payload.scope === 'full_snapshot') {
        queuePendingCommunitySync(authSession?.account ?? null);
      }
      setSelectedCourseId(null);
      setSelectedResourceId(null);
      setActiveTab('profile');
      markWorkspaceLocallySaved();
      return;
    }

    try {
      const snapshot = await appGateway.sync.writeSnapshot(nextSnapshot);

      setSnapshot(snapshot);
      setSelectedCourseId(null);
      setSelectedResourceId(null);
      setActiveTab('profile');
      markWorkspaceSynced();
    } catch (error) {
      if (isAuthenticationRequiredError(error)) {
        handleExpiredWorkspaceSession(authSession?.account ?? profile.email ?? null);
      } else {
        setWorkspaceStatus(createDegradedWorkspaceStatus());
      }

      throw error;
    }
  };

  const persistProfileUpdate = async (value: SetStateAction<ProfileState>) => {
    const nextProfile = resolveSetStateAction(value, profile);
    const previousProfile = profile;

    setProfile(nextProfile);

    if (isWorkspaceDegraded) {
      markWorkspaceLocallySaved();
      return;
    }

    try {
      const savedProfile = await appGateway.profile.update(nextProfile);
      setProfile(savedProfile);
      markWorkspaceSynced();
    } catch (error) {
      setProfile(previousProfile);
      if (isAuthenticationRequiredError(error)) {
        queuePendingAuthReplay({
          kind: 'profile',
          accountHint: authSession?.account ?? nextProfile.email ?? profile.email ?? null,
          profile: nextProfile,
        });
        handleExpiredWorkspaceSession(authSession?.account ?? nextProfile.email ?? profile.email ?? null);
      } else {
        setWorkspaceStatus(createDegradedWorkspaceStatus());
      }

      throw error;
    }
  };

  const handleAuthenticate = async ({
    account,
    password,
    degree,
    displayName,
    mode,
  }: StudentAuthInput) => {
    const normalizedAccount = normalizeAccount(account);
    const nextProfile = {
      ...profile,
      name: profile.name === defaultProfile.name ? displayName : profile.name,
      email: normalizedAccount,
      role: mode === 'register' || profile.role === defaultProfile.role ? degreeRoleLabels[degree] : profile.role,
    };

    if (isWorkspaceDegraded) {
      setAuthSession({
        account: normalizedAccount,
        role: 'student',
        degree,
        lastAuthenticatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString(),
      });
      setProfile(nextProfile);
      setActiveTab('home');
      setCommunityCourseFocus(null);
      setCommunityInboxIntent(null);
      markWorkspaceLocallySaved();
      return;
    }

    try {
      const session = await (mode === 'register'
        ? appGateway.auth.register({
            account: normalizedAccount,
            password,
            degree,
            displayName,
            mode,
          })
        : appGateway.auth.login({
            account: normalizedAccount,
            password,
            degree,
            displayName,
            mode,
          }));
      try {
        const localSnapshot = readAppDomainSnapshot();
        const hydratedSnapshot = await appGateway.sync.readSnapshot();
        if (pendingRemoteCommunitySyncAccountRef.current === session.account) {
          await appGateway.sync.writeSnapshot({
            ...hydratedSnapshot,
            posts: localSnapshot.posts,
            conversations: localSnapshot.conversations,
            notifications: localSnapshot.notifications,
            chatMessages: localSnapshot.chatMessages,
            voiceRooms: localSnapshot.voiceRooms,
          });
          setPendingRemoteCommunitySyncAccount((current) => (current === session.account ? null : current));
          setSnapshot({
            ...hydratedSnapshot,
            posts: localSnapshot.posts,
            conversations: localSnapshot.conversations,
            notifications: localSnapshot.notifications,
            chatMessages: localSnapshot.chatMessages,
            voiceRooms: localSnapshot.voiceRooms,
          });
        } else {
          setSnapshot(hydratedSnapshot);
        }
        markWorkspaceSynced();
      } catch {
        setSnapshot(createFallbackAuthenticatedSnapshot(session, displayName));
        setHasPendingRemoteCoreSync(false);
        setWorkspaceStatus(createDegradedWorkspaceStatus());
      }

      restoreAuthResumeContext(session);
    } catch (error) {
      if (isAuthenticationRequiredError(error)) {
        handleExpiredWorkspaceSession(normalizedAccount);
      } else {
        setWorkspaceStatus(createDegradedWorkspaceStatus());
      }

      throw error;
    }
  };

  const handleProfessorApplication = (payload: ProfessorApplicationInput) =>
    isWorkspaceDegraded
      ? localAppGateway.auth.submitProfessorApplication(payload)
      : appGateway.auth.submitProfessorApplication(payload).catch((error) => {
          setWorkspaceStatus(createDegradedWorkspaceStatus());
          throw error;
        });

  const handleLogout = () => {
    if (isWorkspaceDegraded) {
      clearPendingAuthReplayQueue();
      setAuthResumeContext(null);
      setAuthSession(null);
      setActiveTab('home');
      setSelectedCourseId(null);
      setSelectedResourceId(null);
      setCommunityCourseFocus(null);
      setCommunityInboxIntent(null);
      markWorkspaceLocallySaved();
      return;
    }

    void appGateway.auth
      .logout()
      .then(async () => {
        clearPendingAuthReplayQueue();
        setAuthResumeContext(null);
        try {
          const hydratedSnapshot = await appGateway.sync.readSnapshot();
          setSnapshot(hydratedSnapshot);
          markWorkspaceSynced();
        } catch {
          setSnapshot(createFallbackLoggedOutSnapshot());
          setHasPendingRemoteCoreSync(false);
          setWorkspaceStatus(createDegradedWorkspaceStatus());
        }

        setActiveTab('home');
        setSelectedCourseId(null);
        setSelectedResourceId(null);
        setCommunityCourseFocus(null);
        setCommunityInboxIntent(null);
      })
      .catch(() => {
        setWorkspaceStatus(createDegradedWorkspaceStatus());
      });
  };

  if (!isSyncReady) {
    return (
      <div className="app-shell">
        <AppHeader activeTab={activeTab} />
        <main className="app-main">
          <section className="content-card">
            <p className="eyebrow">Workspace Sync</p>
            <h2>正在同步工作区</h2>
            <p className="hero-copy">正在通过统一服务层加载账号、课程、图书馆与个人资料状态。</p>
          </section>
        </main>
      </div>
    );
  }

  if (!authSession) {
    return (
      <AuthGateway
        initialAccount={authResumeContext?.accountHint ?? profile.email}
        resumeHint={workspaceStatus?.tone === 'expired' ? authResumePrompt : null}
        onAuthenticate={handleAuthenticate}
        onSubmitProfessorApplication={handleProfessorApplication}
        workspaceStatus={workspaceStatus}
        workspaceSessionProbeStatus={workspaceSessionProbeStatus}
        onRetryWorkspaceSync={handleRetryWorkspaceSync}
        onCheckWorkspaceSession={handleCheckWorkspaceSession}
        isRetryingWorkspaceSync={isRetryingWorkspaceSync}
        isCheckingWorkspaceSession={isCheckingWorkspaceSession}
      />
    );
  }

  const storageScopeKey = authSession.account;

  const tabContent = useMemo(() => {
    switch (activeTab) {
      case 'home':
        return (
          <HomeView
            profileName={profile.name}
            storageScopeKey={storageScopeKey}
            displayCourses={displayCourses}
            continueLearningCourses={continueLearningCourses}
            learningOverview={learningOverview}
            recentViewedResources={recentViewedResources}
            libraryRuntimeRecord={libraryRuntimeRecord}
            conversations={conversations}
            notifications={notifications}
            onOpenCourse={openCourse}
            onOpenResource={openResource}
            onOpenProfile={openProfile}
            onOpenCommunityInbox={openCommunityInbox}
          />
        );
      case 'courses':
        return (
          <CoursesView
            storageScopeKey={storageScopeKey}
            runtimeRecord={runtimeRecord}
            libraryRuntimeRecord={libraryRuntimeRecord}
            onUpdateRuntime={updateCourseRuntime}
            onUpdateLibraryRuntime={updateLibraryRuntime}
            runtimeSyncState={courseSyncState}
            selectedCourseId={selectedCourseId}
            onSelectCourse={setSelectedCourseId}
            communityPosts={posts}
            onOpenResource={openResource}
            onOpenCommunityCourse={openCommunityForCourse}
          />
        );
      case 'community':
        return (
          <CommunityView
            onOpenCourse={openCourse}
            onOpenResource={openResource}
            profile={profile}
            storageScopeKey={storageScopeKey}
            courseFocus={communityCourseFocus}
            inboxIntent={communityInboxIntent}
            posts={posts}
            onUpdatePosts={updatePosts}
            conversations={conversations}
            onUpdateConversations={updateConversations}
            notifications={notifications}
            onUpdateNotifications={updateNotifications}
            chatMessages={chatMessages}
            onUpdateChatMessages={updateChatMessages}
            voiceRooms={voiceRooms}
            onUpdateVoiceRooms={updateVoiceRooms}
            workspaceMode={appGatewayInfo.mode}
            workspaceStatusTone={workspaceStatus?.tone ?? null}
          />
        );
      case 'library':
        return (
          <LibraryView
            storageScopeKey={storageScopeKey}
            runtimeRecord={libraryRuntimeRecord}
            displayCourses={displayCourses}
            onUpdateRuntime={updateLibraryRuntime}
            runtimeSyncState={librarySyncState}
            onOpenCourse={openCourse}
            onOpenCommunityCourse={openCommunityForCourse}
            communityPosts={posts}
            selectedResourceId={selectedResourceId}
            onSelectResource={setSelectedResourceId}
          />
        );
      case 'profile':
        return (
          <ProfileView
            profile={profile}
            storageScopeKey={storageScopeKey}
            onUpdateProfile={persistProfileUpdate}
            workspaceStatus={workspaceStatus}
            workspaceSessionProbeStatus={workspaceSessionProbeStatus}
            workspaceSessionProbeHistoryItems={visibleWorkspaceSessionProbeHistory}
            workspaceModeLabel={appGatewayInfo.mode === 'remote' ? '远端模式' : '本地模式'}
            workspaceReason={appGatewayInfo.reason}
            workspaceLastSyncedAt={workspaceLastSyncedAt}
            workspacePendingSync={hasPendingRemoteCoreSync || hasPendingRemoteCommunitySync}
            pendingAuthReplayCount={visiblePendingAuthReplayCount}
            pendingAuthReplayItems={pendingAuthReplayItems}
            pendingAuthReplayHistoryItems={pendingAuthReplayHistoryItems}
            pendingAuthReplayStatus={pendingAuthReplayStatus}
            isReplayingPendingAuthQueue={isReplayingPendingAuthQueue}
            isCheckingWorkspaceSession={isCheckingWorkspaceSession}
            isRefreshingWorkspaceSession={isRefreshingWorkspaceSession}
            onRetryWorkspaceSync={handleRetryWorkspaceSync}
            onCheckWorkspaceSession={handleCheckWorkspaceSession}
            onRefreshWorkspaceSession={handleRefreshWorkspaceSession}
            onClearWorkspaceSessionProbeHistory={clearWorkspaceSessionProbeHistory}
            onReplayPendingAuthQueue={handleReplayPendingAuthQueue}
            onClearPendingAuthReplayQueue={clearVisiblePendingAuthReplayQueue}
            onRetryPendingAuthReplayHistoryItem={handleRetryPendingAuthReplayHistoryItem}
            onClearSuccessfulPendingAuthReplayHistory={clearSuccessfulPendingAuthReplayHistory}
            onClearPendingAuthReplayHistory={clearPendingAuthReplayHistory}
            isRetryingWorkspaceSync={isRetryingWorkspaceSync}
            displayCourses={displayCourses}
            libraryRuntimeRecord={libraryRuntimeRecord}
            rebuildMilestones={rebuildMilestones}
            continueLearningCourses={continueLearningCourses}
            learningOverview={learningOverview}
            recentViewedResources={recentViewedResources}
            communityPosts={posts}
            conversations={conversations}
            notifications={notifications}
            recentCommunityPosts={posts.slice(0, 2)}
            libraryViewedCount={libraryOverview.viewedCount}
            libraryFavoriteCount={libraryOverview.favoriteCount}
            createBackupPayload={getBackupPayload}
            onRestoreBackup={restoreBackup}
            onOpenCourse={openCourse}
            onOpenResource={openResource}
            onOpenCommunityCourse={openCommunityForCourse}
            onOpenCommunityInbox={openCommunityInbox}
            onQuickCompleteCourseTask={quickCompleteCourseTask}
            onQuickAdvanceLibraryTask={quickAdvanceLibraryTask}
            onMarkConversationRead={markConversationRead}
            onMarkNotificationRead={markNotificationRead}
            onClearReminderTasks={clearReminderTasks}
            onLogout={handleLogout}
          />
        );
      default:
        return null;
    }
  }, [
    activeTab,
    continueLearningCourses,
    learningOverview,
    recentViewedResources,
    libraryOverview.viewedCount,
    libraryOverview.favoriteCount,
    profile,
    runtimeRecord,
    selectedCourseId,
    selectedResourceId,
    libraryRuntimeRecord,
    posts,
    conversations,
    notifications,
    communityCourseFocus,
    communityInboxIntent,
    handleLogout,
    storageScopeKey,
  ]);

  return (
    <div className="app-shell">
      <AppHeader activeTab={activeTab} />
      {workspaceStatus && (
        <WorkspaceStatusBanner
          status={workspaceStatus}
          onRetry={handleRetryWorkspaceSync}
          probeStatus={workspaceSessionProbeStatus}
          onProbe={handleCheckWorkspaceSession}
          onRefresh={handleRefreshWorkspaceSession}
          isRetrying={isRetryingWorkspaceSync}
          isProbing={isCheckingWorkspaceSession}
          isRefreshing={isRefreshingWorkspaceSession}
        />
      )}
      <main className="app-main">{tabContent}</main>
      <BottomNav activeTab={activeTab} onChange={setActiveTab} badgeCounts={{ community: communityUnreadCount }} />
    </div>
  );
}

export default App;
