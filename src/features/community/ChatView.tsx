import { useEffect, useMemo, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { ChatMessage, ConversationPreview } from '../../types/app';
import { createOutgoingMessage } from './communityState';

export function ChatView({
  conversation,
  messages,
  onBack,
  onSend,
  onTogglePinned,
  onToggleMuted,
}: {
  conversation: ConversationPreview;
  messages: ChatMessage[];
  onBack: () => void;
  onSend: (message: ChatMessage) => void;
  onTogglePinned: () => void;
  onToggleMuted: () => void;
}) {
  const [drafts, setDrafts] = usePersistentState<Record<string, string>>('amas_community_chat_drafts', {});
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
            <strong>{latestOtherMessage?.content ?? '当前还没有对方新消息'}</strong>
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
          <article key={message.id} className={message.sender === 'me' ? 'chat-bubble me' : 'chat-bubble other'}>
            <p>{message.content}</p>
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
