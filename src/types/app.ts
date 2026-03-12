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
};

export type ChatMessage = {
  id: string;
  sender: 'me' | 'other';
  content: string;
  time: string;
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

export type AppBackupPayload = {
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
  downloaded: boolean;
  lastViewedAt: string | null;
};

export type LibraryRuntimeRecord = Record<string, LibraryRuntimeState>;
