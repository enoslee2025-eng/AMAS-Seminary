import { AppDomainSnapshot, CourseRuntimeState, LibraryRuntimeState, ProfileState } from '../types/app';
import { AppGatewayInfo } from './appGateway';
import { createDefaultAppDomainSnapshot } from './appRepository';

function stringArraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function isProfileModified(current: ProfileState, baseline: ProfileState) {
  return (
    current.name !== baseline.name ||
    current.role !== baseline.role ||
    current.bio !== baseline.bio ||
    current.email !== baseline.email ||
    current.location !== baseline.location
  );
}

function isCourseRuntimeModified(current: CourseRuntimeState, baseline: CourseRuntimeState) {
  return (
    current.currentLessonId !== baseline.currentLessonId ||
    current.lastStudiedAt !== baseline.lastStudiedAt ||
    current.lastOpenedTab !== baseline.lastOpenedTab ||
    !stringArraysEqual(current.completedLessonIds, baseline.completedLessonIds) ||
    !stringArraysEqual(current.viewedMaterialIds, baseline.viewedMaterialIds)
  );
}

function isLibraryRuntimeModified(current: LibraryRuntimeState, baseline: LibraryRuntimeState) {
  return (
    current.favorite !== baseline.favorite ||
    current.viewed !== baseline.viewed ||
    current.progressPercent !== baseline.progressPercent ||
    current.downloaded !== baseline.downloaded ||
    current.lastViewedAt !== baseline.lastViewedAt
  );
}

function isCoreSnapshotModified(snapshot: AppDomainSnapshot) {
  const baseline = createDefaultAppDomainSnapshot();

  if (snapshot.authSession !== null) {
    return true;
  }

  if (isProfileModified(snapshot.profile, baseline.profile)) {
    return true;
  }

  const hasCourseProgress = Object.entries(baseline.courseRuntime).some(([courseId, runtime]) =>
    isCourseRuntimeModified(snapshot.courseRuntime[courseId] ?? runtime, runtime),
  );

  if (hasCourseProgress) {
    return true;
  }

  return Object.entries(baseline.libraryRuntime).some(([resourceId, runtime]) =>
    isLibraryRuntimeModified(snapshot.libraryRuntime[resourceId] ?? runtime, runtime),
  );
}

type StartupSnapshotInput = {
  gatewayMode: AppGatewayInfo['mode'];
  localSnapshot: AppDomainSnapshot;
  remoteSnapshot: AppDomainSnapshot;
};

export function shouldBootstrapRemoteCore({ gatewayMode, localSnapshot, remoteSnapshot }: StartupSnapshotInput) {
  if (gatewayMode !== 'remote') {
    return false;
  }

  if (!localSnapshot.authSession || !remoteSnapshot.authSession) {
    return false;
  }

  if (localSnapshot.authSession.account !== remoteSnapshot.authSession.account) {
    return false;
  }

  return !isCoreSnapshotModified(remoteSnapshot) && isCoreSnapshotModified(localSnapshot);
}

export function resolveStartupSnapshot({ gatewayMode, localSnapshot, remoteSnapshot }: StartupSnapshotInput) {
  const bootstrapCore = shouldBootstrapRemoteCore({
    gatewayMode,
    localSnapshot,
    remoteSnapshot,
  });
  const shouldKeepLocalCommunity = gatewayMode === 'remote';
  const shouldKeepLocalChatMessages =
    shouldKeepLocalCommunity && Object.keys(remoteSnapshot.chatMessages).length === 0;
  const shouldKeepLocalVoiceRooms = shouldKeepLocalCommunity && remoteSnapshot.voiceRooms.length === 0;

  return {
    ...remoteSnapshot,
    authSession: bootstrapCore ? localSnapshot.authSession : remoteSnapshot.authSession,
    profile: bootstrapCore ? localSnapshot.profile : remoteSnapshot.profile,
    courseRuntime: bootstrapCore ? localSnapshot.courseRuntime : remoteSnapshot.courseRuntime,
    libraryRuntime: bootstrapCore ? localSnapshot.libraryRuntime : remoteSnapshot.libraryRuntime,
    posts:
      shouldKeepLocalCommunity && remoteSnapshot.posts.length === 0 ? localSnapshot.posts : remoteSnapshot.posts,
    conversations:
      shouldKeepLocalCommunity && remoteSnapshot.conversations.length === 0
        ? localSnapshot.conversations
        : remoteSnapshot.conversations,
    notifications:
      shouldKeepLocalCommunity && remoteSnapshot.notifications.length === 0
        ? localSnapshot.notifications
        : remoteSnapshot.notifications,
    chatMessages: shouldKeepLocalChatMessages ? localSnapshot.chatMessages : remoteSnapshot.chatMessages,
    voiceRooms: shouldKeepLocalVoiceRooms ? localSnapshot.voiceRooms : remoteSnapshot.voiceRooms,
  };
}
