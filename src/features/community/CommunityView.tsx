import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { communityContacts, courses, libraryResources } from '../../data/mockData';
import { useScopedPersistentState } from '../../hooks/usePersistentState';
import {
  ChatMessage,
  ChatMessageRecord,
  CommunityContact,
  CommunityNotification,
  CommunityNotificationType,
  CommunityPostPreview,
  ConversationPreview,
  ProfileState,
  VoiceRoom,
  WorkspaceStatus,
} from '../../types/app';
import { ChatView } from './ChatView';
import { VoiceRoomsPanel } from './VoiceRoomsPanel';
import { createProcessedQueueLogItem } from '../profile/profileState';
import { useProcessedQueueLog } from '../profile/useProcessedQueueLog';
import {
    buildConversationFromContact,
    buildConversationNotification,
    createAutoReplyMessage,
    createContactIntroMessage,
    createVoiceRoomRecapMessage,
    createVoiceRoomRecapPost,
    createVoiceRoomInviteMessage,
    filterContacts,
    getChatMessagePreview,
  getDisplayTimeSortValue,
  sortNotifications,
  getContactConversationId,
  sortConversations,
} from './communityState';

type CommunitySection = 'feed' | 'rooms' | 'conversations' | 'notifications';
type FeedFilter = 'all' | '课程感悟' | '代祷实践' | '系统公告' | '恢复记录';
type NotificationFilter = 'all' | 'unread' | 'interaction' | 'system';
type PostFollowUpAction =
  | { kind: 'contact'; label: string; contact: CommunityContact }
  | { kind: 'conversation'; label: string; conversationId: string };

export function CommunityView({
  onOpenCourse,
  onOpenResource,
  profile,
  storageScopeKey,
  courseFocus,
  inboxIntent,
  posts,
  onUpdatePosts,
  conversations,
  onUpdateConversations,
  notifications,
  onUpdateNotifications,
  chatMessages,
  onUpdateChatMessages,
  voiceRooms,
  onUpdateVoiceRooms,
  workspaceMode,
  workspaceStatusTone,
}: {
  onOpenCourse: (courseId: string) => void;
  onOpenResource: (resourceId: string) => void;
  profile: ProfileState;
  storageScopeKey: string;
  courseFocus: { courseId: string; token: number; mode: 'feed' | 'compose'; draft?: string } | null;
  inboxIntent: { token: number; section: 'conversations' | 'notifications'; conversationId?: string; notificationId?: string } | null;
  posts: CommunityPostPreview[];
  onUpdatePosts: Dispatch<SetStateAction<CommunityPostPreview[]>>;
  conversations: ConversationPreview[];
  onUpdateConversations: Dispatch<SetStateAction<ConversationPreview[]>>;
  notifications: CommunityNotification[];
  onUpdateNotifications: Dispatch<SetStateAction<CommunityNotification[]>>;
  chatMessages: ChatMessageRecord;
  onUpdateChatMessages: Dispatch<SetStateAction<ChatMessageRecord>>;
  voiceRooms: VoiceRoom[];
  onUpdateVoiceRooms: Dispatch<SetStateAction<VoiceRoom[]>>;
  workspaceMode: 'local' | 'remote';
  workspaceStatusTone: WorkspaceStatus['tone'] | null;
}) {
  const [activeSection, setActiveSection] = useScopedPersistentState<CommunitySection>('amas_community_section', storageScopeKey, 'feed');
  const [selectedConversationId, setSelectedConversationId] = useScopedPersistentState<string | null>(
    'amas_community_selected_conversation',
    storageScopeKey,
    null,
  );
  const [selectedRoomId, setSelectedRoomId] = useScopedPersistentState<string | null>(
    'amas_community_selected_voice_room',
    storageScopeKey,
    null,
  );
  const [chatReturnSection, setChatReturnSection] = useScopedPersistentState<CommunitySection>(
    'amas_community_chat_return_section',
    storageScopeKey,
    'conversations',
  );
  const [highlightedPostId, setHighlightedPostId] = useScopedPersistentState<string | null>(
    'amas_community_highlight_post',
    storageScopeKey,
    null,
  );
  const [feedFilter, setFeedFilter] = useScopedPersistentState<FeedFilter>('amas_community_feed_filter', storageScopeKey, 'all');
  const [activeCourseContextId, setActiveCourseContextId] = useScopedPersistentState<string | null>(
    'amas_community_course_context',
    storageScopeKey,
    null,
  );
  const [conversationSearch, setConversationSearch] = useScopedPersistentState(
    'amas_community_conversation_search',
    storageScopeKey,
    '',
  );
  const [contactSearch, setContactSearch] = useScopedPersistentState('amas_community_contact_search', storageScopeKey, '');
  const [notificationFilter, setNotificationFilter] = useScopedPersistentState<NotificationFilter>(
    'amas_community_notification_filter',
    storageScopeKey,
    'all',
  );
  const [composerText, setComposerText] = useScopedPersistentState('amas_community_composer_text', storageScopeKey, '');
  const [composerCourseId, setComposerCourseId] = useScopedPersistentState<string>(
    'amas_community_composer_course',
    storageScopeKey,
    '',
  );
  const [activeCommentPostId, setActiveCommentPostId] = useScopedPersistentState<string | null>(
    'amas_community_comment_post',
    storageScopeKey,
    null,
  );
  const [commentDrafts, setCommentDrafts] = useScopedPersistentState<Record<string, string>>(
    'amas_community_comment_drafts',
    storageScopeKey,
    {},
  );
  const [highlightedNotificationId, setHighlightedNotificationId] = useState<string | null>(null);
  const [, , appendProcessedQueueLog] = useProcessedQueueLog(storageScopeKey);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedConversationIdRef = useRef<string | null>(selectedConversationId);
  const conversationsRef = useRef<ConversationPreview[]>(conversations);
  const replyTimersRef = useRef<number[]>([]);
  const unreadCount = conversations.reduce((sum, item) => sum + item.unread, 0);
  const unreadNotifications = notifications.filter((item) => !item.read).length;
  const liveRoomCount = voiceRooms.filter((room) => room.status === 'live').length;
  const joinedRoomCount = voiceRooms.filter((room) => room.joined).length;
  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );
  const courseContext = useMemo(
    () => (activeCourseContextId ? courses.find((item) => item.id === activeCourseContextId) ?? null : null),
    [activeCourseContextId],
  );
  const relatedResources = useMemo(
    () => (activeCourseContextId ? libraryResources.filter((resource) => resource.relatedCourseId === activeCourseContextId) : []),
    [activeCourseContextId],
  );
  const filteredPosts = useMemo(
    () => (feedFilter === 'all' ? posts : posts.filter((item) => item.badge === feedFilter)),
    [feedFilter, posts],
  );
  const visibleFeedPosts = useMemo(
    () => (activeCourseContextId ? filteredPosts.filter((item) => item.courseId === activeCourseContextId) : filteredPosts),
    [activeCourseContextId, filteredPosts],
  );
  const courseInsightRows = useMemo(() => {
    const counts = posts.reduce<Record<string, number>>((accumulator, post) => {
      if (!post.courseId) {
        return accumulator;
      }

      accumulator[post.courseId] = (accumulator[post.courseId] ?? 0) + 1;
      return accumulator;
    }, {});

    return Object.entries(counts)
      .map(([courseId, count]) => {
        const course = courses.find((item) => item.id === courseId);
        return course ? { courseId, title: course.title, count } : null;
      })
      .filter((item): item is { courseId: string; title: string; count: number } => item !== null)
      .sort((left, right) => right.count - left.count);
  }, [posts]);

  const visibleConversations = useMemo(() => sortConversations(conversations, conversationSearch), [conversationSearch, conversations]);
  const visibleContacts = useMemo(() => filterContacts(communityContacts, contactSearch), [contactSearch]);
  const adminConversationId = useMemo(
    () => conversations.find((item) => item.id === 'conv-1' || item.name.includes('教务') || item.role === 'Admin')?.id ?? null,
    [conversations],
  );

  const notificationOverview = useMemo(
    () => ({
      unread: notifications.filter((item) => !item.read).length,
      interaction: notifications.filter((item) => item.type === 'interaction').length,
      system: notifications.filter((item) => item.type === 'system').length,
    }),
    [notifications],
  );
  const currentUserIdentity = useMemo(
    () => ({
      name: profile.name.trim() || 'AMAS 学员',
      role: profile.role.trim() || '亚洲宣教神学院 学员',
    }),
    [profile.name, profile.role],
  );

  const filteredNotifications = useMemo(() => {
    return sortNotifications(notifications, notificationFilter);
  }, [notificationFilter, notifications]);
  const communitySyncSummary = useMemo(() => {
    if (workspaceMode === 'local') {
      return '当前所有动态、语音房壳子、消息和通知都保存在本地恢复工作区。';
    }

    if (workspaceStatusTone === 'degraded' || workspaceStatusTone === 'expired') {
      return '当前变更会先保存在本地，连接恢复后再通过统一快照写回远端。';
    }

    return '当前变更会通过统一快照跟随账号一起写回远端，但真实语音与独立互动服务仍在后续恢复清单里。';
  }, [workspaceMode, workspaceStatusTone]);
  const nextUnreadNotification = useMemo(() => sortNotifications(notifications, 'unread')[0] ?? null, [notifications]);
  const topUnreadConversation = useMemo(
    () =>
      [...conversations]
        .filter((conversation) => conversation.unread > 0)
        .sort((left, right) => {
          if (right.unread !== left.unread) {
            return right.unread - left.unread;
          }

          return getDisplayTimeSortValue(right.time) - getDisplayTimeSortValue(left.time);
        })[0] ?? null,
    [conversations],
  );

  const prependNotification = (notification: CommunityNotification) => {
    onUpdateNotifications((current) => [notification, ...current]);
  };

  const truncateProcessedText = (value: string, maxLength = 36) =>
    value.length > maxLength ? `${value.slice(0, maxLength).trim()}...` : value;

  const createNotification = (
    title: string,
    detail: string,
    type: CommunityNotificationType,
    extras?: Partial<CommunityNotification>,
  ): CommunityNotification => ({
    id: `notice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    detail,
    time: '刚刚',
    type,
    read: false,
    ...extras,
  });

  const handleNotificationAction = (notification: CommunityNotification, action: (shouldLog: boolean) => void) => {
    const shouldLog = !notification.read;
    onUpdateNotifications((current) =>
      current.map((item) => (item.id === notification.id ? { ...item, read: true } : item)),
    );
    action(shouldLog);
  };

  const resolveNotificationPost = (notification: CommunityNotification) =>
    notification.postId ? posts.find((item) => item.id === notification.postId) ?? null : null;

  const resolveNotificationVoiceRoomId = (
    notification: CommunityNotification,
    relatedPost: CommunityPostPreview | null = resolveNotificationPost(notification),
  ) => notification.voiceRoomId ?? relatedPost?.voiceRoomId ?? null;

  const resolveNotificationVoiceRoom = (
    notification: CommunityNotification,
    relatedPost: CommunityPostPreview | null = resolveNotificationPost(notification),
  ) => {
    const roomId = resolveNotificationVoiceRoomId(notification, relatedPost);
    return roomId ? voiceRooms.find((item) => item.id === roomId) ?? null : null;
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

  const logReminderAction = (title: string, detail: string, actionLabel: string, impactCount = 1) => {
    appendProcessedQueueLog(
      createProcessedQueueLogItem({
        category: 'reminder',
        title,
        detail,
        actionLabel,
        impactCount,
      }),
    );
  };

  const findContactByName = (name: string) =>
    communityContacts.find((contact) => contact.name.trim().toLowerCase() === name.trim().toLowerCase()) ?? null;

  const resolvePostFollowUpAction = (post: CommunityPostPreview): PostFollowUpAction | null => {
    const exactAuthorContact = findContactByName(post.author);
    if (exactAuthorContact) {
      return {
        kind: 'contact',
        label: '联系作者',
        contact: exactAuthorContact,
      };
    }

    if (post.courseId) {
      const relatedContact = communityContacts.find((contact) => contact.relatedCourseId === post.courseId) ?? null;
      if (relatedContact) {
        return {
          kind: 'contact',
          label: '联系相关同工',
          contact: relatedContact,
        };
      }
    }

    if (!post.courseId && post.author.includes('教务') && adminConversationId) {
      return {
        kind: 'conversation',
        label: '打开教务通知',
        conversationId: adminConversationId,
      };
    }

    return null;
  };

  const touchConversation = (conversationId: string, patch: Partial<(typeof conversations)[number]>) => {
    onUpdateConversations((current) => {
      const target = current.find((item) => item.id === conversationId);
      if (!target) {
        return current;
      }

      const next = { ...target, ...patch };
      return [next, ...current.filter((item) => item.id !== conversationId)];
    });
  };

  const updateConversationFlags = (conversationId: string, patch: Partial<(typeof conversations)[number]>) => {
    onUpdateConversations((current) => current.map((item) => (item.id === conversationId ? { ...item, ...patch } : item)));
  };

  const handleOpenConversation = (conversationId: string) => {
    const conversation = conversations.find((item) => item.id === conversationId) ?? null;
    setChatReturnSection(activeSection);
    setSelectedConversationId(conversationId);
    onUpdateConversations((current) => current.map((item) => (item.id === conversationId ? { ...item, unread: 0 } : item)));
    onUpdateNotifications((current) =>
      current.map((item) => (item.conversationId === conversationId ? { ...item, read: true } : item)),
    );

    if (conversation && conversation.unread > 0) {
      logReminderAction(
        `处理会话未读：${conversation.name}`,
        truncateProcessedText(conversation.subtitle),
        '清空未读',
        conversation.unread,
      );
    }
  };

  const handleOpenNotificationPost = (
    notification: CommunityNotification,
    relatedPost: CommunityPostPreview | null = resolveNotificationPost(notification),
    shouldLog = !notification.read,
  ) => {
    if (!notification.postId || !relatedPost) {
      return false;
    }

    setSelectedConversationId(null);
    setFeedFilter('all');
    setActiveCourseContextId(notification.courseId ?? relatedPost.courseId ?? null);
    setHighlightedPostId(notification.postId);
    setActiveCommentPostId(notification.postId);
    setActiveSection('feed');
    if (shouldLog) {
      logReminderAction(notification.title, truncateProcessedText(notification.detail), '处理通知');
    }
    return true;
  };

  const handleOpenNotificationVoiceRoom = (
    notification: CommunityNotification,
    roomId: string | null = resolveNotificationVoiceRoomId(notification),
    shouldLog = !notification.read,
  ) => {
    if (!roomId) {
      return false;
    }

    setSelectedConversationId(null);
    setSelectedRoomId(roomId);
    setActiveSection('rooms');
    if (shouldLog) {
      logReminderAction(notification.title, truncateProcessedText(notification.detail), '处理通知');
    }
    return true;
  };

  const handleOpenNotificationCourse = (
    notification: CommunityNotification,
    courseId: string | undefined = notification.courseId,
    shouldLog = !notification.read,
  ) => {
    if (!courseId) {
      return false;
    }

    if (shouldLog) {
      logReminderAction(notification.title, truncateProcessedText(notification.detail), '处理通知');
    }
    onOpenCourse(courseId);
    return true;
  };

  const handleNotificationClick = (notification: CommunityNotification) => {
    const relatedPost = resolveNotificationPost(notification);
    const relatedVoiceRoomId = resolveNotificationVoiceRoomId(notification, relatedPost);

    handleNotificationAction(notification, (shouldLog) => {
      if (handleOpenNotificationPost(notification, relatedPost, shouldLog)) {
        return;
      }

      if (handleOpenNotificationVoiceRoom(notification, relatedVoiceRoomId, shouldLog)) {
        return;
      }

      if (handleOpenNotificationCourse(notification, notification.courseId, shouldLog)) {
        return;
      }

      if (notification.conversationId) {
        handleOpenConversation(notification.conversationId);
        return;
      }

      if (shouldLog) {
        logReminderAction(notification.title, truncateProcessedText(notification.detail), '处理通知');
      }
    });
  };

  const handleMarkAllNotificationsRead = () => {
    const unreadNotificationCount = notifications.filter((item) => !item.read).length;
    onUpdateNotifications((current) => current.map((item) => ({ ...item, read: true })));

    if (unreadNotificationCount > 0) {
      logReminderAction('批量处理通知', '通知中心里的未读项已全部标记为已读。', '全部标为已读', unreadNotificationCount);
    }
  };

  const handleClearAllReminders = () => {
    const totalReminderCount =
      conversations.reduce((sum, item) => sum + item.unread, 0) + notifications.filter((item) => !item.read).length;
    onUpdateConversations((current) => current.map((item) => ({ ...item, unread: 0 })));
    onUpdateNotifications((current) => current.map((item) => ({ ...item, read: true })));
    setHighlightedNotificationId(null);

    if (totalReminderCount > 0) {
      logReminderAction('批量清空社区提醒', '最近消息和通知中心的未读提醒已一次性清理完成。', '清空全部提醒', totalReminderCount);
    }
  };

  const handleStartConversation = (contact: CommunityContact) => {
    const existingConversation =
      conversations.find((item) => item.contactId === contact.id) ??
      conversations.find((item) => item.id === getContactConversationId(contact.id));
    const conversationId = existingConversation?.id ?? getContactConversationId(contact.id);

    if (!existingConversation) {
      const introMessage = createContactIntroMessage(contact);

      onUpdateConversations((current) => [buildConversationFromContact(contact), ...current.filter((item) => item.id !== conversationId)]);
      onUpdateChatMessages((current) => ({
        ...current,
        [conversationId]: current[conversationId] ?? [introMessage],
      }));
      prependNotification(
        createNotification(
          `已建立联系：${contact.name}`,
          '新的联系人会话已经加入最近消息，后续可以继续补真实联系人映射和会话同步。',
          'system',
          {
            conversationId,
            ...(contact.relatedCourseId ? { courseId: contact.relatedCourseId } : undefined),
          },
        ),
      );
    }

    setChatReturnSection('conversations');
    handleOpenConversation(conversationId);
  };

  const handleSendMessage = (conversationId: string, message: ChatMessage) => {
    onUpdateChatMessages((current) => ({
      ...current,
      [conversationId]: [...(current[conversationId] ?? []), message],
    }));
    touchConversation(conversationId, {
      subtitle: getChatMessagePreview(message),
      time: message.time,
      unread: 0,
    });

    const conversation = conversationsRef.current.find((item) => item.id === conversationId);
    if (!conversation) {
      return;
    }

    logLearningAction(`回复会话：${conversation.name}`, truncateProcessedText(getChatMessagePreview(message)), '发送消息');

    const timer = window.setTimeout(() => {
      const latestConversation = conversationsRef.current.find((item) => item.id === conversationId) ?? conversation;
      const reply = createAutoReplyMessage(latestConversation);
      onUpdateChatMessages((current) => ({
        ...current,
        [conversationId]: [...(current[conversationId] ?? []), reply],
      }));
      onUpdateConversations((current) => {
        const target = current.find((item) => item.id === conversationId);
        if (!target) {
          return current;
        }

        const isConversationOpen = selectedConversationIdRef.current === conversationId;
        const next = {
          ...target,
          subtitle: reply.content,
          time: reply.time,
          unread: isConversationOpen ? 0 : target.unread + 1,
        };

        return [next, ...current.filter((item) => item.id !== conversationId)];
      });

      if (selectedConversationIdRef.current !== conversationId && !latestConversation.muted) {
        prependNotification(buildConversationNotification(latestConversation, reply));
      }

      replyTimersRef.current = replyTimersRef.current.filter((item) => item !== timer);
    }, 1200);

    replyTimersRef.current.push(timer);
  };

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    if (!courseFocus) {
      return;
    }

    setActiveSection('feed');
    setFeedFilter('all');
    setActiveCourseContextId(courseFocus.courseId);
    setComposerCourseId(courseFocus.courseId);
    setActiveCommentPostId(null);
    if (courseFocus.mode === 'compose' && courseFocus.draft) {
      setComposerText((current) => (current.trim() ? current : courseFocus.draft ?? ''));
    }

    const relatedPost = posts.find((item) => item.courseId === courseFocus.courseId) ?? null;
    setHighlightedPostId(relatedPost?.id ?? null);
    if (courseFocus.mode === 'compose') {
      window.requestAnimationFrame(() => {
        composerTextareaRef.current?.focus();
        composerTextareaRef.current?.setSelectionRange(
          composerTextareaRef.current.value.length,
          composerTextareaRef.current.value.length,
        );
      });
    }
  }, [
    courseFocus?.courseId,
    courseFocus?.draft,
    courseFocus?.mode,
    courseFocus?.token,
    setActiveCommentPostId,
    setActiveSection,
    setComposerCourseId,
    setComposerText,
    setFeedFilter,
    setHighlightedPostId,
    setActiveCourseContextId,
  ]);

  useEffect(() => {
    if (!inboxIntent) {
      return;
    }

    setActiveCourseContextId(null);
    setHighlightedPostId(null);
    setActiveCommentPostId(null);

    if (inboxIntent.section === 'notifications') {
      setSelectedConversationId(null);
      setActiveSection('notifications');
      setChatReturnSection('notifications');
      setNotificationFilter('all');
      setHighlightedNotificationId(inboxIntent.notificationId ?? null);

      return;
    }

    setHighlightedNotificationId(null);

    if (inboxIntent.conversationId) {
      setActiveSection('conversations');
      setChatReturnSection('conversations');
      setSelectedConversationId(inboxIntent.conversationId);
      onUpdateConversations((current) =>
        current.map((item) => (item.id === inboxIntent.conversationId ? { ...item, unread: 0 } : item)),
      );
      onUpdateNotifications((current) =>
        current.map((item) => (item.conversationId === inboxIntent.conversationId ? { ...item, read: true } : item)),
      );
      return;
    }

    setSelectedConversationId(null);
    setActiveSection('conversations');
  }, [
    inboxIntent,
    onUpdateConversations,
    onUpdateNotifications,
    setActiveCommentPostId,
    setActiveCourseContextId,
    setActiveSection,
    setChatReturnSection,
    setHighlightedPostId,
    setNotificationFilter,
    setSelectedConversationId,
  ]);

  useEffect(() => {
    if (activeSection !== 'feed' || !highlightedPostId) {
      return;
    }

    const cleanup = window.setTimeout(() => {
      setHighlightedPostId(null);
    }, 3200);

    return () => {
      window.clearTimeout(cleanup);
    };
  }, [activeSection, highlightedPostId, setHighlightedPostId]);

  useEffect(() => {
    if (activeSection !== 'notifications' || !highlightedNotificationId) {
      return;
    }

    const cleanup = window.setTimeout(() => {
      setHighlightedNotificationId(null);
    }, 3200);

    return () => {
      window.clearTimeout(cleanup);
    };
  }, [activeSection, highlightedNotificationId]);

  useEffect(() => () => {
    replyTimersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const handleOpenVoiceRoom = (roomId: string) => {
    setSelectedConversationId(null);
    setSelectedRoomId(roomId);
    setActiveSection('rooms');
  };

  const handleShareVoiceRoom = (roomId: string, conversationId: string) => {
    const room = voiceRooms.find((item) => item.id === roomId) ?? null;
    const conversation = conversations.find((item) => item.id === conversationId) ?? null;
    if (!room || !conversation) {
      return;
    }

    const inviteMessage = createVoiceRoomInviteMessage(room);
    onUpdateChatMessages((current) => ({
      ...current,
      [conversationId]: [...(current[conversationId] ?? []), inviteMessage],
    }));
    touchConversation(conversationId, {
      subtitle: getChatMessagePreview(inviteMessage),
      time: inviteMessage.time,
      unread: 0,
    });
    prependNotification(
      createNotification(
        `已发送语音房邀请：${room.title}`,
        `这条邀请已经发送到 ${conversation.name}，对方可从会话里直接打开语音房。`,
        'system',
        {
          conversationId,
          ...(room.courseId ? { courseId: room.courseId } : undefined),
          voiceRoomId: room.id,
          voiceRoomTitle: room.title,
        },
      ),
    );
    logLearningAction(`分享语音房：${room.title}`, `${conversation.name} · ${room.title}`, '发送邀请');
  };

  const handlePublishVoiceRoomRecap = (roomId: string) => {
    const room = voiceRooms.find((item) => item.id === roomId) ?? null;
    if (!room?.recap) {
      return null;
    }

    const recapPost = createVoiceRoomRecapPost(room, currentUserIdentity.name, currentUserIdentity.role);
    onUpdatePosts((current) => [recapPost, ...current]);
    prependNotification(
      createNotification(
        `已发布会后摘要：${room.title}`,
        '这份会后摘要已经回流到校友动态，可继续联动课程讨论与评论。',
        'system',
        {
          postId: recapPost.id,
          ...(room.courseId ? { courseId: room.courseId } : undefined),
          voiceRoomId: room.id,
          voiceRoomTitle: room.title,
        },
      ),
    );
    logLearningAction(`发布会后摘要：${room.title}`, truncateProcessedText(room.recap.headline), '发布摘要');
    setFeedFilter('all');
    setHighlightedPostId(recapPost.id);
    setActiveCourseContextId(room.courseId ?? null);
    return recapPost.id;
  };

  const handleShareVoiceRoomRecap = (roomId: string, conversationId: string) => {
    const room = voiceRooms.find((item) => item.id === roomId) ?? null;
    const conversation = conversations.find((item) => item.id === conversationId) ?? null;
    if (!room?.recap || !conversation) {
      return false;
    }

    const recapMessage = createVoiceRoomRecapMessage(room);
    onUpdateChatMessages((current) => ({
      ...current,
      [conversationId]: [...(current[conversationId] ?? []), recapMessage],
    }));
    touchConversation(conversationId, {
      subtitle: getChatMessagePreview(recapMessage),
      time: recapMessage.time,
      unread: 0,
    });
    prependNotification(
      createNotification(
        `已发送会后摘要：${room.title}`,
        `这份会后摘要已经发送到 ${conversation.name}，对方可从会话里直接查看并回到房间。`,
        'system',
        {
          conversationId,
          ...(room.courseId ? { courseId: room.courseId } : undefined),
          voiceRoomId: room.id,
          voiceRoomTitle: room.title,
        },
      ),
    );
    logLearningAction(`分享会后摘要：${room.title}`, `${conversation.name} · ${room.recap.headline}`, '发送摘要');
    return true;
  };

  if (selectedConversation) {
    return (
      <ChatView
        storageScopeKey={storageScopeKey}
        conversation={selectedConversation}
        messages={chatMessages[selectedConversation.id] ?? []}
        onBack={() => {
          setSelectedConversationId(null);
          setActiveSection(chatReturnSection);
        }}
        onSend={(message) => handleSendMessage(selectedConversation.id, message)}
        onTogglePinned={() => updateConversationFlags(selectedConversation.id, { pinned: !selectedConversation.pinned })}
        onToggleMuted={() => updateConversationFlags(selectedConversation.id, { muted: !selectedConversation.muted })}
        onOpenVoiceRoom={handleOpenVoiceRoom}
      />
    );
  }

  return (
    <div className="community-layout">
      <section className="content-card community-hero-card">
        <div>
          <p className="eyebrow">Community Sandbox</p>
          <h2>校友圈暂作为次级恢复区</h2>
          <p className="hero-copy">
            当前先保留动态流、语音房壳子、会话列表和通知入口的次级恢复能力。社区仍不是最先独立接后端的主线模块，但现在已经纳入统一快照链路，能跟随工作区一起保留和回写。
          </p>
          <p className="toolbar-helper">{communitySyncSummary}</p>
        </div>
        <div className="community-summary-grid">
          <article className="summary-card">
            <span className="summary-label">动态条数</span>
            <strong>{posts.length}</strong>
          </article>
          <article className="summary-card">
            <span className="summary-label">会话数量</span>
            <strong>{conversations.length}</strong>
          </article>
          <article className="summary-card">
            <span className="summary-label">语音房数量</span>
            <strong>{liveRoomCount}</strong>
          </article>
          <article className="summary-card">
            <span className="summary-label">已加入房间</span>
            <strong>{joinedRoomCount}</strong>
          </article>
          <article className="summary-card">
            <span className="summary-label">未读提醒</span>
            <strong>{unreadCount}</strong>
          </article>
          <article className="summary-card">
            <span className="summary-label">通知未读</span>
            <strong>{unreadNotifications}</strong>
          </article>
        </div>
      </section>

      <section className="toolbar-card">
        <div className="segmented-control segmented-control-quad">
          <button
            type="button"
            className={activeSection === 'feed' ? 'segmented-btn active' : 'segmented-btn'}
            onClick={() => setActiveSection('feed')}
          >
            校友动态
          </button>
          <button
            type="button"
            className={activeSection === 'rooms' ? 'segmented-btn active' : 'segmented-btn'}
            onClick={() => setActiveSection('rooms')}
          >
            语音房
          </button>
          <button
            type="button"
            className={activeSection === 'conversations' ? 'segmented-btn active' : 'segmented-btn'}
            onClick={() => setActiveSection('conversations')}
          >
            最近消息
          </button>
          <button
            type="button"
            className={activeSection === 'notifications' ? 'segmented-btn active' : 'segmented-btn'}
            onClick={() => setActiveSection('notifications')}
          >
            通知中心
          </button>
        </div>
        <p className="toolbar-helper">
          {activeSection === 'feed'
            ? `${communitySyncSummary} 课程感悟和系统公告的独立互动链路会在后续继续补齐。`
            : activeSection === 'rooms'
              ? `${communitySyncSummary} 房间元数据、成员壳子和提醒跳转已经纳入统一快照，真实音频链路会在后续阶段独立接入。`
              : activeSection === 'conversations'
              ? `${communitySyncSummary} 会话列表当前仍以本地聊天页和联系人映射为主，真实消息服务会放在课程/图书馆基础能力之后再接。`
              : `${communitySyncSummary} 通知中心当前仍以恢复提醒回流为主，后续再统一切到真正的通知服务。`}
        </p>
      </section>

      {activeSection === 'feed' ? (
        <section className="panel-grid">
          <section className="content-card community-compose-card">
            <div className="module-header">
              <div>
                <p className="eyebrow">Compose Post</p>
                <h2>发布动态</h2>
              </div>
            </div>
            <label className="chat-input-field" htmlFor="community-compose-text">
              <span>动态内容</span>
              <textarea
                ref={composerTextareaRef}
                id="community-compose-text"
                rows={4}
                value={composerText}
                onChange={(event) => setComposerText(event.target.value)}
                placeholder="记录课程感悟、代祷事项或恢复进展。"
              />
            </label>
            <label className="search-field" htmlFor="community-compose-course">
              <span>关联课程（可选）</span>
              <select
                id="community-compose-course"
                className="select-field"
                value={composerCourseId}
                onChange={(event) => setComposerCourseId(event.target.value)}
              >
                <option value="">不关联课程</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="chat-input-actions">
              <span className="toolbar-helper">
                {courseContext
                  ? `当前正在为《${courseContext.title}》撰写内容，发布后会自动归到这门课的讨论流。`
                  : '动态会先保存在本地状态，后面再接通知和评论联动。'}
              </span>
              <button
                type="button"
                className="primary-btn compact-btn"
                onClick={() => {
                  const content = composerText.trim();
                  if (!content) {
                    return;
                  }

                  const postId = `post-${Date.now()}`;
                  const nextCourseContextId = composerCourseId || activeCourseContextId;
                  onUpdatePosts((current) => [
                    {
                      id: postId,
                      author: currentUserIdentity.name,
                      role: currentUserIdentity.role,
                      time: '刚刚',
                      content,
                      badge: composerCourseId ? '课程感悟' : '恢复记录',
                      courseId: composerCourseId || undefined,
                      likes: 0,
                      liked: false,
                      comments: [],
                    },
                    ...current,
                  ]);
                  prependNotification(
                    createNotification(
                      composerCourseId ? '课程感悟已发布' : '恢复记录已发布',
                      composerCourseId
                        ? '这条动态已关联课程，后续可继续接课程详情和评论提醒。'
                        : '这条更新已经进入动态流，后续会继续接通知高亮和筛选。',
                      'system',
                      {
                        ...(composerCourseId ? { courseId: composerCourseId } : undefined),
                        postId,
                      },
                    ),
                  );
                  logLearningAction(
                    composerCourseId ? '发布课程感悟' : '发布恢复记录',
                    truncateProcessedText(content),
                    '发布动态',
                  );
                  if (nextCourseContextId) {
                    setActiveCourseContextId(nextCourseContextId);
                  }
                  setHighlightedPostId(postId);
                  setComposerText('');
                  setComposerCourseId(nextCourseContextId ?? '');
                }}
              >
                发布动态
              </button>
            </div>
          </section>
          <section className="content-card">
            <div className="module-header">
              <div>
                <p className="eyebrow">Feed Filter</p>
                <h2>动态筛选</h2>
              </div>
            </div>
            <div className="category-row">
              {(['all', '课程感悟', '代祷实践', '系统公告', '恢复记录'] as FeedFilter[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={feedFilter === option ? 'chip-btn active' : 'chip-btn'}
                  onClick={() => setFeedFilter(option)}
                >
                  {option === 'all' ? '全部动态' : option}
                </button>
              ))}
            </div>
          </section>
          {courseContext && (
            <section className="content-card">
              <div className="module-header">
                <div>
                  <p className="eyebrow">Course Context</p>
                  <h2>当前课程讨论</h2>
                </div>
              </div>
              <div className="post-footer">
                <span>
                  正在查看《{courseContext.title}》的相关动态，共 {visibleFeedPosts.length} 条，新的发布也会默认关联这门课程。
                </span>
                <div className="contact-card-actions">
                  <button type="button" className="secondary-btn compact-btn" onClick={() => onOpenCourse(courseContext.id)}>
                    回到课程详情
                  </button>
                  <button
                    type="button"
                    className="secondary-btn compact-btn"
                    onClick={() => {
                      setActiveCourseContextId(null);
                      setHighlightedPostId(null);
                    }}
                  >
                    查看全部动态
                  </button>
                </div>
              </div>
            </section>
          )}
          {courseContext && relatedResources.length > 0 && (
            <section className="content-card">
              <div className="module-header">
                <div>
                  <p className="eyebrow">Course Resources</p>
                  <h2>相关资料</h2>
                </div>
              </div>
              <div className="archive-list">
                {relatedResources.map((resource) => (
                  <button key={resource.id} type="button" className="archive-item" onClick={() => onOpenResource(resource.id)}>
                    <div>
                      <p className="post-author">{resource.title}</p>
                      <p className="post-role">
                        {resource.author} · {resource.format}
                      </p>
                    </div>
                    <div className="archive-meta">
                      <strong>{resource.updatedAt}</strong>
                      <span>返回图书馆可继续阅读这份资料</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
          {courseInsightRows.length > 0 && (
            <section className="content-card">
              <div className="module-header">
                <div>
                  <p className="eyebrow">Course Insight</p>
                  <h2>课程感悟聚合</h2>
                </div>
              </div>
              <div className="archive-list">
                {courseInsightRows.map((item) => (
                  <button key={item.courseId} type="button" className="archive-item" onClick={() => onOpenCourse(item.courseId)}>
                    <div>
                      <p className="post-author">{item.title}</p>
                      <p className="post-role">来自校友圈的课程讨论聚合</p>
                    </div>
                    <div className="archive-meta">
                      <strong>{item.count}</strong>
                      <span>条相关动态</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
          {visibleFeedPosts.length > 0 ? (
	            visibleFeedPosts.map((post) => {
	              const followUpAction = resolvePostFollowUpAction(post);
              const relatedVoiceRoom = post.voiceRoomId ? voiceRooms.find((item) => item.id === post.voiceRoomId) ?? null : null;
              const hasVoiceRoomLink = Boolean(post.voiceRoomId);
              const hasCourseLink = Boolean(post.courseId);

	              return (
	                <article className={highlightedPostId === post.id ? 'module-card post-card highlighted' : 'module-card post-card'} key={post.id}>
                <div className="post-meta">
                  <div>
                    <p className="post-author">{post.author}</p>
                    <p className="post-role">{post.role}</p>
                  </div>
                  <span className="course-updated">{post.time}</span>
                </div>
                <span className="post-badge">{post.badge}</span>
                <p className="post-content">{post.content}</p>
                <div className="post-actions">
                  <button
                    type="button"
                    className={post.liked ? 'chip-btn active' : 'chip-btn'}
                    onClick={() => {
                      const nextLiked = !post.liked;
                      if (nextLiked) {
                        prependNotification(
                          createNotification(
                            `互动已记录：赞了 ${post.author}`,
                            '这条通知用于模拟未来后端回执，后续会继续接互动高亮和跳转。',
                            'interaction',
                            {
                              ...(post.courseId ? { courseId: post.courseId } : undefined),
                              postId: post.id,
                            },
                          ),
                        );
                      }

                      onUpdatePosts((current) =>
                        current.map((item) =>
                          item.id === post.id
                            ? {
                                ...item,
                                liked: nextLiked,
                                likes: nextLiked ? item.likes + 1 : Math.max(0, item.likes - 1),
                              }
                            : item,
                        ),
                      );
                    }}
                  >
                    赞 {post.likes}
                  </button>
                  <button
                    type="button"
                    className={activeCommentPostId === post.id ? 'chip-btn active' : 'chip-btn'}
                    onClick={() => setActiveCommentPostId((current) => (current === post.id ? null : post.id))}
                  >
                    评论 {post.comments.length}
                  </button>
                </div>
	                {hasCourseLink || hasVoiceRoomLink ? (
	                  <div className="post-footer">
	                    <span>
                        {hasCourseLink && hasVoiceRoomLink
                          ? '这条动态已经同时关联课程和语音房，可回房继续讨论，也可跳回课程详情。'
                          : hasVoiceRoomLink
                            ? '这条动态来自语音房整理纪要，可直接回到对应房间继续查看。'
                            : '已关联课程内容，可直接跳回课程详情继续恢复链路。'}
                      </span>
	                    <div className="contact-card-actions">
	                      {followUpAction?.kind === 'contact' && (
	                        <button type="button" className="secondary-btn compact-btn" onClick={() => handleStartConversation(followUpAction.contact)}>
	                          {followUpAction.label}
	                        </button>
	                      )}
                        {hasVoiceRoomLink && (
                          <button type="button" className="secondary-btn compact-btn" onClick={() => handleOpenVoiceRoom(post.voiceRoomId!)}>
                            {relatedVoiceRoom?.status === 'ended' ? '查看房间摘要' : '回到语音房'}
                          </button>
                        )}
                        {hasCourseLink && (
	                        <button type="button" className="secondary-btn compact-btn" onClick={() => onOpenCourse(post.courseId!)}>
	                          打开关联课程
	                        </button>
                        )}
	                    </div>
	                  </div>
	                ) : (
                  <div className="post-footer">
                    <span>这条内容当前作为系统信息源，后续会接入通知模块。</span>
                    {followUpAction?.kind === 'conversation' && (
                      <button type="button" className="secondary-btn compact-btn" onClick={() => handleOpenConversation(followUpAction.conversationId)}>
                        {followUpAction.label}
                      </button>
                    )}
                  </div>
                )}
                {activeCommentPostId === post.id && (
                  <div className="comment-panel">
                    <div className="comment-list">
                      {post.comments.length > 0 ? (
                        post.comments.map((comment) => (
                          <article key={comment.id} className="comment-item">
                            <div className="comment-meta">
                              <strong>{comment.author}</strong>
                              <span>{comment.time}</span>
                            </div>
                            <p>{comment.content}</p>
                          </article>
                        ))
                      ) : (
                        <p className="toolbar-helper">还没有评论，可以先补一条讨论记录。</p>
                      )}
                    </div>
                    <label className="chat-input-field" htmlFor={`comment-${post.id}`}>
                      <span>添加评论</span>
                      <textarea
                        id={`comment-${post.id}`}
                        rows={2}
                        value={commentDrafts[post.id] ?? ''}
                        onChange={(event) =>
                          setCommentDrafts((current) => ({
                            ...current,
                            [post.id]: event.target.value,
                          }))
                        }
                        placeholder="补充这条动态的讨论上下文。"
                      />
                    </label>
                    <div className="chat-input-actions">
                      <span className="toolbar-helper">评论会绑定到当前动态，后面会接通知提醒。</span>
                      <button
                        type="button"
                        className="secondary-btn compact-btn"
                        onClick={() => {
                          const content = (commentDrafts[post.id] ?? '').trim();
                          if (!content) {
                            return;
                          }

                          onUpdatePosts((current) =>
                            current.map((item) =>
                              item.id === post.id
                                ? {
                                    ...item,
                                    comments: [
                                      ...item.comments,
                                      {
                                        id: `comment-${Date.now()}`,
                                        author: currentUserIdentity.name,
                                        content,
                                        time: '刚刚',
                                      },
                                    ],
                                  }
                                : item,
                            ),
                          );
                          prependNotification(
                            createNotification(
                              `已添加评论：${post.author}`,
                              '评论已写入本地动态流，后续会继续接入回复提醒和通知筛选。',
                              'interaction',
                              {
                                ...(post.courseId ? { courseId: post.courseId } : undefined),
                                postId: post.id,
                              },
                            ),
                          );
                          logLearningAction(
                            `评论了 ${post.author} 的动态`,
                            truncateProcessedText(content),
                            '提交评论',
                          );
                          setCommentDrafts((current) => ({ ...current, [post.id]: '' }));
                        }}
                      >
                        提交评论
                      </button>
                    </div>
                  </div>
                )}
                </article>
              );
            })
          ) : (
            <section className="content-card">
              <div className="empty-state-card">
                <strong>{courseContext ? '这门课还没有动态' : '当前筛选下没有动态'}</strong>
                <span>{courseContext ? '你可以先发布一条关联本课程的感悟或恢复记录。' : '切回全部动态，或者先发布一条新的课程感悟与恢复记录。'}</span>
              </div>
            </section>
          )}
        </section>
      ) : activeSection === 'rooms' ? (
        <VoiceRoomsPanel
          profile={profile}
          storageScopeKey={storageScopeKey}
          communitySyncSummary={communitySyncSummary}
          selectedRoomId={selectedRoomId}
          onSelectRoomId={setSelectedRoomId}
          voiceRooms={voiceRooms}
          onUpdateVoiceRooms={onUpdateVoiceRooms}
          onUpdateNotifications={onUpdateNotifications}
          conversations={conversations}
          onShareVoiceRoom={handleShareVoiceRoom}
          onPublishVoiceRoomRecap={handlePublishVoiceRoomRecap}
          onShareVoiceRoomRecap={handleShareVoiceRoomRecap}
          onOpenCourse={onOpenCourse}
        />
      ) : activeSection === 'conversations' ? (
        <section className="conversation-list">
          <section className="content-card">
            <div className="module-header">
              <div>
                <p className="eyebrow">Conversation Search</p>
                <h2>会话搜索</h2>
              </div>
            </div>
            <label className="search-field" htmlFor="community-conversation-search">
              <span>搜索会话</span>
              <input
                id="community-conversation-search"
                value={conversationSearch}
                onChange={(event) => setConversationSearch(event.target.value)}
                placeholder="输入会话名称、简介或角色"
              />
            </label>
          </section>
          <section className="content-card">
            <div className="module-header">
              <div>
                <p className="eyebrow">Contact Directory</p>
                <h2>通讯录</h2>
              </div>
            </div>
            <label className="search-field" htmlFor="community-contact-search">
              <span>搜索联系人</span>
              <input
                id="community-contact-search"
                value={contactSearch}
                onChange={(event) => setContactSearch(event.target.value)}
                placeholder="输入姓名、角色、地区或服事方向"
              />
            </label>
            <div className="contact-grid">
              {visibleContacts.map((contact) => {
                const existingConversation =
                  conversations.find((item) => item.contactId === contact.id) ??
                  conversations.find((item) => item.id === getContactConversationId(contact.id));

                return (
                  <article key={contact.id} className="course-card contact-card">
                    <div className="contact-card-top">
                      <div>
                        <h3>{contact.name}</h3>
                        <p className="course-summary">
                          {contact.role} · {contact.region}
                        </p>
                      </div>
                      <span className="post-badge">{existingConversation ? '已建会话' : contact.status}</span>
                    </div>
                    <p className="course-summary">{contact.summary}</p>
                    <div className="detail-chip-row">
                      <span className="post-badge">{contact.region}</span>
                      {contact.relatedCourseId && <span className="post-badge">可跳转关联课程</span>}
                      {existingConversation && <span className="post-badge">继续聊天</span>}
                    </div>
                    <div className="contact-card-actions">
                      <button type="button" className="primary-btn compact-btn" onClick={() => handleStartConversation(contact)}>
                        {existingConversation ? '打开会话' : '发起聊天'}
                      </button>
                      {contact.relatedCourseId && (
                        <button type="button" className="secondary-btn compact-btn" onClick={() => onOpenCourse(contact.relatedCourseId!)}>
                          打开课程
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            {visibleContacts.length === 0 && (
              <div className="empty-state-card">
                <strong>没有匹配的联系人</strong>
                <span>试试姓名、角色、地区，或者直接清空搜索继续浏览通讯录。</span>
              </div>
            )}
          </section>
          {visibleConversations.map((conversation) => (
            <button type="button" className="course-card conversation-card conversation-btn" key={conversation.id} onClick={() => handleOpenConversation(conversation.id)}>
              <div className="conversation-top">
                <div>
                  <h3>{conversation.name}</h3>
                  <p className="course-summary">{conversation.subtitle}</p>
                </div>
                <div className="conversation-meta">
                  <span className="course-updated">{conversation.time}</span>
                  {conversation.unread > 0 && <span className="unread-pill">{conversation.unread}</span>}
                </div>
              </div>
              <div className="detail-chip-row">
                {conversation.pinned && <span className="post-badge">已置顶</span>}
                {conversation.muted && <span className="post-badge">已静音</span>}
                {conversation.role && <span className="post-badge">{conversation.role}</span>}
              </div>
            </button>
          ))}
          {visibleConversations.length === 0 && (
            <section className="content-card">
              <div className="empty-state-card">
                <strong>没有匹配的会话</strong>
                <span>试试输入会话名称、角色或最近消息中的关键词。</span>
              </div>
            </section>
          )}
          <section className="content-card community-note-card">
            <p className="eyebrow">Next Step</p>
            <h2>聊天入口已恢复到源码工程</h2>
            <p>
              当前会话已可进入本地聊天页。下一阶段会把通知跳转、联系人映射和已读状态继续统一回真正的服务层。
            </p>
          </section>
        </section>
      ) : (
        <section className="conversation-list">
          <section className="summary-grid">
            <article className="summary-card">
              <span className="summary-label">未读通知</span>
              <strong>{notificationOverview.unread}</strong>
            </article>
            <article className="summary-card">
              <span className="summary-label">互动提醒</span>
              <strong>{notificationOverview.interaction}</strong>
            </article>
            <article className="summary-card">
              <span className="summary-label">系统通知</span>
              <strong>{notificationOverview.system}</strong>
            </article>
          </section>
          <section className="content-card">
            <div className="module-header">
              <div>
                <p className="eyebrow">Reminder Wind-down</p>
                <h2>提醒收尾台</h2>
              </div>
            </div>
            <div className="profile-highlight-grid">
              <article className="detail-summary-card">
                <span className="detail-summary-label">优先会话</span>
                <strong>{topUnreadConversation?.name ?? '当前没有未读会话'}</strong>
                <span>
                  {topUnreadConversation
                    ? `还有 ${topUnreadConversation.unread} 条未读消息，最近一条是“${topUnreadConversation.subtitle}”。`
                    : '消息区已经比较干净，可以把注意力放回课程或互动通知。'}
                </span>
                {topUnreadConversation && (
                  <div className="coach-card-actions">
                    <button
                      type="button"
                      className="secondary-btn compact-btn"
                      onClick={() => handleOpenConversation(topUnreadConversation.id)}
                    >
                      打开会话
                    </button>
                  </div>
                )}
              </article>
              <article className="detail-summary-card">
                <span className="detail-summary-label">优先通知</span>
                <strong>{nextUnreadNotification?.title ?? '当前没有未读通知'}</strong>
                <span>
                  {nextUnreadNotification
                    ? `${nextUnreadNotification.time} · ${nextUnreadNotification.detail}`
                    : '通知中心已经处理完毕，新的互动或系统提醒会继续在这里汇总。'}
                </span>
                {nextUnreadNotification && (
                  <div className="coach-card-actions">
                    <button
                      type="button"
                      className="secondary-btn compact-btn"
                      onClick={() => handleNotificationClick(nextUnreadNotification)}
                    >
                      处理这条通知
                    </button>
                  </div>
                )}
              </article>
              <article className="detail-summary-card">
                <span className="detail-summary-label">一键收尾</span>
                <strong>{unreadCount + notificationOverview.unread}</strong>
                <span>
                  {unreadCount + notificationOverview.unread > 0
                    ? '把最近消息和通知一起清掉，快速结束今天这轮提醒处理。'
                    : '当前没有需要批量清空的提醒，已经适合进入课程复盘。'}
                </span>
                <div className="coach-card-actions">
                  <button
                    type="button"
                    className="primary-btn compact-btn"
                    onClick={handleClearAllReminders}
                    disabled={unreadCount + notificationOverview.unread === 0}
                  >
                    清空全部提醒
                  </button>
                </div>
              </article>
            </div>
          </section>
          <div className="notification-toolbar">
            <p className="toolbar-helper">通知会优先显示未读，再按时间顺序排序，也支持快速处理下一条。</p>
            <div className="contact-card-actions">
              {nextUnreadNotification && (
                <button type="button" className="primary-btn compact-btn" onClick={() => handleNotificationClick(nextUnreadNotification)}>
                  处理下一条未读
                </button>
              )}
              <button type="button" className="secondary-btn compact-btn" onClick={handleClearAllReminders}>
                清空全部提醒
              </button>
              <button type="button" className="secondary-btn compact-btn" onClick={handleMarkAllNotificationsRead}>
                全部标为已读
              </button>
            </div>
          </div>
          <section className="content-card">
            <div className="module-header">
              <div>
                <p className="eyebrow">Notification Filter</p>
                <h2>通知筛选</h2>
              </div>
            </div>
            <div className="category-row">
              {([
                ['all', '全部通知'],
                ['unread', '未读优先'],
                ['interaction', '互动提醒'],
                ['system', '系统通知'],
              ] as Array<[NotificationFilter, string]>).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={notificationFilter === key ? 'chip-btn active' : 'chip-btn'}
                  onClick={() => setNotificationFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
          {filteredNotifications.map((notification) => {
            const relatedPost = resolveNotificationPost(notification);
            const relatedVoiceRoomId = resolveNotificationVoiceRoomId(notification, relatedPost);
            const relatedVoiceRoom = resolveNotificationVoiceRoom(notification, relatedPost);
            const voiceRoomTitle = relatedVoiceRoom?.title ?? notification.voiceRoomTitle ?? relatedPost?.voiceRoomTitle ?? '未命名语音房';
            const voiceRoomActionLabel = relatedVoiceRoom?.status === 'ended' ? '查看房间摘要' : '回到语音房';
            const voiceRoomStatusLabel = relatedVoiceRoom?.status === 'ended' ? '会后摘要' : '直播中';
            const hasQuickActions = Boolean(
              (notification.postId && relatedPost) || relatedVoiceRoomId || notification.conversationId || notification.courseId,
            );
            const voiceRoomContext =
              relatedVoiceRoom
                ? `${relatedVoiceRoom.topic} · ${relatedVoiceRoom.participantCount} 人参与${
                    relatedVoiceRoom.courseId ? ' · 已关联课程' : ''
                  }`
                : '这条通知已经带上语音房上下文，可继续回房查看讨论过程或摘要。';

            return (
              <article
                className={
                  highlightedNotificationId === notification.id
                    ? notification.read
                      ? 'course-card notification-card highlighted'
                      : 'course-card notification-card unread highlighted'
                    : notification.read
                      ? 'course-card notification-card'
                      : 'course-card notification-card unread'
                }
                key={notification.id}
              >
                <button type="button" className="notification-card-main" onClick={() => handleNotificationClick(notification)}>
                  <div className="conversation-top">
                    <div>
                      <p className="post-author">{notification.title}</p>
                      <p className="course-summary">{notification.detail}</p>
                    </div>
                    <div className="conversation-meta">
                      <span className="course-updated">{notification.time}</span>
                      {!notification.read && <span className="unread-dot" />}
                    </div>
                  </div>
                  <div className="detail-chip-row">
                    <span className="post-badge">{notification.type === 'interaction' ? '互动' : '系统'}</span>
                    {notification.postId && <span className="post-badge">定位动态</span>}
                    {relatedVoiceRoomId && <span className="post-badge">关联语音房</span>}
                    {notification.courseId && <span className="post-badge">打开课程</span>}
                    {notification.conversationId && <span className="post-badge">打开会话</span>}
                  </div>
                  {relatedVoiceRoomId && (
                    <div className="notification-context-card">
                      <div className="notification-context-top">
                        <span className="voice-room-invite-eyebrow">语音房上下文</span>
                        <span
                          className={
                            relatedVoiceRoom?.status === 'ended'
                              ? 'notification-status-pill notification-status-pill-ended'
                              : 'notification-status-pill notification-status-pill-live'
                          }
                        >
                          {voiceRoomStatusLabel}
                        </span>
                      </div>
                      <strong>{voiceRoomTitle}</strong>
                      <p>{voiceRoomContext}</p>
                    </div>
                  )}
                </button>
                {hasQuickActions && (
                  <div className="notification-card-actions">
                    {notification.postId && relatedPost && (
                      <button
                        type="button"
                        className="secondary-btn compact-btn"
                        onClick={() =>
                          handleNotificationAction(notification, (shouldLog) => {
                            handleOpenNotificationPost(notification, relatedPost, shouldLog);
                          })
                        }
                      >
                        查看动态
                      </button>
                    )}
                    {relatedVoiceRoomId && (
                      <button
                        type="button"
                        className="secondary-btn compact-btn"
                        onClick={() =>
                          handleNotificationAction(notification, (shouldLog) => {
                            handleOpenNotificationVoiceRoom(notification, relatedVoiceRoomId, shouldLog);
                          })
                        }
                      >
                        {voiceRoomActionLabel}
                      </button>
                    )}
                    {notification.conversationId && (
                      <button
                        type="button"
                        className="secondary-btn compact-btn"
                        onClick={() =>
                          handleNotificationAction(notification, () => {
                            handleOpenConversation(notification.conversationId!);
                          })
                        }
                      >
                        打开会话
                      </button>
                    )}
                    {notification.courseId && (
                      <button
                        type="button"
                        className="secondary-btn compact-btn"
                        onClick={() =>
                          handleNotificationAction(notification, (shouldLog) => {
                            handleOpenNotificationCourse(notification, notification.courseId, shouldLog);
                          })
                        }
                      >
                        打开课程
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
          {filteredNotifications.length === 0 && (
            <section className="content-card">
              <div className="empty-state-card">
                <strong>当前筛选下没有通知</strong>
                <span>切换全部通知或未读优先，可以继续检查互动和系统消息。</span>
              </div>
            </section>
          )}
        </section>
      )}
    </div>
  );
}
