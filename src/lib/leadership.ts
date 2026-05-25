import type {
	CampusLeadershipDoc,
	CampusLeadershipRole,
	LeadershipCoverageType,
	LeadershipEvaluationDoc,
	TeacherDoc,
} from "./types";

export const leadershipRoleLabels: Record<CampusLeadershipRole, string> = {
	BRANCH_MANAGER: "Filial müdiri",
	DEPUTY_DIRECTOR: "Direktor müavini",
	DEPARTMENT_HEAD: "Kafedra müdiri",
	SUBJECT_DEPUTY: "Fənn / istiqamət üzrə direktor müavini",
	CAMBRIDGE_DEPUTY: "Cambridge üzrə müavin",
};

export const leadershipCoverageLabels: Record<LeadershipCoverageType, string> = {
	ALL_CAMPUS_TEACHERS: "Bütün campus müəllimləri",
	GRADE_RANGE: "Sinif aralığı",
	DEPARTMENT_BASED: "Kafedra əsasında",
	CUSTOM_TEACHERS: "Manual müəllim siyahısı",
	PENDING: "Gözləmədə",
};

export const leadershipCriteria = [
	{ key: "disciplineScore", label: "Nizam-intizam qaydalarına riayət" },
	{ key: "teamworkScore", label: "Komandada işləmək bacarığı" },
	{
		key: "communicationScore",
		label: "Şagird, valideyn və heyətlə səmərəli ünsiyyət",
	},
	{ key: "professionalDevelopmentScore", label: "Peşəkar inkişaf" },
	{
		key: "platformUsageScore",
		label: "Məktəbdaxili elektron platformadan düzgün istifadə",
	},
] as const;

export type LeadershipCriterionKey = (typeof leadershipCriteria)[number]["key"];
export type LeadershipCriterionScores = Record<LeadershipCriterionKey, number | null>;

export const computeLeadershipVoteScore = (
	scores: LeadershipCriterionScores,
): number | null => {
	const values = leadershipCriteria.map((criterion) => scores[criterion.key]);
	if (values.some((value) => value === null || value === undefined)) return null;
	if (
		values.some(
			(value) =>
				typeof value !== "number" ||
				Number.isNaN(value) ||
				value < 0 ||
				value > 2,
		)
	) {
		return null;
	}
	return (values as number[]).reduce((sum, value) => sum + value, 0);
};

type EligibilityTeacher = Pick<TeacherDoc, "branchId" | "departmentId" | "uid"> & {
	id: string;
	gradeLevels?: number[];
	departmentIds?: string[];
};

type EligibilityOptions = {
	customTeacherIdsByLeadership?: Record<string, string[]>;
	now?: Date;
};

const dateIsActive = (
	leadership: CampusLeadershipDoc,
	now: Date,
): boolean => {
	const startsAt = leadership.startsAt ? new Date(String(leadership.startsAt)) : null;
	const endsAt = leadership.endsAt ? new Date(String(leadership.endsAt)) : null;
	return (!startsAt || startsAt <= now) && (!endsAt || endsAt >= now);
};

const coverageMatches = (
	id: string,
	teacher: EligibilityTeacher,
	leadership: CampusLeadershipDoc,
	options: EligibilityOptions,
) => {
	if (leadership.role === "BRANCH_MANAGER") {
		return leadership.coverageType === "ALL_CAMPUS_TEACHERS";
	}
	switch (leadership.coverageType) {
		case "ALL_CAMPUS_TEACHERS":
			return true;
		case "GRADE_RANGE":
			return (
				leadership.gradeFrom !== null &&
				leadership.gradeFrom !== undefined &&
				leadership.gradeTo !== null &&
				leadership.gradeTo !== undefined &&
				(teacher.gradeLevels ?? []).some(
					(grade) =>
						grade >= (leadership.gradeFrom as number) &&
						grade <= (leadership.gradeTo as number),
				)
			);
		case "DEPARTMENT_BASED":
			return (
				Boolean(leadership.departmentId) &&
				(teacher.departmentIds ?? [teacher.departmentId]).includes(
					leadership.departmentId ?? "",
				)
			);
		case "CUSTOM_TEACHERS":
			return (options.customTeacherIdsByLeadership?.[id] ?? []).includes(teacher.id);
		case "PENDING":
			return false;
	}
};

export const eligibleLeadershipEvaluators = (
	teacher: EligibilityTeacher,
	leadershipEntries: Array<{ id: string; data: CampusLeadershipDoc }>,
	options: EligibilityOptions = {},
) => {
	const now = options.now ?? new Date();
	const uniqueEvaluatorIds = new Set<string>();
	const targetIsActiveBranchManager = leadershipEntries.some(({ data }) => {
		return (
			data.userId === teacher.uid &&
			data.role === "BRANCH_MANAGER" &&
			data.isActive &&
			data.coverageType !== "PENDING" &&
			dateIsActive(data, now)
		);
	});
	return leadershipEntries.filter((entry) => {
		const leadership = entry.data;
		if (
			leadership.campusId !== teacher.branchId ||
			!leadership.isActive ||
			!leadership.canEvaluateTeachers ||
			leadership.coverageType === "PENDING" ||
			leadership.userId === teacher.uid ||
			(targetIsActiveBranchManager && leadership.role !== "BRANCH_MANAGER") ||
			!dateIsActive(leadership, now) ||
			!coverageMatches(entry.id, teacher, leadership, options) ||
			uniqueEvaluatorIds.has(leadership.userId)
		) {
			return false;
		}
		uniqueEvaluatorIds.add(leadership.userId);
		return true;
	});
};

export const summarizeLeadershipVotes = (
	eligibleEvaluatorIds: string[],
	evaluations: LeadershipEvaluationDoc[],
	isOverridden = false,
) => {
	const eligibleIds = new Set(eligibleEvaluatorIds);
	const submittedByEvaluator = new Map<string, number>();
	evaluations.forEach((evaluation) => {
		if (
			evaluation.isSubmitted &&
			eligibleIds.has(evaluation.evaluatorId) &&
			!submittedByEvaluator.has(evaluation.evaluatorId)
		) {
			submittedByEvaluator.set(evaluation.evaluatorId, evaluation.totalScore);
		}
	});
	const values = [...submittedByEvaluator.values()];
	return {
		leadershipEvaluationScore:
			values.length === 0
				? null
				: values.reduce((sum, value) => sum + value, 0) / values.length,
		submittedCount: values.length,
		eligibleCount: eligibleIds.size,
		isComplete:
			eligibleIds.size > 0 &&
			(values.length === eligibleIds.size || (isOverridden && values.length > 0)),
		isOverridden,
	};
};
