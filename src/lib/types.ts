export type Role =
	| "student"
	| "teacher"
	| "manager"
	| "moderator"
	| "branch_admin"
	| "hr"
	| "superadmin";

export type TargetFlow =
	| "student_teacher"
	| "teacher_management"
	| "management_teacher"
	| "teacher_self";

export type QuestionType = "scale" | "choice" | "text";

export type TeacherCategory = "standard" | "drama_gym" | "chess";
export type PkpdDecisionStatus = "PENDING" | "APPROVED" | "REJECTED";
export type CampusLeadershipRole =
	| "BRANCH_MANAGER"
	| "DEPUTY_DIRECTOR"
	| "DEPARTMENT_HEAD"
	| "SUBJECT_DEPUTY"
	| "CAMBRIDGE_DEPUTY";
export type LeadershipCoverageType =
	| "ALL_CAMPUS_TEACHERS"
	| "GRADE_RANGE"
	| "DEPARTMENT_BASED"
	| "CUSTOM_TEACHERS"
	| "PENDING";

export type UserDoc = {
	role: Role;
	branchId?: string | null;
	displayName?: string | null;
	login?: string | null;
	email?: string | null;
	createdAt?: unknown;
};

export type BranchDoc = {
	name: string;
	address?: string | null;
	studentCount?: number | null;
	teacherCount?: number | null;
	adminCount?: number | null;
	code?: string | null;
};

export type TeacherDoc = {
	name: string;
	firstName?: string | null;
	lastName?: string | null;
	departmentId?: string | null;
	photoUrl?: string | null;
	branchId?: string | null;
	branchIds?: string[];
	category?: TeacherCategory;
	isBiqTeacher?: boolean;
	uid?: string | null;
	login?: string | null;
	createdAt?: unknown;
};

export type StudentDoc = {
	name: string;
	branchId: string;
	groupId: string;
	classLevel: string;
	uid?: string | null;
	login?: string | null;
	createdAt?: unknown;
};

export type StudentGroupMembershipType = "class" | "block";

export type StudentGroupMembershipDoc = {
	studentId: string;
	userId?: string | null;
	branchId: string;
	groupId: string;
	year: number;
	type: StudentGroupMembershipType;
	createdAt?: unknown;
};

export type StudentAssignmentOverrideAction = "include" | "exclude";

export type StudentAssignmentOverrideDoc = {
	studentId: string;
	userId?: string | null;
	branchId: string;
	assignmentId: string;
	year: number;
	action: StudentAssignmentOverrideAction;
	createdBy?: string | null;
	createdAt?: unknown;
	deletedBy?: string | null;
	deletedAt?: unknown;
};

export type GroupDoc = {
	name: string;
	branchId: string;
	classLevel: string;
};

export type SubjectDoc = {
	name: string;
	code?: string | null;
	departmentId?: string | null;
};

export type DepartmentDoc = {
	name: string;
	branchId: string;
};

export type TeachingAssignmentDoc = {
	teacherId: string;
	groupId: string;
	subjectId: string;
	branchId: string;
	year: number;
};

export type ManagementAssignmentDoc = {
	managerUid: string;
	branchId: string;
	departmentId?: string | null;
	year: number;
};

export type CampusLeadershipDoc = {
	campusId: string;
	userId: string;
	role: CampusLeadershipRole;
	coverageType: LeadershipCoverageType;
	gradeFrom?: number | null;
	gradeTo?: number | null;
	departmentId?: string | null;
	isActive: boolean;
	canEvaluateTeachers: boolean;
	startsAt?: unknown;
	endsAt?: unknown;
	note?: string | null;
	createdBy?: string | null;
	createdAt?: unknown;
	updatedAt?: unknown;
};

export type CampusLeadershipTeacherScopeDoc = {
	campusLeadershipId: string;
	teacherId: string;
};

export type LeadershipEvaluationDoc = {
	cycleId: string;
	teacherId: string;
	evaluatorId: string;
	campusId: string;
	evaluatorRole: CampusLeadershipRole;
	coverageType: LeadershipCoverageType;
	disciplineScore: number;
	teamworkScore: number;
	communicationScore: number;
	professionalDevelopmentScore: number;
	platformUsageScore: number;
	totalScore: number;
	comment?: string | null;
	submittedAt?: unknown;
	updatedAt?: unknown;
	isSubmitted: boolean;
};

export type LeadershipCompletionDoc = {
	teacherId: string;
	leadershipEvaluationScore: number | null;
	submittedCount: number;
	eligibleCount: number;
	isComplete: boolean;
	isOverridden: boolean;
	branchManagerSubmitted: boolean;
	deputySubmitted: boolean;
	departmentHeadSubmitted: boolean;
	branchManagerEligible: boolean;
	deputyEligible: boolean;
	departmentHeadEligible: boolean;
};

export type QuestionDoc = {
	text: string;
	type: QuestionType;
	required: boolean;
	options?: string[];
	scaleMin?: number;
	scaleMax?: number;
	category?: string | null;
};

export type SurveyCycleDoc = {
	year: number;
	startAt: unknown;
	endAt: unknown;
	durationDays: number;
	status: "DRAFT" | "OPEN" | "CLOSED";
	branchIds?: string[] | null;
	thresholds: {
		y: number;
		p: number;
	};
};

export type QuestionSetDoc = {
	targetFlow: TargetFlow;
	questionIds: string[];
	isOpen: boolean;
};

export type TaskDoc = {
	cycleId: string;
	raterUid: string;
	raterRole: Role;
	targetType: "teacher" | "manager";
	targetId: string;
	targetName?: string | null;
	branchId: string;
	groupId?: string | null;
	subjectId?: string | null;
	groupName?: string | null;
	subjectName?: string | null;
	status: "OPEN" | "DONE";
	submittedAt?: unknown;
};

export type SubmissionDoc = {
	taskId: string;
	cycleId: string;
	raterUid: string;
	targetId: string;
	branchId: string;
	groupId?: string | null;
	subjectId?: string | null;
	createdAt: unknown;
};

export type AnswerDoc = {
	submissionId: string;
	questionId: string;
	value: string | number;
	createdAt: unknown;
};

export type NotificationType = "reminder" | "system" | "success";
export type NotificationLevel = "info" | "warning" | "success";

export type NotificationDoc = {
	userId: string;
	cycleId?: string | null;
	taskId?: string | null;
	type: NotificationType;
	level: NotificationLevel;
	title: string;
	message: string;
	actionPath?: string | null;
	metadata?: Record<string, unknown> | null;
	isRead: boolean;
	readAt?: unknown;
	createdAt: unknown;
};

export type AiInsightDoc = {
	cycleId: string;
	targetId: string;
	summary: string;
	createdAt: unknown;
};

export type BiqClassResultDoc = {
	cycleId: string;
	branchId: string;
	groupId: string;
	subjectId: string;
	score: number;
	createdAt?: unknown;
};

export type PkpdTeacherBiqResultDoc = {
	cycleId: string;
	branchId: string;
	teacherId: string;
	groupId: string;
	subjectId: string;
	score: number;
	createdAt?: unknown;
};

export type PkpdTeacherBiqAverageDoc = {
	cycleId: string;
	branchId: string;
	teacherId: string;
	score: number;
	note?: string | null;
	createdAt?: unknown;
};

export type PkpdExamDoc = {
	cycleId: string;
	branchId: string;
	teacherId: string;
	score: number;
	note?: string | null;
	createdAt?: unknown;
};

export type PkpdPortfolioDoc = {
	cycleId: string;
	branchId: string;
	teacherId: string;
	educationScore?: number | null;
	attendanceScore?: number | null;
	trainingScore?: number | null;
	olympiadScore?: number | null;
	eventsScore?: number | null;
	note?: string | null;
	createdAt?: unknown;
};

export type PkpdSelfReviewDoc = {
	cycleId: string;
	branchId: string;
	teacherId: string;
	score?: number | null;
	questionScores?: Record<string, number | null> | null;
	note?: string | null;
	editReason?: string | null;
	reviewedBy?: string | null;
	reviewedAt?: unknown;
	createdAt?: unknown;
};

export type PkpdAchievementDoc = {
	cycleId: string;
	branchId: string;
	teacherId: string;
	type: string;
	points: number;
	note?: string | null;
	createdAt?: unknown;
};

export type PkpdDecisionDoc = {
	cycleId: string;
	branchId: string;
	teacherId: string;
	status: PkpdDecisionStatus;
	category?: string | null;
	totalScore?: number | null;
	note?: string | null;
	decidedBy?: string | null;
	decidedAt?: unknown;
	createdAt?: unknown;
};

export type PkpdFinalReviewDoc = {
	cycleId: string;
	branchId: string;
	teacherId: string;
	reviewText: string;
	recommendationText: string;
	generatedBy?: string | null;
	generatedAt?: unknown;
	updatedBy?: string | null;
	updatedAt?: unknown;
	isManualEdited: boolean;
	createdAt?: unknown;
};

export type PkpdTeacherSummaryDoc = {
	teacherId: string;
	branchId?: string | null;
	name: string;
	firstName?: string | null;
	lastName?: string | null;
	departmentName?: string | null;
	branchName?: string | null;
	category: TeacherCategory;
	isBiqTeacher: boolean;
	studentAvg: number | null;
	managementAvg: number | null;
	selfAvg: number | null;
	selfDeclaredScore: number | null;
	academicIndicator: number | null;
	teacherCriteriaTotal: number | null;
	hrEvaluationScore: number | null;
	biqAvg: number | null;
	computedBiqAvg: number | null;
	manualBiqAvg: number | null;
	biqAverageSource: "manual" | "computed" | "none";
	studentWeightedScore: number | null;
	managementWeightedScore: number | null;
	leadershipSubmittedCount: number;
	leadershipEligibleCount: number;
	leadershipComplete: boolean;
	leadershipOverridden: boolean;
	branchManagerSubmitted: boolean;
	deputySubmitted: boolean;
	departmentHeadSubmitted: boolean;
	branchManagerEligible: boolean;
	deputyEligible: boolean;
	departmentHeadEligible: boolean;
	selfWeightedScore: number | null;
	biqWeightedScore: number | null;
	examScore: number | null;
	portfolioScore: number | null;
	bonusScore: number;
	currentEnteredScore: number;
	isComplete: boolean;
	baseTotalScore: number | null;
	finalScoreWithExtra: number | null;
	finalScore: number | null;
	finalMaxScore: number;
	finalScoreLabel: string;
	finalPercentage: number | null;
	isPkpdNonParticipant: boolean;
	isExamExempt: boolean;
	surveySubmissionCount: number;
	studentCount: number;
	studentClassCount: number;
	studentClassScores: Array<{
		groupId: string;
		groupName: string;
		avg: number;
		submissionCount: number;
	}>;
	managementCount: number;
	selfCount: number;
	refreshedAt?: unknown;
};
