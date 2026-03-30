import { useEffect, useMemo, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { communityContacts, courses } from '../../data/mockData';
import { useScopedPersistentState } from '../../hooks/usePersistentState';
import {
  CommunityNotification,
  ConversationPreview,
  ProfileState,
  VoiceRoomActivity,
  VoiceRoomActivityType,
  VoiceRoomJoinPolicy,
  VoiceRoomJoinRequest,
  VoiceRoom,
  VoiceRoomMember,
  VoiceRoomMemberPresence,
  VoiceRoomRecap,
} from '../../types/app';
import { createProcessedQueueLogItem } from '../profile/profileState';
import { useProcessedQueueLog } from '../profile/useProcessedQueueLog';

type VoiceRoomFilter = 'all' | 'joined' | VoiceRoom['topic'];

const roomFilterOptions: Array<[VoiceRoomFilter, string]> = [
  ['all', '全部房间'],
  ['joined', '我已加入'],
  ['课程复盘', '课程复盘'],
  ['代祷陪伴', '代祷陪伴'],
  ['导师答疑', '导师答疑'],
  ['同工交通', '同工交通'],
];

const topicOptions: VoiceRoom['topic'][] = ['课程复盘', '代祷陪伴', '导师答疑', '同工交通'];

function findLocalMember(room: VoiceRoom) {
  return room.members.find((member) => member.isLocal) ?? null;
}

function getJoinPolicy(room: VoiceRoom): VoiceRoomJoinPolicy {
  return room.joinPolicy ?? 'open';
}

function getJoinRequests(room: VoiceRoom): VoiceRoomJoinRequest[] {
  return room.joinRequests ?? [];
}

function findLocalJoinRequest(room: VoiceRoom) {
  return getJoinRequests(room).find((request) => request.isLocal) ?? null;
}

function getMemberPresence(member: VoiceRoomMember): VoiceRoomMemberPresence {
  return member.presence ?? 'online';
}

function getSpeakerRequestIds(room: VoiceRoom) {
  return room.speakerRequestMemberIds ?? [];
}

function getRoomActivities(room: VoiceRoom) {
  return room.activity ?? [];
}

function findHostMember(room: VoiceRoom) {
  return room.members.find((member) => member.role === 'host') ?? null;
}

function sortRoomMembers(members: VoiceRoomMember[]) {
  const roleRank: Record<VoiceRoomMember['role'], number> = {
    host: 0,
    speaker: 1,
    listener: 2,
  };
  const stateRank: Record<VoiceRoomMember['state'], number> = {
    speaking: 0,
    muted: 1,
    listening: 2,
  };
  const presenceRank: Record<VoiceRoomMemberPresence, number> = {
    online: 0,
    reconnecting: 1,
    away: 2,
  };

  return [...members].sort((left, right) => {
    if (left.isLocal !== right.isLocal) {
      return Number(Boolean(right.isLocal)) - Number(Boolean(left.isLocal));
    }

    if (roleRank[left.role] !== roleRank[right.role]) {
      return roleRank[left.role] - roleRank[right.role];
    }

    if (stateRank[left.state] !== stateRank[right.state]) {
      return stateRank[left.state] - stateRank[right.state];
    }

    if (presenceRank[getMemberPresence(left)] !== presenceRank[getMemberPresence(right)]) {
      return presenceRank[getMemberPresence(left)] - presenceRank[getMemberPresence(right)];
    }

    return left.name.localeCompare(right.name, 'zh-CN');
  });
}

function sortVoiceRooms(rooms: VoiceRoom[], keyword: string, filter: VoiceRoomFilter) {
  const normalizedKeyword = keyword.trim().toLowerCase();

  return [...rooms]
    .filter((room) => {
      if (filter === 'joined' && !room.joined) {
        return false;
      }

      if (filter !== 'all' && filter !== 'joined' && room.topic !== filter) {
        return false;
      }

      if (!normalizedKeyword) {
        return true;
      }

      return [room.title, room.summary, room.hostName, room.topic, getJoinPolicyLabel(getJoinPolicy(room)), ...room.members.map((member) => member.name)]
        .join(' ')
        .toLowerCase()
        .includes(normalizedKeyword);
    })
    .sort((left, right) => {
      if (left.joined !== right.joined) {
        return Number(Boolean(right.joined)) - Number(Boolean(left.joined));
      }

      if (left.status !== right.status) {
        return left.status === 'live' ? -1 : 1;
      }

      if (right.participantCount !== left.participantCount) {
        return right.participantCount - left.participantCount;
      }

      return left.title.localeCompare(right.title, 'zh-CN');
    });
}

function createLocalMember(profile: ProfileState): VoiceRoomMember {
  return {
    id: `room-member-local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: profile.name.trim() || 'AMAS 学员',
    badge: profile.role.trim() || '亚洲宣教神学院 学员',
    role: 'listener',
    state: 'listening',
    presence: 'online',
    isLocal: true,
  };
}

function createLocalJoinRequest(profile: ProfileState): VoiceRoomJoinRequest {
  return {
    id: `voice-room-join-local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: profile.name.trim() || 'AMAS 学员',
    badge: profile.role.trim() || '亚洲宣教神学院 学员',
    time: '刚刚',
    isLocal: true,
  };
}

function getMemberRoleLabel(role: VoiceRoomMember['role']) {
  if (role === 'host') {
    return '主持';
  }

  if (role === 'speaker') {
    return '发言席';
  }

  return '听众席';
}

function getMemberStateLabel(state: VoiceRoomMember['state']) {
  if (state === 'speaking') {
    return '正在发言';
  }

  if (state === 'muted') {
    return '已静音';
  }

  return '聆听中';
}

function getMemberPresenceLabel(presence: VoiceRoomMemberPresence) {
  if (presence === 'reconnecting') {
    return '重连中';
  }

  if (presence === 'away') {
    return '暂时离线';
  }

  return '在线';
}

function getMemberPresenceToneClass(presence: VoiceRoomMemberPresence) {
  if (presence === 'reconnecting') {
    return 'post-badge voice-room-presence-badge voice-room-presence-reconnecting';
  }

  if (presence === 'away') {
    return 'post-badge voice-room-presence-badge voice-room-presence-away';
  }

  return 'post-badge voice-room-presence-badge voice-room-presence-online';
}

function getStateForPresence(role: VoiceRoomMember['role'], presence: VoiceRoomMemberPresence) {
  if (presence !== 'online') {
    return role === 'listener' ? 'listening' : 'muted';
  }

  if (role === 'host') {
    return 'speaking';
  }

  if (role === 'speaker') {
    return 'muted';
  }

  return 'listening';
}

function createRoomActivity(title: string, detail: string, type: VoiceRoomActivityType): VoiceRoomActivity {
  return {
    id: `voice-room-activity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    title,
    detail,
    time: '刚刚',
  };
}

function appendRoomActivity(room: VoiceRoom, activity: VoiceRoomActivity) {
  return {
    ...room,
    activity: [activity, ...getRoomActivities(room)].slice(0, 8),
  };
}

function countOnStageMembers(members: VoiceRoomMember[]) {
  return members.filter((member) => member.role !== 'listener').length;
}

function countOnlineMembers(members: VoiceRoomMember[]) {
  return members.filter((member) => getMemberPresence(member) === 'online').length;
}

function countUnstableMembers(members: VoiceRoomMember[]) {
  return members.filter((member) => getMemberPresence(member) !== 'online').length;
}

function getRoomStatusLabel(room: VoiceRoom) {
  if (room.status === 'ended') {
    return '已结束';
  }

  if (room.joined) {
    return '我已在房间';
  }

  return '直播中';
}

function getJoinPolicyLabel(policy: VoiceRoomJoinPolicy) {
  return policy === 'approval' ? '审批入房' : '直接加入';
}

function getActivityTypeLabel(type: VoiceRoomActivityType) {
  if (type === 'moderation') {
    return '主持控制';
  }

  if (type === 'request') {
    return '上麦流转';
  }

  if (type === 'member') {
    return '成员动态';
  }

  return '房间事件';
}

function getActivityTypeClass(type: VoiceRoomActivityType) {
  if (type === 'moderation') {
    return 'post-badge voice-room-activity-badge voice-room-activity-badge-moderation';
  }

  if (type === 'request') {
    return 'post-badge voice-room-activity-badge voice-room-activity-badge-request';
  }

  if (type === 'member') {
    return 'post-badge voice-room-activity-badge voice-room-activity-badge-member';
  }

  return 'post-badge voice-room-activity-badge voice-room-activity-badge-system';
}

function formatRecapTime(date = new Date()) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function buildVoiceRoomRecap(room: VoiceRoom): VoiceRoomRecap {
  const relatedCourseTitle = room.courseId ? courses.find((course) => course.id === room.courseId)?.title ?? null : null;
  const requestCount = getSpeakerRequestIds(room).length;
  const stageMemberCount = room.members.filter((member) => member.role !== 'listener').length;

  return {
    headline: `${room.title} 已完成本轮讨论`,
    generatedAt: formatRecapTime(),
    highlights: [
      `本轮共有 ${room.participantCount} 人参与，${stageMemberCount} 位成员曾进入发言席。`,
      relatedCourseTitle ? `讨论内容持续围绕《${relatedCourseTitle}》展开。` : `本房间主要围绕“${room.topic}”收束了本轮重点。`,
      requestCount > 0 ? `结束前仍有 ${requestCount} 条上麦申请待后续跟进。` : '结束前没有遗留的上麦申请，适合直接进入会后整理。',
    ],
  };
}

function applyLocalJoinToRoom(room: VoiceRoom, profile: ProfileState): VoiceRoom {
  const hasLocalMember = room.members.some((member) => member.isLocal);

  return {
    ...room,
    joined: true,
    participantCount: hasLocalMember ? room.participantCount : room.participantCount + 1,
    joinRequests: getJoinRequests(room).filter((request) => !request.isLocal),
    speakerRequestMemberIds: getSpeakerRequestIds(room),
    members: hasLocalMember ? room.members : [...room.members, createLocalMember(profile)],
  };
}

function createMemberFromJoinRequest(request: VoiceRoomJoinRequest): VoiceRoomMember {
  return {
    id: `voice-room-member-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: request.name,
    badge: request.badge,
    role: 'listener',
    state: 'listening',
    presence: 'online',
    contactId: request.contactId,
    isLocal: request.isLocal,
  };
}

export function VoiceRoomsPanel({
  profile,
  storageScopeKey,
  communitySyncSummary,
  selectedRoomId,
  onSelectRoomId,
  voiceRooms,
  onUpdateVoiceRooms,
  onUpdateNotifications,
  conversations,
  onShareVoiceRoom,
  onPublishVoiceRoomRecap,
  onShareVoiceRoomRecap,
  onOpenCourse,
}: {
  profile: ProfileState;
  storageScopeKey: string;
  communitySyncSummary: string;
  selectedRoomId: string | null;
  onSelectRoomId: Dispatch<SetStateAction<string | null>>;
  voiceRooms: VoiceRoom[];
  onUpdateVoiceRooms: Dispatch<SetStateAction<VoiceRoom[]>>;
  onUpdateNotifications: Dispatch<SetStateAction<CommunityNotification[]>>;
  conversations: ConversationPreview[];
  onShareVoiceRoom: (roomId: string, conversationId: string) => void;
  onPublishVoiceRoomRecap: (roomId: string) => string | null;
  onShareVoiceRoomRecap: (roomId: string, conversationId: string) => boolean;
  onOpenCourse: (courseId: string) => void;
}) {
  const [roomFilter, setRoomFilter] = useScopedPersistentState<VoiceRoomFilter>('amas_community_voice_room_filter', storageScopeKey, 'all');
  const [roomSearch, setRoomSearch] = useScopedPersistentState('amas_community_voice_room_search', storageScopeKey, '');
  const [draftTitle, setDraftTitle] = useScopedPersistentState('amas_community_voice_room_title', storageScopeKey, '');
  const [draftSummary, setDraftSummary] = useScopedPersistentState('amas_community_voice_room_summary', storageScopeKey, '');
  const [draftCourseId, setDraftCourseId] = useScopedPersistentState('amas_community_voice_room_course', storageScopeKey, '');
  const [draftTopic, setDraftTopic] = useScopedPersistentState<VoiceRoom['topic']>(
    'amas_community_voice_room_topic',
    storageScopeKey,
    '课程复盘',
  );
  const [draftJoinPolicy, setDraftJoinPolicy] = useScopedPersistentState<VoiceRoomJoinPolicy>(
    'amas_community_voice_room_join_policy',
    storageScopeKey,
    'open',
  );
  const [shareTargets, setShareTargets] = useScopedPersistentState<Record<string, string>>(
    'amas_community_voice_room_share_targets',
    storageScopeKey,
    {},
  );
  const [minimizedRoomId, setMinimizedRoomId] = useScopedPersistentState<string | null>(
    'amas_community_minimized_voice_room',
    storageScopeKey,
    null,
  );
  const [, , appendProcessedQueueLog] = useProcessedQueueLog(storageScopeKey);
  const approvalTimersRef = useRef<number[]>([]);
  const presenceShiftIndexesRef = useRef<Record<string, number>>({});

  const currentUserIdentity = useMemo(
    () => ({
      name: profile.name.trim() || 'AMAS 学员',
      role: profile.role.trim() || '亚洲宣教神学院 学员',
    }),
    [profile.name, profile.role],
  );

  const selectedRoom = useMemo(
    () => (selectedRoomId ? voiceRooms.find((room) => room.id === selectedRoomId) ?? null : null),
    [selectedRoomId, voiceRooms],
  );
  const minimizedRoom = useMemo(
    () =>
      selectedRoomId
        ? null
        : voiceRooms.find((room) => room.id === minimizedRoomId && room.joined && room.status === 'live') ?? null,
    [minimizedRoomId, selectedRoomId, voiceRooms],
  );
  const filteredRooms = useMemo(() => {
    const nextRooms = sortVoiceRooms(voiceRooms, roomSearch, roomFilter);

    if (selectedRoom && !nextRooms.some((room) => room.id === selectedRoom.id)) {
      return [selectedRoom, ...nextRooms];
    }

    return nextRooms;
  }, [roomFilter, roomSearch, selectedRoom, voiceRooms]);

  const liveRoomCount = useMemo(() => voiceRooms.filter((room) => room.status === 'live').length, [voiceRooms]);
  const joinedRoomCount = useMemo(() => voiceRooms.filter((room) => room.joined).length, [voiceRooms]);
  const hostedRoomCount = useMemo(
    () => voiceRooms.filter((room) => room.joined && findLocalMember(room)?.role === 'host').length,
    [voiceRooms],
  );
  const approvalRoomCount = useMemo(
    () => voiceRooms.filter((room) => getJoinPolicy(room) === 'approval').length,
    [voiceRooms],
  );
  const pendingJoinRequestCount = useMemo(
    () => voiceRooms.reduce((sum, room) => sum + getJoinRequests(room).length, 0),
    [voiceRooms],
  );
  const pendingSpeakerRequestCount = useMemo(
    () => voiceRooms.reduce((sum, room) => sum + getSpeakerRequestIds(room).length, 0),
    [voiceRooms],
  );

  useEffect(() => {
    if (selectedRoomId && !voiceRooms.some((room) => room.id === selectedRoomId)) {
      onSelectRoomId(null);
    }
  }, [onSelectRoomId, selectedRoomId, voiceRooms]);

  useEffect(() => {
    if (minimizedRoomId && !voiceRooms.some((room) => room.id === minimizedRoomId && room.joined && room.status === 'live')) {
      setMinimizedRoomId(null);
    }
  }, [minimizedRoomId, setMinimizedRoomId, voiceRooms]);

  useEffect(
    () => () => {
      approvalTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  const prependNotification = (notification: CommunityNotification) => {
    onUpdateNotifications((current) => [notification, ...current]);
  };

  const appendLearningLog = (title: string, detail: string, actionLabel: string, impactCount = 1) => {
    appendProcessedQueueLog(
      createProcessedQueueLogItem({
        category: 'learning',
        title,
        detail,
        actionLabel,
        impactCount,
      }),
    );
  };

  const appendReminderLog = (title: string, detail: string, actionLabel: string, impactCount = 1) => {
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

  const createRoomNotification = (room: VoiceRoom, title: string, detail: string, type: CommunityNotification['type']) => ({
    id: `notice-room-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    detail,
    time: '刚刚',
    type,
    read: false,
    ...(room.courseId ? { courseId: room.courseId } : undefined),
    voiceRoomId: room.id,
    voiceRoomTitle: room.title,
  });

  const handleCreateRoom = () => {
    const title = draftTitle.trim();
    const summary = draftSummary.trim();

    if (!title || !summary) {
      return;
    }

    const nextRoom: VoiceRoom = {
      id: `room-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      summary,
      topic: draftTopic,
      status: 'live',
      joinPolicy: draftJoinPolicy,
      time: '直播中 · 刚刚开始',
      hostName: currentUserIdentity.name,
      courseId: draftCourseId || undefined,
      joined: true,
      speakerCount: 1,
      participantCount: 1,
      joinRequests: [],
      speakerRequestMemberIds: [],
      members: [
        {
          id: `room-host-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: currentUserIdentity.name,
          badge: '主持',
          role: 'host',
          state: 'speaking',
          presence: 'online',
          isLocal: true,
        },
      ],
    };
    const nextRoomWithActivity = appendRoomActivity(
      nextRoom,
      createRoomActivity('房间已创建', `${currentUserIdentity.name} 已创建这间语音房并开始主持。`, 'system'),
    );

    onUpdateVoiceRooms((current) => [nextRoomWithActivity, ...current]);
    prependNotification(
      createRoomNotification(
        nextRoomWithActivity,
        `语音房已创建：${nextRoomWithActivity.title}`,
        '新的语音房壳子已经进入社区快照，后续可以继续补真实音频链路和邀请服务。',
        'system',
      ),
    );
    appendLearningLog(`创建语音房：${nextRoomWithActivity.title}`, nextRoomWithActivity.summary, '创建房间');
    onSelectRoomId(nextRoomWithActivity.id);
    setMinimizedRoomId(null);
    setDraftTitle('');
    setDraftSummary('');
    setDraftCourseId('');
    setDraftTopic('课程复盘');
    setDraftJoinPolicy('open');
  };

  const handleJoinRoom = (roomId: string) => {
    const roomBeforeJoin = voiceRooms.find((room) => room.id === roomId) ?? null;
    if (!roomBeforeJoin || roomBeforeJoin.joined || roomBeforeJoin.status === 'ended') {
      return;
    }

    if (getJoinPolicy(roomBeforeJoin) === 'approval') {
      if (findLocalJoinRequest(roomBeforeJoin)) {
        onSelectRoomId(roomId);
        return;
      }

      const nextRoom = appendRoomActivity(
        {
          ...roomBeforeJoin,
          joinRequests: [createLocalJoinRequest(profile), ...getJoinRequests(roomBeforeJoin)],
        },
        createRoomActivity('收到新的入房申请', `${currentUserIdentity.name} 已申请加入当前房间。`, 'system'),
      );

      onUpdateVoiceRooms((current) => current.map((room) => (room.id === roomId ? nextRoom : room)));
      prependNotification(
        createRoomNotification(
          nextRoom,
          `已申请加入语音房：${nextRoom.title}`,
          '你的入房申请已经进入待处理列表，主持通过后会自动把你带入房间。',
          'interaction',
        ),
      );
      appendReminderLog(`申请加入语音房：${nextRoom.title}`, nextRoom.summary, '申请加入');
      onSelectRoomId(roomId);
      setMinimizedRoomId(null);

      const hostMember = findHostMember(roomBeforeJoin);
      if (hostMember?.isLocal) {
        return;
      }

      const timer = window.setTimeout(() => {
        let approvedRoom: VoiceRoom | null = null;

        onUpdateVoiceRooms((current) =>
          current.map((item) => {
            if (item.id !== roomId) {
              return item;
            }

            if (!findLocalJoinRequest(item) || item.joined || item.status === 'ended') {
              return item;
            }

            approvedRoom = appendRoomActivity(
              applyLocalJoinToRoom(item, profile),
              createRoomActivity('主持已批准入房', `${currentUserIdentity.name} 已进入当前房间。`, 'system'),
            );

            return approvedRoom;
          }),
        );

        const nextApprovedRoom = approvedRoom as VoiceRoom | null;
        if (nextApprovedRoom) {
          prependNotification(
            createRoomNotification(
              nextApprovedRoom,
              `主持已同意加入：${nextApprovedRoom.title}`,
              '你现在已经进入房间，可以继续申请上麦、分享提醒或查看会后摘要。',
              'interaction',
            ),
          );
          appendLearningLog(`主持同意入房：${nextApprovedRoom.title}`, nextApprovedRoom.summary, '进入房间');
        }

        approvalTimersRef.current = approvalTimersRef.current.filter((item) => item !== timer);
      }, 1400);

      approvalTimersRef.current.push(timer);
      return;
    }

    const activeJoinedRoom = appendRoomActivity(
      applyLocalJoinToRoom(roomBeforeJoin, profile),
      createRoomActivity('成员已加入', `${currentUserIdentity.name} 已进入当前房间，成员壳子与席位状态已同步更新。`, 'member'),
    );

    onUpdateVoiceRooms((current) => current.map((room) => (room.id === roomId ? activeJoinedRoom : room)));

    prependNotification(
      createRoomNotification(
        activeJoinedRoom,
        `已加入语音房：${activeJoinedRoom.title}`,
        '当前房间成员壳子和加入状态会继续跟随账号写进统一快照。',
        'interaction',
      ),
    );
    appendLearningLog(`加入语音房：${activeJoinedRoom.title}`, activeJoinedRoom.summary, '加入房间');
    onSelectRoomId(roomId);
    setMinimizedRoomId(null);
  };

  const handleLeaveRoom = (roomId: string) => {
    const roomBeforeLeave = voiceRooms.find((room) => room.id === roomId) ?? null;
    const localMemberBeforeLeave = roomBeforeLeave ? findLocalMember(roomBeforeLeave) : null;
    if (!roomBeforeLeave || !roomBeforeLeave.joined || !localMemberBeforeLeave) {
      return;
    }

    const actionLabel = localMemberBeforeLeave.role === 'host' ? '结束房间' : '离开房间';
    const activeUpdatedRoom =
      localMemberBeforeLeave.role === 'host'
        ? appendRoomActivity(
            {
              ...roomBeforeLeave,
              joined: false,
              status: 'ended',
              time: '刚刚结束',
              joinRequests: [],
              speakerRequestMemberIds: [],
              recap: buildVoiceRoomRecap(roomBeforeLeave),
              members: roomBeforeLeave.members.filter((member) => !member.isLocal),
            },
            createRoomActivity('房间已结束', `${currentUserIdentity.name} 已结束本轮语音房，并生成会后摘要。`, 'system'),
          )
        : appendRoomActivity(
            {
              ...roomBeforeLeave,
              joined: false,
              participantCount: Math.max(roomBeforeLeave.participantCount - 1, 0),
              speakerCount:
                localMemberBeforeLeave.role === 'speaker'
                  ? Math.max(roomBeforeLeave.speakerCount - 1, 0)
                  : roomBeforeLeave.speakerCount,
              speakerRequestMemberIds: getSpeakerRequestIds(roomBeforeLeave).filter((memberId) => memberId !== localMemberBeforeLeave.id),
              members: roomBeforeLeave.members.filter((member) => !member.isLocal),
            },
            createRoomActivity('成员已离开', `${currentUserIdentity.name} 已离开当前房间。`, 'member'),
          );

    onUpdateVoiceRooms((current) => current.map((room) => (room.id === roomId ? activeUpdatedRoom : room)));

    prependNotification(
      createRoomNotification(
        activeUpdatedRoom,
        actionLabel === '结束房间' ? `语音房已结束：${activeUpdatedRoom.title}` : `已离开语音房：${activeUpdatedRoom.title}`,
        actionLabel === '结束房间'
          ? '这次房间记录会继续保留在社区快照里，后续可以从这里继续补会后摘要和邀请回流。'
          : '离开后的语音房状态已经写回本地工作区，后续仍可从列表重新进入。',
        'system',
      ),
    );
    appendLearningLog(
      `${actionLabel}：${activeUpdatedRoom.title}`,
      activeUpdatedRoom.summary,
      actionLabel,
    );
    if (selectedRoomId === roomId) {
      onSelectRoomId(null);
    }
    if (minimizedRoomId === roomId) {
      setMinimizedRoomId(null);
    }
  };

  const handleCancelJoinRequest = (roomId: string) => {
    const room = voiceRooms.find((item) => item.id === roomId) ?? null;
    const localJoinRequest = room ? findLocalJoinRequest(room) : null;
    if (!room || !localJoinRequest || room.joined) {
      return;
    }

    const nextRoom = appendRoomActivity(
      {
        ...room,
        joinRequests: getJoinRequests(room).filter((request) => request.id !== localJoinRequest.id),
      },
      createRoomActivity('已撤回入房申请', `${currentUserIdentity.name} 已撤回本次入房申请。`, 'system'),
    );

    onUpdateVoiceRooms((current) => current.map((item) => (item.id === roomId ? nextRoom : item)));
    prependNotification(
      createRoomNotification(
        nextRoom,
        `已撤回入房申请：${nextRoom.title}`,
        '你的入房申请已经从待处理列表移除，后续仍可再次申请加入。',
        'system',
      ),
    );
    appendReminderLog(`撤回入房申请：${nextRoom.title}`, nextRoom.summary, '撤回申请');
  };

  const handleApproveJoinRequest = (roomId: string, requestId: string) => {
    const room = voiceRooms.find((item) => item.id === roomId) ?? null;
    const hostMember = room ? findLocalMember(room) : null;
    const requestTarget = room ? getJoinRequests(room).find((request) => request.id === requestId) ?? null : null;
    if (!room || !hostMember || hostMember.role !== 'host' || !requestTarget) {
      return;
    }

    const nextRoom = appendRoomActivity(
      {
        ...room,
        joined: requestTarget.isLocal ? true : room.joined,
        participantCount: room.participantCount + 1,
        joinRequests: getJoinRequests(room).filter((request) => request.id !== requestId),
        members: [...room.members, createMemberFromJoinRequest(requestTarget)],
      },
      createRoomActivity('主持已批准入房', `${requestTarget.name} 已进入当前房间。`, 'system'),
    );

    onUpdateVoiceRooms((current) => current.map((item) => (item.id === roomId ? nextRoom : item)));
    prependNotification(
      createRoomNotification(
        nextRoom,
        `主持已批准入房：${requestTarget.name}`,
        `${requestTarget.name} 已进入房间，当前成员统计和房间活动已同步更新。`,
        'interaction',
      ),
    );
    appendLearningLog(`批准入房：${requestTarget.name}`, `${nextRoom.title} · ${requestTarget.name}`, '批准入房');
  };

  const handleDeclineJoinRequest = (roomId: string, requestId: string) => {
    const room = voiceRooms.find((item) => item.id === roomId) ?? null;
    const hostMember = room ? findLocalMember(room) : null;
    const requestTarget = room ? getJoinRequests(room).find((request) => request.id === requestId) ?? null : null;
    if (!room || !hostMember || hostMember.role !== 'host' || !requestTarget) {
      return;
    }

    const nextRoom = appendRoomActivity(
      {
        ...room,
        joinRequests: getJoinRequests(room).filter((request) => request.id !== requestId),
      },
      createRoomActivity('入房申请已暂缓', `${requestTarget.name} 的入房申请已被暂缓处理。`, 'system'),
    );

    onUpdateVoiceRooms((current) => current.map((item) => (item.id === roomId ? nextRoom : item)));
    prependNotification(
      createRoomNotification(
        nextRoom,
        `已暂缓入房申请：${requestTarget.name}`,
        '这条入房申请已从待处理列表移除，后续仍可再次申请。',
        'system',
      ),
    );
    appendReminderLog(`暂缓入房申请：${requestTarget.name}`, `${nextRoom.title} · ${requestTarget.name}`, '暂缓入房');
  };

  const handleSimulateJoinRequest = (roomId: string) => {
    const room = voiceRooms.find((item) => item.id === roomId) ?? null;
    const hostMember = room ? findLocalMember(room) : null;
    if (!room || !hostMember || hostMember.role !== 'host' || room.status === 'ended' || getJoinPolicy(room) !== 'approval') {
      return;
    }

    const existingNames = new Set([...room.members.map((member) => member.name), ...getJoinRequests(room).map((request) => request.name)]);
    const fallbackContact =
      communityContacts.find((contact) => !existingNames.has(contact.name)) ??
      communityContacts[0] ??
      null;
    if (!fallbackContact) {
      return;
    }

    const nextJoinRequest: VoiceRoomJoinRequest = {
      id: `voice-room-join-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: fallbackContact.name,
      badge: fallbackContact.role,
      time: '刚刚',
      contactId: fallbackContact.id,
    };
    const nextRoom = appendRoomActivity(
      {
        ...room,
        joinRequests: [...getJoinRequests(room), nextJoinRequest],
      },
      createRoomActivity('收到新的入房申请', `${nextJoinRequest.name} 正等待主持批准加入房间。`, 'system'),
    );

    onUpdateVoiceRooms((current) => current.map((item) => (item.id === roomId ? nextRoom : item)));
    prependNotification(
      createRoomNotification(
        nextRoom,
        `收到新的入房申请：${nextJoinRequest.name}`,
        '主持控制台已经收到一条新的入房申请，可以直接批准或暂缓处理。',
        'interaction',
      ),
    );
    appendReminderLog(`收到入房申请：${nextJoinRequest.name}`, `${nextRoom.title} · ${nextJoinRequest.name}`, '新增入房申请');
  };

  const handleModeratorMuteMember = (roomId: string, memberId: string) => {
    const room = voiceRooms.find((item) => item.id === roomId) ?? null;
    const hostMember = room ? findLocalMember(room) : null;
    const targetMember = room?.members.find((member) => member.id === memberId) ?? null;
    if (!room || !hostMember || hostMember.role !== 'host' || !targetMember || targetMember.role === 'listener' || targetMember.isLocal) {
      return;
    }

    if (targetMember.state === 'muted') {
      return;
    }

    const nextRoom = appendRoomActivity(
      {
        ...room,
        members: room.members.map((member) =>
          member.id === memberId
            ? {
                ...member,
                state: 'muted',
              }
            : member,
        ),
      },
      createRoomActivity('主持已静音成员', `${targetMember.name} 被主持暂时静音。`, 'moderation'),
    );

    onUpdateVoiceRooms((current) => current.map((item) => (item.id === roomId ? nextRoom : item)));
    prependNotification(
      createRoomNotification(
        nextRoom,
        `主持已静音：${targetMember.name}`,
        `${targetMember.name} 已被暂时静音，房间秩序调整会继续保留在这次会后记录里。`,
        'system',
      ),
    );
    appendReminderLog(`主持静音成员：${targetMember.name}`, `${nextRoom.title} · ${targetMember.name}`, '主持静音');
  };

  const handleModeratorMoveMemberToAudience = (roomId: string, memberId: string) => {
    const room = voiceRooms.find((item) => item.id === roomId) ?? null;
    const hostMember = room ? findLocalMember(room) : null;
    const targetMember = room?.members.find((member) => member.id === memberId) ?? null;
    if (!room || !hostMember || hostMember.role !== 'host' || !targetMember || targetMember.role !== 'speaker' || targetMember.isLocal) {
      return;
    }

    const nextRoom = appendRoomActivity(
      {
        ...room,
        speakerCount: Math.max(room.speakerCount - 1, 0),
        members: room.members.map((member) =>
          member.id === memberId
            ? {
                ...member,
                role: 'listener',
                state: 'listening',
              }
            : member,
        ),
      },
      createRoomActivity('主持已调整席位', `${targetMember.name} 已被移回听众席。`, 'moderation'),
    );

    onUpdateVoiceRooms((current) => current.map((item) => (item.id === roomId ? nextRoom : item)));
    prependNotification(
      createRoomNotification(
        nextRoom,
        `主持已调整席位：${targetMember.name}`,
        `${targetMember.name} 已从发言席移回听众席，当前房间人数与席位统计已同步更新。`,
        'interaction',
      ),
    );
    appendLearningLog(`主持调整席位：${targetMember.name}`, `${nextRoom.title} · 回到听众席`, '移回听众');
  };

  const handleModeratorRemoveMember = (roomId: string, memberId: string) => {
    const room = voiceRooms.find((item) => item.id === roomId) ?? null;
    const hostMember = room ? findLocalMember(room) : null;
    const targetMember = room?.members.find((member) => member.id === memberId) ?? null;
    if (!room || !hostMember || hostMember.role !== 'host' || !targetMember || targetMember.role === 'host' || targetMember.isLocal) {
      return;
    }

    const nextRoom = appendRoomActivity(
      {
        ...room,
        participantCount: Math.max(room.participantCount - 1, 0),
        speakerCount: targetMember.role === 'speaker' ? Math.max(room.speakerCount - 1, 0) : room.speakerCount,
        speakerRequestMemberIds: getSpeakerRequestIds(room).filter((item) => item !== memberId),
        members: room.members.filter((member) => member.id !== memberId),
      },
      createRoomActivity('主持已移出成员', `${targetMember.name} 已被移出当前房间。`, 'moderation'),
    );

    onUpdateVoiceRooms((current) => current.map((item) => (item.id === roomId ? nextRoom : item)));
    prependNotification(
      createRoomNotification(
        nextRoom,
        `主持已移出成员：${targetMember.name}`,
        `${targetMember.name} 已被移出当前房间，成员和审批队列也已同步更新。`,
        'system',
      ),
    );
    appendReminderLog(`主持移出成员：${targetMember.name}`, `${nextRoom.title} · ${targetMember.name}`, '移出成员');
  };

  const handleSimulatePresenceShift = (roomId: string) => {
    const room = voiceRooms.find((item) => item.id === roomId) ?? null;
    if (!room || !room.joined || room.status === 'ended') {
      return;
    }

    const candidates = sortRoomMembers(room.members).filter((member) => !member.isLocal);
    if (candidates.length === 0) {
      return;
    }

    const currentIndex = presenceShiftIndexesRef.current[roomId] ?? 0;
    const targetMember = candidates[currentIndex % candidates.length];
    const currentPresence = getMemberPresence(targetMember);
    const nextPresence: VoiceRoomMemberPresence =
      currentPresence === 'online' ? 'reconnecting' : currentPresence === 'reconnecting' ? 'away' : 'online';

    const nextRoom = appendRoomActivity(
      {
        ...room,
        members: room.members.map((member) =>
          member.id === targetMember.id
            ? {
                ...member,
                presence: nextPresence,
                state: getStateForPresence(member.role, nextPresence),
              }
            : member,
        ),
      },
      createRoomActivity(
        nextPresence === 'online' ? '成员已恢复在线' : '成员在线状态波动',
        `${targetMember.name} 当前${getMemberPresenceLabel(nextPresence)}。`,
        'member',
      ),
    );

    presenceShiftIndexesRef.current[roomId] = currentIndex + 1;
    onUpdateVoiceRooms((current) => current.map((item) => (item.id === roomId ? nextRoom : item)));
    prependNotification(
      createRoomNotification(
        nextRoom,
        nextPresence === 'online' ? `成员已恢复在线：${targetMember.name}` : `成员状态波动：${targetMember.name}`,
        nextPresence === 'online'
          ? `${targetMember.name} 已恢复在线，当前房间的在线提示和席位状态已经同步刷新。`
          : `${targetMember.name} 当前${getMemberPresenceLabel(nextPresence)}，如有需要可临时接手主持或调整发言席。`,
        'interaction',
      ),
    );
    appendReminderLog(
      `模拟成员在线波动：${targetMember.name}`,
      `${nextRoom.title} · ${getMemberPresenceLabel(nextPresence)}`,
      '模拟波动',
    );
  };

  const handleTransferHost = (roomId: string, memberId: string) => {
    const room = voiceRooms.find((item) => item.id === roomId) ?? null;
    const localHost = room ? findLocalMember(room) : null;
    const targetMember = room?.members.find((member) => member.id === memberId) ?? null;
    if (
      !room ||
      !localHost ||
      localHost.role !== 'host' ||
      !targetMember ||
      targetMember.isLocal ||
      targetMember.role === 'host' ||
      room.status === 'ended' ||
      getMemberPresence(targetMember) !== 'online'
    ) {
      return;
    }

    const nextMembers = room.members.map((member) => {
      if (member.isLocal) {
        return {
          ...member,
          role: 'speaker' as const,
          state: 'muted' as const,
          presence: 'online' as const,
        };
      }

      if (member.id === memberId) {
        return {
          ...member,
          role: 'host' as const,
          state: 'speaking' as const,
          presence: 'online' as const,
        };
      }

      return member;
    });
    const nextRoom = appendRoomActivity(
      {
        ...room,
        hostName: targetMember.name,
        speakerCount: countOnStageMembers(nextMembers),
        speakerRequestMemberIds: getSpeakerRequestIds(room).filter((item) => item !== memberId),
        members: nextMembers,
      },
      createRoomActivity('主持已转交', `${targetMember.name} 已接手主持，${currentUserIdentity.name} 已退回发言席。`, 'moderation'),
    );

    onUpdateVoiceRooms((current) => current.map((item) => (item.id === roomId ? nextRoom : item)));
    prependNotification(
      createRoomNotification(
        nextRoom,
        `主持已转交：${targetMember.name}`,
        `${targetMember.name} 已接手主持，${currentUserIdentity.name} 已退回发言席，房间控制权变更会继续写进快照。`,
        'interaction',
      ),
    );
    appendLearningLog(`转交语音房主持：${targetMember.name}`, `${nextRoom.title} · 主持已转交`, '转交主持');
  };

  const handleTakeOverHost = (roomId: string) => {
    const room = voiceRooms.find((item) => item.id === roomId) ?? null;
    const localMember = room ? findLocalMember(room) : null;
    const hostMember = room ? findHostMember(room) : null;
    if (
      !room ||
      !room.joined ||
      !localMember ||
      localMember.role === 'host' ||
      !hostMember ||
      hostMember.isLocal ||
      room.status === 'ended' ||
      getMemberPresence(hostMember) === 'online'
    ) {
      return;
    }

    const nextMembers = room.members.map((member) => {
      if (member.id === hostMember.id) {
        return {
          ...member,
          role: 'listener' as const,
          state: 'listening' as const,
        };
      }

      if (member.isLocal) {
        return {
          ...member,
          role: 'host' as const,
          state: 'speaking' as const,
          presence: 'online' as const,
        };
      }

      return member;
    });
    const nextRoom = appendRoomActivity(
      {
        ...room,
        hostName: currentUserIdentity.name,
        speakerCount: countOnStageMembers(nextMembers),
        speakerRequestMemberIds: getSpeakerRequestIds(room).filter((item) => item !== localMember.id),
        members: nextMembers,
      },
      createRoomActivity(
        '已临时接手主持',
        `${currentUserIdentity.name} 已接手主持，原主持 ${hostMember.name} 当前${getMemberPresenceLabel(getMemberPresence(hostMember))}。`,
        'moderation',
      ),
    );

    onUpdateVoiceRooms((current) => current.map((item) => (item.id === roomId ? nextRoom : item)));
    prependNotification(
      createRoomNotification(
        nextRoom,
        `已临时接手主持：${nextRoom.title}`,
        `${hostMember.name} 当前${getMemberPresenceLabel(getMemberPresence(hostMember))}，你已临时接手主持，房间成员和摘要记录会继续保留。`,
        'system',
      ),
    );
    appendLearningLog(`接手语音房主持：${nextRoom.title}`, `${hostMember.name} 当前${getMemberPresenceLabel(getMemberPresence(hostMember))}`, '接手主持');
  };

  const handleRequestToSpeak = (roomId: string) => {
    const room = voiceRooms.find((item) => item.id === roomId) ?? null;
    const localMember = room ? findLocalMember(room) : null;
    if (!room || !room.joined || !localMember || localMember.role !== 'listener' || room.status === 'ended') {
      return;
    }

    if (getSpeakerRequestIds(room).includes(localMember.id)) {
      return;
    }

    const nextRoom = appendRoomActivity(
      {
        ...room,
        speakerRequestMemberIds: [...getSpeakerRequestIds(room), localMember.id],
      },
      createRoomActivity('新的上麦申请', `${currentUserIdentity.name} 已举手申请上麦。`, 'request'),
    );

    onUpdateVoiceRooms((current) => current.map((item) => (item.id === roomId ? nextRoom : item)));
    prependNotification(
      createRoomNotification(
        nextRoom,
        `已申请上麦：${nextRoom.title}`,
        '你的上麦申请已经进入待处理列表，主持通过后会自动把你切到发言席。',
        'interaction',
      ),
    );
    appendReminderLog(`申请语音房上麦：${nextRoom.title}`, nextRoom.summary, '举手申请');

    const hostMember = findHostMember(room);
    if (hostMember?.isLocal) {
      return;
    }

    const timer = window.setTimeout(() => {
      let approvedRoom: VoiceRoom | null = null;

      onUpdateVoiceRooms((current) =>
        current.map((item) => {
          if (item.id !== roomId) {
            return item;
          }

          const currentLocalMember = findLocalMember(item);
          const requestIds = getSpeakerRequestIds(item);
          if (!currentLocalMember || currentLocalMember.role !== 'listener' || !requestIds.includes(currentLocalMember.id) || item.status === 'ended') {
            return item;
          }

          approvedRoom = appendRoomActivity(
            {
              ...item,
              speakerCount: item.speakerCount + 1,
              speakerRequestMemberIds: requestIds.filter((memberId) => memberId !== currentLocalMember.id),
              members: item.members.map((member) =>
                member.isLocal
                  ? {
                      ...member,
                      role: 'speaker',
                      state: 'muted',
                    }
                  : member,
              ),
            },
            createRoomActivity('上麦申请已通过', `${currentUserIdentity.name} 已进入发言席。`, 'request'),
          );

          return approvedRoom;
        }),
      );

      const nextApprovedRoom = approvedRoom as VoiceRoom | null;

      if (nextApprovedRoom !== null) {
        const approvedRoomTitle = nextApprovedRoom.title;
        const approvedRoomSummary = nextApprovedRoom.summary;
        prependNotification(
          createRoomNotification(
            nextApprovedRoom,
            `主持已同意你上麦：${approvedRoomTitle}`,
            '你现在已经进入发言席，可以打开麦克风或稍后回到听众席。',
            'interaction',
          ),
        );
        appendLearningLog(`主持同意上麦：${approvedRoomTitle}`, approvedRoomSummary, '进入发言席');
      }

      approvalTimersRef.current = approvalTimersRef.current.filter((item) => item !== timer);
    }, 1400);

    approvalTimersRef.current.push(timer);
  };

  const handleCancelSpeakerRequest = (roomId: string) => {
    const room = voiceRooms.find((item) => item.id === roomId) ?? null;
    const localMember = room ? findLocalMember(room) : null;
    if (!room || !localMember) {
      return;
    }

    const requestIds = getSpeakerRequestIds(room);
    if (!requestIds.includes(localMember.id)) {
      return;
    }

    const nextRoom = appendRoomActivity(
      {
        ...room,
        speakerRequestMemberIds: requestIds.filter((memberId) => memberId !== localMember.id),
      },
      createRoomActivity('已取消上麦申请', `${currentUserIdentity.name} 已撤回本次上麦申请。`, 'request'),
    );

    onUpdateVoiceRooms((current) => current.map((item) => (item.id === roomId ? nextRoom : item)));
    prependNotification(
      createRoomNotification(
        nextRoom,
        `已取消上麦申请：${nextRoom.title}`,
        '你的举手申请已经从待处理列表移除。',
        'system',
      ),
    );
    appendReminderLog(`取消语音房上麦申请：${nextRoom.title}`, nextRoom.summary, '取消申请');
  };

  const handleApproveSpeakerRequest = (roomId: string, memberId: string) => {
    const room = voiceRooms.find((item) => item.id === roomId) ?? null;
    const hostMember = room ? findLocalMember(room) : null;
    const requestTarget = room?.members.find((member) => member.id === memberId) ?? null;
    if (!room || !hostMember || hostMember.role !== 'host' || !requestTarget) {
      return;
    }

    const requestIds = getSpeakerRequestIds(room);
    if (!requestIds.includes(memberId)) {
      return;
    }

    const nextRoom = appendRoomActivity(
      {
        ...room,
        speakerCount: requestTarget.role === 'listener' ? room.speakerCount + 1 : room.speakerCount,
        speakerRequestMemberIds: requestIds.filter((item) => item !== memberId),
        members: room.members.map((member) =>
          member.id === memberId
            ? {
                ...member,
                role: 'speaker',
                state: 'muted',
              }
            : member,
        ),
      },
      createRoomActivity('主持已批准上麦', `${requestTarget.name} 已进入发言席。`, 'request'),
    );

    onUpdateVoiceRooms((current) => current.map((item) => (item.id === roomId ? nextRoom : item)));
    prependNotification(
      createRoomNotification(
        nextRoom,
        `主持已批准上麦：${requestTarget.name}`,
        `${requestTarget.name} 已进入发言席，房间当前会继续保留这条审批结果。`,
        'interaction',
      ),
    );
    appendLearningLog(`批准上麦：${requestTarget.name}`, `${nextRoom.title} · ${requestTarget.name}`, '批准申请');
  };

  const handleDeclineSpeakerRequest = (roomId: string, memberId: string) => {
    const room = voiceRooms.find((item) => item.id === roomId) ?? null;
    const hostMember = room ? findLocalMember(room) : null;
    const requestTarget = room?.members.find((member) => member.id === memberId) ?? null;
    if (!room || !hostMember || hostMember.role !== 'host' || !requestTarget) {
      return;
    }

    const requestIds = getSpeakerRequestIds(room);
    if (!requestIds.includes(memberId)) {
      return;
    }

    const nextRoom = appendRoomActivity(
      {
        ...room,
        speakerRequestMemberIds: requestIds.filter((item) => item !== memberId),
      },
      createRoomActivity('上麦申请已暂缓', `${requestTarget.name} 的申请已被暂缓处理。`, 'request'),
    );

    onUpdateVoiceRooms((current) => current.map((item) => (item.id === roomId ? nextRoom : item)));
    prependNotification(
      createRoomNotification(
        nextRoom,
        `已暂缓上麦申请：${requestTarget.name}`,
        '这条申请已从待处理列表移除，后续仍可再次发起。',
        'system',
      ),
    );
    appendReminderLog(`暂缓上麦申请：${requestTarget.name}`, `${nextRoom.title} · ${requestTarget.name}`, '暂缓申请');
  };

  const handleSimulateSpeakerRequest = (roomId: string) => {
    const room = voiceRooms.find((item) => item.id === roomId) ?? null;
    const hostMember = room ? findLocalMember(room) : null;
    if (!room || !hostMember || hostMember.role !== 'host' || room.status === 'ended') {
      return;
    }

    const existingNames = new Set(room.members.map((member) => member.name));
    const fallbackContact =
      communityContacts.find((contact) => !existingNames.has(contact.name)) ??
      communityContacts[0] ??
      null;
    if (!fallbackContact) {
      return;
    }

    const requestMemberId = `room-request-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const requestMember: VoiceRoomMember = {
      id: requestMemberId,
      name: fallbackContact.name,
      badge: fallbackContact.role,
      role: 'listener',
      state: 'listening',
      presence: 'online',
      contactId: fallbackContact.id,
    };
    const nextRoom = appendRoomActivity(
      {
        ...room,
        participantCount: room.participantCount + 1,
        members: [...room.members, requestMember],
        speakerRequestMemberIds: [...getSpeakerRequestIds(room), requestMemberId],
      },
      createRoomActivity('收到新的上麦申请', `${requestMember.name} 已进入房间并发起上麦申请。`, 'request'),
    );

    onUpdateVoiceRooms((current) => current.map((item) => (item.id === roomId ? nextRoom : item)));
    prependNotification(
      createRoomNotification(
        nextRoom,
        `收到新的上麦申请：${requestMember.name}`,
        '主持控制台已经收到一条新的举手申请，可以直接批准或暂缓处理。',
        'interaction',
      ),
    );
    appendReminderLog(`收到上麦申请：${requestMember.name}`, `${nextRoom.title} · ${requestMember.name}`, '新增申请');
  };

  const handleMoveToAudience = (roomId: string) => {
    const room = voiceRooms.find((item) => item.id === roomId) ?? null;
    const localMember = room ? findLocalMember(room) : null;
    if (!room || !room.joined || !localMember || localMember.role !== 'speaker' || room.status === 'ended') {
      return;
    }

    const nextRoom = appendRoomActivity(
      {
        ...room,
        speakerCount: Math.max(room.speakerCount - 1, 0),
        members: room.members.map((member) =>
          member.isLocal
            ? {
                ...member,
                role: 'listener',
                state: 'listening',
              }
            : member,
        ),
      },
      createRoomActivity('已回到听众席', `${currentUserIdentity.name} 已从发言席回到听众席。`, 'member'),
    );

    onUpdateVoiceRooms((current) => current.map((item) => (item.id === roomId ? nextRoom : item)));
  };

  const handleToggleMic = (roomId: string) => {
    const room = voiceRooms.find((item) => item.id === roomId) ?? null;
    const localMember = room ? findLocalMember(room) : null;
    if (!room || !room.joined || !localMember || localMember.role === 'listener' || room.status === 'ended') {
      return;
    }

    const nextRoom = appendRoomActivity(
      {
        ...room,
        members: room.members.map((member) =>
          member.isLocal
            ? {
                ...member,
                state: member.state === 'speaking' ? 'muted' : 'speaking',
              }
            : member,
        ),
      },
      createRoomActivity(
        localMember.state === 'speaking' ? '已切换到静音' : '已打开麦克风',
        `${currentUserIdentity.name}${localMember.state === 'speaking' ? ' 已暂时静音。' : ' 已打开麦克风准备发言。'}`,
        'member',
      ),
    );

    onUpdateVoiceRooms((current) => current.map((item) => (item.id === roomId ? nextRoom : item)));
  };

  const handleShareRoomReminder = (room: VoiceRoom) => {
    const nextRoom = appendRoomActivity(
      room,
      createRoomActivity('已发送房间提醒', `${currentUserIdentity.name} 刚刚发出一条回房提醒。`, 'system'),
    );
    onUpdateVoiceRooms((current) => current.map((item) => (item.id === room.id ? nextRoom : item)));
    prependNotification(
      createRoomNotification(
        nextRoom,
        `语音房提醒：${nextRoom.title}`,
        '这条提醒可直接把你带回当前房间，后续会再接到真实邀请和 push 链路。',
        'interaction',
      ),
    );
    appendReminderLog(`发送语音房提醒：${nextRoom.title}`, nextRoom.summary, '发送提醒');
  };

  const handleShareRoomInvite = (roomId: string, conversationId: string) => {
    const room = voiceRooms.find((item) => item.id === roomId) ?? null;
    if (!room) {
      return;
    }

    const targetConversation = conversations.find((conversation) => conversation.id === conversationId) ?? null;
    const nextRoom = appendRoomActivity(
      room,
      createRoomActivity(
        '已发送房间邀请',
        `${currentUserIdentity.name} 已将房间邀请发送到${targetConversation ? `「${targetConversation.name}」` : '指定会话'}。`,
        'system',
      ),
    );
    onUpdateVoiceRooms((current) => current.map((item) => (item.id === roomId ? nextRoom : item)));
    onShareVoiceRoom(roomId, conversationId);
  };

  const handlePublishRoomRecap = (roomId: string) => {
    const room = voiceRooms.find((item) => item.id === roomId) ?? null;
    if (!room?.recap || room.recapPostId) {
      return;
    }

    const postId = onPublishVoiceRoomRecap(roomId);
    if (!postId) {
      return;
    }

    const nextRoom = appendRoomActivity(
      {
        ...room,
        recapPostId: postId,
      },
      createRoomActivity('会后摘要已发布', '这份会后摘要已经回流到校友动态。', 'system'),
    );

    onUpdateVoiceRooms((current) => current.map((item) => (item.id === roomId ? nextRoom : item)));
  };

  const handleShareRoomRecap = (roomId: string, conversationId: string) => {
    const room = voiceRooms.find((item) => item.id === roomId) ?? null;
    if (!room?.recap) {
      return;
    }

    const sharedConversationIds = room.recapConversationIds ?? [];
    if (sharedConversationIds.includes(conversationId)) {
      return;
    }

    const targetConversation = conversations.find((conversation) => conversation.id === conversationId) ?? null;
    const didShare = onShareVoiceRoomRecap(roomId, conversationId);
    if (!didShare) {
      return;
    }

    const nextRoom = appendRoomActivity(
      {
        ...room,
        recapConversationIds: [...sharedConversationIds, conversationId],
      },
      createRoomActivity(
        '会后摘要已发送',
        `这份会后摘要已经发送到${targetConversation ? `「${targetConversation.name}」` : '指定会话'}。`,
        'system',
      ),
    );

    onUpdateVoiceRooms((current) => current.map((item) => (item.id === roomId ? nextRoom : item)));
  };

  return (
    <section className="conversation-list">
      <section className="summary-grid">
        <article className="summary-card">
          <span className="summary-label">直播中房间</span>
          <strong>{liveRoomCount}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">我已加入</span>
          <strong>{joinedRoomCount}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">主持中的房间</span>
          <strong>{hostedRoomCount}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">审批入房房间</span>
          <strong>{approvalRoomCount}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">待审批入房</span>
          <strong>{pendingJoinRequestCount}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">待审批上麦</span>
          <strong>{pendingSpeakerRequestCount}</strong>
        </article>
      </section>

      <section className="content-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Create Voice Room</p>
            <h2>创建语音房壳子</h2>
          </div>
        </div>
        <div className="voice-room-create-grid">
          <label className="chat-input-field" htmlFor="voice-room-title">
            <span>房间标题</span>
            <input
              id="voice-room-title"
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              placeholder="例如：使徒行传今晚复盘"
            />
          </label>
          <label className="chat-input-field" htmlFor="voice-room-summary">
            <span>房间简介</span>
            <textarea
              id="voice-room-summary"
              rows={3}
              value={draftSummary}
              onChange={(event) => setDraftSummary(event.target.value)}
              placeholder="描述这次房间要讨论的主题、课程或代祷重点。"
            />
          </label>
          <label className="search-field" htmlFor="voice-room-topic">
            <span>房间类型</span>
            <select
              id="voice-room-topic"
              className="select-field"
              value={draftTopic}
              onChange={(event) => setDraftTopic(event.target.value as VoiceRoom['topic'])}
            >
              {topicOptions.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
          </label>
          <label className="search-field" htmlFor="voice-room-course">
            <span>关联课程（可选）</span>
            <select
              id="voice-room-course"
              className="select-field"
              value={draftCourseId}
              onChange={(event) => setDraftCourseId(event.target.value)}
            >
              <option value="">不关联课程</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </label>
          <label className="search-field" htmlFor="voice-room-join-policy">
            <span>入房方式</span>
            <select
              id="voice-room-join-policy"
              className="select-field"
              value={draftJoinPolicy}
              onChange={(event) => setDraftJoinPolicy(event.target.value as VoiceRoomJoinPolicy)}
            >
              <option value="open">直接加入</option>
              <option value="approval">审批加入</option>
            </select>
          </label>
        </div>
        <div className="chat-input-actions">
          <span className="toolbar-helper">
            {communitySyncSummary} 当前先恢复房间元数据、入房/上麦审批、成员壳子和提醒跳转，真实上麦与音频链路会放到后续阶段。
          </span>
          <button type="button" className="primary-btn compact-btn" onClick={handleCreateRoom}>
            创建房间
          </button>
        </div>
      </section>

      {minimizedRoom && (
        <section className="content-card voice-room-minibar">
          <div>
            <p className="eyebrow">Minimized Room</p>
            <h2>{minimizedRoom.title}</h2>
            <p className="toolbar-helper">
              你仍在这间房里，当前共有 {minimizedRoom.participantCount} 人，点击可回到房间控制台。
            </p>
          </div>
          <div className="contact-card-actions">
            <button
              type="button"
              className="primary-btn compact-btn"
              onClick={() => {
                onSelectRoomId(minimizedRoom.id);
                setMinimizedRoomId(null);
              }}
            >
              回到房间
            </button>
            <button type="button" className="secondary-btn compact-btn" onClick={() => handleLeaveRoom(minimizedRoom.id)}>
              离开房间
            </button>
          </div>
        </section>
      )}

      <section className="content-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Room Filter</p>
            <h2>房间筛选</h2>
          </div>
        </div>
        <label className="search-field" htmlFor="voice-room-search">
          <span>搜索房间</span>
          <input
            id="voice-room-search"
            value={roomSearch}
            onChange={(event) => setRoomSearch(event.target.value)}
            placeholder="输入房间名称、主持人、主题或成员"
          />
        </label>
        <div className="category-row">
          {roomFilterOptions.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={roomFilter === key ? 'chip-btn active' : 'chip-btn'}
              onClick={() => setRoomFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {filteredRooms.map((room) => {
        const localMember = findLocalMember(room);
        const hostMember = findHostMember(room);
        const joinPolicy = getJoinPolicy(room);
        const joinRequests = getJoinRequests(room);
        const localJoinRequest = findLocalJoinRequest(room);
        const requestIds = getSpeakerRequestIds(room);
        const requestMembers = requestIds
          .map((memberId) => room.members.find((member) => member.id === memberId) ?? null)
          .filter((member): member is VoiceRoomMember => member !== null);
        const roomActivities = getRoomActivities(room);
        const isExpanded = selectedRoomId === room.id;
        const onlineMemberCount = countOnlineMembers(room.members);
        const unstableMemberCount = countUnstableMembers(room.members);
        const hostPresence = hostMember ? getMemberPresence(hostMember) : 'online';
        const localJoinPending = Boolean(localJoinRequest && !room.joined);
        const canToggleMic = Boolean(room.joined && localMember && localMember.role !== 'listener' && room.status === 'live');
        const localRequestPending = Boolean(localMember && requestIds.includes(localMember.id));
        const canTakeStage = Boolean(room.joined && localMember?.role === 'listener' && room.status === 'live' && !localRequestPending);
        const canMoveToAudience = Boolean(room.joined && localMember?.role === 'speaker' && room.status === 'live');
        const canManageJoinRequests = Boolean(hostMember?.isLocal && joinRequests.length > 0 && room.status === 'live');
        const canManageRequests = Boolean(hostMember?.isLocal && requestMembers.length > 0 && room.status === 'live');
        const canSimulateJoinRequest = Boolean(hostMember?.isLocal && room.status === 'live' && joinPolicy === 'approval');
        const canSimulatePresenceShift = Boolean(room.joined && room.status === 'live' && room.members.some((member) => !member.isLocal));
        const canTakeOverHost = Boolean(
          room.joined &&
            localMember &&
            localMember.role !== 'host' &&
            hostMember &&
            !hostMember.isLocal &&
            hostPresence !== 'online' &&
            room.status === 'live',
        );
        const shareTargetConversationId = conversations.some((conversation) => conversation.id === shareTargets[room.id])
          ? shareTargets[room.id]
          : conversations[0]?.id ?? '';
        const recapSharedConversationIds = room.recapConversationIds ?? [];
        const canPublishRecap = Boolean(room.recap && !room.recapPostId);
        const canShareRecap = Boolean(
          room.recap &&
            shareTargetConversationId &&
            !recapSharedConversationIds.includes(shareTargetConversationId),
        );

        return (
          <article
            key={room.id}
            className={isExpanded ? 'course-card voice-room-card voice-room-card-active' : 'course-card voice-room-card'}
          >
            <div className="voice-room-card-top">
              <div>
                <h3>{room.title}</h3>
                <p className="course-summary">{room.summary}</p>
              </div>
              <div className="voice-room-meta">
                <span className={room.status === 'ended' ? 'post-badge voice-room-badge-ended' : 'post-badge'}>
                  {getRoomStatusLabel(room)}
                </span>
                <span className="course-updated">{room.time}</span>
              </div>
            </div>
            <div className="detail-chip-row">
              <span className="post-badge">{room.topic}</span>
              <span className="post-badge">{getJoinPolicyLabel(joinPolicy)}</span>
              <span className="post-badge">{room.speakerCount} 位发言</span>
              <span className="post-badge">{room.participantCount} 人在房间</span>
              <span className="post-badge">{onlineMemberCount} 位在线</span>
              {unstableMemberCount > 0 && <span className="post-badge">波动中 {unstableMemberCount}</span>}
              {roomActivities.length > 0 && <span className="post-badge">{roomActivities.length} 条动态</span>}
              {joinRequests.length > 0 && <span className="post-badge">入房待审 {joinRequests.length}</span>}
              {requestIds.length > 0 && <span className="post-badge">上麦待审 {requestIds.length}</span>}
              {room.recap && <span className="post-badge">会后摘要</span>}
              {room.recapPostId && <span className="post-badge">摘要已发布</span>}
              {recapSharedConversationIds.length > 0 && <span className="post-badge">已同步 {recapSharedConversationIds.length} 个会话</span>}
              {room.courseId && <span className="post-badge">关联课程</span>}
              {room.joined && <span className="post-badge">我已加入</span>}
              {localJoinPending && <span className="post-badge">我的申请处理中</span>}
            </div>
            <div className="post-footer">
              <span>
                {room.courseId
                  ? `主持人 ${room.hostName}，当前为${getJoinPolicyLabel(joinPolicy)}房间，可直接联动到关联课程。`
                  : `主持人 ${room.hostName}，当前为${getJoinPolicyLabel(joinPolicy)}房间，状态会跟随社区快照保留。`}
              </span>
              <div className="contact-card-actions">
                <button
                  type="button"
                  className="secondary-btn compact-btn"
                  onClick={() => {
                    onSelectRoomId((current) => (current === room.id ? null : room.id));
                    if (minimizedRoomId === room.id) {
                      setMinimizedRoomId(null);
                    }
                  }}
                >
                  {isExpanded ? '收起详情' : room.joined ? '打开控制台' : '查看房间'}
                </button>
                {!room.joined && (
                  <button
                    type="button"
                    className="primary-btn compact-btn"
                    disabled={room.status === 'ended' || localJoinPending}
                    onClick={() => handleJoinRoom(room.id)}
                  >
                    {room.status === 'ended' ? '房间已结束' : localJoinPending ? '等待批准' : joinPolicy === 'approval' ? '申请加入' : '加入房间'}
                  </button>
                )}
                {!room.joined && localJoinPending && (
                  <button type="button" className="secondary-btn compact-btn" onClick={() => handleCancelJoinRequest(room.id)}>
                    撤回申请
                  </button>
                )}
                {room.courseId && (
                  <button type="button" className="secondary-btn compact-btn" onClick={() => onOpenCourse(room.courseId!)}>
                    打开关联课程
                  </button>
                )}
              </div>
            </div>

            {isExpanded && (
              <div className="voice-room-detail-panel">
                <div className="profile-highlight-grid">
                  <article className="detail-summary-card">
                    <span className="detail-summary-label">主持人</span>
                    <strong>{room.hostName}</strong>
                    <span>
                      {hostMember
                        ? `当前主持${getMemberPresenceLabel(hostPresence)}，${hostPresence === 'online' ? '房间主持控制稳定。' : '如有需要可临时接手主持。'}`
                        : '当前房间会优先保留成员壳子和提醒跳转，后续再接真实主持控制。'}
                    </span>
                  </article>
                  <article className="detail-summary-card">
                    <span className="detail-summary-label">发言席</span>
                    <strong>{room.speakerCount}</strong>
                    <span>
                      {localMember
                        ? `${getMemberRoleLabel(localMember.role)} · ${getMemberStateLabel(localMember.state)}`
                        : '加入后可切到听众或发言席。'}
                    </span>
                  </article>
                  <article className="detail-summary-card">
                    <span className="detail-summary-label">在线状态</span>
                    <strong>{onlineMemberCount}</strong>
                    <span>
                      {unstableMemberCount > 0
                        ? `当前可见成员里有 ${unstableMemberCount} 位处于重连或暂离状态。`
                        : '当前可见成员都在线，房间状态稳定。'}
                    </span>
                  </article>
                  <article className="detail-summary-card">
                    <span className="detail-summary-label">入房方式</span>
                    <strong>{getJoinPolicyLabel(joinPolicy)}</strong>
                    <span>
                      {joinPolicy === 'approval'
                        ? '新成员需要经过主持批准后才能进入房间。'
                        : '新成员可以直接进入房间，后续再决定是否申请上麦。'}
                    </span>
                  </article>
                  <article className="detail-summary-card">
                    <span className="detail-summary-label">入房审批</span>
                    <strong>{joinRequests.length}</strong>
                    <span>
                      {joinRequests.length > 0
                        ? `当前有 ${joinRequests.length} 条待处理入房申请。`
                        : joinPolicy === 'approval'
                          ? '当前没有待处理入房申请，新的申请会进入这里。'
                          : '当前房间为直接加入模式，不需要额外审批。'}
                    </span>
                  </article>
                  <article className="detail-summary-card">
                    <span className="detail-summary-label">上麦审批</span>
                    <strong>{requestIds.length}</strong>
                    <span>
                      {requestIds.length > 0
                        ? `当前有 ${requestIds.length} 条待处理上麦申请。`
                        : room.status === 'ended'
                          ? '房间已结束，当前没有待处理申请。'
                          : '当前没有待处理申请，新的举手会直接进入这里。'}
                    </span>
                  </article>
                </div>

                <div className="voice-room-control-row">
                  {room.joined && (
                    <>
                      {canTakeStage && (
                        <button type="button" className="primary-btn compact-btn" onClick={() => handleRequestToSpeak(room.id)}>
                          举手申请上麦
                        </button>
                      )}
                      {localRequestPending && (
                        <button type="button" className="secondary-btn compact-btn" onClick={() => handleCancelSpeakerRequest(room.id)}>
                          取消上麦申请
                        </button>
                      )}
                      {canMoveToAudience && (
                        <button type="button" className="secondary-btn compact-btn" onClick={() => handleMoveToAudience(room.id)}>
                          回到听众席
                        </button>
                      )}
                      {canToggleMic && (
                        <button type="button" className="secondary-btn compact-btn" onClick={() => handleToggleMic(room.id)}>
                          {localMember?.state === 'speaking' ? '暂时静音' : '打开麦克风'}
                        </button>
                      )}
                      {canTakeOverHost && (
                        <button type="button" className="secondary-btn compact-btn" onClick={() => handleTakeOverHost(room.id)}>
                          接手主持
                        </button>
                      )}
                      <button type="button" className="secondary-btn compact-btn" onClick={() => handleShareRoomReminder(room)}>
                        发送房间提醒
                      </button>
                      {canSimulatePresenceShift && (
                        <button type="button" className="secondary-btn compact-btn" onClick={() => handleSimulatePresenceShift(room.id)}>
                          模拟成员波动
                        </button>
                      )}
                      {canSimulateJoinRequest && (
                        <button type="button" className="secondary-btn compact-btn" onClick={() => handleSimulateJoinRequest(room.id)}>
                          模拟收到入房申请
                        </button>
                      )}
                      {hostMember?.isLocal && room.status === 'live' && (
                        <button type="button" className="secondary-btn compact-btn" onClick={() => handleSimulateSpeakerRequest(room.id)}>
                          模拟收到举手
                        </button>
                      )}
                      {room.status === 'live' && (
                        <button
                          type="button"
                          className="secondary-btn compact-btn"
                          onClick={() => {
                            setMinimizedRoomId(room.id);
                            onSelectRoomId(null);
                          }}
                        >
                          最小化房间
                        </button>
                      )}
                      <button type="button" className="secondary-btn compact-btn" onClick={() => handleLeaveRoom(room.id)}>
                        {localMember?.role === 'host' ? '结束房间' : '离开房间'}
                      </button>
                    </>
                  )}
                </div>

                <div className="voice-room-member-list">
                  {room.recap && (
                    <section className="voice-room-recap-panel">
                      <div className="module-header">
                        <div>
                          <p className="eyebrow">Room Recap</p>
                          <h2>{room.recap.headline}</h2>
                        </div>
                        <span className="post-badge">{room.recap.generatedAt}</span>
                      </div>
                      <div className="voice-room-recap-list">
                        {room.recap.highlights.map((item) => (
                          <article key={item} className="voice-room-recap-item">
                            <strong>会后摘要</strong>
                            <span>{item}</span>
                          </article>
                        ))}
                      </div>
                      <div className="voice-room-recap-actions">
                        <button
                          type="button"
                          className="secondary-btn compact-btn"
                          disabled={!canPublishRecap}
                          onClick={() => handlePublishRoomRecap(room.id)}
                        >
                          {room.recapPostId ? '摘要已发布到动态' : '发布到校友圈'}
                        </button>
                        {conversations.length > 0 && (
                          <>
                            <label className="search-field" htmlFor={`voice-room-recap-share-${room.id}`}>
                              <span>发送会后摘要</span>
                              <select
                                id={`voice-room-recap-share-${room.id}`}
                                className="select-field"
                                value={shareTargetConversationId}
                                onChange={(event) =>
                                  setShareTargets((current) => ({
                                    ...current,
                                    [room.id]: event.target.value,
                                  }))
                                }
                              >
                                {conversations.map((conversation) => (
                                  <option key={conversation.id} value={conversation.id}>
                                    {conversation.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="button"
                              className="secondary-btn compact-btn"
                              disabled={!canShareRecap}
                              onClick={() => handleShareRoomRecap(room.id, shareTargetConversationId)}
                            >
                              {shareTargetConversationId && recapSharedConversationIds.includes(shareTargetConversationId)
                                ? '该会话已收到摘要'
                                : '发送会后摘要'}
                            </button>
                          </>
                        )}
                      </div>
                    </section>
                  )}

                  {joinRequests.length > 0 && (
                    <section className="voice-room-request-panel">
                      <div className="module-header">
                        <div>
                          <p className="eyebrow">Join Queue</p>
                          <h2>待审批入房申请</h2>
                        </div>
                      </div>
                      <div className="voice-room-request-list">
                        {joinRequests.map((request) => (
                          <article key={request.id} className="voice-room-request-item">
                            <div>
                              <p className="voice-room-member-name">
                                {request.name}
                                {request.isLocal && <span className="voice-room-member-me">我</span>}
                              </p>
                              <p className="voice-room-member-badge">{request.badge}</p>
                            </div>
                            <div className="contact-card-actions">
                              <span className="post-badge">{request.time}</span>
                              <span className="post-badge">待主持处理</span>
                              {canManageJoinRequests && (
                                <>
                                  <button
                                    type="button"
                                    className="primary-btn compact-btn"
                                    onClick={() => handleApproveJoinRequest(room.id, request.id)}
                                  >
                                    批准入房
                                  </button>
                                  <button
                                    type="button"
                                    className="secondary-btn compact-btn"
                                    onClick={() => handleDeclineJoinRequest(room.id, request.id)}
                                  >
                                    暂缓处理
                                  </button>
                                </>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}

                  {requestMembers.length > 0 && (
                    <section className="voice-room-request-panel">
                      <div className="module-header">
                        <div>
                          <p className="eyebrow">Speaker Queue</p>
                          <h2>待审批上麦申请</h2>
                        </div>
                      </div>
                      <div className="voice-room-request-list">
                        {requestMembers.map((member) => (
                          <article key={member.id} className="voice-room-request-item">
                            <div>
                              <p className="voice-room-member-name">{member.name}</p>
                              <p className="voice-room-member-badge">{member.badge}</p>
                            </div>
                            <div className="contact-card-actions">
                              <span className={getMemberPresenceToneClass(getMemberPresence(member))}>
                                {getMemberPresenceLabel(getMemberPresence(member))}
                              </span>
                              <span className="post-badge">待主持处理</span>
                              {canManageRequests && (
                                <>
                                  <button
                                    type="button"
                                    className="primary-btn compact-btn"
                                    onClick={() => handleApproveSpeakerRequest(room.id, member.id)}
                                  >
                                    批准上麦
                                  </button>
                                  <button
                                    type="button"
                                    className="secondary-btn compact-btn"
                                    onClick={() => handleDeclineSpeakerRequest(room.id, member.id)}
                                  >
                                    暂缓处理
                                  </button>
                                </>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}

                  {roomActivities.length > 0 && (
                    <section className="voice-room-activity-panel">
                      <div className="module-header">
                        <div>
                          <p className="eyebrow">Room Timeline</p>
                          <h2>房间活动时间线</h2>
                        </div>
                        <span className="post-badge">{roomActivities.length} 条记录</span>
                      </div>
                      <div className="voice-room-activity-list">
                        {roomActivities.map((activity) => (
                          <article key={activity.id} className="voice-room-activity-item">
                            <div className="voice-room-activity-top">
                              <strong>{activity.title}</strong>
                              <span className={getActivityTypeClass(activity.type)}>{getActivityTypeLabel(activity.type)}</span>
                            </div>
                            <span>{activity.detail}</span>
                            <span className="voice-room-activity-time">{activity.time}</span>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}

                  {conversations.length > 0 ? (
                    <div className="voice-room-share-row">
                      <label className="search-field" htmlFor={`voice-room-share-${room.id}`}>
                        <span>分享到会话</span>
                        <select
                          id={`voice-room-share-${room.id}`}
                          className="select-field"
                          value={shareTargetConversationId}
                          onChange={(event) =>
                            setShareTargets((current) => ({
                              ...current,
                              [room.id]: event.target.value,
                            }))
                          }
                        >
                          {conversations.map((conversation) => (
                            <option key={conversation.id} value={conversation.id}>
                              {conversation.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="secondary-btn compact-btn"
                        disabled={!shareTargetConversationId || room.status === 'ended'}
                        onClick={() => handleShareRoomInvite(room.id, shareTargetConversationId)}
                      >
                        发送房间邀请
                      </button>
                    </div>
                  ) : (
                    <p className="toolbar-helper">当前还没有可分享的会话，先到最近消息里建立一条联系即可。</p>
                  )}

                  {sortRoomMembers(room.members).map((member) => (
                    <article key={member.id} className="voice-room-member-item">
                      <div>
                        <p className="voice-room-member-name">
                          {member.name}
                          {member.isLocal && <span className="voice-room-member-me">我</span>}
                        </p>
                        <p className="voice-room-member-badge">{member.badge}</p>
                      </div>
                      <div className="voice-room-member-actions">
                        <span className="post-badge">{getMemberRoleLabel(member.role)}</span>
                        <span className="post-badge">{getMemberStateLabel(member.state)}</span>
                        <span className={getMemberPresenceToneClass(getMemberPresence(member))}>
                          {getMemberPresenceLabel(getMemberPresence(member))}
                        </span>
                        {hostMember?.isLocal &&
                          !member.isLocal &&
                          member.role !== 'host' &&
                          getMemberPresence(member) === 'online' &&
                          room.status === 'live' && (
                            <button
                              type="button"
                              className="secondary-btn compact-btn"
                              onClick={() => handleTransferHost(room.id, member.id)}
                            >
                              转交主持
                            </button>
                          )}
                        {hostMember?.isLocal && !member.isLocal && member.role === 'speaker' && member.state === 'speaking' && room.status === 'live' && (
                          <button
                            type="button"
                            className="secondary-btn compact-btn"
                            onClick={() => handleModeratorMuteMember(room.id, member.id)}
                          >
                            主持静音
                          </button>
                        )}
                        {hostMember?.isLocal && !member.isLocal && member.role === 'speaker' && room.status === 'live' && (
                          <button
                            type="button"
                            className="secondary-btn compact-btn"
                            onClick={() => handleModeratorMoveMemberToAudience(room.id, member.id)}
                          >
                            移回听众席
                          </button>
                        )}
                        {hostMember?.isLocal && !member.isLocal && member.role !== 'host' && room.status === 'live' && (
                          <button
                            type="button"
                            className="secondary-btn compact-btn"
                            onClick={() => handleModeratorRemoveMember(room.id, member.id)}
                          >
                            移出房间
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </article>
        );
      })}

      {filteredRooms.length === 0 && (
        <section className="content-card">
          <div className="empty-state-card">
            <strong>当前筛选下没有语音房</strong>
            <span>试试切回全部房间，或者直接创建一间新的课程复盘或代祷房。</span>
          </div>
        </section>
      )}
    </section>
  );
}
