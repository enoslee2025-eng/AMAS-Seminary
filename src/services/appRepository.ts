import { SetStateAction, useEffect, useState } from 'react';
import {
  communityChatMessages,
  communityConversations,
  communityNotifications,
  communityPosts,
  communityVoiceRooms,
  courses,
  defaultProfile,
  libraryResources,
} from '../data/mockData';
import { createInitialCourseRuntime } from '../features/courses/courseState';
import { clampLibraryProgress, createInitialLibraryRuntime } from '../features/library/libraryState';
import {
  AppDomainSnapshot,
  AuthSession,
  ChatMessage,
  ChatMessageRecord,
  CommunityNotification,
  CommunityPostPreview,
  ConversationPreview,
  CourseDetailTab,
  CourseRuntimeRecord,
  LibraryRuntimeRecord,
  ProfileState,
  VoiceRoom,
} from '../types/app';

export const appDomainStorageKey = 'amas_app_domain_state_v1';

const legacyStorageKeys = {
  authSession: 'amas_auth_session',
  profile: 'amas_profile_state',
  courseRuntime: 'amas_courses_runtime',
  libraryRuntime: 'amas_library_runtime',
  posts: 'amas_community_posts',
  conversations: 'amas_community_conversations',
  notifications: 'amas_community_notifications',
  chatMessages: 'amas_community_chat_messages',
  voiceRooms: 'amas_community_voice_rooms',
} as const;

function resolveSetStateAction<T>(value: SetStateAction<T>, current: T): T {
  return typeof value === 'function' ? (value as (previous: T) => T)(current) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isCourseDetailTab(value: unknown): value is CourseDetailTab {
  return value === 'overview' || value === 'syllabus' || value === 'materials';
}

function isAuthSession(value: unknown): value is AuthSession {
  return (
    isRecord(value) &&
    typeof value.account === 'string' &&
    (value.role === 'student' || value.role === 'professor') &&
    typeof value.degree === 'string' &&
    typeof value.lastAuthenticatedAt === 'string' &&
    (!('expiresAt' in value) || value.expiresAt === null || typeof value.expiresAt === 'string')
  );
}

function isProfileState(value: unknown): value is ProfileState {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.role === 'string' &&
    typeof value.bio === 'string' &&
    typeof value.email === 'string' &&
    typeof value.location === 'string'
  );
}

export function createDefaultAppDomainSnapshot(): AppDomainSnapshot {
  return {
    version: 1,
    authSession: null,
    profile: defaultProfile,
    courseRuntime: createInitialCourseRuntime(courses),
    libraryRuntime: createInitialLibraryRuntime(libraryResources),
    posts: communityPosts,
    conversations: communityConversations,
    notifications: communityNotifications,
    chatMessages: communityChatMessages,
    voiceRooms: communityVoiceRooms,
  };
}

function normalizeCourseRuntime(value: unknown): CourseRuntimeRecord {
  const fallback = createInitialCourseRuntime(courses);
  if (!isRecord(value)) {
    return fallback;
  }

  return courses.reduce<CourseRuntimeRecord>((accumulator, course) => {
    const runtime = value[course.id];
    const fallbackRuntime = fallback[course.id];

    if (!isRecord(runtime)) {
      accumulator[course.id] = fallbackRuntime;
      return accumulator;
    }

    accumulator[course.id] = {
      currentLessonId:
        runtime.currentLessonId === null || typeof runtime.currentLessonId === 'string'
          ? runtime.currentLessonId
          : fallbackRuntime.currentLessonId,
      completedLessonIds: isStringArray(runtime.completedLessonIds) ? Array.from(new Set(runtime.completedLessonIds)) : fallbackRuntime.completedLessonIds,
      viewedMaterialIds: isStringArray(runtime.viewedMaterialIds) ? Array.from(new Set(runtime.viewedMaterialIds)) : [],
      lastStudiedAt: runtime.lastStudiedAt === null || typeof runtime.lastStudiedAt === 'string' ? runtime.lastStudiedAt : null,
      lastOpenedTab: isCourseDetailTab(runtime.lastOpenedTab) ? runtime.lastOpenedTab : fallbackRuntime.lastOpenedTab,
    };

    return accumulator;
  }, {});
}

function normalizeLibraryRuntime(value: unknown): LibraryRuntimeRecord {
  const fallback = createInitialLibraryRuntime(libraryResources);
  if (!isRecord(value)) {
    return fallback;
  }

  return libraryResources.reduce<LibraryRuntimeRecord>((accumulator, resource) => {
    const runtime = value[resource.id];
    const fallbackRuntime = fallback[resource.id];

    if (!isRecord(runtime)) {
      accumulator[resource.id] = fallbackRuntime;
      return accumulator;
    }

    accumulator[resource.id] = {
      favorite: typeof runtime.favorite === 'boolean' ? runtime.favorite : fallbackRuntime.favorite,
      viewed: typeof runtime.viewed === 'boolean' ? runtime.viewed : fallbackRuntime.viewed,
      progressPercent:
        typeof runtime.progressPercent === 'number' ? clampLibraryProgress(runtime.progressPercent) : fallbackRuntime.progressPercent,
      downloaded: typeof runtime.downloaded === 'boolean' ? runtime.downloaded : fallbackRuntime.downloaded,
      lastViewedAt: runtime.lastViewedAt === null || typeof runtime.lastViewedAt === 'string' ? runtime.lastViewedAt : null,
    };

    return accumulator;
  }, {});
}

function normalizePosts(value: unknown): CommunityPostPreview[] {
  return Array.isArray(value) ? (value as CommunityPostPreview[]) : communityPosts;
}

function normalizeConversations(value: unknown): ConversationPreview[] {
  return Array.isArray(value) ? (value as ConversationPreview[]) : communityConversations;
}

function normalizeNotifications(value: unknown): CommunityNotification[] {
  return Array.isArray(value) ? (value as CommunityNotification[]) : communityNotifications;
}

function normalizeChatMessages(value: unknown): ChatMessageRecord {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([conversationId, messages]) => [
      conversationId,
      Array.isArray(messages) ? (messages as ChatMessage[]) : [],
    ]),
  );
}

function normalizeVoiceRooms(value: unknown): VoiceRoom[] {
  return Array.isArray(value) ? (value as VoiceRoom[]) : communityVoiceRooms;
}

export function normalizeAppDomainSnapshot(value: unknown): AppDomainSnapshot {
  const fallback = createDefaultAppDomainSnapshot();
  if (!isRecord(value)) {
    return fallback;
  }

  return {
    version: 1,
    authSession: value.authSession === null || isAuthSession(value.authSession) ? value.authSession : fallback.authSession,
    profile: isProfileState(value.profile) ? value.profile : fallback.profile,
    courseRuntime: normalizeCourseRuntime(value.courseRuntime),
    libraryRuntime: normalizeLibraryRuntime(value.libraryRuntime),
    posts: normalizePosts(value.posts),
    conversations: normalizeConversations(value.conversations),
    notifications: normalizeNotifications(value.notifications),
    chatMessages: normalizeChatMessages(value.chatMessages),
    voiceRooms: normalizeVoiceRooms(value.voiceRooms),
  };
}

function readStorageValue<T>(key: string): T | null {
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : null;
  } catch {
    return null;
  }
}

function readLegacySnapshot(): AppDomainSnapshot {
  const fallback = createDefaultAppDomainSnapshot();

  return normalizeAppDomainSnapshot({
    version: 1,
    authSession: readStorageValue<AuthSession | null>(legacyStorageKeys.authSession) ?? fallback.authSession,
    profile: readStorageValue<ProfileState>(legacyStorageKeys.profile) ?? fallback.profile,
    courseRuntime: readStorageValue<CourseRuntimeRecord>(legacyStorageKeys.courseRuntime) ?? fallback.courseRuntime,
    libraryRuntime: readStorageValue<LibraryRuntimeRecord>(legacyStorageKeys.libraryRuntime) ?? fallback.libraryRuntime,
    posts: readStorageValue<CommunityPostPreview[]>(legacyStorageKeys.posts) ?? fallback.posts,
    conversations: readStorageValue<ConversationPreview[]>(legacyStorageKeys.conversations) ?? fallback.conversations,
    notifications: readStorageValue<CommunityNotification[]>(legacyStorageKeys.notifications) ?? fallback.notifications,
    chatMessages: readStorageValue<ChatMessageRecord>(legacyStorageKeys.chatMessages) ?? fallback.chatMessages,
    voiceRooms: readStorageValue<VoiceRoom[]>(legacyStorageKeys.voiceRooms) ?? fallback.voiceRooms,
  });
}

export function readAppDomainSnapshot(): AppDomainSnapshot {
  const snapshot = readStorageValue<AppDomainSnapshot>(appDomainStorageKey);
  if (snapshot) {
    const snapshotRecord = isRecord(snapshot) ? snapshot : null;
    const hasSnapshotChatMessages = Boolean(snapshotRecord && 'chatMessages' in snapshotRecord);
    return normalizeAppDomainSnapshot(
      hasSnapshotChatMessages
        ? snapshot
        : {
            ...(snapshotRecord ?? {}),
            chatMessages:
              readStorageValue<ChatMessageRecord>(legacyStorageKeys.chatMessages) ??
              createDefaultAppDomainSnapshot().chatMessages,
          },
    );
  }

  return readLegacySnapshot();
}

export function writeAppDomainSnapshot(snapshot: AppDomainSnapshot) {
  const normalized = normalizeAppDomainSnapshot(snapshot);

  try {
    window.localStorage.setItem(appDomainStorageKey, JSON.stringify(normalized));
  } catch {
    // Ignore storage failures in rebuild shell.
  }

  return normalized;
}

export function useAppDomainState() {
  const [snapshot, setSnapshot] = useState<AppDomainSnapshot>(() => readAppDomainSnapshot());

  useEffect(() => {
    writeAppDomainSnapshot(snapshot);
  }, [snapshot]);

  const setAuthSession = (value: SetStateAction<AuthSession | null>) => {
    setSnapshot((current) => ({
      ...current,
      authSession: resolveSetStateAction(value, current.authSession),
    }));
  };

  const setProfile = (value: SetStateAction<ProfileState>) => {
    setSnapshot((current) => ({
      ...current,
      profile: resolveSetStateAction(value, current.profile),
    }));
  };

  const setCourseRuntime = (value: SetStateAction<CourseRuntimeRecord>) => {
    setSnapshot((current) => ({
      ...current,
      courseRuntime: normalizeCourseRuntime(resolveSetStateAction(value, current.courseRuntime)),
    }));
  };

  const setLibraryRuntime = (value: SetStateAction<LibraryRuntimeRecord>) => {
    setSnapshot((current) => ({
      ...current,
      libraryRuntime: normalizeLibraryRuntime(resolveSetStateAction(value, current.libraryRuntime)),
    }));
  };

  const setPosts = (value: SetStateAction<CommunityPostPreview[]>) => {
    setSnapshot((current) => ({
      ...current,
      posts: normalizePosts(resolveSetStateAction(value, current.posts)),
    }));
  };

  const setConversations = (value: SetStateAction<ConversationPreview[]>) => {
    setSnapshot((current) => ({
      ...current,
      conversations: normalizeConversations(resolveSetStateAction(value, current.conversations)),
    }));
  };

  const setNotifications = (value: SetStateAction<CommunityNotification[]>) => {
    setSnapshot((current) => ({
      ...current,
      notifications: normalizeNotifications(resolveSetStateAction(value, current.notifications)),
    }));
  };

  const setChatMessages = (value: SetStateAction<ChatMessageRecord>) => {
    setSnapshot((current) => ({
      ...current,
      chatMessages: normalizeChatMessages(resolveSetStateAction(value, current.chatMessages)),
    }));
  };

  const setVoiceRooms = (value: SetStateAction<VoiceRoom[]>) => {
    setSnapshot((current) => ({
      ...current,
      voiceRooms: normalizeVoiceRooms(resolveSetStateAction(value, current.voiceRooms)),
    }));
  };

  return {
    snapshot,
    setSnapshot,
    setAuthSession,
    setProfile,
    setCourseRuntime,
    setLibraryRuntime,
    setPosts,
    setConversations,
    setNotifications,
    setChatMessages,
    setVoiceRooms,
  };
}
