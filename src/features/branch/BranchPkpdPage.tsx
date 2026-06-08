import { useEffect, useMemo, useState } from "react";
import {
	PageHeader,
	ScoreBreakdownTable,
	StatCard,
	StatusBadge,
	type ScoreBreakdownRow,
} from "../../components/dashboard";
import {
	DataTable,
	sortData,
	type DataTableColumn,
	type SortState,
} from "../../components/DataTable";
import { useFeedbackState } from "../../components/feedback/FeedbackProvider";
import { PaginationControls } from "../../components/PaginationControls";
import { getLeadershipVoteRoleStatus } from "../../lib/leadership";
import { ORG_ID, supabase } from "../../lib/supabase";
import {
	mapAnswerRow,
	mapBiqClassResultRow,
	mapGroupRow,
	mapPkpdAchievementRow,
	mapPkpdDecisionRow,
	mapPkpdExamRow,
	mapPkpdFinalReviewRow,
	mapPkpdPortfolioRow,
	mapPkpdSelfReviewRow,
	mapPkpdTeacherBiqAverageRow,
	mapPkpdTeacherBiqResultRow,
	mapLeadershipCompletionRow,
	mapQuestionRow,
	mapSubjectRow,
	mapSurveyCycleRow,
	mapTaskRow,
	mapTeacherRow,
	mapTeachingAssignmentRow,
} from "../../lib/supabaseMappers";
import {
	buildPkpdSelfReviewNote,
	isPkpdSelfReviewQuestionScoresError,
} from "../../lib/pkpdSelfReview";
import {
	buildRuleBasedPkpdFinalReview,
	type GeneratedPkpdFinalReview,
} from "../../lib/pkpdFinalReview";
import {
	computePkpdCompletion,
	computePkpdPortfolioScore,
	getPkpdEvaluationTypeFromBiq,
	getPkpdPortfolioLimits,
	getPkpdWeights,
	normalizePkpdScale,
	pkpdDecision,
	pkpdBucket,
} from "../../lib/pkpdScoring";
import type { PkpdEvaluationType } from "../../lib/pkpdScoring";
import type {
	AnswerDoc,
	BiqClassResultDoc,
	GroupDoc,
	PkpdAchievementDoc,
	PkpdDecisionDoc,
	PkpdDecisionStatus,
	PkpdExamDoc,
	PkpdFinalReviewDoc,
	PkpdPortfolioDoc,
	PkpdSelfReviewDoc,
	PkpdTeacherBiqAverageDoc,
	PkpdTeacherBiqResultDoc,
	LeadershipCompletionDoc,
	QuestionDoc,
	SubjectDoc,
	SurveyCycleDoc,
	TaskDoc,
	TeacherCategory,
	TeacherDoc,
	TeachingAssignmentDoc,
} from "../../lib/types";
import { usePagination } from "../../lib/usePagination";
import {
	chunkArray,
	chunkValuesForInFilter,
	formatShortDate,
	toJsDate,
	toNumber,
} from "../../lib/utils";
import { useAuth } from "../auth/AuthProvider";
import { BranchSelector } from "./BranchSelector";
import { parseSpreadsheet } from "./importUtils";
import { useBranchScope } from "./useBranchScope";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../../components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";

type DocEntry<T> = { id: string; data: T };
const SUPABASE_BATCH_SIZE = 1000;

const fetchAllBatched = async <T,>(
	fetchPage: (
		from: number,
		to: number,
	) => Promise<{ data: T[] | null; error: { message?: string } | null }>,
) => {
	const rows: T[] = [];
	let from = 0;

	while (true) {
		const to = from + SUPABASE_BATCH_SIZE - 1;
		const { data, error } = await fetchPage(from, to);
		if (error) {
			throw new Error(error.message ?? "Data load failed");
		}

		const page = data ?? [];
		rows.push(...page);
		if (page.length < SUPABASE_BATCH_SIZE) break;

		from += SUPABASE_BATCH_SIZE;
	}

	return rows;
};

type SummaryRow = {
	teacherId: string;
	name: string;
	category: TeacherCategory;
	isBiqTeacher: boolean;
	evaluationType: PkpdEvaluationType;
	assessmentResultLabel: string;
	studentScore: number | null;
	managementScore: number | null;
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
	selfScore: number | null;
	teacherCriteriaTotal: number | null;
	hrSelfReviewScore: number | null;
	biqAvg: number | null;
	computedBiqAvg: number | null;
	manualBiqAvg: number | null;
	biqAverageSource: "manual" | "computed" | "none";
	biqScore: number | null;
	examScore: number | null;
	portfolioScore: number | null;
	extraScore: number;
	currentEnteredScore: number;
	isComplete: boolean;
	baseTotalScore: number | null;
	finalScoreWithExtra: number | null;
};

const teacherCategoryLabel = (category?: TeacherCategory) => {
	switch (category) {
		case "drama_gym":
			return "Dram/Gimnastika";
		case "chess":
			return "Şahmat";
		default:
			return "Əsas";
	}
};

const decisionLabel: Record<PkpdDecisionStatus, string> = {
	PENDING: "Gözləmədə",
	APPROVED: "Uyğundur",
	REJECTED: "Uyğun deyil",
};

const formatScoreValue = (value: number | null) =>
	value === null ? "-" : value.toFixed(1);

const isMissingScore = (value: number | null | undefined) =>
	value === null || value === undefined || Number.isNaN(value);

const formatScoreOrMissing = (value: number | null | undefined) =>
	isMissingScore(value) ? "Daxil edilməyib" : Number(value).toFixed(1);

const evaluationTypeLabel = (isWithBiq: boolean) =>
	isWithBiq
		? "BİQ/KİQ nəticəsi olan müəllim"
		: "BİQ/KİQ nəticəsi olmayan müəllim";

const getSummaryStatusInfo = (row: SummaryRow) => {
	if (!row.isComplete) {
		if (!row.leadershipComplete) {
			return { label: "Rəhbərlik səsi gözləyir", tone: "warning" as const };
		}
		if (isMissingScore(row.portfolioScore)) {
			return { label: "Portfolio gözləyir", tone: "warning" as const };
		}
		return { label: "Hesablama tamamlanmayıb", tone: "warning" as const };
	}
	if ((row.baseTotalScore ?? 0) < 60) {
		return { label: "Risk qrupu", tone: "danger" as const };
	}
	return { label: "Tamamlanıb", tone: "success" as const };
};

const buildSummaryBreakdownRows = (row: SummaryRow): ScoreBreakdownRow[] => {
	const leadershipRoleStatus = getLeadershipVoteRoleStatus(row);
	const rows = row.isBiqTeacher
		? [
				{
					key: "subject-mastery",
					label: "Balabilgənin fənni mənimsəməsi",
					value: row.biqScore,
					max: 15,
					meta: `Orta BİQ: ${formatScoreOrMissing(row.biqAvg)}`,
				},
				{
					key: "student-survey",
					label: "Balabilgə sorğusu",
					value: row.studentScore,
					max: 15,
				},
				{
					key: "self-review",
					label: "Özünüqiymətləndirmə",
					value: row.selfScore,
					max: 10,
				},
				{
					key: "leadership",
					label: "Rəhbərlik qiymətləndirməsi",
					value: row.managementScore,
					max: 10,
					meta: (
						<>
							{row.leadershipSubmittedCount} / {row.leadershipEligibleCount} səs ·{" "}
							<span className={leadershipRoleStatus.hasPending ? "font-semibold text-red-600 dark:text-red-300" : ""}>
								{leadershipRoleStatus.pendingText}
							</span>
						</>
					),
				},
				{
					key: "exam",
					label: "Attestasiya imtahanı",
					value: row.examScore,
					max: 30,
				},
				{
					key: "portfolio",
					label: "Portfolio",
					value: row.portfolioScore,
					max: 20,
				},
			]
		: [
				{
					key: "student-survey",
					label: "Balabilgə sorğusu",
					value: row.studentScore,
					max: 20,
				},
				{
					key: "self-review",
					label: "Özünüqiymətləndirmə",
					value: row.selfScore,
					max: 10,
				},
				{
					key: "leadership",
					label: "Rəhbərlik qiymətləndirməsi",
					value: row.managementScore,
					max: 10,
					meta: (
						<>
							{row.leadershipSubmittedCount} / {row.leadershipEligibleCount} səs ·{" "}
							<span className={leadershipRoleStatus.hasPending ? "font-semibold text-red-600 dark:text-red-300" : ""}>
								{leadershipRoleStatus.pendingText}
							</span>
						</>
					),
				},
				{
					key: "portfolio",
					label: "Portfolio",
					value: row.portfolioScore,
					max: 60,
				},
			];

	if (!row.isBiqTeacher && !isMissingScore(row.examScore)) {
		rows.splice(rows.length - 1, 0, {
			key: "exam",
			label: "Attestasiya imtahanı",
			value: row.examScore,
			max: 30,
			meta: "Xam cəm 130 maksimumdan 100 şkalasına normallaşdırılır",
		});
	}

	return rows.map((item) => ({
		...item,
		value: formatScoreOrMissing(item.value),
		tone: isMissingScore(item.value) ? "warning" : "success",
	}));
};

const getFinalReviewComponents = (row: SummaryRow) => {
	const components = row.isBiqTeacher
		? [
				{ key: "subjectMasteryScore", label: "Balabilgənin fənni mənimsəməsi", value: row.biqScore, max: 15 },
				{ key: "studentSurveyScore", label: "Balabilgə sorğusu", value: row.studentScore, max: 15 },
				{ key: "selfEvaluationScore", label: "Özünü qiymətləndirmə", value: row.selfScore, max: 10 },
				{ key: "leadershipEvaluationScore", label: "Rəhbərlik qiymətləndirməsi", value: row.managementScore, max: 10 },
				{ key: "examScore", label: "Attestasiya imtahanı", value: row.examScore, max: 30 },
				{ key: "portfolioScore", label: "Portfolio", value: row.portfolioScore, max: 20 },
			]
		: [
				{ key: "studentSurveyScore", label: "Balabilgə sorğusu", value: row.studentScore, max: 20 },
				{ key: "selfEvaluationScore", label: "Özünü qiymətləndirmə", value: row.selfScore, max: 10 },
				{ key: "leadershipEvaluationScore", label: "Rəhbərlik qiymətləndirməsi", value: row.managementScore, max: 10 },
				{ key: "portfolioScore", label: "Portfolio", value: row.portfolioScore, max: 60 },
			];

	if (!row.isBiqTeacher && !isMissingScore(row.examScore)) {
		components.splice(components.length - 1, 0, {
			key: "examScore",
			label: "Attestasiya imtahanı",
			value: row.examScore,
			max: 30,
		});
	}

	return components;
};

const getMissingSummaryScoreLabels = (row: SummaryRow) =>
	getFinalReviewComponents(row)
		.filter((component) => isMissingScore(component.value))
		.map((component) => component.label);

const getIsBiqTeacher = (teacher: TeacherDoc) =>
	teacher.isBiqTeacher !== false;

const clampExamScore = (score: number | null | undefined) =>
	typeof score === "number" && !Number.isNaN(score)
		? Math.min(Math.max(score, 0), 30)
		: null;

const clampBiqAverageScore = (score: number | null | undefined) =>
	typeof score === "number" && !Number.isNaN(score)
		? Math.min(Math.max(score, 0), 100)
		: null;

const sumQuestionScores = (scores: Array<number | null | undefined>) => {
	const values = scores.filter(
		(value): value is number => typeof value === "number" && !Number.isNaN(value),
	);
	if (values.length === 0) return null;
	return values.reduce((acc, value) => acc + value, 0);
};

const getTeacherCriteriaTotal = (review?: PkpdSelfReviewDoc | null) => {
	if (!review) return null;
	return sumQuestionScores(Object.values(review.questionScores ?? {}));
};

export const BranchPkpdPage = () => {
	const { user, userDoc } = useAuth();
	const { branchId, setBranchId, branches, isSuperAdmin } = useBranchScope();
	const [cycles, setCycles] = useState<Array<DocEntry<SurveyCycleDoc>>>([]);
	const [selectedCycleId, setSelectedCycleId] = useState("");
	const [teachers, setTeachers] = useState<Array<DocEntry<TeacherDoc>>>([]);
	const [groups, setGroups] = useState<Array<DocEntry<GroupDoc>>>([]);
	const [subjects, setSubjects] = useState<Array<DocEntry<SubjectDoc>>>([]);
	const [assignments, setAssignments] = useState<
		Array<DocEntry<TeachingAssignmentDoc>>
	>([]);
	const [questions, setQuestions] = useState<Record<string, QuestionDoc>>({});
	const [tasks, setTasks] = useState<Array<DocEntry<TaskDoc>>>([]);
	const [answers, setAnswers] = useState<Array<DocEntry<AnswerDoc>>>([]);
	const [biqResults, setBiqResults] = useState<
		Array<DocEntry<BiqClassResultDoc>>
	>([]);
	const [teacherBiqResults, setTeacherBiqResults] = useState<
		Array<DocEntry<PkpdTeacherBiqResultDoc>>
	>([]);
	const [teacherBiqAverages, setTeacherBiqAverages] = useState<
		Array<DocEntry<PkpdTeacherBiqAverageDoc>>
	>([]);
	const [examResults, setExamResults] = useState<Array<DocEntry<PkpdExamDoc>>>(
		[],
	);
	const [portfolios, setPortfolios] = useState<
		Array<DocEntry<PkpdPortfolioDoc>>
	>([]);
	const [selfReviews, setSelfReviews] = useState<
		Array<DocEntry<PkpdSelfReviewDoc>>
	>([]);
	const [achievements, setAchievements] = useState<
		Array<DocEntry<PkpdAchievementDoc>>
	>([]);
	const [decisions, setDecisions] = useState<Array<DocEntry<PkpdDecisionDoc>>>(
		[],
	);
	const [finalReviews, setFinalReviews] = useState<
		Array<DocEntry<PkpdFinalReviewDoc>>
	>([]);
	const [leadershipCompletion, setLeadershipCompletion] = useState<
		Record<string, LeadershipCompletionDoc>
	>({});
	const [status, setStatus] = useFeedbackState();

	const [biqGroupId, setBiqGroupId] = useState("");
	const [biqSubjectId, setBiqSubjectId] = useState("");
	const [biqScore, setBiqScore] = useState("");
	const [biqImportStatus, setBiqImportStatus] = useFeedbackState();
	const [teacherBiqTeacherId, setTeacherBiqTeacherId] = useState("");
	const [teacherBiqGroupId, setTeacherBiqGroupId] = useState("");
	const [teacherBiqSubjectId, setTeacherBiqSubjectId] = useState("");
	const [teacherBiqScore, setTeacherBiqScore] = useState("");
	const [teacherBiqEditTeacherId, setTeacherBiqEditTeacherId] = useState<
		string | null
	>(null);
	const [teacherBiqEditAssignmentKey, setTeacherBiqEditAssignmentKey] =
		useState("");
	const [teacherBiqEditScore, setTeacherBiqEditScore] = useState("");
	const [teacherBiqEditSaving, setTeacherBiqEditSaving] = useState(false);
	const [teacherBiqImportStatus, setTeacherBiqImportStatus] = useFeedbackState();
	const [teacherBiqAverageDrafts, setTeacherBiqAverageDrafts] = useState<
		Record<string, string>
	>({});

	const [examDrafts, setExamDrafts] = useState<Record<string, string>>({});
	const [examImportStatus, setExamImportStatus] = useFeedbackState();

	const [portfolioTeacherId, setPortfolioTeacherId] = useState("");
	const [portfolioEducation, setPortfolioEducation] = useState("");
	const [portfolioAttendance, setPortfolioAttendance] = useState("");
	const [portfolioTraining, setPortfolioTraining] = useState("");
	const [portfolioOlympiad, setPortfolioOlympiad] = useState("");
	const [portfolioEvents, setPortfolioEvents] = useState("");
	const [portfolioNote, setPortfolioNote] = useState("");
	const [selfReviewTeacherId, setSelfReviewTeacherId] = useState("");
	const [selfReviewNote, setSelfReviewNote] = useState("");
	const [selfReviewEditUnlocked, setSelfReviewEditUnlocked] = useState(false);
	const [selfReviewUnlockOpen, setSelfReviewUnlockOpen] = useState(false);
	const [selfReviewUnlockPassword, setSelfReviewUnlockPassword] = useState("");
	const [selfReviewUnlockReason, setSelfReviewUnlockReason] = useState("");
	const [selfReviewUnlockError, setSelfReviewUnlockError] = useFeedbackState();
	const [selfReviewUnlockSubmitting, setSelfReviewUnlockSubmitting] =
		useState(false);

	const [achievementTeacherId, setAchievementTeacherId] = useState("");
	const [achievementType, setAchievementType] = useState("");
	const [achievementPoints, setAchievementPoints] = useState("");
	const [achievementNote, setAchievementNote] = useState("");
	const [decisionDrafts, setDecisionDrafts] = useState<
		Record<string, { status: PkpdDecisionStatus; note: string }>
	>({});
	const [finalReviewDraft, setFinalReviewDraft] = useState("");
	const [finalRecommendationDraft, setFinalRecommendationDraft] = useState("");
	const [generatedFinalReviewDraft, setGeneratedFinalReviewDraft] =
		useState<GeneratedPkpdFinalReview | null>(null);
	const [finalReviewGeneratedAtDraft, setFinalReviewGeneratedAtDraft] = useState<
		string | null
	>(null);
	const [finalReviewStatus, setFinalReviewStatus] = useFeedbackState();
	const [selectedSummaryTeacherId, setSelectedSummaryTeacherId] = useState<
		string | null
	>(null);
	const [summaryQuery, setSummaryQuery] = useState("");
	const [summaryStatusFilter, setSummaryStatusFilter] = useState("all");
	const [summarySort, setSummarySort] = useState<SortState>(null);

	useEffect(() => {
		const loadLookups = async () => {
			if (!branchId) return;
			const [cycleRes, teacherRes, groupRes, subjectRes, assignmentRes] =
				await Promise.all([
					supabase.from("survey_cycles").select("*").eq("org_id", ORG_ID),
					supabase
						.from("teachers")
						.select("*")
						.eq("org_id", ORG_ID)
						.is("deleted_at", null)
						.eq("branch_id", branchId),
					supabase
						.from("groups")
						.select("*")
						.eq("org_id", ORG_ID)
						.is("deleted_at", null)
						.eq("branch_id", branchId),
					supabase
						.from("subjects")
						.select("*")
						.eq("org_id", ORG_ID)
						.is("deleted_at", null),
					supabase
						.from("teaching_assignments")
						.select("*")
						.eq("org_id", ORG_ID)
						.eq("branch_id", branchId),
				]);

			const cycleDocs = (cycleRes.data ?? []).map((row) => ({
				id: row.id,
				data: mapSurveyCycleRow(row),
			}));
			const visibleCycles = cycleDocs.filter((cycle) => {
				const branchIds = cycle.data.branchIds ?? [];
				if (branchIds.length === 0) return true;
				return branchId ? branchIds.includes(branchId) : false;
			});
			setCycles(visibleCycles);
			setTeachers(
				(teacherRes.data ?? []).map((row) => ({
					id: row.id,
					data: mapTeacherRow(row),
				})),
			);
			setGroups(
				(groupRes.data ?? []).map((row) => ({
					id: row.id,
					data: mapGroupRow(row),
				})),
			);
			setSubjects(
				(subjectRes.data ?? []).map((row) => ({
					id: row.id,
					data: mapSubjectRow(row),
				})),
			);
			setAssignments(
				(assignmentRes.data ?? []).map((row) => ({
					id: row.id,
					data: mapTeachingAssignmentRow(row),
				})),
			);

			if (visibleCycles.length > 0) {
				const latest = [...visibleCycles].sort(
					(a, b) => b.data.year - a.data.year,
				)[0];
				if (
					!selectedCycleId ||
					!visibleCycles.some((cycle) => cycle.id === selectedCycleId)
				) {
					setSelectedCycleId(latest.id);
				}
			}
		};

		void loadLookups();
	}, [branchId, selectedCycleId]);

	useEffect(() => {
		const loadPkpdData = async () => {
			if (!branchId || !selectedCycleId) return;

			const [
				questionRows,
				taskRows,
				biqRows,
				teacherBiqRows,
				teacherBiqAverageRows,
				examRows,
				portfolioRows,
				selfReviewRows,
				achievementRows,
				decisionRows,
				finalReviewResult,
				leadershipSummaryResult,
			] = await Promise.all([
				fetchAllBatched<any>(async (from, to) =>
					supabase
						.from("questions")
						.select("*")
						.eq("org_id", ORG_ID)
						.order("id")
						.range(from, to),
				),
				fetchAllBatched<any>(async (from, to) =>
					supabase
						.from("tasks")
						.select("*")
						.eq("org_id", ORG_ID)
						.eq("cycle_id", selectedCycleId)
						.eq("branch_id", branchId)
						.order("id")
						.range(from, to),
				),
				fetchAllBatched<any>(async (from, to) =>
					supabase
						.from("biq_class_results")
						.select("*")
						.eq("org_id", ORG_ID)
						.eq("cycle_id", selectedCycleId)
						.eq("branch_id", branchId)
						.order("id")
						.range(from, to),
				),
				fetchAllBatched<any>(async (from, to) =>
					supabase
						.from("pkpd_teacher_biq_results")
						.select("*")
						.eq("org_id", ORG_ID)
						.eq("cycle_id", selectedCycleId)
						.eq("branch_id", branchId)
						.order("id")
						.range(from, to),
				),
				fetchAllBatched<any>(async (from, to) =>
					supabase
						.from("pkpd_teacher_biq_averages")
						.select("*")
						.eq("org_id", ORG_ID)
						.eq("cycle_id", selectedCycleId)
						.eq("branch_id", branchId)
						.order("id")
						.range(from, to),
				),
				fetchAllBatched<any>(async (from, to) =>
					supabase
						.from("pkpd_exam_results")
						.select("*")
						.eq("org_id", ORG_ID)
						.eq("cycle_id", selectedCycleId)
						.eq("branch_id", branchId)
						.order("id")
						.range(from, to),
				),
				fetchAllBatched<any>(async (from, to) =>
					supabase
						.from("pkpd_portfolios")
						.select("*")
						.eq("org_id", ORG_ID)
						.eq("cycle_id", selectedCycleId)
						.eq("branch_id", branchId)
						.order("id")
						.range(from, to),
				),
				fetchAllBatched<any>(async (from, to) =>
					supabase
						.from("pkpd_self_reviews")
						.select("*")
						.eq("org_id", ORG_ID)
						.eq("cycle_id", selectedCycleId)
						.eq("branch_id", branchId)
						.order("id")
						.range(from, to),
				),
				fetchAllBatched<any>(async (from, to) =>
					supabase
						.from("pkpd_achievements")
						.select("*")
						.eq("org_id", ORG_ID)
						.eq("cycle_id", selectedCycleId)
						.eq("branch_id", branchId)
						.order("id")
						.range(from, to),
				),
				fetchAllBatched<any>(async (from, to) =>
					supabase
						.from("pkpd_decisions")
						.select("*")
						.eq("org_id", ORG_ID)
						.eq("cycle_id", selectedCycleId)
						.eq("branch_id", branchId)
						.order("id")
						.range(from, to),
				),
				supabase
					.from("pkpd_final_reviews")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("cycle_id", selectedCycleId)
					.eq("branch_id", branchId),
				supabase.rpc("leadership_score_summary", {
					p_cycle_id: selectedCycleId,
					p_campus_id: branchId,
				}),
			]);

			const questionMap: Record<string, QuestionDoc> = {};
			questionRows.forEach((row) => {
				questionMap[row.id] = mapQuestionRow(row);
			});
			setQuestions(questionMap);

			const taskDocs = taskRows.map((row) => ({
				id: row.id,
				data: mapTaskRow(row),
			}));
			setTasks(taskDocs);

			const biqDocs = biqRows.map((row) => ({
				id: row.id,
				data: mapBiqClassResultRow(row),
			}));
			setBiqResults(biqDocs);
			const teacherBiqDocs = teacherBiqRows.map((row) => ({
				id: row.id,
				data: mapPkpdTeacherBiqResultRow(row),
			}));
			setTeacherBiqResults(teacherBiqDocs);

			const teacherBiqAverageDocs = teacherBiqAverageRows.map((row) => ({
				id: row.id,
				data: mapPkpdTeacherBiqAverageRow(row),
			}));
			setTeacherBiqAverages(teacherBiqAverageDocs);
			setTeacherBiqAverageDrafts(
				Object.fromEntries(
					teacherBiqAverageDocs.map((row) => [
						row.data.teacherId,
						row.data.score !== null ? String(row.data.score) : "",
					]),
				),
			);

			const examDocs = examRows.map((row) => ({
				id: row.id,
				data: mapPkpdExamRow(row),
			}));
			setExamResults(examDocs);
			setExamDrafts(
				Object.fromEntries(
					examDocs.map((row) => [
						row.data.teacherId,
						row.data.score !== null ? String(row.data.score) : "",
					]),
				),
			);

			const portfolioDocs = portfolioRows.map((row) => ({
				id: row.id,
				data: mapPkpdPortfolioRow(row),
			}));
			setPortfolios(portfolioDocs);

			const selfReviewDocs = selfReviewRows.map((row) => ({
				id: row.id,
				data: mapPkpdSelfReviewRow(row),
			}));
			setSelfReviews(selfReviewDocs);

			const achievementDocs = achievementRows.map((row) => ({
				id: row.id,
				data: mapPkpdAchievementRow(row),
			}));
			setAchievements(achievementDocs);

			const decisionDocs = decisionRows.map((row) => ({
				id: row.id,
				data: mapPkpdDecisionRow(row),
			}));
			setDecisions(decisionDocs);
			setDecisionDrafts(
				decisionDocs.reduce<
					Record<string, { status: PkpdDecisionStatus; note: string }>
				>((acc, item) => {
					acc[item.data.teacherId] = {
						status: item.data.status ?? "PENDING",
						note: item.data.note ?? "",
					};
					return acc;
				}, {}),
			);
			if (finalReviewResult.error) {
				console.warn("PKPD final reviews load skipped", finalReviewResult.error);
			}
			setFinalReviews(
				(finalReviewResult.data ?? []).map((row) => ({
					id: row.id,
					data: mapPkpdFinalReviewRow(row),
				})),
			);
			setLeadershipCompletion(
				Object.fromEntries(
					(leadershipSummaryResult.data ?? []).map((row: Record<string, unknown>) => {
						const summary = mapLeadershipCompletionRow(row);
						return [summary.teacherId, summary];
					}),
				),
			);

			if (taskDocs.length === 0) {
				setAnswers([]);
				return;
			}

			const ids = Array.from(new Set(taskDocs.map((item) => item.id)));
			const chunks = chunkValuesForInFilter(ids);
			const answerDocs: Array<DocEntry<AnswerDoc>> = [];
			for (const chunk of chunks) {
				if (chunk.length === 0) continue;
				const answerRows = await fetchAllBatched<any>(async (from, to) =>
					supabase
						.from("answers")
						.select("*")
						.eq("org_id", ORG_ID)
						.in("submission_id", chunk)
						.order("submission_id")
						.order("question_id")
						.range(from, to),
				);
				answerRows.forEach((row) => {
					const key = `${row.submission_id}_${row.question_id}`;
					answerDocs.push({ id: key, data: mapAnswerRow(row) });
				});
			}
			setAnswers(answerDocs);
		};

		void loadPkpdData();
	}, [branchId, selectedCycleId]);

	const cycle = useMemo(
		() => cycles.find((item) => item.id === selectedCycleId),
		[cycles, selectedCycleId],
	);
	const cycleYear = cycle?.data.year ?? new Date().getFullYear();

	const teacherMap = useMemo(
		() => Object.fromEntries(teachers.map((t) => [t.id, t.data])),
		[teachers],
	);
	const groupMap = useMemo(
		() => Object.fromEntries(groups.map((g) => [g.id, g.data])),
		[groups],
	);
	const subjectMap = useMemo(
		() => Object.fromEntries(subjects.map((s) => [s.id, s.data])),
		[subjects],
	);
	const groupNameMap = useMemo(() => {
		const map = new Map<string, string>();
		groups.forEach((group) => {
			map.set(group.data.name.trim().toLowerCase(), group.id);
		});
		return map;
	}, [groups]);
	const subjectNameMap = useMemo(() => {
		const map = new Map<string, string>();
		subjects.forEach((subject) => {
			map.set(subject.data.name.trim().toLowerCase(), subject.id);
			if (subject.data.code) {
				map.set(subject.data.code.trim().toLowerCase(), subject.id);
			}
		});
		return map;
	}, [subjects]);
	const teacherNameMap = useMemo(() => {
		const map = new Map<string, string>();
		teachers.forEach((teacher) => {
			const normalizedName = teacher.data.name.trim().toLowerCase();
			map.set(normalizedName, teacher.id);
			if (teacher.data.login) {
				map.set(teacher.data.login.trim().toLowerCase(), teacher.id);
			}
		});
		return map;
	}, [teachers]);

	const biqMap = useMemo(
		() =>
			Object.fromEntries(
				biqResults.map((item) => [
					`${item.data.groupId}_${item.data.subjectId}`,
					item.data,
				]),
			),
		[biqResults],
	);
	const teacherBiqMap = useMemo(
		() =>
			Object.fromEntries(
				teacherBiqResults.map((item) => [
					`${item.data.teacherId}_${item.data.groupId}_${item.data.subjectId}`,
					item.data,
				]),
			),
		[teacherBiqResults],
	);
	const teacherBiqAverageMap = useMemo(
		() =>
			Object.fromEntries(
				teacherBiqAverages.map((item) => [item.data.teacherId, item.data]),
			),
		[teacherBiqAverages],
	);

	const portfolioMap = useMemo(
		() =>
			Object.fromEntries(
				portfolios.map((item) => [item.data.teacherId, item.data]),
			),
		[portfolios],
	);
	const selfReviewMap = useMemo(
		() =>
			Object.fromEntries(
				selfReviews.map((item) => [item.data.teacherId, item.data]),
			),
		[selfReviews],
	);

	const portfolioTeacher = portfolioTeacherId
		? teacherMap[portfolioTeacherId]
		: undefined;
	const portfolioMax = getPkpdPortfolioLimits(
		portfolioTeacher?.category,
		portfolioTeacher ? getIsBiqTeacher(portfolioTeacher) : undefined,
	);
	const portfolioDraftValues = [
		{ value: toNumber(portfolioEducation), max: portfolioMax.education },
		{ value: toNumber(portfolioAttendance), max: portfolioMax.attendance },
		{ value: toNumber(portfolioTraining), max: portfolioMax.training },
		{ value: toNumber(portfolioOlympiad), max: portfolioMax.olympiad },
		{ value: toNumber(portfolioEvents), max: portfolioMax.events },
	];
	const portfolioDraftScore =
		portfolioDraftValues.some(({ value }) => value !== null)
			? portfolioDraftValues.reduce(
					(sum, { value, max }) =>
						value === null ? sum : sum + Math.min(Math.max(value, 0), max),
					0,
				)
			: null;
	const portfolioDraftMax =
		portfolioMax.education +
		portfolioMax.attendance +
		portfolioMax.training +
		portfolioMax.olympiad +
		portfolioMax.events;
	const selfReviewTeacher = selfReviewTeacherId
		? teacherMap[selfReviewTeacherId]
		: null;

	const examMap = useMemo(
		() =>
			Object.fromEntries(
				examResults.map((item) => [item.data.teacherId, item.data]),
			),
		[examResults],
	);

	const achievementTotals = useMemo(() => {
		const totals: Record<string, number> = {};
		achievements.forEach((item) => {
			totals[item.data.teacherId] =
				(totals[item.data.teacherId] ?? 0) + item.data.points;
		});
		return totals;
	}, [achievements]);

	const decisionMap = useMemo(
		() =>
			Object.fromEntries(
				decisions.map((item) => [item.data.teacherId, item.data]),
			),
		[decisions],
	);
	const finalReviewMap = useMemo(
		() =>
			Object.fromEntries(
				finalReviews.map((item) => [item.data.teacherId, item.data]),
			),
		[finalReviews],
	);

	const teacherSelfResponses = useMemo(() => {
		const taskMap = Object.fromEntries(tasks.map((item) => [item.id, item.data]));
		const responseMap: Record<
			string,
			{
				declaredScore: number | null;
				textAnswers: Array<{ questionId: string; questionText: string; answerText: string }>;
			}
		> = {};

		answers.forEach((answer) => {
			const task = taskMap[answer.data.submissionId];
			if (!task) return;
			if (task.raterRole !== "teacher" || task.targetType !== "teacher") return;

			const question = questions[answer.data.questionId];
			if (!question) return;
			if (question.category !== "teacher_self_pkpd") return;

			const teacherId = task.targetId;
			responseMap[teacherId] = responseMap[teacherId] ?? {
				declaredScore: null,
				textAnswers: [],
			};

			if (question.type === "scale") {
				const numeric = toNumber(answer.data.value);
				if (numeric !== null) {
					responseMap[teacherId].declaredScore = numeric;
				}
				return;
			}

			if (question.type !== "text") return;
			const answerText =
				typeof answer.data.value === "string"
					? answer.data.value
					: String(answer.data.value ?? "");
			if (!answerText.trim()) return;

			responseMap[teacherId].textAnswers.push({
				questionId: answer.data.questionId,
				questionText: question.text,
				answerText,
			});
		});

		return responseMap;
	}, [answers, questions, tasks]);
	const selectedTeacherSelfResponse = selfReviewTeacherId
		? (teacherSelfResponses[selfReviewTeacherId] ?? null)
		: null;
	const selectedTeacherSelfReview = selfReviewTeacherId
		? (selfReviewMap[selfReviewTeacherId] ?? null)
		: null;
	const selectedTeacherHasSavedSelfReview = Boolean(
		selectedTeacherSelfReview &&
			(typeof selectedTeacherSelfReview.score === "number" ||
				Boolean(selectedTeacherSelfReview.reviewedAt)),
	);
	const selectedTeacherSelfReviewLocked =
		selectedTeacherHasSavedSelfReview && !selfReviewEditUnlocked;

	const assignmentByTeacher = useMemo(() => {
		const map: Record<string, TeachingAssignmentDoc[]> = {};
		assignments.forEach((assignment) => {
			if (assignment.data.year !== cycleYear) return;
			map[assignment.data.teacherId] = map[assignment.data.teacherId] || [];
			map[assignment.data.teacherId].push(assignment.data);
		});
		return map;
	}, [assignments, cycleYear]);
	const assignmentKeySet = useMemo(() => {
		const keys = new Set<string>();
		assignments.forEach((assignment) => {
			if (assignment.data.year !== cycleYear) return;
			keys.add(
				`${assignment.data.teacherId}_${assignment.data.groupId}_${assignment.data.subjectId}`,
			);
		});
		return keys;
	}, [assignments, cycleYear]);

	const flowStats = useMemo(() => {
		const taskMap = Object.fromEntries(
			tasks.map((item) => [item.id, item.data]),
		);
		const stats: Record<
			string,
			{
				student: { sum: number; count: number };
				management: { sum: number; count: number };
				self: { sum: number; count: number };
			}
		> = {};

		answers.forEach((answer) => {
			const task = taskMap[answer.data.submissionId];
			if (!task) return;
			const question = questions[answer.data.questionId];
			if (!question || question.type !== "scale") return;
			const numeric = toNumber(answer.data.value);
			if (numeric === null) return;
			const normalized = normalizePkpdScale(
				numeric,
				question.scaleMin,
				question.scaleMax,
			);

			const targetId = task.targetId;
			stats[targetId] = stats[targetId] ?? {
				student: { sum: 0, count: 0 },
				management: { sum: 0, count: 0 },
				self: { sum: 0, count: 0 },
			};

			if (task.raterRole === "student" && task.targetType === "teacher") {
				stats[targetId].student.sum += normalized;
				stats[targetId].student.count += 1;
			} else if (
				task.raterRole === "manager" &&
				task.targetType === "teacher"
			) {
				stats[targetId].management.sum += normalized;
				stats[targetId].management.count += 1;
			} else if (
				task.raterRole === "teacher" &&
				task.targetType === "teacher"
			) {
				stats[targetId].self.sum += normalized;
				stats[targetId].self.count += 1;
			}
		});

		return stats;
	}, [answers, questions, tasks]);

	const biqTeachers = useMemo(
		() => teachers.filter((teacher) => getIsBiqTeacher(teacher.data)),
		[teachers],
	);
	const examTeachers = teachers;

	const summaryRows = useMemo<SummaryRow[]>(() => {
		return teachers.map((teacher) => {
			const category = teacher.data.category ?? "standard";
			const isBiqTeacher = getIsBiqTeacher(teacher.data);
			const evaluationType = getPkpdEvaluationTypeFromBiq(isBiqTeacher);
			const weights = getPkpdWeights(category, isBiqTeacher);
			const assessmentResultLabel = isBiqTeacher
				? "Balabilgənin fənni mənimsəməsi"
				: "BİQ/KİQ tətbiq edilmir";

			const stats = flowStats[teacher.id];
			const studentAvg =
				stats && stats.student.count > 0
					? stats.student.sum / stats.student.count
					: null;
			const selfAvg =
				stats && stats.self.count > 0
					? stats.self.sum / stats.self.count
					: null;

			const studentScore =
				studentAvg === null ? null : (studentAvg * weights.student) / 100;
			const leadershipSummary = leadershipCompletion[teacher.id];
			const managementScore = leadershipSummary?.leadershipEvaluationScore ?? null;
			const selfScore =
				selfAvg === null ? null : (selfAvg * weights.self) / 100;

			const assignmentsForTeacher = assignmentByTeacher[teacher.id] ?? [];
			const biqScores = assignmentsForTeacher
				.map((assignment) => {
					const teacherBiqKey = `${teacher.id}_${assignment.groupId}_${assignment.subjectId}`;
					const teacherOverride = teacherBiqMap[teacherBiqKey]?.score;
					if (typeof teacherOverride === "number") return teacherOverride;
					return biqMap[`${assignment.groupId}_${assignment.subjectId}`]?.score;
				})
				.filter((value): value is number => typeof value === "number");
			const computedBiqAvg =
				biqScores.length > 0
					? biqScores.reduce((a, b) => a + b, 0) / biqScores.length
					: null;
			const manualBiqAvg = clampBiqAverageScore(
				teacherBiqAverageMap[teacher.id]?.score,
			);
			const biqAvg = isBiqTeacher
				? (manualBiqAvg ?? computedBiqAvg)
				: null;
			const biqAverageSource: "manual" | "computed" | "none" = !isBiqTeacher
				? "none"
				: manualBiqAvg !== null
					? "manual"
					: computedBiqAvg !== null
						? "computed"
						: "none";
			const examInputScore = clampExamScore(examMap[teacher.id]?.score);
			const biqScore =
				isBiqTeacher
					? weights.biq === 0 || biqAvg === null
						? null
						: (biqAvg * weights.biq) / 100
					: null;

			const examScore = examInputScore;
			const portfolioScore = computePkpdPortfolioScore(
				portfolioMap[teacher.id] ?? null,
				category,
				isBiqTeacher,
			);
			const selfReview = selfReviewMap[teacher.id] ?? null;
			const teacherCriteriaTotal = getTeacherCriteriaTotal(selfReview);
			const hrSelfReviewScore = selfReview?.score ?? null;
			const bonus = achievementTotals[teacher.id] ?? 0;

			const completion = computePkpdCompletion(evaluationType, {
					studentScore,
					managementScore,
					selfScore,
					biqScore,
					examScore,
					portfolioScore,
				});
			const isComplete =
				completion.isComplete && Boolean(leadershipSummary?.isComplete);
			const currentEnteredScore = completion.currentEnteredScore;
			const baseTotalScore = completion.baseTotalScore;
			const extraScore = bonus;
			const finalScoreWithExtra = baseTotalScore + extraScore;

			return {
				teacherId: teacher.id,
				name: teacher.data.name,
				category,
				isBiqTeacher,
				evaluationType,
				assessmentResultLabel,
				studentScore,
				managementScore,
				leadershipSubmittedCount: leadershipSummary?.submittedCount ?? 0,
				leadershipEligibleCount: leadershipSummary?.eligibleCount ?? 0,
				leadershipComplete: leadershipSummary?.isComplete ?? false,
				leadershipOverridden: leadershipSummary?.isOverridden ?? false,
				branchManagerSubmitted: leadershipSummary?.branchManagerSubmitted ?? false,
				deputySubmitted: leadershipSummary?.deputySubmitted ?? false,
				departmentHeadSubmitted: leadershipSummary?.departmentHeadSubmitted ?? false,
				branchManagerEligible: leadershipSummary?.branchManagerEligible ?? false,
				deputyEligible: leadershipSummary?.deputyEligible ?? false,
				departmentHeadEligible: leadershipSummary?.departmentHeadEligible ?? false,
				selfScore,
				teacherCriteriaTotal,
				hrSelfReviewScore,
				biqAvg,
				computedBiqAvg,
				manualBiqAvg,
				biqAverageSource,
				biqScore,
				examScore,
				portfolioScore,
				extraScore,
				currentEnteredScore,
				isComplete,
				baseTotalScore,
				finalScoreWithExtra,
			};
		});
	}, [
		achievementTotals,
		assignmentByTeacher,
		biqMap,
		examMap,
		flowStats,
		leadershipCompletion,
		portfolioMap,
		selfReviewMap,
		teacherBiqAverageMap,
		teacherBiqMap,
		teachers,
	]);

	const biqPagination = usePagination(biqResults);
	const teacherBiqPagination = usePagination(teacherBiqResults);
	const teacherBiqAveragePagination = usePagination(biqTeachers);
	const examPagination = usePagination(examTeachers);
	const achievementPagination = usePagination(achievements);

	const formatPkpdCategory = (row: SummaryRow) =>
		row.baseTotalScore !== null ? pkpdBucket(row.baseTotalScore) : "Hesablama tamamlanmayıb";

	const formatPkpdDecision = (row: SummaryRow) =>
		row.baseTotalScore !== null ? pkpdDecision(row.baseTotalScore) : "Qərar verilməyib";

	const filteredSummaryRows = useMemo(() => {
		const query = summaryQuery.trim().toLocaleLowerCase("az");
		return summaryRows.filter((row) => {
			const statusInfo = getSummaryStatusInfo(row);
			if (summaryStatusFilter !== "all") {
				if (summaryStatusFilter === "complete" && !row.isComplete) return false;
				if (summaryStatusFilter === "incomplete" && row.isComplete) return false;
				if (summaryStatusFilter === "risk" && statusInfo.label !== "Risk qrupu")
					return false;
				if (
					summaryStatusFilter === "portfolio" &&
					statusInfo.label !== "Portfolio gözləyir"
				)
					return false;
				if (
					summaryStatusFilter === "leadership" &&
					statusInfo.label !== "Rəhbərlik səsi gözləyir"
				)
					return false;
			}
			if (!query) return true;
			return [
				row.name,
				evaluationTypeLabel(row.isBiqTeacher),
				statusInfo.label,
				row.baseTotalScore !== null ? pkpdBucket(row.baseTotalScore) : "Hesablama tamamlanmayıb",
			]
				.join(" ")
				.toLocaleLowerCase("az")
				.includes(query);
		});
	}, [summaryQuery, summaryRows, summaryStatusFilter]);

	const summaryTableColumns = useMemo<Array<DataTableColumn<SummaryRow>>>(
		() => [
			{
				key: "name",
				header: "Müəllim",
				sortValue: (row) => row.name,
				render: (row) => row.name,
			},
			{
				key: "model",
				header: "PKPD modeli",
				sortValue: (row) => evaluationTypeLabel(row.isBiqTeacher),
				render: (row) => (
					<StatusBadge tone={row.isBiqTeacher ? "info" : "accent"}>
						{evaluationTypeLabel(row.isBiqTeacher)}
					</StatusBadge>
				),
			},
			{
				key: "leadership",
				header: "Rəhbərlik səsi",
				sortValue: (row) => row.leadershipSubmittedCount,
				render: (row) => {
					const roleStatus = getLeadershipVoteRoleStatus(row);
					return (
						<div className="grid gap-1">
							<StatusBadge tone={row.leadershipComplete ? "success" : "warning"}>
								{row.leadershipSubmittedCount} / {row.leadershipEligibleCount}
							</StatusBadge>
							<div className="hint">{roleStatus.submittedText}</div>
							{!row.leadershipComplete && (
								<div className="hint font-semibold text-red-600 dark:text-red-300">
									{roleStatus.pendingText}
								</div>
							)}
						</div>
					);
				},
			},
			{
				key: "score",
				header: "PKPD yekun balı",
				sortValue: (row) => row.baseTotalScore ?? row.currentEnteredScore,
				render: (row) => formatScoreValue(row.baseTotalScore ?? row.currentEnteredScore),
			},
			{
				key: "bonus",
				header: "Əlavə bal",
				sortValue: (row) => row.extraScore,
				render: (row) => row.extraScore.toFixed(1),
			},
			{
				key: "stimulus",
				header: "Stimullaşdırıcı yekun",
				sortValue: (row) => row.finalScoreWithExtra,
				render: (row) => formatScoreValue(row.finalScoreWithExtra),
			},
			{
				key: "status",
				header: "Status",
				sortValue: (row) => getSummaryStatusInfo(row).label,
				render: (row) => {
					const statusInfo = getSummaryStatusInfo(row);
					return <StatusBadge tone={statusInfo.tone}>{statusInfo.label}</StatusBadge>;
				},
			},
			{
				key: "decision",
				header: "Qərar",
				sortValue: (row) => decisionLabel[(decisionDrafts[row.teacherId] ?? decisionMap[row.teacherId])?.status ?? "PENDING"],
				render: (row) => {
					const decision = decisionDrafts[row.teacherId] ?? decisionMap[row.teacherId] ?? null;
					return (
						<StatusBadge tone={decision?.status === "APPROVED" ? "success" : decision?.status === "REJECTED" ? "danger" : "neutral"}>
							{decisionLabel[decision?.status ?? "PENDING"]}
						</StatusBadge>
					);
				},
			},
			{
				key: "actions",
				header: "",
				render: (row) => (
					<div className="actions">
						<button
							className="btn"
							type="button"
							onClick={() => setSelectedSummaryTeacherId(row.teacherId)}
						>
							Detallar
						</button>
					</div>
				),
			},
		],
		[decisionDrafts, decisionMap],
	);
	const sortedSummaryRows = useMemo(
		() => sortData(filteredSummaryRows, summaryTableColumns, summarySort),
		[filteredSummaryRows, summarySort, summaryTableColumns],
	);
	const summaryPagination = usePagination(sortedSummaryRows);

	const selectedSummaryRow = useMemo(
		() =>
			selectedSummaryTeacherId
				? (summaryRows.find((row) => row.teacherId === selectedSummaryTeacherId) ?? null)
				: null,
		[selectedSummaryTeacherId, summaryRows],
	);
	const selectedSummaryFinalReview = selectedSummaryRow
		? (finalReviewMap[selectedSummaryRow.teacherId] ?? null)
		: null;
	useEffect(() => {
		setFinalReviewDraft(selectedSummaryFinalReview?.reviewText ?? "");
		setFinalRecommendationDraft(
			selectedSummaryFinalReview?.recommendationText ?? "",
		);
		setGeneratedFinalReviewDraft(null);
		setFinalReviewGeneratedAtDraft(
			selectedSummaryFinalReview?.generatedAt
				? String(selectedSummaryFinalReview.generatedAt)
				: null,
		);
		setFinalReviewStatus(null);
	}, [
		selectedSummaryFinalReview,
		selectedSummaryTeacherId,
		setFinalReviewStatus,
	]);
	const summaryByTeacherId = useMemo(
		() => Object.fromEntries(summaryRows.map((row) => [row.teacherId, row])),
		[summaryRows],
	);
	const selectedSummaryAssignments = selectedSummaryTeacherId
		? (assignmentByTeacher[selectedSummaryTeacherId] ?? [])
		: [];
	const selectedSummaryPortfolio =
		selectedSummaryRow ? (portfolioMap[selectedSummaryRow.teacherId] ?? null) : null;
	const selectedSummaryPortfolioLimits = selectedSummaryRow
		? getPkpdPortfolioLimits(
				selectedSummaryRow.category,
				selectedSummaryRow.isBiqTeacher,
			)
		: null;
	const teacherBiqEditAssignments = teacherBiqEditTeacherId
		? (assignmentByTeacher[teacherBiqEditTeacherId] ?? [])
		: [];
	const teacherBiqEditTeacher = teacherBiqEditTeacherId
		? (teacherMap[teacherBiqEditTeacherId] ?? null)
		: null;
	const selectedTeacherBiqEditAssignment = teacherBiqEditAssignments.find(
		(assignment) =>
			`${assignment.groupId}_${assignment.subjectId}` === teacherBiqEditAssignmentKey,
	);

	const refreshTeacherBiqResults = async () => {
		if (!branchId || !selectedCycleId) return;
		const { data } = await supabase
			.from("pkpd_teacher_biq_results")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("cycle_id", selectedCycleId)
			.eq("branch_id", branchId);
		setTeacherBiqResults(
			(data ?? []).map((row) => ({
				id: row.id,
				data: mapPkpdTeacherBiqResultRow(row),
			})),
		);
	};

	const refreshTeacherBiqAverages = async () => {
		if (!branchId || !selectedCycleId) return;
		const { data } = await supabase
			.from("pkpd_teacher_biq_averages")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("cycle_id", selectedCycleId)
			.eq("branch_id", branchId);
		const docs = (data ?? []).map((row) => ({
			id: row.id,
			data: mapPkpdTeacherBiqAverageRow(row),
		}));
		setTeacherBiqAverages(docs);
		setTeacherBiqAverageDrafts(
			Object.fromEntries(
				docs.map((row) => [
					row.data.teacherId,
					row.data.score !== null ? String(row.data.score) : "",
				]),
			),
		);
	};

	const openTeacherBiqEditForAssignment = (
		teacherId: string,
		groupId: string,
		subjectId: string,
	) => {
		const existingScore =
			teacherBiqMap[`${teacherId}_${groupId}_${subjectId}`]?.score;
		setTeacherBiqEditTeacherId(teacherId);
		setTeacherBiqEditAssignmentKey(`${groupId}_${subjectId}`);
		setTeacherBiqEditScore(
			existingScore === null || existingScore === undefined
				? ""
				: String(existingScore),
		);
	};

	const handleTeacherBiqEditAssignmentChange = (assignmentKey: string) => {
		if (!teacherBiqEditTeacherId) return;
		const assignment = (assignmentByTeacher[teacherBiqEditTeacherId] ?? []).find(
			(item) => `${item.groupId}_${item.subjectId}` === assignmentKey,
		);
		const existingScore = assignment
			? teacherBiqMap[
					`${teacherBiqEditTeacherId}_${assignment.groupId}_${assignment.subjectId}`
				]?.score
			: null;
		setTeacherBiqEditAssignmentKey(assignmentKey);
		setTeacherBiqEditScore(
			existingScore === null || existingScore === undefined
				? ""
				: String(existingScore),
		);
	};

	const handleSaveTeacherBiqAverage = async (teacherId: string) => {
		if (!branchId || !selectedCycleId) return;
		const raw = teacherBiqAverageDrafts[teacherId]?.trim();
		if (!raw) {
			setStatus("Boş BİQ ortalaması saxlanmadı; mövcud qeyd silinmədi");
			return;
		}

		const scoreValue = Number(raw.replace(",", "."));
		if (Number.isNaN(scoreValue) || scoreValue < 0 || scoreValue > 100) {
			setStatus("BİQ ortalaması 0-100 arası olmalıdır");
			return;
		}

		const { error } = await supabase.from("pkpd_teacher_biq_averages").upsert(
			{
				org_id: ORG_ID,
				branch_id: branchId,
				cycle_id: selectedCycleId,
				teacher_id: teacherId,
				score: scoreValue,
			},
			{ onConflict: "org_id,cycle_id,teacher_id" },
		);
		if (error) {
			setStatus("BİQ ortalaması saxlanmadı");
			return;
		}

		setStatus("BİQ ortalaması saxlanıldı");
		await refreshTeacherBiqAverages();
	};

	const handleSaveBiq = async () => {
		if (!branchId || !selectedCycleId) return;
		if (!biqGroupId || !biqSubjectId) {
			setStatus("Qrup və fənn seçin");
			return;
		}
		const scoreValue = Number(biqScore);
		if (Number.isNaN(scoreValue) || scoreValue < 0 || scoreValue > 100) {
			setStatus("BİQ balı 0-100 arası olmalıdır");
			return;
		}

		const { error } = await supabase.from("biq_class_results").upsert(
			{
				org_id: ORG_ID,
				branch_id: branchId,
				cycle_id: selectedCycleId,
				group_id: biqGroupId,
				subject_id: biqSubjectId,
				score: scoreValue,
			},
			{ onConflict: "org_id,branch_id,cycle_id,group_id,subject_id" },
		);
		if (error) {
			setStatus("BİQ nəticəsi saxlanmadı");
			return;
		}
		setBiqScore("");
		setStatus("BİQ nəticəsi saxlanıldı");
		const { data } = await supabase
			.from("biq_class_results")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("cycle_id", selectedCycleId)
			.eq("branch_id", branchId);
		setBiqResults(
			(data ?? []).map((row) => ({
				id: row.id,
				data: mapBiqClassResultRow(row),
			})),
		);
	};

	const handleImportBiq = async (file: File) => {
		if (!branchId || !selectedCycleId) return;
		const rows = await parseSpreadsheet(file);
		const prepared: Array<{
			org_id: string;
			branch_id: string;
			cycle_id: string;
			group_id: string;
			subject_id: string;
			score: number;
		}> = [];

		let missingGroup = 0;
		let missingSubject = 0;
		let invalidScore = 0;
		let emptyScore = 0;

		rows.forEach((row) => {
			const normalized: Record<string, string> = {};
			Object.entries(row).forEach(([key, value]) => {
				normalized[key.trim().toLowerCase()] = String(value ?? "").trim();
			});

			const groupRaw =
				normalized.group_id ||
				normalized.group ||
				normalized.group_name ||
				normalized.qrup ||
				normalized.sinif ||
				normalized.class;
			const subjectRaw =
				normalized.subject_id ||
				normalized.subject ||
				normalized.subject_name ||
				normalized.fenn ||
				normalized["fənn"] ||
				normalized.fen;
			const scoreRaw = normalized.score || normalized.biq || normalized.bal;
			if (String(scoreRaw ?? "").trim() === "") {
				emptyScore += 1;
				return;
			}

			const groupId =
				(groupRaw && groupMap[groupRaw]?.branchId ? groupRaw : null) ||
				(groupRaw ? (groupNameMap.get(groupRaw.toLowerCase()) ?? null) : null);
			if (!groupId) {
				missingGroup += 1;
				return;
			}

			const subjectId =
				(subjectRaw && subjectMap[subjectRaw] ? subjectRaw : null) ||
				(subjectRaw
					? (subjectNameMap.get(subjectRaw.toLowerCase()) ?? null)
					: null);
			if (!subjectId) {
				missingSubject += 1;
				return;
			}

			const numericScore = Number(String(scoreRaw ?? "").replace(",", "."));
			if (
				Number.isNaN(numericScore) ||
				numericScore < 0 ||
				numericScore > 100
			) {
				invalidScore += 1;
				return;
			}

			prepared.push({
				org_id: ORG_ID,
				branch_id: branchId,
				cycle_id: selectedCycleId,
				group_id: groupId,
				subject_id: subjectId,
				score: numericScore,
			});
		});

		if (prepared.length === 0) {
			setBiqImportStatus("Yüklənəcək düzgün sətir tapılmadı");
			return;
		}

		const chunks = chunkArray(prepared, 200);
		for (const chunk of chunks) {
			const { error } = await supabase.from("biq_class_results").upsert(chunk, {
				onConflict: "org_id,branch_id,cycle_id,group_id,subject_id",
			});
			if (error) {
				setBiqImportStatus("BİQ import zamanı xəta oldu");
				return;
			}
		}

		const { data } = await supabase
			.from("biq_class_results")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("cycle_id", selectedCycleId)
			.eq("branch_id", branchId);
		setBiqResults(
			(data ?? []).map((row) => ({
				id: row.id,
				data: mapBiqClassResultRow(row),
			})),
		);

		const report = `Yükləndi: ${prepared.length}. Boş bal: ${emptyScore}. Qrup tapılmadı: ${missingGroup}. Fənn tapılmadı: ${missingSubject}. Bal səhv: ${invalidScore}.`;
		setBiqImportStatus(report);
	};

	const handleSaveTeacherBiq = async () => {
		if (!branchId || !selectedCycleId) return;
		if (!teacherBiqTeacherId || !teacherBiqGroupId || !teacherBiqSubjectId) {
			setStatus("Müəllim, qrup və fənn seçin");
			return;
		}
		const assignmentKey = `${teacherBiqTeacherId}_${teacherBiqGroupId}_${teacherBiqSubjectId}`;
		if (!assignmentKeySet.has(assignmentKey)) {
			setStatus("Seçilən müəllim üçün bu qrup/fənn təyinatı yoxdur");
			return;
		}
		const scoreValue = Number(teacherBiqScore);
		if (Number.isNaN(scoreValue) || scoreValue < 0 || scoreValue > 100) {
			setStatus("BİQ balı 0-100 arası olmalıdır");
			return;
		}

		const { error } = await supabase.from("pkpd_teacher_biq_results").upsert(
			{
				org_id: ORG_ID,
				branch_id: branchId,
				cycle_id: selectedCycleId,
				teacher_id: teacherBiqTeacherId,
				group_id: teacherBiqGroupId,
				subject_id: teacherBiqSubjectId,
				score: scoreValue,
			},
			{
				onConflict:
					"org_id,branch_id,cycle_id,teacher_id,group_id,subject_id",
			},
		);
		if (error) {
			setStatus("Müəllim üzrə BİQ nəticəsi saxlanmadı");
			return;
		}
		setTeacherBiqScore("");
		setStatus("Müəllim üzrə BİQ nəticəsi saxlanıldı");
		await refreshTeacherBiqResults();
	};

	const handleSaveTeacherBiqEdit = async () => {
		if (
			!branchId ||
			!selectedCycleId ||
			!teacherBiqEditTeacherId ||
			!selectedTeacherBiqEditAssignment
		) {
			setStatus("Müəllim üçün dərs təyinatı seçin");
			return;
		}
		const scoreValue = Number(teacherBiqEditScore);
		if (Number.isNaN(scoreValue) || scoreValue < 0 || scoreValue > 100) {
			setStatus("BİQ balı 0-100 arası olmalıdır");
			return;
		}

		setTeacherBiqEditSaving(true);
		try {
			const { error } = await supabase.from("pkpd_teacher_biq_results").upsert(
				{
					org_id: ORG_ID,
					branch_id: branchId,
					cycle_id: selectedCycleId,
					teacher_id: teacherBiqEditTeacherId,
					group_id: selectedTeacherBiqEditAssignment.groupId,
					subject_id: selectedTeacherBiqEditAssignment.subjectId,
					score: scoreValue,
				},
				{
					onConflict:
						"org_id,branch_id,cycle_id,teacher_id,group_id,subject_id",
				},
			);
			if (error) throw error;
			await refreshTeacherBiqResults();
			setStatus(
				`${teacherBiqEditTeacher?.name ?? "Müəllim"} üçün BİQ balı saxlanıldı`,
			);
			setTeacherBiqEditTeacherId(null);
			setTeacherBiqEditAssignmentKey("");
			setTeacherBiqEditScore("");
		} catch (error) {
			setStatus(
				error instanceof Error
					? error.message
					: "Müəllim üzrə BİQ nəticəsi saxlanmadı",
			);
		} finally {
			setTeacherBiqEditSaving(false);
		}
	};

	const handleImportTeacherBiq = async (file: File) => {
		if (!branchId || !selectedCycleId) return;
		const rows = await parseSpreadsheet(file);
		const prepared: Array<{
			org_id: string;
			branch_id: string;
			cycle_id: string;
			teacher_id: string;
			group_id: string;
			subject_id: string;
			score: number;
		}> = [];

		let missingTeacher = 0;
		let missingGroup = 0;
		let missingSubject = 0;
		let missingAssignment = 0;
		let invalidScore = 0;
		let emptyScore = 0;

		rows.forEach((row) => {
			const normalized: Record<string, string> = {};
			Object.entries(row).forEach(([key, value]) => {
				normalized[key.trim().toLowerCase()] = String(value ?? "").trim();
			});

			const teacherRaw =
				normalized.teacher_id ||
				normalized.teacher ||
				normalized.teacher_name ||
				normalized.muellim ||
				normalized["müəllim"];
			const groupRaw =
				normalized.group_id ||
				normalized.group ||
				normalized.group_name ||
				normalized.qrup ||
				normalized.sinif ||
				normalized.class;
			const subjectRaw =
				normalized.subject_id ||
				normalized.subject ||
				normalized.subject_name ||
				normalized.fenn ||
				normalized["fənn"] ||
				normalized.fen;
			const scoreRaw = normalized.score || normalized.biq || normalized.bal;
			if (String(scoreRaw ?? "").trim() === "") {
				emptyScore += 1;
				return;
			}

			const teacherId =
				(teacherRaw && teacherMap[teacherRaw] ? teacherRaw : null) ||
				(teacherRaw
					? (teacherNameMap.get(teacherRaw.toLowerCase()) ?? null)
					: null);
			if (!teacherId) {
				missingTeacher += 1;
				return;
			}

			const groupId =
				(groupRaw && groupMap[groupRaw]?.branchId ? groupRaw : null) ||
				(groupRaw ? (groupNameMap.get(groupRaw.toLowerCase()) ?? null) : null);
			if (!groupId) {
				missingGroup += 1;
				return;
			}

			const subjectId =
				(subjectRaw && subjectMap[subjectRaw] ? subjectRaw : null) ||
				(subjectRaw
					? (subjectNameMap.get(subjectRaw.toLowerCase()) ?? null)
					: null);
			if (!subjectId) {
				missingSubject += 1;
				return;
			}

			const assignmentKey = `${teacherId}_${groupId}_${subjectId}`;
			if (!assignmentKeySet.has(assignmentKey)) {
				missingAssignment += 1;
				return;
			}

			const numericScore = Number(String(scoreRaw ?? "").replace(",", "."));
			if (
				Number.isNaN(numericScore) ||
				numericScore < 0 ||
				numericScore > 100
			) {
				invalidScore += 1;
				return;
			}

			prepared.push({
				org_id: ORG_ID,
				branch_id: branchId,
				cycle_id: selectedCycleId,
				teacher_id: teacherId,
				group_id: groupId,
				subject_id: subjectId,
				score: numericScore,
			});
		});

		if (prepared.length === 0) {
			setTeacherBiqImportStatus("Yüklənəcək düzgün sətir tapılmadı");
			return;
		}

		const chunks = chunkArray(prepared, 200);
		for (const chunk of chunks) {
			const { error } = await supabase
				.from("pkpd_teacher_biq_results")
				.upsert(chunk, {
					onConflict:
						"org_id,branch_id,cycle_id,teacher_id,group_id,subject_id",
				});
			if (error) {
				setTeacherBiqImportStatus("Müəllim üzrə BİQ import zamanı xəta oldu");
				return;
			}
		}

		const { data } = await supabase
			.from("pkpd_teacher_biq_results")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("cycle_id", selectedCycleId)
			.eq("branch_id", branchId);
		setTeacherBiqResults(
			(data ?? []).map((row) => ({
				id: row.id,
				data: mapPkpdTeacherBiqResultRow(row),
			})),
		);

		const report = `Yükləndi: ${prepared.length}. Boş bal: ${emptyScore}. Müəllim tapılmadı: ${missingTeacher}. Qrup tapılmadı: ${missingGroup}. Fənn tapılmadı: ${missingSubject}. Təyinat tapılmadı: ${missingAssignment}. Bal səhv: ${invalidScore}.`;
		setTeacherBiqImportStatus(report);
	};

	const handleDeleteBiq = async (id: string) => {
		if (!branchId || !selectedCycleId) return;
		await supabase
			.from("biq_class_results")
			.delete()
			.eq("org_id", ORG_ID)
			.eq("id", id);
		setBiqResults((prev) => prev.filter((item) => item.id !== id));
	};

	const handleDeleteTeacherBiq = async (id: string) => {
		if (!branchId || !selectedCycleId) return;
		await supabase
			.from("pkpd_teacher_biq_results")
			.delete()
			.eq("org_id", ORG_ID)
			.eq("id", id);
		setTeacherBiqResults((prev) => prev.filter((item) => item.id !== id));
	};

	const handleSaveExam = async (teacherId: string) => {
		if (!branchId || !selectedCycleId) return;
		const raw = examDrafts[teacherId];
		if (!raw || raw.trim() === "") {
			setStatus("Boş imtahan balı saxlanmadı; mövcud qeyd silinmədi");
			return;
		}
		const scoreValue = Number(raw);
		if (Number.isNaN(scoreValue) || scoreValue < 0 || scoreValue > 30) {
			setStatus("Attestasiya imtahanı balı 0-30 arası olmalıdır");
			return;
		}
		const { error } = await supabase.from("pkpd_exam_results").upsert(
			{
				org_id: ORG_ID,
				branch_id: branchId,
				cycle_id: selectedCycleId,
				teacher_id: teacherId,
				score: scoreValue,
			},
			{ onConflict: "org_id,cycle_id,teacher_id" },
		);
		if (error) {
			setStatus("Attestasiya imtahanı balı saxlanmadı");
			return;
		}
		const { data } = await supabase
			.from("pkpd_exam_results")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("cycle_id", selectedCycleId)
			.eq("branch_id", branchId);
		setExamResults(
			(data ?? []).map((row) => ({ id: row.id, data: mapPkpdExamRow(row) })),
		);
		setExamDrafts(
			Object.fromEntries(
				(data ?? []).map((row) => [
					row.teacher_id,
					row.score !== null && row.score !== undefined ? String(row.score) : "",
				]),
			),
		);
	};

	const handleImportExam = async (file: File) => {
		if (!branchId || !selectedCycleId) return;

		const rows = await parseSpreadsheet(file);
		const prepared: Array<{
			org_id: string;
			branch_id: string;
			cycle_id: string;
			teacher_id: string;
			score: number;
		}> = [];

		let missingTeacher = 0;
		let invalidScore = 0;

		rows.forEach((row) => {
			const normalized: Record<string, string> = {};
			Object.entries(row).forEach(([key, value]) => {
				normalized[key.trim().toLowerCase()] = String(value ?? "").trim();
			});

			const teacherRaw =
				normalized.teacher_id ||
				normalized.teacher ||
				normalized.teacher_name ||
				normalized.muellim ||
				normalized["müəllim"];
			const scoreRaw =
				normalized.score ||
				normalized.miq ||
				normalized.miq_score ||
				normalized.exam ||
				normalized.exam_score ||
				normalized.imtahan ||
				normalized.imtahan_bali ||
				normalized.attestasiya ||
				normalized.attestasiya_imtahani ||
				normalized.bal;

			const teacherId =
				(teacherRaw && teacherMap[teacherRaw] ? teacherRaw : null) ||
				(teacherRaw
					? (teacherNameMap.get(teacherRaw.toLowerCase()) ?? null)
					: null);
			if (!teacherId) {
				missingTeacher += 1;
				return;
			}

			const numericScore = Number(String(scoreRaw ?? "").replace(",", "."));
			if (
				Number.isNaN(numericScore) ||
				numericScore < 0 ||
				numericScore > 30
			) {
				invalidScore += 1;
				return;
			}

			prepared.push({
				org_id: ORG_ID,
				branch_id: branchId,
				cycle_id: selectedCycleId,
				teacher_id: teacherId,
				score: numericScore,
			});
		});

		if (prepared.length === 0) {
			setExamImportStatus("Yüklənəcək düzgün sətir tapılmadı");
			return;
		}

		const chunks = chunkArray(prepared, 200);
		for (const chunk of chunks) {
			const { error } = await supabase.from("pkpd_exam_results").upsert(chunk, {
				onConflict: "org_id,cycle_id,teacher_id",
			});
			if (error) {
				setExamImportStatus("Attestasiya imtahanı import zamanı xəta oldu");
				return;
			}
		}

		const { data } = await supabase
			.from("pkpd_exam_results")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("cycle_id", selectedCycleId)
			.eq("branch_id", branchId);
		const examDocs = (data ?? []).map((row) => ({
			id: row.id,
			data: mapPkpdExamRow(row),
		}));
		setExamResults(examDocs);
		setExamDrafts(
			Object.fromEntries(
				examDocs.map((row) => [
					row.data.teacherId,
					row.data.score !== null && row.data.score !== undefined
						? String(row.data.score)
						: "",
				]),
			),
		);

		setExamImportStatus(
			`Yükləndi: ${prepared.length}. Müəllim tapılmadı: ${missingTeacher}. Bal səhv: ${invalidScore}.`,
		);
	};

	const loadPortfolioForTeacher = (teacherId: string) => {
		if (!teacherId) {
			setPortfolioTeacherId("");
			setPortfolioEducation("");
			setPortfolioAttendance("");
			setPortfolioTraining("");
			setPortfolioOlympiad("");
			setPortfolioEvents("");
			setPortfolioNote("");
			return;
		}
		const portfolio = portfolioMap[teacherId];
		setPortfolioTeacherId(teacherId);
		setPortfolioEducation(portfolio?.educationScore?.toString() ?? "");
		setPortfolioAttendance(portfolio?.attendanceScore?.toString() ?? "");
		setPortfolioTraining(portfolio?.trainingScore?.toString() ?? "");
		setPortfolioOlympiad(portfolio?.olympiadScore?.toString() ?? "");
		setPortfolioEvents(portfolio?.eventsScore?.toString() ?? "");
		setPortfolioNote(portfolio?.note ?? "");
	};

	const loadSelfReviewForTeacher = (teacherId: string) => {
		if (!teacherId) {
			setSelfReviewTeacherId("");
			setSelfReviewNote("");
			setSelfReviewEditUnlocked(false);
			setSelfReviewUnlockOpen(false);
			setSelfReviewUnlockPassword("");
			setSelfReviewUnlockReason("");
			setSelfReviewUnlockError(null);
			setSelfReviewUnlockSubmitting(false);
			return;
		}

		const review = selfReviewMap[teacherId];
		setSelfReviewTeacherId(teacherId);
		setSelfReviewNote(review?.note ?? "");
		setSelfReviewEditUnlocked(false);
		setSelfReviewUnlockOpen(false);
		setSelfReviewUnlockPassword("");
		setSelfReviewUnlockReason("");
		setSelfReviewUnlockError(null);
		setSelfReviewUnlockSubmitting(false);
	};

	const handleRequestSelfReviewEdit = () => {
		setSelfReviewUnlockPassword("");
		setSelfReviewUnlockReason("");
		setSelfReviewUnlockError(null);
		setSelfReviewUnlockOpen(true);
	};

	const handleUnlockSelfReviewEdit = async () => {
		if (!user?.email) {
			setSelfReviewUnlockError("Hesab email-i tapılmadı. Yenidən daxil olun.");
			return;
		}
		if (!selfReviewUnlockPassword.trim()) {
			setSelfReviewUnlockError("Admin şifrəsini daxil edin.");
			return;
		}
		if (!selfReviewUnlockReason.trim()) {
			setSelfReviewUnlockError("Düzəliş səbəbini yazın.");
			return;
		}

		setSelfReviewUnlockSubmitting(true);
		setSelfReviewUnlockError(null);

		const { error } = await supabase.auth.signInWithPassword({
			email: user.email,
			password: selfReviewUnlockPassword,
		});
		if (error) {
			setSelfReviewUnlockError("Şifrə yanlışdır.");
			setSelfReviewUnlockSubmitting(false);
			return;
		}

		setSelfReviewEditUnlocked(true);
		setSelfReviewUnlockOpen(false);
		setSelfReviewUnlockPassword("");
		setSelfReviewUnlockError(null);
		setStatus("Düzəliş üçün sahələr açıldı.");
		setSelfReviewUnlockSubmitting(false);
	};

	const handleSavePortfolio = async () => {
		if (!branchId || !selectedCycleId || !portfolioTeacherId) return;
		const teacher = teacherMap[portfolioTeacherId];
		const limits = getPkpdPortfolioLimits(
			teacher?.category,
			teacher ? getIsBiqTeacher(teacher) : undefined,
		);

		const educationValue = toNumber(portfolioEducation);
		const attendanceValue = toNumber(portfolioAttendance);
		const trainingValue = toNumber(portfolioTraining);
		const olympiadValue = toNumber(portfolioOlympiad);
		const eventsValue = toNumber(portfolioEvents);

		if (
			(educationValue !== null && educationValue > limits.education) ||
			(attendanceValue !== null && attendanceValue > limits.attendance) ||
			(trainingValue !== null && trainingValue > limits.training) ||
			(olympiadValue !== null && olympiadValue > limits.olympiad) ||
			(eventsValue !== null && eventsValue > limits.events)
		) {
			setStatus("Portfolio balları kateqoriyanın limitlərini aşır");
			return;
		}

		const payload = {
			org_id: ORG_ID,
			branch_id: branchId,
			cycle_id: selectedCycleId,
			teacher_id: portfolioTeacherId,
			education_score: educationValue,
			attendance_score: attendanceValue,
			training_score: trainingValue,
			olympiad_score: olympiadValue,
			events_score: eventsValue,
			note: portfolioNote.trim() || null,
		};
		const { error } = await supabase.from("pkpd_portfolios").upsert(payload, {
			onConflict: "org_id,cycle_id,teacher_id",
		});
		if (error) {
			setStatus("Portfolio saxlanmadı");
			return;
		}
		const { data } = await supabase
			.from("pkpd_portfolios")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("cycle_id", selectedCycleId)
			.eq("branch_id", branchId);
		setPortfolios(
			(data ?? []).map((row) => ({
				id: row.id,
				data: mapPkpdPortfolioRow(row),
			})),
		);
		setStatus("Portfolio saxlanıldı");
	};

	const handleSaveSelfReview = async () => {
		if (!branchId || !selectedCycleId || !selfReviewTeacherId) return;
		if (selectedTeacherSelfReviewLocked) {
			setStatus(
				"Bu qiymətləndirmə kilidlənib. Düzəliş üçün admin şifrəsi tələb olunur.",
			);
			return;
		}

		const noteValue = selfReviewNote.trim() || null;

		if (!noteValue) {
			setStatus("Boş HR qeydi saxlanmadı; mövcud qeyd silinmədi");
			return;
		}

		const existingQuestionScores =
			selfReviewMap[selfReviewTeacherId]?.questionScores ?? null;
		const editReason = selectedTeacherHasSavedSelfReview
			? selfReviewUnlockReason.trim()
			: null;
		const payload = {
			org_id: ORG_ID,
			branch_id: branchId,
			cycle_id: selectedCycleId,
			teacher_id: selfReviewTeacherId,
			question_scores: existingQuestionScores,
			note:
				selectedTeacherHasSavedSelfReview && editReason
					? buildPkpdSelfReviewNote(noteValue, existingQuestionScores, editReason)
					: noteValue,
			reviewed_by: user?.id ?? null,
			reviewed_at: new Date().toISOString(),
		};

		let { error } = await supabase.from("pkpd_self_reviews").upsert(payload, {
			onConflict: "org_id,cycle_id,teacher_id",
		});
		if (error && isPkpdSelfReviewQuestionScoresError(error.message)) {
			const fallbackPayload = {
				...payload,
				note: buildPkpdSelfReviewNote(
					noteValue,
					existingQuestionScores,
					editReason,
				),
			};
			delete (
				fallbackPayload as {
					question_scores?: Record<string, number | null> | null;
				}
			).question_scores;

			const fallbackResult = await supabase
				.from("pkpd_self_reviews")
				.upsert(fallbackPayload, {
					onConflict: "org_id,cycle_id,teacher_id",
				});
			error = fallbackResult.error;
		}
		if (error) {
			setStatus(
				`HR qiymətləndirməsi saxlanmadı: ${error.message ?? "naməlum xəta"}`,
			);
			return;
		}

		const { data } = await supabase
			.from("pkpd_self_reviews")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("cycle_id", selectedCycleId)
			.eq("branch_id", branchId);
		setSelfReviews(
			(data ?? []).map((row) => ({
				id: row.id,
				data: mapPkpdSelfReviewRow(row),
			})),
		);
		setStatus("HR qiymətləndirməsi saxlanıldı");
		setSelfReviewEditUnlocked(false);
		setSelfReviewUnlockReason("");
	};

	const handleAddAchievement = async () => {
		if (!branchId || !selectedCycleId) return;
		if (!achievementTeacherId || !achievementType.trim()) {
			setStatus("Müəllim və növ seçin");
			return;
		}
		const pointsValue = Number(achievementPoints);
		if (Number.isNaN(pointsValue) || pointsValue < 0 || pointsValue > 10) {
			setStatus("Bonus balı 0-10 arası olmalıdır");
			return;
		}
		const { error } = await supabase.from("pkpd_achievements").insert({
			org_id: ORG_ID,
			branch_id: branchId,
			cycle_id: selectedCycleId,
			teacher_id: achievementTeacherId,
			type: achievementType.trim(),
			points: pointsValue,
			note: achievementNote.trim() || null,
		});
		if (error) {
			setStatus("Bonus saxlanmadı");
			return;
		}
		setAchievementType("");
		setAchievementPoints("");
		setAchievementNote("");
		const { data } = await supabase
			.from("pkpd_achievements")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("cycle_id", selectedCycleId)
			.eq("branch_id", branchId);
		setAchievements(
			(data ?? []).map((row) => ({
				id: row.id,
				data: mapPkpdAchievementRow(row),
			})),
		);
		setStatus("Bonus əlavə edildi");
	};

	const handleDeleteAchievement = async (id: string) => {
		await supabase
			.from("pkpd_achievements")
			.delete()
			.eq("org_id", ORG_ID)
			.eq("id", id);
		setAchievements((prev) => prev.filter((item) => item.id !== id));
	};

	const handleGenerateFinalReview = async () => {
		if (!selectedCycleId || !selectedSummaryRow) return;
		if (
			selectedSummaryFinalReview &&
			!window.confirm(
				"Mövcud rəy yenidən hazırlanacaq. Davam etmək istəyirsiniz?",
			)
		) {
			return;
		}

		const generatedReview = buildRuleBasedPkpdFinalReview({
			isComplete: selectedSummaryRow.isComplete,
			baseTotalScore: selectedSummaryRow.baseTotalScore,
			currentEnteredScore: selectedSummaryRow.currentEnteredScore,
			leadershipComplete: selectedSummaryRow.leadershipComplete,
			missingFields: getMissingSummaryScoreLabels(selectedSummaryRow),
			components: getFinalReviewComponents(selectedSummaryRow),
		});
		const generatedAt = new Date().toISOString();
		setFinalReviewDraft(generatedReview.reviewText);
		setFinalRecommendationDraft(generatedReview.recommendationText);
		setGeneratedFinalReviewDraft(generatedReview);
		setFinalReviewGeneratedAtDraft(generatedAt);
		setFinalReviewStatus(
			"Rəy hazırlandı. Yoxlayıb redaktə etdikdən sonra Saxla düyməsinə klik edin.",
		);

		const { error } = await supabase.rpc("log_pkpd_final_review_generation", {
			p_cycle_id: selectedCycleId,
			p_teacher_id: selectedSummaryRow.teacherId,
			p_action: selectedSummaryFinalReview ? "REGENERATED" : "GENERATED",
			p_after: {
				review_text: generatedReview.reviewText,
				recommendation_text: generatedReview.recommendationText,
			},
		});
		if (error) {
			console.warn("PKPD final review generation audit failed", error);
		}
	};

	const handleSaveFinalReview = async () => {
		if (!branchId || !selectedCycleId || !selectedSummaryRow) return;
		const reviewText = finalReviewDraft.trim();
		const recommendationText = finalRecommendationDraft.trim();
		if (!reviewText || !recommendationText) {
			setFinalReviewStatus("Rəy və tövsiyə mətnlərini daxil edin.");
			return;
		}

		const changedFromGenerated =
			generatedFinalReviewDraft !== null &&
			(generatedFinalReviewDraft.reviewText !== reviewText ||
				generatedFinalReviewDraft.recommendationText !== recommendationText);
		const changedFromSaved =
			selectedSummaryFinalReview !== null &&
			(selectedSummaryFinalReview.reviewText !== reviewText ||
				selectedSummaryFinalReview.recommendationText !== recommendationText);
		const payload = {
			org_id: ORG_ID,
			branch_id: branchId,
			cycle_id: selectedCycleId,
			teacher_id: selectedSummaryRow.teacherId,
			review_text: reviewText,
			recommendation_text: recommendationText,
			generated_by: generatedFinalReviewDraft
				? (user?.id ?? null)
				: (selectedSummaryFinalReview?.generatedBy ?? null),
			generated_at:
				finalReviewGeneratedAtDraft ??
				(selectedSummaryFinalReview?.generatedAt
					? String(selectedSummaryFinalReview.generatedAt)
					: null),
			updated_by: user?.id ?? null,
			updated_at: new Date().toISOString(),
			is_manual_edited: generatedFinalReviewDraft
				? changedFromGenerated
				: selectedSummaryFinalReview
					? Boolean(selectedSummaryFinalReview.isManualEdited) ||
						changedFromSaved
					: true,
		};
		const { data, error } = await supabase
			.from("pkpd_final_reviews")
			.upsert(payload, { onConflict: "org_id,cycle_id,teacher_id" })
			.select("*")
			.single();
		if (error || !data) {
			setFinalReviewStatus(
				`Yekun rəy saxlanmadı: ${error?.message ?? "naməlum xəta"}`,
			);
			return;
		}

		const mappedReview = mapPkpdFinalReviewRow(data);
		setFinalReviews((previous) => [
			...previous.filter((item) => item.data.teacherId !== mappedReview.teacherId),
			{ id: data.id, data: mappedReview },
		]);
		setGeneratedFinalReviewDraft(null);
		setFinalReviewStatus("Yekun rəy və tövsiyə saxlanıldı.");
	};

	const handleSaveDecision = async (teacherId: string) => {
		if (!branchId || !selectedCycleId) return;
		const draft = decisionDrafts[teacherId] ?? { status: "PENDING", note: "" };
		const summary = summaryRows.find((row) => row.teacherId === teacherId);
		const payload = {
			org_id: ORG_ID,
			branch_id: branchId,
			cycle_id: selectedCycleId,
			teacher_id: teacherId,
			status: draft.status,
			note: draft.note.trim() || null,
			total_score: summary?.baseTotalScore ?? null,
			category:
				summary?.baseTotalScore === null || summary?.baseTotalScore === undefined
					? null
					: pkpdBucket(summary.baseTotalScore),
			decided_by: user?.id ?? null,
			decided_at: new Date().toISOString(),
		};

		const { error } = await supabase.from("pkpd_decisions").upsert(payload, {
			onConflict: "org_id,cycle_id,teacher_id",
		});
		if (error) {
			setStatus("Qərar saxlanmadı");
			return;
		}
		const { data } = await supabase
			.from("pkpd_decisions")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("cycle_id", selectedCycleId)
			.eq("branch_id", branchId);
		setDecisions(
			(data ?? []).map((row) => ({
				id: row.id,
				data: mapPkpdDecisionRow(row),
			})),
		);
		setStatus("Qərar saxlanıldı");
	};

	const handleLeadershipOverride = async (teacherId: string, enabled: boolean) => {
		if (!selectedCycleId) return;
		const { error } = await supabase.rpc("set_leadership_completion_override", {
			p_cycle_id: selectedCycleId,
			p_teacher_id: teacherId,
			p_enabled: enabled,
			p_note: enabled ? "Cari verilmiş rəhbərlik səsləri əsasında yekunlaşdırıldı." : null,
		});
		if (error) {
			setStatus(error.message);
			return;
		}
		setLeadershipCompletion((previous) => {
			const row = previous[teacherId];
			if (!row) return previous;
			return {
				...previous,
				[teacherId]: {
					...row,
					isOverridden: enabled,
					isComplete:
						row.eligibleCount > 0 &&
						(row.submittedCount >= row.eligibleCount ||
							(enabled && row.submittedCount > 0)),
				},
			};
		});
		setStatus(enabled ? "Rəhbərlik səsi yekunlaşdırıldı." : "Yekunlaşdırma ləğv edildi.");
	};

	const scoredSummaryRows = summaryRows.filter((row) => row.baseTotalScore !== null);
	const averageSummaryScore =
		scoredSummaryRows.length > 0
			? scoredSummaryRows.reduce(
					(sum, row) => sum + (row.baseTotalScore ?? 0),
					0,
				) / scoredSummaryRows.length
			: null;

	return (
		<div className="panel">
			<PageHeader
				eyebrow="PKPD idarəetməsi"
				title="PKPD"
				description="Müəllimlərin cari ballarını, portfolio göstəricilərini və yekun qərarlarını idarə edin."
				actions={
					<>
					{isSuperAdmin && (
						<BranchSelector
							branchId={branchId}
							branches={branches}
							onChange={setBranchId}
						/>
					)}
					<label className="field">
						<span className="label">Sorğu dövrü</span>
						<select
							className="input"
							value={selectedCycleId}
							onChange={(event) => setSelectedCycleId(event.target.value)}
						>
							<option value="">Sorğu dövrü seçin</option>
							{cycles.map((cycleItem) => (
								<option key={cycleItem.id} value={cycleItem.id}>
									{cycleItem.data.year} ({cycleItem.data.status})
								</option>
							))}
						</select>
					</label>
					</>
				}
				meta={
					<>
						<StatusBadge tone="neutral">Müəllim: {summaryRows.length}</StatusBadge>
						<StatusBadge tone="success">
							Tamamlanıb: {summaryRows.filter((row) => row.isComplete).length}
						</StatusBadge>
						<StatusBadge tone="warning">
							Gözləyir: {summaryRows.filter((row) => !row.isComplete).length}
						</StatusBadge>
					</>
				}
			/>

						{status && <div className="notice">{status}</div>}

			<div className="grid three">
				<StatCard
					tone="neutral"
					icon="MT"
					label="Ümumi müəllim sayı"
					value={summaryRows.length}
					meta={`dövr: ${cycleYear}`}
				/>
				<StatCard
					tone="success"
					icon="OK"
					label="Tamamlanan qiymətləndirmələr"
					value={summaryRows.filter((row) => row.isComplete).length}
					meta="yekun PKPD balı formalaşıb"
				/>
				<StatCard
					tone="warning"
					icon="ID"
					label="Tamamlanmayan qiymətləndirmələr"
					value={summaryRows.filter((row) => !row.isComplete).length}
					meta="daxil edilməmiş sahələr var"
				/>
				<StatCard
					tone="info"
					icon="PK"
					label="Orta PKPD balı"
					value={formatScoreValue(averageSummaryScore)}
					meta="daxil edilmiş nəticələr üzrə"
				/>
				<StatCard
					tone="accent"
					icon="PF"
					label="Portfolio daxil edilməyənlər"
					value={summaryRows.filter((row) => isMissingScore(row.portfolioScore)).length}
					meta="portfolio cəmi boş olanlar"
				/>
				<StatCard
					tone="danger"
					icon="RS"
					label="Risk qrupu"
					value={
						summaryRows.filter((row) => row.baseTotalScore !== null && row.baseTotalScore < 60)
							.length
					}
					meta="yekun balı 60-dan aşağı"
				/>
			</div>

			<Tabs defaultValue="inputs" className="stack">
				<div className="card">
					<div className="section-header">
						<div>
							<div className="section-kicker">PKPD idarəetməsi</div>
							<h3 className="section-title">Bölmələr</h3>
						</div>
						<TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
							<TabsTrigger value="inputs">Bal girişləri</TabsTrigger>
							<TabsTrigger value="summary">Yekun cədvəl</TabsTrigger>
							<TabsTrigger value="self-review">Özünüqiymətləndirmə</TabsTrigger>
						</TabsList>
					</div>
				</div>

				<TabsContent value="inputs" className="stack">
					<div className="card">
						<h3>BİQ nəticələri (sinif + fənn)</h3>
						<div className="form-row">
							<select
								className="input"
								value={biqGroupId}
								onChange={(event) => setBiqGroupId(event.target.value)}
							>
								<option value="">Qrup</option>
								{groups.map((group) => (
									<option key={group.id} value={group.id}>
										{group.data.name} ({group.data.classLevel})
									</option>
								))}
							</select>
							<select
								className="input"
								value={biqSubjectId}
								onChange={(event) => setBiqSubjectId(event.target.value)}
							>
								<option value="">Fənn</option>
								{subjects.map((subject) => (
									<option key={subject.id} value={subject.id}>
										{subject.data.name}
									</option>
								))}
							</select>
						</div>
						<div className="form-row">
							<input
								className="input"
								type="number"
								placeholder="BİQ balı (0-100)"
								value={biqScore}
								onChange={(event) => setBiqScore(event.target.value)}
							/>
							<button
								className="btn primary"
								type="button"
								onClick={handleSaveBiq}
								disabled={!selectedCycleId}
							>
								Saxla
							</button>
						</div>
						<div className="form-row">
							<input
								className="input"
								type="file"
								accept=".csv,.xlsx"
								onChange={(event) => {
									const file = event.target.files?.[0];
									if (file) void handleImportBiq(file);
								}}
							/>
							<span className="hint">Şablon: group/qrup, subject/fənn, score/biq/bal</span>
						</div>
						{biqImportStatus && <div className="notice">{biqImportStatus}</div>}
						<div className="data-table">
							<div className="data-row header">
								<div>Qrup</div>
								<div>Fənn</div>
								<div>Bal</div>
								<div></div>
							</div>
							{biqPagination.paginatedItems.map((item) => (
								<div className="data-row" key={item.id}>
									<div>{groupMap[item.data.groupId]?.name ?? item.data.groupId}</div>
									<div>{subjectMap[item.data.subjectId]?.name ?? item.data.subjectId}</div>
									<div>{item.data.score}</div>
									<div className="actions">
										<button className="btn ghost" type="button" onClick={() => void handleDeleteBiq(item.id)}>
											Sil
										</button>
									</div>
								</div>
							))}
							{biqResults.length === 0 && <div className="empty">Məlumat yoxdur.</div>}
						</div>
						{biqResults.length > 0 && (
							<PaginationControls
								totalItems={biqPagination.totalItems}
								page={biqPagination.page}
								pageSize={biqPagination.pageSize}
								onPageChange={biqPagination.setPage}
								onPageSizeChange={(nextSize) => {
									biqPagination.setPageSize(nextSize);
									biqPagination.setPage(1);
								}}
							/>
						)}
					</div>

					<div className="card">
						<h3>Müəllim üzrə BİQ nəticələri (override)</h3>
						<div className="form-row">
							<select className="input" value={teacherBiqTeacherId} onChange={(event) => setTeacherBiqTeacherId(event.target.value)}>
								<option value="">Müəllim</option>
								{teachers.map((teacher) => (
									<option key={teacher.id} value={teacher.id}>{teacher.data.name}</option>
								))}
							</select>
							<select className="input" value={teacherBiqGroupId} onChange={(event) => setTeacherBiqGroupId(event.target.value)}>
								<option value="">Qrup</option>
								{groups.map((group) => (
									<option key={group.id} value={group.id}>{group.data.name} ({group.data.classLevel})</option>
								))}
							</select>
							<select className="input" value={teacherBiqSubjectId} onChange={(event) => setTeacherBiqSubjectId(event.target.value)}>
								<option value="">Fənn</option>
								{subjects.map((subject) => (
									<option key={subject.id} value={subject.id}>{subject.data.name}</option>
								))}
							</select>
						</div>
						<div className="form-row">
							<input className="input" type="number" placeholder="BİQ balı (0-100)" value={teacherBiqScore} onChange={(event) => setTeacherBiqScore(event.target.value)} />
							<button className="btn primary" type="button" onClick={handleSaveTeacherBiq} disabled={!selectedCycleId}>Saxla</button>
						</div>
						<div className="form-row">
							<input
								className="input"
								type="file"
								accept=".csv,.xlsx"
								onChange={(event) => {
									const file = event.target.files?.[0];
									if (file) void handleImportTeacherBiq(file);
								}}
							/>
							<span className="hint">Şablon: teacher/teacher_id, group/qrup, subject/fənn, score/biq/bal</span>
						</div>
						{teacherBiqImportStatus && <div className="notice">{teacherBiqImportStatus}</div>}
						<div className="data-table">
							<div className="data-row header">
								<div>Müəllim</div>
								<div>Qrup</div>
								<div>Fənn</div>
								<div>Bal</div>
								<div></div>
							</div>
							{teacherBiqPagination.paginatedItems.map((item) => (
								<div className="data-row" key={item.id}>
									<div>{teacherMap[item.data.teacherId]?.name ?? item.data.teacherId}</div>
									<div>{groupMap[item.data.groupId]?.name ?? item.data.groupId}</div>
									<div>{subjectMap[item.data.subjectId]?.name ?? item.data.subjectId}</div>
									<div>{item.data.score}</div>
									<div className="actions">
										<button
											className="btn"
											type="button"
											onClick={() =>
												openTeacherBiqEditForAssignment(
													item.data.teacherId,
													item.data.groupId,
													item.data.subjectId,
												)
											}
										>
											Redaktə
										</button>
										<button className="btn ghost" type="button" onClick={() => void handleDeleteTeacherBiq(item.id)}>Sil</button>
									</div>
								</div>
							))}
							{teacherBiqResults.length === 0 && <div className="empty">Məlumat yoxdur.</div>}
						</div>
						{teacherBiqResults.length > 0 && (
							<PaginationControls
								totalItems={teacherBiqPagination.totalItems}
								page={teacherBiqPagination.page}
								pageSize={teacherBiqPagination.pageSize}
								onPageChange={teacherBiqPagination.setPage}
								onPageSizeChange={(nextSize) => {
									teacherBiqPagination.setPageSize(nextSize);
									teacherBiqPagination.setPage(1);
								}}
							/>
						)}
					</div>

					<div className="card">
						<div className="section-header">
							<div>
								<h3>Müəllim üzrə BİQ ortalaması</h3>
								<p className="hint">
									Hazır ortalama varsa buraya 0-100 arası yazın. Bu xana doludursa,
									yekun hesablamada qrup/fənn ortalamasından üstün götürülür.
								</p>
							</div>
							<div className="stat-pill">Cəmi: {biqTeachers.length}</div>
						</div>
						<div className="data-table">
							<div className="data-row header">
								<div>Müəllim</div>
								<div>BİQ ortalaması</div>
								<div>Mənbə</div>
								<div></div>
							</div>
							{teacherBiqAveragePagination.paginatedItems.map((teacher) => {
								const summary = summaryByTeacherId[teacher.id];
								const sourceText =
									summary?.biqAverageSource === "manual"
										? "Manual"
										: summary?.biqAverageSource === "computed"
											? "Qrup/fənn"
											: "Yoxdur";
								return (
									<div className="data-row" key={teacher.id}>
										<div>{teacher.data.name}</div>
										<div>
											<input
												className="input"
												type="number"
												min="0"
												max="100"
												step="0.01"
												placeholder={
													summary?.computedBiqAvg !== null &&
													summary?.computedBiqAvg !== undefined
														? `Hesablanan: ${formatScoreValue(summary.computedBiqAvg)}`
														: "0-100"
												}
												value={teacherBiqAverageDrafts[teacher.id] ?? ""}
												onChange={(event) =>
													setTeacherBiqAverageDrafts((prev) => ({
														...prev,
														[teacher.id]: event.target.value,
													}))
												}
											/>
										</div>
										<div>
											<div>{sourceText}</div>
											<div className="hint">
												Yekun orta: {formatScoreValue(summary?.biqAvg ?? null)}
											</div>
										</div>
										<div className="actions">
											<button
												className="btn"
												type="button"
												onClick={() => void handleSaveTeacherBiqAverage(teacher.id)}
											>
												Saxla
											</button>
										</div>
									</div>
								);
							})}
							{biqTeachers.length === 0 && (
								<div className="empty">BİQ ortalaması üçün müəllim yoxdur.</div>
							)}
						</div>
						{biqTeachers.length > 0 && (
							<PaginationControls
								totalItems={teacherBiqAveragePagination.totalItems}
								page={teacherBiqAveragePagination.page}
								pageSize={teacherBiqAveragePagination.pageSize}
								onPageChange={teacherBiqAveragePagination.setPage}
								onPageSizeChange={(nextSize) => {
									teacherBiqAveragePagination.setPageSize(nextSize);
									teacherBiqAveragePagination.setPage(1);
								}}
							/>
						)}
					</div>

					<div className="card">
						<div className="section-header">
							<div>
								<h3>Attestasiya imtahanı (0-30)</h3>
								<p className="hint">Attestasiyada iştirak edən müəllimlər üçün imtahan balı.</p>
							</div>
							<div className="stat-pill">Cəmi: {examTeachers.length}</div>
						</div>
						<div className="form-row">
							<input
								className="input"
								type="file"
								accept=".csv,.xlsx"
								onChange={(event) => {
									const file = event.target.files?.[0];
									if (file) void handleImportExam(file);
								}}
							/>
							<span className="hint">Şablon: teacher/teacher_id, score/exam/imtahan/bal</span>
						</div>
						{examImportStatus && <div className="notice">{examImportStatus}</div>}
						<div className="data-table">
							<div className="data-row header"><div>Müəllim</div><div>Bal</div><div></div></div>
							{examPagination.paginatedItems.map((teacher) => (
								<div className="data-row" key={teacher.id}>
									<div>{teacher.data.name}</div>
									<div>
										<input
											className="input"
											type="number"
											min="0"
											max="30"
											value={examDrafts[teacher.id] ?? ""}
											onChange={(event) =>
												setExamDrafts((prev) => ({
													...prev,
													[teacher.id]: event.target.value,
												}))
											}
										/>
									</div>
									<div className="actions"><button className="btn" type="button" onClick={() => void handleSaveExam(teacher.id)}>Saxla</button></div>
								</div>
							))}
							{examTeachers.length === 0 && <div className="empty">Attestasiya imtahanı üçün müəllim yoxdur.</div>}
						</div>
						{examTeachers.length > 0 && (
							<PaginationControls
								totalItems={examPagination.totalItems}
								page={examPagination.page}
								pageSize={examPagination.pageSize}
								onPageChange={examPagination.setPage}
								onPageSizeChange={(nextSize) => {
									examPagination.setPageSize(nextSize);
									examPagination.setPage(1);
								}}
							/>
						)}
					</div>

					<div className="card">
						<h3>Portfolio (bal + qeyd)</h3>
						<div className="form-row">
							<select className="input" value={portfolioTeacherId} onChange={(event) => loadPortfolioForTeacher(event.target.value)}>
								<option value="">Müəllim seçin</option>
								{teachers.map((teacher) => (
									<option key={teacher.id} value={teacher.id}>
										{teacher.data.name} ({teacherCategoryLabel(teacher.data.category)})
									</option>
								))}
							</select>
						</div>
						{portfolioTeacherId && (
							<>
								<div className="form-grid">
									<input className="input" type="number" placeholder={`Təhsil pilləsi (max ${portfolioMax.education})`} value={portfolioEducation} onChange={(event) => setPortfolioEducation(event.target.value)} />
									<input className="input" type="number" placeholder={`Davamiyyət (max ${portfolioMax.attendance})`} value={portfolioAttendance} onChange={(event) => setPortfolioAttendance(event.target.value)} />
									<input className="input" type="number" placeholder={`Təlim/nəşr (max ${portfolioMax.training})`} value={portfolioTraining} onChange={(event) => setPortfolioTraining(event.target.value)} />
									<input className="input" type="number" placeholder={`Olimpiada (max ${portfolioMax.olympiad})`} value={portfolioOlympiad} onChange={(event) => setPortfolioOlympiad(event.target.value)} />
									<input className="input" type="number" placeholder={`Tədbir/layihə (max ${portfolioMax.events})`} value={portfolioEvents} onChange={(event) => setPortfolioEvents(event.target.value)} />
								</div>
								<div className="notice">
									Portfolio cəmi: {formatScoreValue(portfolioDraftScore)} /{" "}
									{portfolioDraftMax}
								</div>
								<div className="form-row">
									<input className="input" placeholder="Qeyd (istəyə bağlı)" value={portfolioNote} onChange={(event) => setPortfolioNote(event.target.value)} />
									<button className="btn primary" type="button" onClick={handleSavePortfolio}>Saxla</button>
								</div>
							</>
						)}
					</div>

					<div className="card">
						<h3>Bonus nailiyyətlər</h3>
						<div className="form-grid">
							<select className="input" value={achievementTeacherId} onChange={(event) => setAchievementTeacherId(event.target.value)}>
								<option value="">Müəllim</option>
								{teachers.map((teacher) => (
									<option key={teacher.id} value={teacher.id}>{teacher.data.name}</option>
								))}
							</select>
							<input className="input" placeholder="Növ (məs: Dövlət təltifi)" value={achievementType} onChange={(event) => setAchievementType(event.target.value)} />
							<input className="input" type="number" placeholder="Bal (0-10)" value={achievementPoints} onChange={(event) => setAchievementPoints(event.target.value)} />
						</div>
						<div className="form-row">
							<input className="input" placeholder="Qeyd (istəyə bağlı)" value={achievementNote} onChange={(event) => setAchievementNote(event.target.value)} />
							<button className="btn primary" type="button" onClick={handleAddAchievement}>Əlavə et</button>
						</div>
						<div className="data-table">
							<div className="data-row header"><div>Müəllim</div><div>Növ</div><div>Bal</div><div>Tarix</div><div></div></div>
							{achievementPagination.paginatedItems.map((item) => (
								<div className="data-row" key={item.id}>
									<div>{teacherMap[item.data.teacherId]?.name ?? item.data.teacherId}</div>
									<div>{item.data.type}</div>
									<div>{item.data.points}</div>
									<div>{formatShortDate(toJsDate(item.data.createdAt))}</div>
									<div className="actions"><button className="btn ghost" type="button" onClick={() => void handleDeleteAchievement(item.id)}>Sil</button></div>
								</div>
							))}
							{achievements.length === 0 && <div className="empty">Bonus yoxdur.</div>}
						</div>
						{achievements.length > 0 && (
							<PaginationControls
								totalItems={achievementPagination.totalItems}
								page={achievementPagination.page}
								pageSize={achievementPagination.pageSize}
								onPageChange={achievementPagination.setPage}
								onPageSizeChange={(nextSize) => {
									achievementPagination.setPageSize(nextSize);
									achievementPagination.setPage(1);
								}}
							/>
						)}
					</div>
				</TabsContent>

				<TabsContent value="summary" className="stack">
					<div className="card">
						<div className="section-header">
							<div>
								<h3>PKPD yekun cədvəli</h3>
								<p className="hint">Ətraflı bal bölgüsü və qərar redaktəsi üçün hər müəllimdə <code>Detallar</code> düyməsini açın.</p>
							</div>
							<div className="stat-pill">Cəmi: {filteredSummaryRows.length}</div>
						</div>
						<div className="filters mt-4">
							<label className="field">
								<span className="label">Axtarış</span>
								<input
									className="input"
									placeholder="Müəllim, status və ya model üzrə axtar..."
									value={summaryQuery}
									onChange={(event) => {
										setSummaryQuery(event.target.value);
										summaryPagination.setPage(1);
									}}
								/>
							</label>
							<label className="field">
								<span className="label">Status</span>
								<select
									className="input"
									value={summaryStatusFilter}
									onChange={(event) => {
										setSummaryStatusFilter(event.target.value);
										summaryPagination.setPage(1);
									}}
								>
									<option value="all">Hamısı</option>
									<option value="complete">Tamamlanıb</option>
									<option value="incomplete">Hesablama tamamlanmayıb</option>
									<option value="portfolio">Portfolio gözləyir</option>
									<option value="leadership">Rəhbərlik səsi gözləyir</option>
									<option value="risk">Risk qrupu</option>
								</select>
							</label>
							<label className="field">
								<span className="label">Əməliyyat</span>
								<button
									className="btn"
									type="button"
									onClick={() => {
										setSummaryQuery("");
										setSummaryStatusFilter("all");
										setSummarySort(null);
										summaryPagination.setPage(1);
									}}
								>
									Filterləri sıfırla
								</button>
							</label>
						</div>
						<div className="mt-4">
							<DataTable
								columns={summaryTableColumns}
								rows={summaryPagination.paginatedItems}
								getRowKey={(row) => row.teacherId}
								sort={summarySort}
								onSortChange={(nextSort) => {
									setSummarySort(nextSort);
									summaryPagination.setPage(1);
								}}
								emptyTitle="Bu filterlərə uyğun məlumat tapılmadı."
								emptyDescription="Filterləri dəyişərək yenidən yoxlayın."
							/>
						</div>
						{filteredSummaryRows.length > 0 && (
							<PaginationControls
								totalItems={summaryPagination.totalItems}
								page={summaryPagination.page}
								pageSize={summaryPagination.pageSize}
								onPageChange={summaryPagination.setPage}
								onPageSizeChange={(nextSize) => {
									summaryPagination.setPageSize(nextSize);
									summaryPagination.setPage(1);
								}}
							/>
						)}
					</div>
				</TabsContent>

				<TabsContent value="self-review" className="stack">
					<div className="card">
						<h3>Özünüqiymətləndirmə cavabları və HR qeydi</h3>
						<div className="form-row">
							<select className="input" value={selfReviewTeacherId} onChange={(event) => loadSelfReviewForTeacher(event.target.value)}>
								<option value="">Müəllim seçin</option>
								{teachers.map((teacher) => (
									<option key={teacher.id} value={teacher.id}>{teacher.data.name}</option>
								))}
							</select>
						</div>
						{selfReviewTeacherId && selectedTeacherHasSavedSelfReview && (
							<div className="form-row">
								{selectedTeacherSelfReviewLocked ? (
									<button className="btn ghost" type="button" onClick={handleRequestSelfReviewEdit}>Düzəliş et</button>
								) : (
									<span className="tag success">Düzəliş açıqdır</span>
								)}
							</div>
						)}
						{selfReviewTeacherId && (
							<>
								{selectedTeacherHasSavedSelfReview && (
									<div className="notice">{selectedTeacherSelfReviewLocked ? "Bu HR qiymətləndirməsi kilidlənib. Dəyişiklik üçün admin şifrəsi və səbəb tələb olunur." : "Düzəliş rejimi aktivdir. Yenidən saxladıqdan sonra forma yenə kilidlənəcək."}</div>
								)}
								<div className="notice">{selfReviewTeacher?.name ?? "Müəllim"} üçün müəllimin öz balı: {selectedTeacherSelfResponse?.declaredScore ?? "-"} / 10</div>
								{selectedTeacherSelfReview?.editReason && <div className="hint">Son düzəliş səbəbi: {selectedTeacherSelfReview.editReason}</div>}
								<div className="data-table">
									<div className="data-row header"><div>Sual</div><div>Cavab</div></div>
									{selectedTeacherSelfResponse?.textAnswers.map((item) => (
										<div className="data-row" key={item.questionId}><div>{item.questionText}</div><div>{item.answerText}</div></div>
									))}
									{(!selectedTeacherSelfResponse || selectedTeacherSelfResponse.textAnswers.length === 0) && <div className="empty">Müəllim bu sorğuda hələ açıq cavab yazmayıb.</div>}
								</div>
								<div className="form-row">
									<input className="input" placeholder="HR qeydi (hesaba daxil deyil)" value={selfReviewNote} disabled={selectedTeacherSelfReviewLocked} onChange={(event) => setSelfReviewNote(event.target.value)} />
									<button className="btn primary" type="button" onClick={handleSaveSelfReview} disabled={selectedTeacherSelfReviewLocked}>Saxla</button>
								</div>
								<div className="hint">HR qeydi sənəddəki rəsmi PKPD cəminə əlavə olunmur.</div>
							</>
						)}
					</div>
				</TabsContent>
			</Tabs>
			<Dialog open={Boolean(selectedSummaryRow)} onOpenChange={(open) => { if (!open) setSelectedSummaryTeacherId(null); }}>
				<DialogContent className="max-w-4xl">
					{selectedSummaryRow && (
						<>
							<DialogHeader>
								<DialogTitle>{selectedSummaryRow.name}</DialogTitle>
								<DialogDescription>{cycleYear} dövrü üçün PKPD detal görünüşü və qərar redaktəsi.</DialogDescription>
							</DialogHeader>
							<div className="grid three">
								<div className="stat-card"><div className="stat-label">PKPD modeli</div><div className="stat-value text-base leading-snug">{evaluationTypeLabel(selectedSummaryRow.isBiqTeacher)}</div><div className="stat-meta">{selectedSummaryRow.assessmentResultLabel}</div></div>
								<div className="stat-card"><div className="stat-label">Şagird sorğusu</div><div className="stat-value">{formatScoreValue(selectedSummaryRow.studentScore)}</div></div>
								<div className="stat-card">
									<div className="stat-label">Rəhbərlik qiymətləndirməsi</div>
									<div className="stat-value">{formatScoreValue(selectedSummaryRow.managementScore)} / 10</div>
									<div className="stat-meta">{selectedSummaryRow.leadershipSubmittedCount} / {selectedSummaryRow.leadershipEligibleCount} səs verilib{selectedSummaryRow.leadershipComplete ? "" : " · tamamlanmayıb"}{selectedSummaryRow.leadershipOverridden ? " · admin yekunlaşdırıb" : ""}</div>
									<div className="stat-meta">{getLeadershipVoteRoleStatus(selectedSummaryRow).submittedText}</div>
									<div className={getLeadershipVoteRoleStatus(selectedSummaryRow).hasPending ? "stat-meta font-semibold text-red-600 dark:text-red-300" : "stat-meta"}>{getLeadershipVoteRoleStatus(selectedSummaryRow).pendingText}</div>
									{(userDoc?.role === "branch_admin" || userDoc?.role === "superadmin") &&
										selectedSummaryRow.leadershipSubmittedCount > 0 &&
										selectedSummaryRow.leadershipSubmittedCount < selectedSummaryRow.leadershipEligibleCount && (
											<button
												className="btn ghost"
												type="button"
												onClick={() =>
													void handleLeadershipOverride(
														selectedSummaryRow.teacherId,
														!selectedSummaryRow.leadershipOverridden,
													)
												}
											>
												{selectedSummaryRow.leadershipOverridden ? "Yekunlaşdırmanı ləğv et" : "Cari səslərlə yekunlaşdır"}
											</button>
										)}
								</div>
								<div className="stat-card"><div className="stat-label">Özünüqiymətləndirmə</div><div className="stat-value">{formatScoreValue(selectedSummaryRow.selfScore)}</div></div>
								{selectedSummaryRow.isBiqTeacher && (
									<>
										<div className="stat-card"><div className="stat-label">BİQ ortalaması</div><div className="stat-value">{formatScoreValue(selectedSummaryRow.biqAvg)}</div><div className="stat-meta">{selectedSummaryRow.biqAverageSource === "manual" ? "manual daxil edilib" : selectedSummaryRow.biqAverageSource === "computed" ? "qrup/fənn üzrə hesablanıb" : "məlumat yoxdur"}</div></div>
										<div className="stat-card"><div className="stat-label">{selectedSummaryRow.assessmentResultLabel}</div><div className="stat-value">{formatScoreValue(selectedSummaryRow.biqScore)}</div></div>
										<div className="stat-card"><div className="stat-label">Attestasiya imtahanı</div><div className="stat-value">{formatScoreValue(selectedSummaryRow.examScore)}</div></div>
									</>
								)}
								{!selectedSummaryRow.isBiqTeacher &&
									!isMissingScore(selectedSummaryRow.examScore) && (
										<div className="stat-card">
											<div className="stat-label">Attestasiya imtahanı</div>
											<div className="stat-value">{formatScoreValue(selectedSummaryRow.examScore)}</div>
											<div className="stat-meta">Xam cəm 130 maksimumdan 100 şkalasına çevrilir</div>
										</div>
									)}
								<div className="stat-card"><div className="stat-label">Portfolio</div><div className="stat-value">{formatScoreValue(selectedSummaryRow.portfolioScore)}</div></div>
								<div className="stat-card"><div className="stat-label">Əlavə bal</div><div className="stat-value">{selectedSummaryRow.extraScore.toFixed(1)}</div></div>
								<div className="stat-card"><div className="stat-label">Daxil edilmiş balların cari cəmi</div><div className="stat-value">{formatScoreValue(selectedSummaryRow.teacherCriteriaTotal)}</div></div>
								<div className="stat-card"><div className="stat-label">HR qeydi (hesaba daxil deyil)</div><div className="stat-value">{formatScoreValue(selectedSummaryRow.hrSelfReviewScore)}</div></div>
								<div className="stat-card"><div className="stat-label">PKPD yekun balı</div><div className="stat-value">{formatScoreValue(selectedSummaryRow.baseTotalScore ?? selectedSummaryRow.currentEnteredScore)}</div><div className="stat-meta">{formatPkpdCategory(selectedSummaryRow)}</div></div>
								<div className="stat-card"><div className="stat-label">Stimullaşdırıcı yekun</div><div className="stat-value">{formatScoreValue(selectedSummaryRow.finalScoreWithExtra)}</div><div className="stat-meta">{formatPkpdDecision(selectedSummaryRow)}</div></div>
							</div>
							<div className="card">
								<div className="section-header">
									<div>
										<div className="section-kicker">Bal bölgüsü</div>
										<h3 className="section-title">PKPD komponentləri</h3>
									</div>
								</div>
								<ScoreBreakdownTable rows={buildSummaryBreakdownRows(selectedSummaryRow)} />
							</div>
							{selectedSummaryPortfolioLimits && (
								<div className="card">
									<div className="section-header">
										<div>
											<div className="section-kicker">Portfolio</div>
											<h3 className="section-title">Alt meyarlar üzrə bal</h3>
										</div>
										<div className="tag">
											Cəmi: {formatScoreValue(selectedSummaryRow.portfolioScore)}
										</div>
									</div>
									<div className="grid three">
										<div className="stat-card"><div className="stat-label">Təhsil/kvalifikasiya</div><div className="stat-value">{formatScoreValue(selectedSummaryPortfolio?.educationScore ?? null)}</div><div className="stat-meta">max {selectedSummaryPortfolioLimits.education}</div></div>
										<div className="stat-card"><div className="stat-label">Davamiyyət</div><div className="stat-value">{formatScoreValue(selectedSummaryPortfolio?.attendanceScore ?? null)}</div><div className="stat-meta">max {selectedSummaryPortfolioLimits.attendance}</div></div>
										<div className="stat-card"><div className="stat-label">Sertifikat/təlim/məqalə</div><div className="stat-value">{formatScoreValue(selectedSummaryPortfolio?.trainingScore ?? null)}</div><div className="stat-meta">max {selectedSummaryPortfolioLimits.training}</div></div>
										<div className="stat-card"><div className="stat-label">{selectedSummaryRow.isBiqTeacher ? "Olimpiada/müsabiqə" : "Müsabiqə/festival/yarış"}</div><div className="stat-value">{formatScoreValue(selectedSummaryPortfolio?.olympiadScore ?? null)}</div><div className="stat-meta">max {selectedSummaryPortfolioLimits.olympiad}</div></div>
										<div className="stat-card"><div className="stat-label">Layihə/tədbir/təltif</div><div className="stat-value">{formatScoreValue(selectedSummaryPortfolio?.eventsScore ?? null)}</div><div className="stat-meta">max {selectedSummaryPortfolioLimits.events}</div></div>
									</div>
								</div>
							)}
							<div className="card">
								<div className="section-header">
									<div><div className="section-kicker">Cari il</div><h3 className="section-title">Dərs təyinatları</h3></div>
									<div className="tag">{teacherCategoryLabel(selectedSummaryRow.category)}</div>
								</div>
								<div className="list">
									{selectedSummaryAssignments.map((assignment) => (
										<div className="list-item" key={`${assignment.teacherId}_${assignment.groupId}_${assignment.subjectId}`}>
											<div><div className="list-title">{subjectMap[assignment.subjectId]?.name ?? assignment.subjectId}</div><div className="list-meta">{groupMap[assignment.groupId]?.name ?? assignment.groupId}</div></div>
											<div className="tag">{cycleYear}</div>
										</div>
									))}
									{selectedSummaryAssignments.length === 0 && <div className="empty">Bu müəllim üçün cari ildə dərs təyinatı yoxdur.</div>}
								</div>
							</div>
							<div className="card">
								<div className="section-header">
									<div>
										<div className="section-kicker">Yekun sənəd</div>
										<h3 className="section-title">Yekun rəy və tövsiyə</h3>
										<div className="hint">Rule-based şablon nəticələrə əsasən ilkin mətn hazırlayır. Saxlamadan əvvəl mətni redaktə edə bilərsiniz.</div>
									</div>
									<button className="btn primary" type="button" onClick={() => void handleGenerateFinalReview()}>
										{selectedSummaryFinalReview ? "Yenidən hazırla" : "Yekun rəyi hazırla"}
									</button>
								</div>
								<div className="grid gap-4">
									<label className="field">
										<span className="label">Rəy</span>
										<textarea className="input min-h-36" rows={6} value={finalReviewDraft} onChange={(event) => setFinalReviewDraft(event.target.value)} />
									</label>
									<label className="field">
										<span className="label">Tövsiyə</span>
										<textarea className="input min-h-28" rows={5} value={finalRecommendationDraft} onChange={(event) => setFinalRecommendationDraft(event.target.value)} />
									</label>
									<div className="form-row">
										<button className="btn primary" type="button" onClick={() => void handleSaveFinalReview()} disabled={!finalReviewDraft.trim() || !finalRecommendationDraft.trim()}>Saxla</button>
										{selectedSummaryFinalReview && (
											<button className="btn ghost" type="button" onClick={() => void handleGenerateFinalReview()}>Yenidən hazırla</button>
										)}
									</div>
									{selectedSummaryFinalReview && (
										<div className="hint">
											Son yenilənmə: {selectedSummaryFinalReview.updatedAt ? new Date(String(selectedSummaryFinalReview.updatedAt)).toLocaleString("az-AZ") : "—"}
											{" · "}
											Redaktə edən: {selectedSummaryFinalReview.updatedBy === user?.id ? (userDoc?.displayName ?? userDoc?.login ?? selectedSummaryFinalReview.updatedBy) : (selectedSummaryFinalReview.updatedBy ?? "—")}
										</div>
									)}
									{finalReviewStatus && <div className="notice">{finalReviewStatus}</div>}
								</div>
							</div>
							<div className="card">
								<h3>Qərar və qeyd</h3>
								<div className="form-row">
									<select
										className="input"
										value={decisionDrafts[selectedSummaryRow.teacherId]?.status ?? decisionMap[selectedSummaryRow.teacherId]?.status ?? 'PENDING'}
										onChange={(event) =>
											setDecisionDrafts((prev) => ({
												...prev,
												[selectedSummaryRow.teacherId]: {
													status: event.target.value as PkpdDecisionStatus,
													note: prev[selectedSummaryRow.teacherId]?.note ?? decisionMap[selectedSummaryRow.teacherId]?.note ?? '',
												},
											}))
										}
									>
										{Object.entries(decisionLabel).map(([value, label]) => (
											<option key={value} value={value}>{label}</option>
										))}
									</select>
									<input
										className="input"
										placeholder="Qeyd"
										value={decisionDrafts[selectedSummaryRow.teacherId]?.note ?? decisionMap[selectedSummaryRow.teacherId]?.note ?? ''}
										onChange={(event) =>
											setDecisionDrafts((prev) => ({
												...prev,
												[selectedSummaryRow.teacherId]: {
													status: prev[selectedSummaryRow.teacherId]?.status ?? decisionMap[selectedSummaryRow.teacherId]?.status ?? 'PENDING',
													note: event.target.value,
												},
											}))
										}
									/>
									<button className="btn primary" type="button" onClick={() => void handleSaveDecision(selectedSummaryRow.teacherId)}>Saxla</button>
								</div>
							</div>
						</>
					)}
				</DialogContent>
			</Dialog>
			<Dialog
				open={Boolean(teacherBiqEditTeacherId)}
				onOpenChange={(open) => {
					if (!open) {
						setTeacherBiqEditTeacherId(null);
						setTeacherBiqEditAssignmentKey("");
						setTeacherBiqEditScore("");
					}
				}}
			>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>BİQ balını redaktə et</DialogTitle>
						<DialogDescription>
							{teacherBiqEditTeacher?.name ?? "Müəllim"} üçün sinif və fənn üzrə
							fərdi BİQ balını daxil edin.
						</DialogDescription>
					</DialogHeader>
					<div className="stack">
						<label className="field">
							<span className="label">Dərs təyinatı</span>
							<select
								className="input"
								value={teacherBiqEditAssignmentKey}
								onChange={(event) =>
									handleTeacherBiqEditAssignmentChange(event.target.value)
								}
							>
								<option value="">Sinif və fənn seçin</option>
								{teacherBiqEditAssignments.map((assignment) => {
									const key = `${assignment.groupId}_${assignment.subjectId}`;
									const currentScore =
										teacherBiqMap[
											`${teacherBiqEditTeacherId}_${assignment.groupId}_${assignment.subjectId}`
										]?.score;
									return (
										<option key={key} value={key}>
											{groupMap[assignment.groupId]?.name ?? assignment.groupId} -{" "}
											{subjectMap[assignment.subjectId]?.name ?? assignment.subjectId}
											{currentScore !== undefined ? ` (${currentScore})` : ""}
										</option>
									);
								})}
							</select>
						</label>
						<label className="field">
							<span className="label">BİQ balı</span>
							<input
								className="input"
								type="number"
								min="0"
								max="100"
								step="0.01"
								value={teacherBiqEditScore}
								onChange={(event) => setTeacherBiqEditScore(event.target.value)}
								placeholder="0-100"
							/>
						</label>
						{selectedTeacherBiqEditAssignment && (
							<div className="notice">
								Ümumi sinif/fənn balı:{" "}
								{biqMap[
									`${selectedTeacherBiqEditAssignment.groupId}_${selectedTeacherBiqEditAssignment.subjectId}`
								]?.score ?? "-"}
							</div>
						)}
						{teacherBiqEditAssignments.length === 0 && (
							<div className="empty">
								Bu müəllim üçün cari ildə dərs təyinatı yoxdur.
							</div>
						)}
					</div>
					<DialogFooter>
						<button
							className="btn ghost"
							type="button"
							onClick={() => setTeacherBiqEditTeacherId(null)}
							disabled={teacherBiqEditSaving}
						>
							Ləğv et
						</button>
						<button
							className="btn primary"
							type="button"
							onClick={() => void handleSaveTeacherBiqEdit()}
							disabled={
								teacherBiqEditSaving ||
								!teacherBiqEditAssignmentKey ||
								teacherBiqEditAssignments.length === 0
							}
						>
							{teacherBiqEditSaving ? "Saxlanır..." : "Saxla"}
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<Dialog open={selfReviewUnlockOpen} onOpenChange={setSelfReviewUnlockOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Düzəlişi təsdiqlə</DialogTitle>
						<DialogDescription>
							Saxlanmış HR balını dəyişmək üçün admin şifrəsini və düzəliş
							səbəbini daxil edin.
						</DialogDescription>
					</DialogHeader>
					<div className="stack">
						<label className="field">
							<span className="label">Admin şifrəsi</span>
							<input
								className="input"
								type="password"
								value={selfReviewUnlockPassword}
								onChange={(event) =>
									setSelfReviewUnlockPassword(event.target.value)
								}
							/>
						</label>
						<label className="field">
							<span className="label">Düzəliş səbəbi</span>
							<textarea
								className="input"
								rows={4}
								value={selfReviewUnlockReason}
								onChange={(event) =>
									setSelfReviewUnlockReason(event.target.value)
								}
							/>
						</label>
						{selfReviewUnlockError && (
							<div className="notice">{selfReviewUnlockError}</div>
						)}
					</div>
					<DialogFooter>
						<button
							className="btn ghost"
							type="button"
							onClick={() => setSelfReviewUnlockOpen(false)}
							disabled={selfReviewUnlockSubmitting}
						>
							Ləğv et
						</button>
						<button
							className="btn primary"
							type="button"
							onClick={handleUnlockSelfReviewEdit}
							disabled={selfReviewUnlockSubmitting}
						>
							{selfReviewUnlockSubmitting ? "Yoxlanır..." : "Təsdiqlə"}
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
};



