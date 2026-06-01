/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
	AiInsightDoc,
	AnswerDoc,
	BiqClassResultDoc,
	BranchDoc,
	CampusLeadershipDoc,
	CampusLeadershipTeacherScopeDoc,
	DepartmentDoc,
	GroupDoc,
	ManagementAssignmentDoc,
	NotificationDoc,
	LeadershipCompletionDoc,
	LeadershipEvaluationDoc,
	PkpdAchievementDoc,
	PkpdDecisionDoc,
	PkpdExamDoc,
	PkpdPortfolioDoc,
	PkpdSelfReviewDoc,
	PkpdTeacherBiqAverageDoc,
	PkpdTeacherBiqResultDoc,
	QuestionDoc,
	QuestionSetDoc,
	StudentAssignmentOverrideDoc,
	StudentGroupMembershipDoc,
	StudentDoc,
	SubjectDoc,
	SubmissionDoc,
	SurveyCycleDoc,
	TaskDoc,
	TeacherDoc,
	TeachingAssignmentDoc,
	UserDoc,
} from "./types";
import { parsePkpdSelfReviewNote } from "./pkpdSelfReview";
import { decodeQuestionSetState } from "./questionSetState";

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
	isBiqTeacher:
		typeof row.is_biq_teacher === "boolean"
			? row.is_biq_teacher
			: (row.teacher_category ?? "standard") === "standard",
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

export const mapStudentGroupMembershipRow = (
	row: Row,
): StudentGroupMembershipDoc => ({
	studentId: row.student_id,
	userId: row.user_id ?? null,
	branchId: row.branch_id,
	groupId: row.group_id,
	year: row.year,
	type: row.membership_type ?? "block",
	createdAt: row.created_at ?? null,
});

export const mapStudentAssignmentOverrideRow = (
	row: Row,
): StudentAssignmentOverrideDoc => ({
	studentId: row.student_id,
	userId: row.user_id ?? null,
	branchId: row.branch_id,
	assignmentId: row.assignment_id,
	year: row.year,
	action: row.action ?? "include",
	createdBy: row.created_by ?? null,
	createdAt: row.created_at ?? null,
	deletedBy: row.deleted_by ?? null,
	deletedAt: row.deleted_at ?? null,
});

export const mapGroupRow = (row: Row): GroupDoc => ({
	name: row.name,
	branchId: row.branch_id,
	classLevel: row.class_level,
});

export const mapSubjectRow = (row: Row): SubjectDoc => ({
	name: row.name,
	code: row.code ?? null,
	departmentId: row.department_id ?? null,
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
	departmentId: row.department_id ?? null,
	year: row.year,
});

export const mapCampusLeadershipRow = (row: Row): CampusLeadershipDoc => ({
	campusId: row.campus_id,
	userId: row.user_id,
	role: row.role,
	coverageType: row.coverage_type,
	gradeFrom: row.grade_from ?? null,
	gradeTo: row.grade_to ?? null,
	departmentId: row.department_id ?? null,
	isActive: row.is_active ?? false,
	canEvaluateTeachers: row.can_evaluate_teachers ?? false,
	startsAt: row.starts_at ?? null,
	endsAt: row.ends_at ?? null,
	note: row.note ?? null,
	createdBy: row.created_by ?? null,
	createdAt: row.created_at ?? null,
	updatedAt: row.updated_at ?? null,
});

export const mapCampusLeadershipTeacherScopeRow = (
	row: Row,
): CampusLeadershipTeacherScopeDoc => ({
	campusLeadershipId: row.campus_leadership_id,
	teacherId: row.teacher_id,
});

export const mapLeadershipEvaluationRow = (
	row: Row,
): LeadershipEvaluationDoc => ({
	cycleId: row.cycle_id,
	teacherId: row.teacher_id,
	evaluatorId: row.evaluator_id,
	campusId: row.campus_id,
	evaluatorRole: row.evaluator_role,
	coverageType: row.coverage_type,
	disciplineScore: Number(row.discipline_score),
	teamworkScore: Number(row.teamwork_score),
	communicationScore: Number(row.communication_score),
	professionalDevelopmentScore: Number(row.professional_development_score),
	platformUsageScore: Number(row.platform_usage_score),
	totalScore: Number(row.total_score),
	comment: row.comment ?? null,
	submittedAt: row.submitted_at ?? null,
	updatedAt: row.updated_at ?? null,
	isSubmitted: row.is_submitted ?? false,
});

export const mapLeadershipCompletionRow = (
	row: Row,
): LeadershipCompletionDoc => ({
	teacherId: row.teacher_id,
	leadershipEvaluationScore:
		row.leadership_evaluation_score === null ||
		row.leadership_evaluation_score === undefined
			? null
			: Number(row.leadership_evaluation_score),
	submittedCount: Number(row.submitted_count ?? 0),
	eligibleCount: Number(row.eligible_count ?? 0),
	isComplete: row.is_complete ?? false,
	isOverridden: row.is_overridden ?? false,
	branchManagerSubmitted: row.branch_manager_submitted ?? false,
	deputySubmitted: row.deputy_submitted ?? false,
	departmentHeadSubmitted: row.department_head_submitted ?? false,
	branchManagerEligible: row.branch_manager_eligible ?? false,
	deputyEligible: row.deputy_eligible ?? false,
	departmentHeadEligible: row.department_head_eligible ?? false,
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

export const mapQuestionSetRow = (row: Row): QuestionSetDoc => {
	const decoded = decodeQuestionSetState(row.question_ids, row.is_open);
	return {
		targetFlow: row.target_flow,
		questionIds: decoded.questionIds,
		isOpen: decoded.isOpen,
	};
};

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

export const mapNotificationRow = (row: Row): NotificationDoc => ({
	userId: row.user_id,
	cycleId: row.cycle_id ?? null,
	taskId: row.task_id ?? null,
	type: row.type,
	level: row.level ?? "info",
	title: row.title,
	message: row.message,
	actionPath: row.action_path ?? null,
	metadata:
		row.metadata && typeof row.metadata === "object"
			? (row.metadata as Record<string, unknown>)
			: {},
	isRead: row.is_read ?? false,
	readAt: row.read_at ?? null,
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

export const mapPkpdTeacherBiqResultRow = (
	row: Row,
): PkpdTeacherBiqResultDoc => ({
	cycleId: row.cycle_id,
	branchId: row.branch_id,
	teacherId: row.teacher_id,
	groupId: row.group_id,
	subjectId: row.subject_id,
	score: Number(row.score ?? 0),
	createdAt: row.created_at ?? null,
});

export const mapPkpdTeacherBiqAverageRow = (
	row: Row,
): PkpdTeacherBiqAverageDoc => ({
	cycleId: row.cycle_id,
	branchId: row.branch_id,
	teacherId: row.teacher_id,
	score: Number(row.score ?? 0),
	note: row.note ?? null,
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

export const mapPkpdSelfReviewRow = (row: Row): PkpdSelfReviewDoc => ({
	...(() => {
		const parsedNote = parsePkpdSelfReviewNote(row.note ?? null);
		return {
			note: parsedNote.note,
			editReason: parsedNote.editReason,
			questionScores:
				row.question_scores && typeof row.question_scores === "object"
					? Object.fromEntries(
							Object.entries(row.question_scores as Record<string, unknown>).map(
								([key, value]) => [
									key,
									value === null || value === undefined ? null : Number(value),
								],
							),
						)
					: parsedNote.questionScores,
		};
	})(),
	cycleId: row.cycle_id,
	branchId: row.branch_id,
	teacherId: row.teacher_id,
	score: row.score === null || row.score === undefined ? null : Number(row.score),
	reviewedBy: row.reviewed_by ?? null,
	reviewedAt: row.reviewed_at ?? null,
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
