import { useEffect, useMemo, useState } from 'react';
import { CommunityPostPreview, CourseDetailTab, CourseItem, CourseRuntimeState } from '../../types/app';
import { createProcessedQueueLogItem } from '../profile/profileState';
import { useProcessedQueueLog } from '../profile/useProcessedQueueLog';
import {
  formatLastStudiedAt,
  getCompletedLessonsCount,
  markCurrentLesson,
  setDetailTab,
  toggleLessonCompleted,
  toggleMaterialViewed,
} from './courseState';

const tabLabels: Array<{ key: CourseDetailTab; label: string }> = [
  { key: 'overview', label: '课程概览' },
  { key: 'syllabus', label: '课程目录' },
  { key: 'materials', label: '学习资料' },
];

export function CourseDetailView({
  course,
  runtime,
  progress,
  recentLesson,
  onBack,
  onUpdateRuntime,
  communityPostCount,
  latestCommunityPost,
  onOpenCommunity,
  onComposeCommunityPost,
}: {
  course: CourseItem;
  runtime: CourseRuntimeState;
  progress: number;
  recentLesson: string;
  onBack: () => void;
  onUpdateRuntime: (updater: (current: CourseRuntimeState) => CourseRuntimeState) => void;
  communityPostCount: number;
  latestCommunityPost: CommunityPostPreview | null;
  onOpenCommunity: () => void;
  onComposeCommunityPost: (draft: string) => void;
}) {
  const [activeTab, setActiveTabState] = useState<CourseDetailTab>(runtime.lastOpenedTab ?? 'overview');
  const [, , appendProcessedQueueLog] = useProcessedQueueLog();

  useEffect(() => {
    setActiveTabState(runtime.lastOpenedTab ?? 'overview');
  }, [course.id, runtime.lastOpenedTab]);

  const setActiveTab = (tab: CourseDetailTab) => {
    setActiveTabState(tab);
    onUpdateRuntime((current) => setDetailTab(current, tab));
  };

  const completedLessons = useMemo(() => getCompletedLessonsCount(runtime), [runtime]);
  const currentLessonTitle =
    course.syllabus.find((lesson) => lesson.id === runtime.currentLessonId)?.title ?? recentLesson;
  const suggestedCommunityDraft = useMemo(
    () => `我正在学习《${course.title}》的「${currentLessonTitle}」，今天的一个收获是：`,
    [course.title, currentLessonTitle],
  );

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

  const handleToggleLessonCompleted = (lessonId: string, lessonTitle: string) => {
    const wasCompleted = runtime.completedLessonIds.includes(lessonId);
    onUpdateRuntime((current) => toggleLessonCompleted(current, lessonId));

    if (!wasCompleted) {
      logLearningAction(`完成《${course.title}》课时`, `已完成「${lessonTitle}」，课程进度继续向前推进。`, '完成课时');
    }
  };

  const handleToggleMaterialViewed = (materialId: string, materialTitle: string) => {
    const wasViewed = runtime.viewedMaterialIds.includes(materialId);
    onUpdateRuntime((current) => toggleMaterialViewed(current, materialId));

    if (!wasViewed) {
      logLearningAction(`查看课程资料《${materialTitle}》`, `这份资料已记入《${course.title}》的学习轨迹。`, '标记资料已读');
    }
  };

  return (
    <div className="course-detail-layout">
      <button type="button" className="back-link" onClick={onBack}>
        返回课程列表
      </button>

      <section className={`detail-hero-card tone-${course.coverTone}`}>
        <div>
          <p className="eyebrow">{course.degree} · {course.instructor}</p>
          <h2>{course.title}</h2>
          <p className="hero-copy">{course.description}</p>
        </div>
        <div className="detail-stats">
          <div>
            <strong>{progress}%</strong>
            <span>当前进度</span>
          </div>
          <div>
            <strong>{completedLessons}/{course.syllabus.length}</strong>
            <span>完成课时</span>
          </div>
          <div>
            <strong>{course.updatedAt}</strong>
            <span>最近更新</span>
          </div>
        </div>
      </section>

      <section className="detail-toolbar-card">
        <div className="detail-chip-row">
          {tabLabels.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={tab.key === activeTab ? 'chip-btn active' : 'chip-btn'}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'overview' && (
        <section className="detail-panel-card">
          <div className="detail-summary-row">
            <div className="detail-summary-card">
              <span className="detail-summary-label">当前课时</span>
              <strong>{currentLessonTitle}</strong>
            </div>
            <div className="detail-summary-card">
              <span className="detail-summary-label">最近学习</span>
              <strong>{formatLastStudiedAt(runtime.lastStudiedAt)}</strong>
            </div>
            <div className="detail-summary-card">
              <span className="detail-summary-label">资料已读</span>
              <strong>{runtime.viewedMaterialIds.length} 份</strong>
            </div>
          </div>
          <h3>课程目标</h3>
          <ul className="detail-list">
            {course.goals.map((goal) => (
              <li key={goal}>{goal}</li>
            ))}
          </ul>
          <div className="detail-meta-note">
            <strong>最近学习：</strong>
            <span>{recentLesson}</span>
          </div>
          <section className="detail-panel-card">
            <div className="module-header">
              <div>
                <p className="eyebrow">Course Discussion</p>
                <h3>课程讨论</h3>
              </div>
              <button type="button" className="secondary-btn compact-btn" onClick={onOpenCommunity}>
                打开相关讨论
              </button>
              <button type="button" className="primary-btn compact-btn" onClick={() => onComposeCommunityPost(suggestedCommunityDraft)}>
                发布课程感悟
              </button>
            </div>
            <div className="detail-summary-row">
              <article className="detail-summary-card">
                <span className="detail-summary-label">讨论动态</span>
                <strong>{communityPostCount}</strong>
                <span>{communityPostCount > 0 ? '已回流到校友圈讨论流' : '这门课还没有关联讨论'}</span>
              </article>
              <article className="detail-summary-card">
                <span className="detail-summary-label">最近讨论作者</span>
                <strong>{latestCommunityPost?.author ?? '等待首条动态'}</strong>
                <span>{latestCommunityPost?.time ?? '进入社区后可直接发布本课感悟'}</span>
              </article>
            </div>
            {latestCommunityPost ? (
              <article className="module-card post-card">
                <div className="post-meta">
                  <div>
                    <p className="post-author">{latestCommunityPost.author}</p>
                    <p className="post-role">{latestCommunityPost.role}</p>
                  </div>
                  <span className="course-updated">{latestCommunityPost.time}</span>
                </div>
                <span className="post-badge">{latestCommunityPost.badge}</span>
                <p className="post-content">{latestCommunityPost.content}</p>
                <div className="post-footer">
                  <span>进入社区后会自动带上这门课的讨论上下文，方便继续跟进。</span>
                </div>
              </article>
            ) : (
              <div className="empty-state-card">
                <strong>这门课还没有讨论记录</strong>
                <span>可以从社区页直接发一条关联本课程的感悟或恢复进展。</span>
              </div>
            )}
          </section>
        </section>
      )}

      {activeTab === 'syllabus' && (
        <section className="detail-panel-card">
          <h3>课程目录</h3>
          <div className="lesson-list">
            {course.syllabus.map((lesson, index) => (
              <article className="lesson-card" key={lesson.id}>
                <div className="lesson-content">
                  <p className="lesson-index">第 {index + 1} 课</p>
                  <h4>{lesson.title}</h4>
                </div>
                <div className="lesson-meta">
                  <span>{lesson.duration}</span>
                  <span className={runtime.completedLessonIds.includes(lesson.id) ? 'lesson-status done' : 'lesson-status'}>
                    {runtime.completedLessonIds.includes(lesson.id) ? '已完成' : '未完成'}
                  </span>
                  <div className="lesson-actions">
                    <button type="button" className="secondary-btn compact-btn" onClick={() => onUpdateRuntime((current) => markCurrentLesson(current, lesson.id))}>
                      设为当前
                    </button>
                    <button type="button" className="primary-btn compact-btn" onClick={() => handleToggleLessonCompleted(lesson.id, lesson.title)}>
                      {runtime.completedLessonIds.includes(lesson.id) ? '撤销完成' : '标记完成'}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'materials' && (
        <section className="detail-panel-card">
          <h3>学习资料</h3>
          <div className="material-list">
            {course.materials.map((material) => (
              <article className="material-card" key={material.id}>
                <div className="material-content">
                  <p className="material-format">{material.format}</p>
                  <h4>{material.title}</h4>
                </div>
                <div className="material-meta">
                  <span className={material.status === 'ready' ? 'material-status ready' : 'material-status draft'}>
                    {material.status === 'ready' ? '可查看' : '草稿'}
                  </span>
                  <button type="button" className="secondary-btn compact-btn" onClick={() => handleToggleMaterialViewed(material.id, material.title)}>
                    {runtime.viewedMaterialIds.includes(material.id) ? '撤销已读' : '标记已读'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
