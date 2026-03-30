import { useEffect, useMemo, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { useScopedPersistentState } from '../../hooks/usePersistentState';
import { ChatMessage, ConversationPreview } from '../../types/app';
import { createOutgoingMessage, getChatMessagePreview } from './communityState';

export function ChatView({
  storageScopeKey,
  conversation,
  messages,
  onBack,
  onSend,
  onTogglePinned,
  onToggleMuted,
  onOpenVoiceRoom,
}: {
  storageScopeKey: string;
  conversation: ConversationPreview;
  messages: ChatMessage[];
  onBack: () => void;
  onSend: (message: ChatMessage) => void;
  onTogglePinned: () => void;
  onToggleMuted: () => void;
  onOpenVoiceRoom: (roomId: string) => void;
}) {
  const [drafts, setDrafts] = useScopedPersistentState<Record<string, string>>(
    'amas_community_chat_drafts',
    storageScopeKey,
    {},
  );
  const messageListRef = useRef<HTMLElement | null>(null);
  const draft = drafts[conversation.id] ?? '';
  const myMessageCount = useMemo(() => messages.filter((message) => message.sender === 'me').length, [messages]);
  const otherMessageCount = useMemo(() => messages.filter((message) => message.sender === 'other').length, [messages]);
  const lastActiveAt = useMemo(() => {
    const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    return latestMessage?.time ?? conversation.time;
  }, [conversation.time, messages]);
  const latestOtherMessage = useMemo(
    () => [...messages].reverse().find((message) => message.sender === 'other') ?? null,
    [messages],
  );

  useEffect(() => {
    if (!(conversation.id in drafts)) {
      setDrafts((current) => ({ ...current, [conversation.id]: '' }));
    }
  }, [conversation.id, drafts, setDrafts]);

  useEffect(() => {
    if (!messageListRef.current) {
      return;
    }

    messageListRef.current.scrollTo({
      top: messageListRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  const handleSend = () => {
    const content = draft.trim();
    if (!content) {
      return;
    }

    onSend(createOutgoingMessage(content));
    setDrafts((current) => ({ ...current, [conversation.id]: '' }));
  };

  const handleDraftKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-layout">
      <section className="content-card chat-header-card">
        <div className="chat-header-row">
          <button type="button" className="back-link text-back-link" onClick={onBack}>
            返回消息
          </button>
          <div className="chat-header-copy">
            <p className="eyebrow">Conversation</p>
            <h2>{conversation.name}</h2>
            <p className="profile-role">
              {conversation.role ?? 'Community'} · 最近活跃 {lastActiveAt}
            </p>
          </div>
        </div>
        <div className="chat-header-stats">
          <article className="chat-header-stat">
            <span>消息总数</span>
            <strong>{messages.length}</strong>
          </article>
          <article className="chat-header-stat">
            <span>对方消息</span>
            <strong>{otherMessageCount}</strong>
          </article>
          <article className="chat-header-stat wide">
            <span>最近互动</span>
            <strong>{latestOtherMessage ? getChatMessagePreview(latestOtherMessage) : '当前还没有对方新消息'}</strong>
          </article>
          <article className="chat-header-stat">
            <span>我发出的消息</span>
            <strong>{myMessageCount}</strong>
          </article>
        </div>
        <div className="chat-header-actions">
          <button type="button" className={conversation.pinned ? 'chip-btn active' : 'chip-btn'} onClick={onTogglePinned}>
            {conversation.pinned ? '已置顶' : '置顶会话'}
          </button>
          <button type="button" className={conversation.muted ? 'chip-btn active' : 'chip-btn'} onClick={onToggleMuted}>
            {conversation.muted ? '已静音' : '消息提醒'}
          </button>
        </div>
      </section>

      <section ref={messageListRef} className="chat-message-list">
        {messages.map((message) => (
          <article
            key={message.id}
            className={
              message.type === 'voice_room_invite' || message.type === 'voice_room_recap'
                ? message.sender === 'me'
                  ? 'chat-bubble me invite'
                  : 'chat-bubble other invite'
                : message.sender === 'me'
                  ? 'chat-bubble me'
                  : 'chat-bubble other'
            }
          >
            {(message.type === 'voice_room_invite' || message.type === 'voice_room_recap') && message.voiceRoomId ? (
              <div className="voice-room-invite-card">
                <span className="voice-room-invite-eyebrow">{message.type === 'voice_room_recap' ? '会后摘要' : '语音房邀请'}</span>
                <strong>
                  {message.type === 'voice_room_recap'
                    ? message.voiceRoomRecapHeadline ?? message.voiceRoomTitle ?? '未命名语音房'
                    : message.voiceRoomTitle ?? '未命名语音房'}
                </strong>
                {message.voiceRoomTopic && <span className="voice-room-invite-topic">{message.voiceRoomTopic}</span>}
                <p>{message.voiceRoomSummary ?? message.content}</p>
                {message.type === 'voice_room_recap' && (message.voiceRoomRecapHighlights?.length ?? 0) > 0 && (
                  <div className="voice-room-recap-points">
                    {message.voiceRoomRecapHighlights?.map((item) => (
                      <p key={item} className="voice-room-invite-note">
                        {item}
                      </p>
                    ))}
                  </div>
                )}
                {message.type !== 'voice_room_recap' && message.voiceRoomSummary !== message.content && (
                  <p className="voice-room-invite-note">{message.content}</p>
                )}
                <div className="voice-room-invite-actions">
                  <button type="button" className="secondary-btn compact-btn" onClick={() => onOpenVoiceRoom(message.voiceRoomId!)}>
                    {message.type === 'voice_room_recap' ? '回到房间' : '打开语音房'}
                  </button>
                </div>
              </div>
            ) : (
              <p>{message.content}</p>
            )}
            <span>{message.time}</span>
          </article>
        ))}
      </section>

      <section className="content-card chat-input-card">
        <label className="chat-input-field" htmlFor="chat-draft">
          <span>发送消息</span>
          <textarea
            id="chat-draft"
            rows={3}
            value={draft}
            onChange={(event) =>
              setDrafts((current) => ({
                ...current,
                [conversation.id]: event.target.value,
              }))
            }
            onKeyDown={handleDraftKeyDown}
            placeholder="继续恢复聊天链路，例如：补通知跳转、已读状态或会话映射。"
          />
        </label>
        <div className="chat-input-actions">
          <span className="toolbar-helper">当前草稿会按会话保存，按 Cmd/Ctrl + Enter 可快速发送。</span>
          <button type="button" className="primary-btn compact-btn" onClick={handleSend}>
            发送
          </button>
        </div>
      </section>
    </div>
  );
}
