import { useEffect, useMemo, useRef } from 'react';
import { communityChatMessages, communityConversations, communityNotifications, communityPosts, courses } from '../../data/mockData';
import { usePersistentState } from '../../hooks/usePersistentState';
import { ChatMessage, CommunityNotification, CommunityNotificationType } from '../../types/app';
import { ChatView } from './ChatView';
import { buildConversationNotification, createAutoReplyMessage, sortConversations } from './communityState';

type CommunitySection = 'feed' | 'conversations' | 'notifications';
type FeedFilter = 'all' | '课程感悟' | '代祷实践' | '系统公告' | '恢复记录';
type NotificationFilter = 'all' | 'unread' | 'interaction' | 'system';

export function CommunityView({ onOpenCourse }: { onOpenCourse: (courseId: string) => void }) {
  const [activeSection, setActiveSection] = usePersistentState<CommunitySection>('amas_community_section', 'feed');
  const [selectedConversationId, setSelectedConversationId] = usePersistentState<string | null>('amas_community_selected_conversation', null);
  const [chatReturnSection, setChatReturnSection] = usePersistentState<CommunitySection>('amas_community_chat_return_section', 'conversations');
  const [highlightedPostId, setHighlightedPostId] = usePersistentState<string | null>('amas_community_highlight_post', null);
  const [feedFilter, setFeedFilter] = usePersistentState<FeedFilter>('amas_community_feed_filter', 'all');
  const [conversationSearch, setConversationSearch] = usePersistentState('amas_community_conversation_search', '');
  const [notificationFilter, setNotificationFilter] = usePersistentState<NotificationFilter>('amas_community_notification_filter', 'all');
  const [notifications, setNotifications] = usePersistentState<CommunityNotification[]>('amas_community_notifications', communityNotifications);
  const [chatMessages, setChatMessages] = usePersistentState<Record<string, ChatMessage[]>>('amas_community_chat_messages', communityChatMessages);
  const [posts, setPosts] = usePersistentState('amas_community_posts', communityPosts);
  const [conversations, setConversations] = usePersistentState('amas_community_conversations', communityConversations);
  const [composerText, setComposerText] = usePersistentState('amas_community_composer_text', '');
  const [composerCourseId, setComposerCourseId] = usePersistentState<string>('amas_community_composer_course', '');
  const [activeCommentPostId, setActiveCommentPostId] = usePersistentState<string | null>('amas_community_comment_post', null);
  const [commentDrafts, setCommentDrafts] = usePersistentState<Record<string, string>>('amas_community_comment_drafts', {});
  const selectedConversationIdRef = useRef<string | null>(selectedConversationId);
  const replyTimersRef = useRef<number[]>([]);
  const unreadCount = conversations.reduce((sum, item) => sum + item.unread, 0);
  const unreadNotifications = notifications.filter((item) => !item.read).length;
  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );
  const filteredPosts = useMemo(
    () => (feedFilter === 'all' ? posts : posts.filter((item) => item.badge === feedFilter)),
    [feedFilter, posts],
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

  const notificationOverview = useMemo(
    () => ({
      unread: notifications.filter((item) => !item.read).length,
      interaction: notifications.filter((item) => item.type === 'interaction').length,
      system: notifications.filter((item) => item.type === 'system').length,
    }),
    [notifications],
  );

  const filteredNotifications = useMemo(() => {
    const order: Record<CommunityNotificationType, number> = {
      interaction: 0,
      system: 1,
    };

    return [...notifications]
      .filter((item) => {
        if (notificationFilter === 'all') {
          return true;
        }
        if (notificationFilter === 'unread') {
          return !item.read;
        }
        return item.type === notificationFilter;
      })
      .sort((left, right) => order[left.type] - order[right.type]);
  }, [notificationFilter, notifications]);

  const prependNotification = (notification: CommunityNotification) => {
    setNotifications((current) => [notification, ...current]);
  };

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

  const touchConversation = (conversationId: string, patch: Partial<(typeof conversations)[number]>) => {
    setConversations((current) => {
      const target = current.find((item) => item.id === conversationId);
      if (!target) {
        return current;
      }

      const next = { ...target, ...patch };
      return [next, ...current.filter((item) => item.id !== conversationId)];
    });
  };

  const updateConversationFlags = (conversationId: string, patch: Partial<(typeof conversations)[number]>) => {
    setConversations((current) => current.map((item) => (item.id === conversationId ? { ...item, ...patch } : item)));
  };

  const handleOpenConversation = (conversationId: string) => {
    setChatReturnSection(activeSection);
    setSelectedConversationId(conversationId);
    setConversations((current) => current.map((item) => (item.id === conversationId ? { ...item, unread: 0 } : item)));
    setNotifications((current) =>
      current.map((item) => (item.conversationId === conversationId ? { ...item, read: true } : item)),
    );
  };

  const handleNotificationClick = (notification: CommunityNotification) => {
    setNotifications((current) =>
      current.map((item) => (item.id === notification.id ? { ...item, read: true } : item)),
    );

    if (notification.postId) {
      setFeedFilter('all');
      setHighlightedPostId(notification.postId);
      setActiveCommentPostId(notification.postId);
      setActiveSection('feed');
      return;
    }

    if (notification.courseId) {
      onOpenCourse(notification.courseId);
      return;
    }

    if (notification.conversationId) {
      handleOpenConversation(notification.conversationId);
      return;
    }
  };

  const handleMarkAllNotificationsRead = () => {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
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

    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) {
      return;
    }

    const timer = window.setTimeout(() => {
      const reply = createAutoReplyMessage(conversation);
      setChatMessages((current) => ({
        ...current,
        [conversationId]: [...(current[conversationId] ?? []), reply],
      }));
      setConversations((current) => {
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

      if (selectedConversationIdRef.current !== conversationId && !conversation.muted) {
        prependNotification(buildConversationNotification(conversation, reply));
      }
    }, 1200);

    replyTimersRef.current.push(timer);
  };

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

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
              <span className="toolbar-helper">动态会先保存在本地状态，后面再接通知和评论联动。</span>
              <button
                type="button"
                className="primary-btn compact-btn"
                onClick={() => {
                  const content = composerText.trim();
                  if (!content) {
                    return;
                  }

                  const postId = `post-${Date.now()}`;
                  setPosts((current) => [
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
                  setComposerText('');
                  setComposerCourseId('');
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
          {filteredPosts.map((post) => (
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

                    setPosts((current) =>
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
                  <button type="button" className="secondary-btn compact-btn" onClick={() => onOpenCourse(post.courseId!)}>
                    打开关联课程
                  </button>
                </div>
              ) : (
                <div className="post-footer">
                  <span>这条内容当前作为系统信息源，后续会接入通知模块。</span>
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

                        setPosts((current) =>
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
                      setCommentDrafts((current) => ({ ...current, [post.id]: '' }));
                      }}
                    >
                      提交评论
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}
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
          <div className="notification-toolbar">
            <p className="toolbar-helper">通知会按照互动 / 系统分组展示，并支持一键标记已读。</p>
            <button type="button" className="secondary-btn compact-btn" onClick={handleMarkAllNotificationsRead}>
              全部标为已读
            </button>
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
              className={notification.read ? 'course-card notification-card' : 'course-card notification-card unread'}
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
