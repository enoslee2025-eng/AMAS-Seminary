import { ChatMessage, CommunityNotification, ConversationPreview } from '../../types/app';

function getConversationTimeRank(time: string) {
  if (time.includes(':')) {
    return 4;
  }
  if (time.includes('刚刚') || time.includes('分钟') || time.includes('小时')) {
    return 3;
  }
  if (time.includes('昨天')) {
    return 2;
  }
  if (time.includes('周') || time.includes('星期')) {
    return 1;
  }
  return 0;
}

export function formatConversationTime(date = new Date()) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function sortConversations(conversations: ConversationPreview[], keyword: string) {
  const normalizedKeyword = keyword.trim().toLowerCase();

  return [...conversations]
    .filter((conversation) => {
      if (!normalizedKeyword) {
        return true;
      }

      return [conversation.name, conversation.subtitle, conversation.role]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedKeyword);
    })
    .sort((left, right) => {
      const pinnedDiff = Number(Boolean(right.pinned)) - Number(Boolean(left.pinned));
      if (pinnedDiff !== 0) {
        return pinnedDiff;
      }

      const leftText = [left.name, left.subtitle, left.role].filter(Boolean).join(' ').toLowerCase();
      const rightText = [right.name, right.subtitle, right.role].filter(Boolean).join(' ').toLowerCase();
      const leftStarts = normalizedKeyword ? Number(leftText.startsWith(normalizedKeyword)) : 0;
      const rightStarts = normalizedKeyword ? Number(rightText.startsWith(normalizedKeyword)) : 0;
      if (rightStarts !== leftStarts) {
        return rightStarts - leftStarts;
      }

      if (right.unread !== left.unread) {
        return right.unread - left.unread;
      }

      const timeDiff = getConversationTimeRank(right.time) - getConversationTimeRank(left.time);
      if (timeDiff !== 0) {
        return timeDiff;
      }

      return left.name.localeCompare(right.name, 'zh-CN');
    });
}

export function createOutgoingMessage(content: string): ChatMessage {
  return {
    id: `msg-${Date.now()}`,
    sender: 'me',
    content,
    time: formatConversationTime(),
  };
}

export function createAutoReplyMessage(conversation: ConversationPreview): ChatMessage {
  const contentMap: Record<string, string> = {
    'conv-1': '收到。我会把这条信息补进教务记录，稍后同步恢复进度。',
    'conv-2': '已收到，今晚会把对应模块拆解结果发到群里。',
    'conv-3': '明白，我们会把这条代祷与课程资料一起整理进跟进表。',
  };

  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sender: 'other',
    content: contentMap[conversation.id] ?? `${conversation.name} 已收到，后续会继续跟进这条消息。`,
    time: formatConversationTime(),
  };
}

export function buildConversationNotification(conversation: ConversationPreview, message: ChatMessage): CommunityNotification {
  return {
    id: `notice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: `${conversation.name} 发来新消息`,
    detail: message.content,
    time: '刚刚',
    type: 'interaction',
    read: false,
    conversationId: conversation.id,
  };
}
