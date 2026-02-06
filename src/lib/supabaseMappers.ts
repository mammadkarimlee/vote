/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
	AiInsightDoc,
	AnswerDoc,
	BiqClassResultDoc,
	BranchDoc,
	DepartmentDoc,
	GroupDoc,
	ManagementAssignmentDoc,
	PkpdAchievementDoc,
	PkpdDecisionDoc,
	PkpdExamDoc,
	PkpdPortfolioDoc,
	QuestionDoc,
	QuestionSetDoc,
	StudentDoc,
	SubjectDoc,
	SubmissionDoc,
	SurveyCycleDoc,
	TaskDoc,
	TeacherDoc,
	TeachingAssignmentDoc,
	UserDoc,
} from "./types";

type Row = Record<string, any>;

export const mapBranchRow = (row: Row): BranchDoc => ({
	name: row.name,
	address: row.address ?? null,
	studentCount: row.student_count ?? null,
	teacherCount: row.teacher_count ?? null,
	adminCount: row.admin_count ?? null,
	code: row.code ?? null,
});

export const mapUserRow = (row: Row): UserDoc => ({
	role: row.role,
	branchId: row.branch_id ?? null,
	displayName: row.display_name ?? null,
	login: row.login ?? null,
	email: row.email ?? null,
	createdAt: row.created_at ?? null,
});

export const mapTeacherRow = (row: Row): TeacherDoc => ({
	name: row.name,
	firstName: row.first_name ?? null,
	lastName: row.last_name ?? null,
	departmentId: row.department_id ?? null,
	photoUrl: row.photo_url ?? null,
	branchId: row.branch_id ?? null,
	branchIds: row.branch_ids ?? undefined,
	category: row.teacher_category ?? "standard",
	uid: row.user_id ?? null,
	login: row.login ?? null,
	createdAt: row.created_at ?? null,
});

export const mapStudentRow = (row: Row): StudentDoc => ({
	name: row.name,
	branchId: row.branch_id,
	groupId: row.group_id,
	classLevel: row.class_level,
	uid: row.user_id ?? null,
	login: row.login ?? null,
	createdAt: row.created_at ?? null,
});

export const mapGroupRow = (row: Row): GroupDoc => ({
	name: row.name,
	branchId: row.branch_id,
	classLevel: row.class_level,
});

export const mapSubjectRow = (row: Row): SubjectDoc => ({
	name: row.name,
	code: row.code ?? null,
});

export const mapDepartmentRow = (row: Row): DepartmentDoc => ({
	name: row.name,
	branchId: row.branch_id,
});

export const mapTeachingAssignmentRow = (row: Row): TeachingAssignmentDoc => ({
	teacherId: row.teacher_id,
	groupId: row.group_id,
	subjectId: row.subject_id,
	branchId: row.branch_id,
	year: row.year,
});

export const mapManagementAssignmentRow = (
	row: Row,
): ManagementAssignmentDoc => ({
	managerUid: row.manager_id,
	branchId: row.branch_id,
	year: row.year,
});

export const mapQuestionRow = (row: Row): QuestionDoc => ({
	text: row.text,
	type: row.type,
	required: row.required ?? false,
	options: row.options ?? undefined,
	scaleMin: row.scale_min ?? undefined,
	scaleMax: row.scale_max ?? undefined,
	category: row.category ?? null,
});

export const mapSurveyCycleRow = (row: Row): SurveyCycleDoc => ({
	year: row.year,
	startAt: row.start_at,
	endAt: row.end_at,
	durationDays: row.duration_days,
	status: row.status,
	branchIds: row.branch_ids ?? null,
	thresholds: {
		y: Number(row.threshold_y ?? 0),
		p: Number(row.threshold_p ?? 0),
	},
});

export const mapQuestionSetRow = (row: Row): QuestionSetDoc => ({
	targetFlow: row.target_flow,
	questionIds: row.question_ids ?? [],
});

export const mapTaskRow = (row: Row): TaskDoc => ({
	cycleId: row.cycle_id,
	raterUid: row.rater_id,
	raterRole: row.rater_role,
	targetType: row.target_type,
	targetId: row.target_id,
	targetName: row.target_name ?? null,
	branchId: row.branch_id,
	groupId: row.group_id ?? null,
	subjectId: row.subject_id ?? null,
	groupName: row.group_name ?? null,
	subjectName: row.subject_name ?? null,
	status: row.status,
	submittedAt: row.submitted_at ?? null,
});

export const mapSubmissionRow = (row: Row): SubmissionDoc => ({
	taskId: row.task_id,
	cycleId: row.cycle_id,
	raterUid: row.rater_id,
	targetId: row.target_id,
	branchId: row.branch_id,
	groupId: row.group_id ?? null,
	subjectId: row.subject_id ?? null,
	createdAt: row.created_at ?? null,
});

export const mapAnswerRow = (row: Row): AnswerDoc => ({
	submissionId: row.submission_id,
	questionId: row.question_id,
	value: row.value,
	createdAt: row.created_at ?? null,
});

export const mapAiInsightRow = (row: Row): AiInsightDoc => ({
	cycleId: row.cycle_id,
	targetId: row.target_id,
	summary: row.summary,
	createdAt: row.created_at ?? null,
});

export const mapBiqClassResultRow = (row: Row): BiqClassResultDoc => ({
	cycleId: row.cycle_id,
	branchId: row.branch_id,
	groupId: row.group_id,
	subjectId: row.subject_id,
	score: Number(row.score ?? 0),
	createdAt: row.created_at ?? null,
});

export const mapPkpdExamRow = (row: Row): PkpdExamDoc => ({
	cycleId: row.cycle_id,
	branchId: row.branch_id,
	teacherId: row.teacher_id,
	score: Number(row.score ?? 0),
	note: row.note ?? null,
	createdAt: row.created_at ?? null,
});

export const mapPkpdPortfolioRow = (row: Row): PkpdPortfolioDoc => ({
	cycleId: row.cycle_id,
	branchId: row.branch_id,
	teacherId: row.teacher_id,
	educationScore: row.education_score ?? null,
	attendanceScore: row.attendance_score ?? null,
	trainingScore: row.training_score ?? null,
	olympiadScore: row.olympiad_score ?? null,
	eventsScore: row.events_score ?? null,
	note: row.note ?? null,
	createdAt: row.created_at ?? null,
});

export const mapPkpdAchievementRow = (row: Row): PkpdAchievementDoc => ({
	cycleId: row.cycle_id,
	branchId: row.branch_id,
	teacherId: row.teacher_id,
	type: row.type,
	points: Number(row.points ?? 0),
	note: row.note ?? null,
	createdAt: row.created_at ?? null,
});

export const mapPkpdDecisionRow = (row: Row): PkpdDecisionDoc => ({
	cycleId: row.cycle_id,
	branchId: row.branch_id,
	teacherId: row.teacher_id,
	status: row.status,
	category: row.category ?? null,
	totalScore: row.total_score ?? null,
	note: row.note ?? null,
	decidedBy: row.decided_by ?? null,
	decidedAt: row.decided_at ?? null,
	createdAt: row.created_at ?? null,
});
