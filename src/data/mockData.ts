import {
  ChatMessage,
  CommunityComment,
  CommunityNotification,
  CommunityPostPreview,
  ConversationPreview,
  CourseCategory,
  CourseItem,
  LibraryResource,
  ProfileState,
  RecoveryModule,
  TabKey,
} from '../types/app';

export const tabs: Array<{ key: TabKey; label: string; subtitle: string }> = [
  { key: 'home', label: '首页', subtitle: '恢复总览' },
  { key: 'courses', label: '课程', subtitle: '首个重建模块' },
  { key: 'community', label: '校友圈', subtitle: '下一阶段' },
  { key: 'library', label: '图书馆', subtitle: '资源模块' },
  { key: 'profile', label: '我的', subtitle: '资料与进度' },
];

export const modules: RecoveryModule[] = [
  {
    id: 'shell',
    title: '应用框架',
    status: 'rebuild',
    summary: '新源码入口、底部导航、恢复快照入口和本地持久化骨架已经建立。',
  },
  {
    id: 'courses',
    title: '课程系统',
    status: 'rebuild',
    summary: '课程列表、详情结构和学习目录已开始重建，下一步恢复学习进度和上传链路。',
  },
  {
    id: 'community',
    title: '校友圈',
    status: 'rebuild',
    summary: '校友圈已从占位页进入源码页，接下来继续恢复通知、通讯录和聊天入口。',
  },
  {
    id: 'library',
    title: '图书馆',
    status: 'rebuild',
    summary: '图书馆开始从占位页恢复为真实资源页，先重建检索、精选资源和收藏入口。',
  },
  {
    id: 'profile',
    title: '个人中心',
    status: 'rebuild',
    summary: '个人中心开始消费课程学习记录，后续会继续接资料和后端同步。',
  },
];

export const courseCategories: Array<{ key: CourseCategory; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'mission', label: '宣教神学' },
  { key: 'bible', label: '圣经神学' },
  { key: 'pastoral', label: '实践神学' },
  { key: 'leadership', label: '教会领导' },
];

export const courses: CourseItem[] = [
  {
    id: 'course-acts',
    title: '使徒行传与宣教拓展',
    instructor: 'Rev. Daniel Wong',
    category: 'mission',
    degree: 'B.Th',
    lessons: 12,
    progress: 60,
    recentLesson: '保罗第二次宣教旅程',
    updatedAt: '今天 08:40',
    summary: '从教会差遣、跨文化进入到团队协作，重建宣教课程主线。',
    actionLabel: '继续学习',
    coverTone: 'navy',
    description: '围绕使徒行传的差遣叙事，整理宣教神学、团队协作、跨文化进入和教会支持的完整教学骨架。',
    goals: ['建立宣教神学基础', '梳理差遣与支持链路', '为校友圈语音房和课程感悟模块预留内容数据'],
    syllabus: [
      { id: 'acts-1', title: '耶路撒冷教会与差遣起点', duration: '18:40', completed: true },
      { id: 'acts-2', title: '安提阿教会与宣教团队形成', duration: '22:10', completed: true },
      { id: 'acts-3', title: '保罗第一次宣教旅程', duration: '19:25', completed: true },
      { id: 'acts-4', title: '保罗第二次宣教旅程', duration: '24:30', completed: false },
      { id: 'acts-5', title: '跨文化进入与本地同工', duration: '17:15', completed: false },
    ],
    materials: [
      { id: 'acts-m1', title: '课程讲义总览', format: 'PDF', status: 'ready' },
      { id: 'acts-m2', title: '宣教旅程地图', format: 'Worksheet', status: 'ready' },
      { id: 'acts-m3', title: '课堂回顾音频', format: 'Audio', status: 'draft' },
    ],
  },
  {
    id: 'course-corinthians',
    title: '哥林多前书',
    instructor: 'Dr. Enos Lee',
    category: 'bible',
    degree: 'M.Div',
    lessons: 10,
    progress: 50,
    recentLesson: '教会秩序与恩赐',
    updatedAt: '昨天 19:20',
    summary: '围绕教会秩序、十字架神学与群体建造，恢复核心经文课程。',
    actionLabel: '打开课程',
    coverTone: 'emerald',
    description: '以哥林多前书为核心，重建经文、神学与群体建造的课程详情结构，后续可直接接入学习记录和讨论区。',
    goals: ['梳理书信结构与写作背景', '恢复课程目录与详情 tab', '为课程详情和评论联动预留入口'],
    syllabus: [
      { id: 'cor-1', title: '导论与哥林多教会背景', duration: '15:00', completed: true },
      { id: 'cor-2', title: '十字架神学与属灵成熟', duration: '16:45', completed: true },
      { id: 'cor-3', title: '圣徒群体中的分裂', duration: '20:20', completed: false },
      { id: 'cor-4', title: '敬拜秩序与恩赐运用', duration: '23:10', completed: false },
    ],
    materials: [
      { id: 'cor-m1', title: '书信结构图', format: 'PDF', status: 'ready' },
      { id: 'cor-m2', title: '课堂录音节选', format: 'Audio', status: 'ready' },
      { id: 'cor-m3', title: '神学术语卡片', format: 'Worksheet', status: 'ready' },
    ],
  },
  {
    id: 'course-pastoral-care',
    title: '牧养关怀与代祷实践',
    instructor: 'Pastor Sarah Kim',
    category: 'pastoral',
    degree: 'M.P.Th',
    lessons: 8,
    progress: 33,
    recentLesson: '危机中的代祷陪伴',
    updatedAt: '星期一 14:10',
    summary: '聚焦校园牧养、代祷陪伴与会谈记录，适合作为社区模块的数据源。',
    actionLabel: '查看大纲',
    coverTone: 'indigo',
    description: '课程聚焦牧养陪伴、危机代祷和会谈记录，适合后续连接校友圈中的代祷事项与通知模块。',
    goals: ['建立代祷事项到课程感悟的桥接结构', '恢复资料列表与草稿状态', '为通讯录和聊天模块预留实践案例'],
    syllabus: [
      { id: 'pc-1', title: '牧养关怀的节奏', duration: '14:35', completed: true },
      { id: 'pc-2', title: '危机中的代祷陪伴', duration: '18:50', completed: false },
      { id: 'pc-3', title: '跟进与记录', duration: '12:25', completed: false },
    ],
    materials: [
      { id: 'pc-m1', title: '代祷跟进模板', format: 'Worksheet', status: 'ready' },
      { id: 'pc-m2', title: '课堂案例录音', format: 'Audio', status: 'draft' },
    ],
  },
  {
    id: 'course-leadership',
    title: '教会领导力与团队治理',
    instructor: 'Dr. Maria Santos',
    category: 'leadership',
    degree: 'D.Min',
    lessons: 15,
    progress: 0,
    recentLesson: '长执团队协作',
    updatedAt: '上周五 09:30',
    summary: '为后续个人中心与管理员权限恢复，预留领导力课程的数据结构。',
    actionLabel: '继续重建',
    coverTone: 'violet',
    description: '恢复领导力课程的详情结构，为后续个人中心、教师权限和管理端课程发布打基础。',
    goals: ['建立教师与管理员课程形态', '恢复课程资料与草稿区分', '为后端权限层预留字段'],
    syllabus: [
      { id: 'ld-1', title: '团队治理原则', duration: '20:10', completed: false },
      { id: 'ld-2', title: '长执团队协作', duration: '19:40', completed: false },
      { id: 'ld-3', title: '冲突处理与复盘', duration: '17:55', completed: false },
    ],
    materials: [
      { id: 'ld-m1', title: '治理结构草案', format: 'PDF', status: 'ready' },
      { id: 'ld-m2', title: '会议模板', format: 'Worksheet', status: 'ready' },
      { id: 'ld-m3', title: '课程导言视频', format: 'Video', status: 'draft' },
    ],
  },
];

export const communityPosts: CommunityPostPreview[] = [
  {
    id: 'post-1',
    author: '林恩典',
    role: 'M.Div 2022',
    time: '今天 10:18',
    content: '这周重新听了《哥林多前书》的第二课，关于十字架神学的部分，刚好补足了我在团契分享里的盲点。',
    badge: '课程感悟',
    courseId: 'course-corinthians',
    likes: 8,
    liked: false,
    comments: [
      {
        id: 'post-1-comment-1',
        author: '张彼得',
        content: '这门课的第二课确实很扎实，后面可以把课堂讨论也恢复出来。',
        time: '今天 10:35',
      },
    ],
  },
  {
    id: 'post-2',
    author: 'Sarah Kim',
    role: 'Pastoral Mentor',
    time: '昨天 21:04',
    content: '下周会把“危机中的代祷陪伴”案例整理进课程材料，也欢迎大家把真实服事中的困难提交出来。',
    badge: '代祷实践',
    courseId: 'course-pastoral-care',
    likes: 5,
    liked: true,
    comments: [
      {
        id: 'post-2-comment-1',
        author: 'Grace',
        content: '代祷模板如果能和聊天入口结合，会很适合小组跟进。',
        time: '昨天 21:36',
      },
    ],
  },
  {
    id: 'post-3',
    author: '教务处',
    role: 'Admin',
    time: '昨天 09:30',
    content: '课程源码恢复已进入第二阶段。接下来会优先恢复课程详情、校友圈通知和聊天入口。',
    badge: '系统公告',
    likes: 3,
    liked: false,
    comments: [],
  },
];

export const communityConversations: ConversationPreview[] = [
  {
    id: 'conv-1',
    name: '教务处通知',
    subtitle: '课程恢复节奏已经调整，本周优先修复课程详情。',
    time: '08:40',
    unread: 1,
    role: 'Admin',
    pinned: true,
    muted: false,
  },
  {
    id: 'conv-2',
    name: '课程恢复工作群',
    subtitle: '下一个模块准备开始拆校友圈通知。',
    time: '昨天',
    unread: 0,
    role: 'Group',
    pinned: false,
    muted: false,
  },
  {
    id: 'conv-3',
    name: '牧养实践同工',
    subtitle: '代祷案例模板已经更新到课程资料。',
    time: '周一',
    unread: 3,
    role: 'Ministry Team',
    pinned: false,
    muted: true,
  },
];

export const communityNotifications: CommunityNotification[] = [
  {
    id: 'notice-1',
    title: '张彼得赞了你的课程感悟',
    detail: '这条互动来自《哥林多前书》的课程感悟，后续会接评论与点赞链路。',
    time: '5 分钟前',
    type: 'interaction',
    read: false,
    courseId: 'course-corinthians',
    postId: 'post-1',
  },
  {
    id: 'notice-2',
    title: '教务处发布了恢复进度通知',
    detail: '课程详情和校友圈源码已经完成第一轮恢复。',
    time: '20 分钟前',
    type: 'system',
    read: false,
    conversationId: 'conv-1',
  },
  {
    id: 'notice-3',
    title: '牧养实践同工有 3 条未读消息',
    detail: '危机中的代祷陪伴案例已经整理进课程资料。',
    time: '今天 08:25',
    type: 'interaction',
    read: true,
    conversationId: 'conv-3',
    postId: 'post-2',
  },
];

export const communityChatMessages: Record<string, ChatMessage[]> = {
  'conv-1': [
    { id: 'conv-1-m1', sender: 'other', content: '课程恢复节奏已经调整，本周先稳定课程详情和进度记录。', time: '08:12' },
    { id: 'conv-1-m2', sender: 'other', content: '校友圈通知和聊天入口会在下一轮源码恢复里推进。', time: '08:40' },
  ],
  'conv-2': [
    { id: 'conv-2-m1', sender: 'other', content: '我先把课程详情和学习记录跑通，再接聊天。', time: '昨天 17:20' },
    { id: 'conv-2-m2', sender: 'me', content: '收到，校友圈通知和最近消息入口我来补源码结构。', time: '昨天 17:26' },
  ],
  'conv-3': [
    { id: 'conv-3-m1', sender: 'other', content: '代祷案例模板已经放进课程资料区了。', time: '周一 10:15' },
    { id: 'conv-3-m2', sender: 'other', content: '后面建议把通知和会话入口统一成一套状态流。', time: '周一 11:03' },
    { id: 'conv-3-m3', sender: 'me', content: '同意，我会先在恢复工程里把入口做成闭环。', time: '周一 11:10' },
  ],
};

export const defaultProfile: ProfileState = {
  name: 'Enos Lee',
  role: 'AMAS Seminary Product Recovery',
  bio: '当前以源码恢复为主线，先稳定课程、校友圈和个人中心的状态层，再继续恢复聊天、通知和图书馆业务。',
  email: 'enos@amas.local',
  location: 'Bangkok',
};

export const libraryResources: LibraryResource[] = [
  {
    id: 'lib-1',
    title: '亚洲宣教史文献导读',
    author: 'AMAS Research Office',
    category: 'featured',
    format: 'eBook',
    summary: '整理亚洲宣教发展脉络、关键人物与机构演进，适合作为课程与校友圈讨论的背景材料。',
    updatedAt: '今天更新',
    relatedCourseId: 'course-acts',
  },
  {
    id: 'lib-2',
    title: '教牧关怀案例汇编',
    author: 'Sarah Kim',
    category: 'research',
    format: 'Journal',
    summary: '围绕危机陪伴、代祷跟进和会谈记录，重建实践神学资料入口。',
    updatedAt: '昨天',
    relatedCourseId: 'course-pastoral-care',
  },
  {
    id: 'lib-3',
    title: '课堂回顾音频：哥林多前书',
    author: 'Dr. Enos Lee',
    category: 'audio',
    format: 'Audio',
    summary: '恢复课程音频资源与学习资料同步入口，为后续播放器和离线状态做准备。',
    updatedAt: '周一',
    relatedCourseId: 'course-corinthians',
  },
  {
    id: 'lib-4',
    title: '院史档案与毕业讲章',
    author: 'Seminary Archive',
    category: 'archive',
    format: 'Archive',
    summary: '收录学院历史图片、毕业讲章和阶段性档案，用于图书馆档案区恢复。',
    updatedAt: '上周',
    relatedCourseId: 'course-leadership',
  },
];

export const rebuildMilestones = [
  {
    title: '阶段 1',
    detail: '可开发源码骨架已恢复，Git 与恢复快照都已固化。',
  },
  {
    title: '阶段 2',
    detail: '课程模块开始源码化，筛选、列表、详情与目录结构已建立。',
  },
  {
    title: '阶段 3',
    detail: '接下来进入校友圈、通知、聊天和个人中心的模块回迁。',
  },
];
