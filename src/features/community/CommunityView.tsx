import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { communityChatMessages, communityContacts, courses, libraryResources } from '../../data/mockData';
import { usePersistentState } from '../../hooks/usePersistentState';
import {
  ChatMessage,
  CommunityContact,
  CommunityNotification,
  CommunityNotificationType,
  CommunityPostPreview,
  ConversationPreview,
} from '../../types/app';
import { ChatView } from './ChatView';
import { createProcessedQueueLogItem } from '../profile/profileState';
import { useProcessedQueueLog } from '../profile/useProcessedQueueLog';
import {
  buildConversationFromContact,
  buildConversationNotification,
  createAutoReplyMessage,
  createContactIntroMessage,
  filterContacts,
  getDisplayTimeSortValue,
  sortNotifications,
  getContactConversationId,
  sortConversations,
} from './communityState';

type CommunitySection = 'feed' | 'conversations' | 'notifications';
type FeedFilter = 'all' | '课程感悟' | '代祷实践' | '系统公告' | '恢复记录';
type NotificationFilter = 'all' | 'unread' | 'interaction' | 'system';
type PostFollowUpAction =
  | { kind: 'contact'; label: string; contact: CommunityContact }
  | { kind: 'conversation'; label: string; conversationId: string };

export function CommunityView({
  onOpenCourse,
  onOpenResource,
  courseFocus,
  inboxIntent,
  posts,
  onUpdatePosts,
  conversations,
  onUpdateConversations,
  notifications,
  onUpdateNotifications,
}: {
  onOpenCourse: (courseId: string) => void;
  onOpenResource: (resourceId: string) => void;
  courseFocus: { courseId: string; token: number; mode: 'feed' | 'compose'; draft?: string } | null;
  inboxIntent: { token: number; section: 'conversations' | 'notifications'; conversationId?: string; notificationId?: string } | null;
  posts: CommunityPostPreview[];
  onUpdatePosts: Dispatch<SetStateAction<CommunityPostPreview[]>>;
  conversations: ConversationPreview[];
  onUpdateConversations: Dispatch<SetStateAction<ConversationPreview[]>>;
  notifications: CommunityNotification[];
  onUpdateNotifications: Dispatch<SetStateAction<CommunityNotification[]>>;
}) {
  const [activeSection, setActiveSection] = usePersistentState<CommunitySection>('amas_community_section', 'feed');
  const [selectedConversationId, setSelectedConversationId] = usePersistentState<string | null>('amas_community_selected_conversation', null);
  const [chatReturnSection, setChatReturnSection] = usePersistentState<CommunitySection>('amas_community_chat_return_section', 'conversations');
  const [highlightedPostId, setHighlightedPostId] = usePersistentState<string | null>('amas_community_highlight_post', null);
  const [feedFilter, setFeedFilter] = usePersistentState<FeedFilter>('amas_community_feed_filter', 'all');
  const [activeCourseContextId, setActiveCourseContextId] = usePersistentState<string | null>('amas_community_course_context', null);
  const [conversationSearch, setConversationSearch] = usePersistentState('amas_community_conversation_search', '');
  const [contactSearch, setContactSearch] = usePersistentState('amas_community_contact_search', '');
  const [notificationFilter, setNotificationFilter] = usePersistentState<NotificationFilter>('amas_community_notification_filter', 'all');
  const [chatMessages, setChatMessages] = usePersistentState<Record<string, ChatMessage[]>>('amas_community_chat_messages', communityChatMessages);
  const [composerText, setComposerText] = usePersistentState('amas_community_composer_text', '');
  const [composerCourseId, setComposerCourseId] = usePersistentState<string>('amas_community_composer_course', '');
  const [activeCommentPostId, setActiveCommentPostId] = usePersistentState<string | null>('amas_community_comment_post', null);
  const [commentDrafts, setCommentDrafts] = usePersistentState<Record<string, string>>('amas_community_comment_drafts', {});
  const [highlightedNotificationId, setHighlightedNotificationId] = useState<string | null>(null);
  const [, , appendProcessedQueueLog] = useProcessedQueueLog();
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedConversationIdRef = useRef<string | null>(selectedConversationId);
  const conversationsRef = useRef<ConversationPreview[]>(conversations);
  const replyTimersRef = useRef<number[]>([]);
  const unreadCount = conversations.reduce((sum, item) => sum + item.unread, 0);
  const unreadNotifications = notifications.filter((item) => !item.read).length;
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

  const filteredNotifications = useMemo(() => {
    return sortNotifications(notifications, notificationFilter);
  }, [notificationFilter, notifications]);
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

  const handleNotificationClick = (notification: CommunityNotification) => {
    const wasUnread = !notification.read;
    onUpdateNotifications((current) =>
      current.map((item) => (item.id === notification.id ? { ...item, read: true } : item)),
    );

    if (notification.postId) {
      const relatedPost = posts.find((item) => item.id === notification.postId) ?? null;
      setFeedFilter('all');
      setActiveCourseContextId(notification.courseId ?? relatedPost?.courseId ?? null);
      setHighlightedPostId(notification.postId);
      setActiveCommentPostId(notification.postId);
      setActiveSection('feed');
      if (wasUnread) {
        logReminderAction(notification.title, truncateProcessedText(notification.detail), '处理通知');
      }
      return;
    }

    if (notification.courseId) {
      if (wasUnread) {
        logReminderAction(notification.title, truncateProcessedText(notification.detail), '处理通知');
      }
      onOpenCourse(notification.courseId);
      return;
    }

    if (notification.conversationId) {
      handleOpenConversation(notification.conversationId);
      return;
    }

    if (wasUnread) {
      logReminderAction(notification.title, truncateProcessedText(notification.detail), '处理通知');
    }
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
      setChatMessages((current) => ({
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
    setChatMessages((current) => ({
      ...current,
      [conversationId]: [...(current[conversationId] ?? []), message],
    }));
    touchConversation(conversationId, {
      subtitle: message.content,
      time: message.time,
      unread: 0,
    });

    const conversation = conversationsRef.current.find((item) => item.id === conversationId);
    if (!conversation) {
      return;
    }

    logLearningAction(`回复会话：${conversation.name}`, truncateProcessedText(message.content), '发送消息');

    const timer = window.setTimeout(() => {
      const latestConversation = conversationsRef.current.find((item) => item.id === conversationId) ?? conversation;
      const reply = createAutoReplyMessage(latestConversation);
      setChatMessages((current) => ({
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

  if (selectedConversation) {
    return (
      <ChatView
        conversation={selectedConversation}
        messages={chatMessages[selectedConversation.id] ?? []}
        onBack={() => {
          setSelectedConversationId(null);
          setActiveSection(chatReturnSection);
        }}
        onSend={(message) => handleSendMessage(selectedConversation.id, message)}
        onTogglePinned={() => updateConversationFlags(selectedConversation.id, { pinned: !selectedConversation.pinned })}
        onToggleMuted={() => updateConversationFlags(selectedConversation.id, { muted: !selectedConversation.muted })}
      />
    );
  }

  return (
    <div className="community-layout">
      <section className="content-card community-hero-card">
        <div>
          <p className="eyebrow">Community Rebuild</p>
          <h2>校友圈源码已进入恢复阶段</h2>
          <p className="hero-copy">
            当前先恢复动态流和会话列表的基础结构。下一轮会继续接通知、通讯录和聊天跳转逻辑，把这一块从恢复壳体推进到真正可交互状态。
          </p>
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
        <div className="segmented-control segmented-control-triple">
          <button
            type="button"
            className={activeSection === 'feed' ? 'segmented-btn active' : 'segmented-btn'}
            onClick={() => setActiveSection('feed')}
          >
            校友动态
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
            ? '课程感悟和系统公告先以静态数据重建，后续会接入通知高亮和评论链路。'
            : activeSection === 'conversations'
              ? '会话列表先重建信息层，当前已经有本地聊天页，下一阶段接入真实已读状态和通讯录映射。'
              : '通知中心已开始恢复，点击通知可回到课程详情或对应会话。'}
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
                      author: 'Enos Lee',
                      role: 'AMAS Seminary Product Recovery',
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
                {post.courseId ? (
                  <div className="post-footer">
                    <span>已关联课程内容，可直接跳回课程详情继续恢复链路。</span>
                    <div className="contact-card-actions">
                      {followUpAction?.kind === 'contact' && (
                        <button type="button" className="secondary-btn compact-btn" onClick={() => handleStartConversation(followUpAction.contact)}>
                          {followUpAction.label}
                        </button>
                      )}
                      <button type="button" className="secondary-btn compact-btn" onClick={() => onOpenCourse(post.courseId!)}>
                        打开关联课程
                      </button>
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
                                        author: 'Enos Lee',
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
          {filteredNotifications.map((notification) => (
            <button
              type="button"
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
              onClick={() => handleNotificationClick(notification)}
            >
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
                {notification.courseId && <span className="post-badge">打开课程</span>}
                {notification.conversationId && <span className="post-badge">打开会话</span>}
              </div>
            </button>
          ))}
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
