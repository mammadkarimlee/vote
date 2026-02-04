export type Role =
  | 'student'
  | 'teacher'
  | 'manager'
  | 'moderator'
  | 'branch_admin'
  | 'superadmin'

export type TargetFlow =
  | 'student_teacher'
  | 'teacher_management'
  | 'management_teacher'

export type QuestionType = 'scale' | 'choice' | 'text'

export type UserDoc = {
  role: Role
  branchId?: string | null
  displayName?: string | null
  login?: string | null
  email?: string | null
  createdAt?: unknown
}

export type BranchDoc = {
  name: string
  address?: string | null
  studentCount?: number | null
  teacherCount?: number | null
  adminCount?: number | null
  code?: string | null
}

export type TeacherDoc = {
  name: string
  firstName?: string | null
  lastName?: string | null
  departmentId?: string | null
  photoUrl?: string | null
  branchId?: string | null
  branchIds?: string[]
  uid?: string | null
  login?: string | null
  createdAt?: unknown
}

export type StudentDoc = {
  name: string
  branchId: string
  groupId: string
  classLevel: string
  uid?: string | null
  login?: string | null
  createdAt?: unknown
}

export type GroupDoc = {
  name: string
  branchId: string
  classLevel: string
}

export type SubjectDoc = {
  name: string
  code?: string | null
}

export type DepartmentDoc = {
  name: string
  branchId: string
}

export type TeachingAssignmentDoc = {
  teacherId: string
  groupId: string
  subjectId: string
  branchId: string
  year: number
}

export type ManagementAssignmentDoc = {
  managerUid: string
  branchId: string
  year: number
}

export type QuestionDoc = {
  text: string
  type: QuestionType
  required: boolean
  options?: string[]
  scaleMin?: number
  scaleMax?: number
  category?: string | null
}

export type SurveyCycleDoc = {
  year: number
  startAt: unknown
  endAt: unknown
  durationDays: number
  status: 'DRAFT' | 'OPEN' | 'CLOSED'
  branchIds?: string[] | null
  thresholds: {
    y: number
    p: number
  }
}

export type QuestionSetDoc = {
  targetFlow: TargetFlow
  questionIds: string[]
}

export type TaskDoc = {
  cycleId: string
  raterUid: string
  raterRole: Role
  targetType: 'teacher' | 'manager'
  targetId: string
  targetName?: string | null
  branchId: string
  groupId?: string | null
  subjectId?: string | null
  groupName?: string | null
  subjectName?: string | null
  status: 'OPEN' | 'DONE'
  submittedAt?: unknown
}

export type SubmissionDoc = {
  taskId: string
  cycleId: string
  raterUid: string
  targetId: string
  branchId: string
  groupId?: string | null
  subjectId?: string | null
  createdAt: unknown
}

export type AnswerDoc = {
  submissionId: string
  questionId: string
  value: string | number
  createdAt: unknown
}

export type AiInsightDoc = {
  cycleId: string
  targetId: string
  summary: string
  createdAt: unknown
}
