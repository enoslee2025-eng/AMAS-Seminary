export type TabKey = 'home' | 'courses' | 'community' | 'library' | 'profile';

export type ModuleStatus = 'recovered' | 'rebuild' | 'pending';

export type RecoveryModule = {
  id: string;
  title: string;
  status: ModuleStatus;
  summary: string;
};

export type CourseCategory = 'all' | 'mission' | 'bible' | 'pastoral' | 'leadership';

export type CourseDegree = 'B.Th' | 'M.Div' | 'M.P.Th' | 'D.Min';

export type CourseLesson = {
  id: string;
  title: string;
  duration: string;
  completed: boolean;
};

export type CourseMaterial = {
  id: string;
  title: string;
  format: 'PDF' | 'Audio' | 'Video' | 'Worksheet';
  status: 'ready' | 'draft';
  libraryResourceId?: string;
};

export type CourseDetailTab = 'overview' | 'syllabus' | 'materials';

export type CourseRuntimeState = {
  currentLessonId: string | null;
  completedLessonIds: string[];
  viewedMaterialIds: string[];
  lastStudiedAt: string | null;
  lastOpenedTab: CourseDetailTab;
};

export type CourseRuntimeRecord = Record<string, CourseRuntimeState>;

export type CourseItem = {
  id: string;
  title: string;
  instructor: string;
  category: Exclude<CourseCategory, 'all'>;
  degree: CourseDegree;
  lessons: number;
  progress: number;
  recentLesson: string;
  updatedAt: string;
  summary: string;
  actionLabel: string;
  coverTone: 'navy' | 'emerald' | 'indigo' | 'violet';
  description: string;
  goals: string[];
  syllabus: CourseLesson[];
  materials: CourseMaterial[];
};

export type CommunityPostPreview = {
  id: string;
  author: string;
  role: string;
  time: string;
  content: string;
  badge: string;
  courseId?: string;
  voiceRoomId?: string;
  voiceRoomTitle?: string;
  likes: number;
  liked: boolean;
  comments: CommunityComment[];
};

export type ConversationPreview = {
  id: string;
  name: string;
  subtitle: string;
  time: string;
  unread: number;
  role?: string;
  pinned?: boolean;
  muted?: boolean;
  contactId?: string;
};

export type CommunityContact = {
  id: string;
  name: string;
  role: string;
  region: string;
  summary: string;
  status: '在线' | '可留言' | '课程导师';
  relatedCourseId?: string;
};

export type CommunityNotificationType = 'interaction' | 'system';

export type CommunityNotification = {
  id: string;
  title: string;
  detail: string;
  time: string;
  type: CommunityNotificationType;
  read: boolean;
  conversationId?: string;
  courseId?: string;
  postId?: string;
  voiceRoomId?: string;
  voiceRoomTitle?: string;
};

export type ChatMessage = {
  id: string;
  sender: 'me' | 'other';
  content: string;
  time: string;
  type?: 'text' | 'voice_room_invite' | 'voice_room_recap';
  voiceRoomId?: string;
  voiceRoomTitle?: string;
  voiceRoomSummary?: string;
  voiceRoomTopic?: '课程复盘' | '代祷陪伴' | '导师答疑' | '同工交通';
  voiceRoomRecapHeadline?: string;
  voiceRoomRecapHighlights?: string[];
};

export type ChatMessageRecord = Record<string, ChatMessage[]>;

export type VoiceRoomTopic = '课程复盘' | '代祷陪伴' | '导师答疑' | '同工交通';

export type VoiceRoomStatus = 'live' | 'ended';

export type VoiceRoomJoinPolicy = 'open' | 'approval';

export type VoiceRoomMemberRole = 'host' | 'speaker' | 'listener';

export type VoiceRoomMemberState = 'speaking' | 'muted' | 'listening';

export type VoiceRoomMemberPresence = 'online' | 'reconnecting' | 'away';

export type VoiceRoomMember = {
  id: string;
  name: string;
  badge: string;
  role: VoiceRoomMemberRole;
  state: VoiceRoomMemberState;
  presence?: VoiceRoomMemberPresence;
  contactId?: string;
  isLocal?: boolean;
};

export type VoiceRoomRecap = {
  headline: string;
  highlights: string[];
  generatedAt: string;
};

export type VoiceRoomActivityType = 'system' | 'member' | 'request' | 'moderation';

export type VoiceRoomActivity = {
  id: string;
  type: VoiceRoomActivityType;
  title: string;
  detail: string;
  time: string;
};

export type VoiceRoomJoinRequest = {
  id: string;
  name: string;
  badge: string;
  time: string;
  contactId?: string;
  isLocal?: boolean;
};

export type VoiceRoom = {
  id: string;
  title: string;
  summary: string;
  topic: VoiceRoomTopic;
  status: VoiceRoomStatus;
  joinPolicy?: VoiceRoomJoinPolicy;
  time: string;
  hostName: string;
  courseId?: string;
  joined: boolean;
  speakerCount: number;
  participantCount: number;
  members: VoiceRoomMember[];
  joinRequests?: VoiceRoomJoinRequest[];
  speakerRequestMemberIds?: string[];
  recap?: VoiceRoomRecap;
  activity?: VoiceRoomActivity[];
  recapPostId?: string;
  recapConversationIds?: string[];
};

export type CommunityComment = {
  id: string;
  author: string;
  content: string;
  time: string;
};

export type ProfileState = {
  name: string;
  role: string;
  bio: string;
  email: string;
  location: string;
};

export type AuthMode = 'register' | 'login' | 'professor_apply';

export type AuthDegree = 'B.Th' | 'M.Div' | 'M.P.Th' | 'D.Min' | 'Ph.D.';

export type AuthSession = {
  account: string;
  role: 'student' | 'professor';
  degree: AuthDegree;
  lastAuthenticatedAt: string;
  expiresAt?: string | null;
};

export type AuthResumeCourseFocus = {
  courseId: string;
  mode: 'feed' | 'compose';
  draft?: string;
};

export type AuthResumeInboxIntent = {
  section: 'conversations' | 'notifications';
  conversationId?: string;
  notificationId?: string;
};

export type AuthResumeContext = {
  activeTab: TabKey;
  selectedCourseId: string | null;
  selectedResourceId: string | null;
  communityCourseFocus: AuthResumeCourseFocus | null;
  communityInboxIntent: AuthResumeInboxIntent | null;
  accountHint: string | null;
  capturedAt: string;
};

export type PendingAuthReplayDraft =
  | {
      kind: 'course';
      accountHint: string | null;
      courseId: string;
      source: 'manual' | 'quick_action';
      runtime: CourseRuntimeState;
    }
  | {
      kind: 'library';
      accountHint: string | null;
      resourceId: string;
      source: 'view' | 'favorite' | 'download' | 'restore';
      runtime: LibraryRuntimeState;
    }
  | {
      kind: 'profile';
      accountHint: string | null;
      profile: ProfileState;
    };

export type PendingAuthReplay = PendingAuthReplayDraft & {
  createdAt: string;
};

export type PendingAuthReplayHistoryItem = {
  id: string;
  accountHint: string | null;
  outcome: 'success' | 'error';
  failureKind: 'network' | 'authentication' | 'remote' | null;
  trigger: 'auto' | 'manual';
  title: string;
  detail: string;
  message: string;
  processedAt: string;
  retryReplay: PendingAuthReplayDraft | null;
};

export type AppDomainSnapshot = {
  version: 1;
  authSession: AuthSession | null;
  profile: ProfileState;
  courseRuntime: CourseRuntimeRecord;
  libraryRuntime: LibraryRuntimeRecord;
  posts: CommunityPostPreview[];
  conversations: ConversationPreview[];
  notifications: CommunityNotification[];
  chatMessages: ChatMessageRecord;
  voiceRooms: VoiceRoom[];
};

export type AppBackupSnapshot = Omit<AppDomainSnapshot, 'authSession'> & {
  authSession: null;
};

export type AppBackupPayload = {
  version: 2;
  scope: 'full_snapshot' | 'legacy_partial';
  exportedAt: string;
  snapshot: AppBackupSnapshot;
};

export type LegacyAppBackupPayload = {
  version: 1;
  exportedAt: string;
  profile: ProfileState;
  courseRuntime: CourseRuntimeRecord;
  libraryRuntime: LibraryRuntimeRecord;
};

export type LibraryCategory = 'featured' | 'research' | 'audio' | 'archive';

export type LibraryResource = {
  id: string;
  title: string;
  author: string;
  category: LibraryCategory;
  format: 'eBook' | 'Journal' | 'Audio' | 'Archive';
  summary: string;
  updatedAt: string;
  relatedCourseId?: string;
};

export type LibraryRuntimeState = {
  favorite: boolean;
  viewed: boolean;
  progressPercent: number;
  downloaded: boolean;
  lastViewedAt: string | null;
};

export type LibraryRuntimeRecord = Record<string, LibraryRuntimeState>;

export type RuntimeSyncState = {
  tone: 'syncing' | 'success' | 'error';
  message: string;
};

export type WorkspaceStatus = {
  tone: 'local' | 'connected' | 'bootstrapped' | 'degraded' | 'expired';
  title: string;
  detail: string;
};

export type WorkspaceSessionProbeStatus = {
  tone: 'healthy' | 'warning' | 'checking' | 'unreachable' | 'expired';
  trigger: 'auto' | 'manual';
  checkedAt: string | null;
  title: string;
  detail: string;
};

export type WorkspaceSessionProbeHistoryItem = {
  id: string;
  accountHint: string | null;
  tone: 'healthy' | 'warning' | 'unreachable' | 'expired';
  trigger: 'auto' | 'manual';
  checkedAt: string;
  title: string;
  detail: string;
};
