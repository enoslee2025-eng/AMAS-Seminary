import { useEffect, useMemo, useState } from 'react';
import { CourseDetailTab, CourseItem, CourseRuntimeState } from '../../types/app';
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
}: {
  course: CourseItem;
  runtime: CourseRuntimeState;
  progress: number;
  recentLesson: string;
  onBack: () => void;
  onUpdateRuntime: (updater: (current: CourseRuntimeState) => CourseRuntimeState) => void;
}) {
  const [activeTab, setActiveTabState] = useState<CourseDetailTab>(runtime.lastOpenedTab ?? 'overview');

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
                    <button type="button" className="primary-btn compact-btn" onClick={() => onUpdateRuntime((current) => toggleLessonCompleted(current, lesson.id))}>
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
                  <button type="button" className="secondary-btn compact-btn" onClick={() => onUpdateRuntime((current) => toggleMaterialViewed(current, material.id))}>
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
