import {
  AppDomainSnapshot,
  AuthDegree,
  AuthMode,
  AuthSession,
  CourseRuntimeRecord,
  CourseRuntimeState,
  LibraryRuntimeRecord,
  LibraryRuntimeState,
  ProfileState,
} from '../types/app';

export type StudentAuthMode = Exclude<AuthMode, 'professor_apply'>;

export type StudentAuthInput = {
  account: string;
  password: string;
  degree: AuthDegree;
  displayName: string;
  mode: StudentAuthMode;
};

export type ProfessorApplicationInput = {
  name: string;
  email: string;
  institution: string;
  focus: string;
};

export type ProfessorApplicationReceipt = {
  submittedAt: string;
  status: 'submitted';
};

export type ProfileUpdateInput = ProfileState;

export type CourseRuntimeSyncInput = {
  courseId: string;
  runtime: CourseRuntimeState;
  source: 'manual' | 'quick_action' | 'restore';
};

export type LibraryRuntimeSyncInput = {
  resourceId: string;
  runtime: LibraryRuntimeState;
  source: 'view' | 'favorite' | 'download' | 'restore';
};

export interface AuthServiceContract {
  readSession(): Promise<AuthSession | null>;
  refreshSession(): Promise<AuthSession>;
  login(input: StudentAuthInput): Promise<AuthSession>;
  register(input: StudentAuthInput): Promise<AuthSession>;
  logout(): Promise<null>;
  submitProfessorApplication(input: ProfessorApplicationInput): Promise<ProfessorApplicationReceipt>;
}

export interface ProfileServiceContract {
  read(): Promise<ProfileState>;
  update(input: ProfileUpdateInput): Promise<ProfileState>;
}

export interface LearningRuntimeServiceContract {
  readCourseRuntime(): Promise<CourseRuntimeRecord>;
  updateCourseRuntime(input: CourseRuntimeSyncInput): Promise<CourseRuntimeRecord>;
}

export interface LibraryRuntimeServiceContract {
  readLibraryRuntime(): Promise<LibraryRuntimeRecord>;
  updateLibraryRuntime(input: LibraryRuntimeSyncInput): Promise<LibraryRuntimeRecord>;
}

export interface AppSyncServiceContract {
  readSnapshot(): Promise<AppDomainSnapshot>;
  writeSnapshot(snapshot: AppDomainSnapshot): Promise<AppDomainSnapshot>;
}

export interface AppServiceContracts {
  auth: AuthServiceContract;
  profile: ProfileServiceContract;
  learning: LearningRuntimeServiceContract;
  library: LibraryRuntimeServiceContract;
  sync: AppSyncServiceContract;
}
