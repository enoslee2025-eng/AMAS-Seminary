import { ChatMessage, CommunityContact, CommunityNotification, ConversationPreview } from '../../types/app';

const weekdayMap: Record<string, number> = {
  日: 0,
  天: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
};

type NotificationFilterKey = 'all' | 'unread' | 'interaction' | 'system';

export function formatConversationTime(date = new Date()) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function parseClock(value: string) {
  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (!match) {
    return null;
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

function withClock(date: Date, value: string) {
  const clock = parseClock(value);
  const next = new Date(date);
  next.setHours(clock?.hour ?? 12, clock?.minute ?? 0, 0, 0);
  return next.getTime();
}

function mostRecentWeekday(now: Date, weekday: number) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  const diff = (7 + date.getDay() - weekday) % 7;
  date.setDate(date.getDate() - diff);
  return date;
}

export function getDisplayTimeSortValue(value: string, now = new Date()) {
  const text = value.trim();
  if (!text) {
    return 0;
  }

  if (text === '刚刚') {
    return now.getTime();
  }

  const minuteMatch = text.match(/(\d+)\s*分钟前/);
  if (minuteMatch) {
    return now.getTime() - Number(minuteMatch[1]) * 60_000;
  }

  const hourMatch = text.match(/(\d+)\s*小时前/);
  if (hourMatch) {
    return now.getTime() - Number(hourMatch[1]) * 3_600_000;
  }

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  if (/^今天/.test(text)) {
    return withClock(todayStart, text);
  }

  if (/^昨天/.test(text)) {
    const yesterday = new Date(todayStart);
    yesterday.setDate(yesterday.getDate() - 1);
    return withClock(yesterday, text);
  }

  const weekdayMatch = text.match(/^(?:周|星期)([一二三四五六日天])/);
  if (weekdayMatch) {
    return withClock(mostRecentWeekday(now, weekdayMap[weekdayMatch[1]]), text);
  }

  if (/^\d{1,2}:\d{2}$/.test(text)) {
    return withClock(todayStart, text);
  }

  return 0;
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

      const timeDiff = getDisplayTimeSortValue(right.time) - getDisplayTimeSortValue(left.time);
      if (timeDiff !== 0) {
        return timeDiff;
      }

      return left.name.localeCompare(right.name, 'zh-CN');
    });
}

export function sortNotifications(notifications: CommunityNotification[], filter: NotificationFilterKey) {
  const typeOrder: Record<CommunityNotification['type'], number> = {
    interaction: 0,
    system: 1,
  };

  return [...notifications]
    .filter((item) => {
      if (filter === 'all') {
        return true;
      }
      if (filter === 'unread') {
        return !item.read;
      }
      return item.type === filter;
    })
    .sort((left, right) => {
      const unreadDiff = Number(!right.read) - Number(!left.read);
      if (unreadDiff !== 0) {
        return unreadDiff;
      }

      const timeDiff = getDisplayTimeSortValue(right.time) - getDisplayTimeSortValue(left.time);
      if (timeDiff !== 0) {
        return timeDiff;
      }

      const typeDiff = typeOrder[left.type] - typeOrder[right.type];
      if (typeDiff !== 0) {
        return typeDiff;
      }

      return left.title.localeCompare(right.title, 'zh-CN');
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

export function filterContacts(contacts: CommunityContact[], keyword: string) {
  const normalizedKeyword = keyword.trim().toLowerCase();

  return contacts.filter((contact) => {
    if (!normalizedKeyword) {
      return true;
    }

    return [contact.name, contact.role, contact.region, contact.summary].join(' ').toLowerCase().includes(normalizedKeyword);
  });
}

export function getContactConversationId(contactId: string) {
  return `conv-contact-${contactId}`;
}

export function buildConversationFromContact(contact: CommunityContact): ConversationPreview {
  return {
    id: getContactConversationId(contact.id),
    name: contact.name,
    subtitle: contact.summary,
    time: '刚刚',
    unread: 0,
    role: contact.role,
    pinned: false,
    muted: false,
    contactId: contact.id,
  };
}

export function createContactIntroMessage(contact: CommunityContact): ChatMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sender: 'other',
    content:
      contact.relatedCourseId
        ? `${contact.name} 已上线，我们可以继续对接课程资料和校友圈里的讨论。`
        : `${contact.name} 已上线，后续可以从这里继续恢复聊天和协作链路。`,
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
