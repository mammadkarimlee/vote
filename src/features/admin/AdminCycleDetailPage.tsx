import { useEffect, useMemo, useState } from "react";
import {
	FilterPanel,
	PageHeader,
	ScoreBreakdownTable,
	SectionCard,
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
import { Link, useParams } from "react-router-dom";
import { InfoTip } from "../../components/InfoTip";
import { PaginationControls } from "../../components/PaginationControls";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../../components/ui/dialog";
import { downloadCsv } from "../../lib/csv";
import {
	buildPkpdSelfReviewNote,
	isPkpdSelfReviewQuestionScoresError,
} from "../../lib/pkpdSelfReview";
import {
	computePkpdCompletion,
	computePkpdPortfolioScore,
	getPkpdEvaluationTypeFromBiq,
	getPkpdPortfolioLimits,
	getPkpdWeights,
	pkpdBucket,
	pkpdDecision,
} from "../../lib/pkpdScoring";
import type { PkpdEvaluationType } from "../../lib/pkpdScoring";
import { ORG_ID, supabase } from "../../lib/supabase";
import {
	mapAnswerRow,
	mapBiqClassResultRow,
	mapBranchRow,
	mapDepartmentRow,
	mapLeadershipCompletionRow,
	mapPkpdAchievementRow,
	mapPkpdExamRow,
	mapPkpdPortfolioRow,
	mapPkpdSelfReviewRow,
	mapPkpdTeacherBiqAverageRow,
	mapPkpdTeacherBiqResultRow,
	mapQuestionRow,
	mapSubmissionRow,
	mapSurveyCycleRow,
	mapTaskRow,
	mapTeacherRow,
	mapTeachingAssignmentRow,
	mapUserRow,
} from "../../lib/supabaseMappers";
import type {
	AnswerDoc,
	BiqClassResultDoc,
	BranchDoc,
	DepartmentDoc,
	LeadershipCompletionDoc,
	PkpdAchievementDoc,
	PkpdExamDoc,
	PkpdPortfolioDoc,
	PkpdSelfReviewDoc,
	PkpdTeacherBiqAverageDoc,
	PkpdTeacherBiqResultDoc,
	QuestionDoc,
	SubmissionDoc,
	SurveyCycleDoc,
	TaskDoc,
	TeacherCategory,
	TeacherDoc,
	TeachingAssignmentDoc,
	UserDoc,
} from "../../lib/types";
import { chunkValuesForInFilter, toNumber } from "../../lib/utils";
import { useAuth } from "../auth/AuthProvider";

type DocEntry<T> = { id: string; data: T };
const SUPABASE_BATCH_SIZE = 1000;

type FlowAggregate = { sum: number; count: number };

type TeacherClassScore = {
	groupId: string;
	groupName: string;
	avg: number;
	submissionCount: number;
};

type TeacherFlowAggregate = {
	management: FlowAggregate;
	self: FlowAggregate;
};

type TeacherRow = {
	teacherId: string;
	name: string;
	firstName: string;
	lastName: string;
	departmentName: string;
	branchName: string;
	category: TeacherCategory;
	isBiqTeacher: boolean;
	evaluationType: PkpdEvaluationType;
	assessmentResultLabel: string;
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
	surveySubmissionCount: number;
	studentCount: number;
	studentClassCount: number;
	studentClassScores: TeacherClassScore[];
	managementCount: number;
	selfCount: number;
};

type TeacherSelfResponse = {
	declaredScore: number | null;
	textAnswers: Array<{
		questionId: string;
		questionText: string;
		answerText: string;
	}>;
};

const emptyFlowAggregate = (): TeacherFlowAggregate => ({
	management: { sum: 0, count: 0 },
	self: { sum: 0, count: 0 },
});

const average = (agg: FlowAggregate) =>
	agg.count > 0 ? agg.sum / agg.count : null;

const averageNumbers = (values: number[]) =>
	values.length > 0
		? values.reduce((acc, value) => acc + value, 0) / values.length
		: null;

const sumNumbers = (values: number[]) =>
	values.length > 0 ? values.reduce((acc, value) => acc + value, 0) : null;

const averageQuestionScores = (scores: Array<number | null | undefined>) => {
	const numericScores = scores.filter(
		(value): value is number => typeof value === "number" && !Number.isNaN(value),
	);
	return averageNumbers(numericScores);
};

const sumQuestionScores = (scores: Array<number | null | undefined>) => {
	const numericScores = scores.filter(
		(value): value is number => typeof value === "number" && !Number.isNaN(value),
	);
	return sumNumbers(numericScores);
};

type SelfReviewPortfolioField = "trainingScore" | "olympiadScore" | "eventsScore";

const getSelfReviewPortfolioField = (
	questionId: string,
	questionText: string,
): SelfReviewPortfolioField => {
	const normalized = `${questionId} ${questionText}`.toLowerCase();
	if (
		normalized.includes("olympiad") ||
		normalized.includes("olimpiada") ||
		normalized.includes("competition") ||
		normalized.includes("sabiq") ||
		normalized.includes("festival") ||
		normalized.includes("contest") ||
		normalized.includes("yarış") ||
		normalized.includes("yaris")
	) {
		return "olympiadScore";
	}
	if (
		normalized.includes("project") ||
		normalized.includes("layih") ||
		normalized.includes("event") ||
		normalized.includes("tədbir") ||
		normalized.includes("tedbir") ||
		normalized.includes("award") ||
		normalized.includes("təltif") ||
		normalized.includes("teltif")
	) {
		return "eventsScore";
	}
	return "trainingScore";
};

const getSelfReviewQuestionLimit = (
	questionId: string,
	questionText: string,
	limits: ReturnType<typeof getPkpdPortfolioLimits>,
) => {
	const normalized = `${questionId} ${questionText}`.toLowerCase();
	if (
		normalized.includes("olympiad") ||
		normalized.includes("olimpiada") ||
		normalized.includes("competition") ||
		normalized.includes("müsabiq") ||
		normalized.includes("musabiq") ||
		normalized.includes("festival") ||
		normalized.includes("contest") ||
		normalized.includes("yarış") ||
		normalized.includes("yaris")
	) {
		return limits.olympiad;
	}
	if (
		normalized.includes("project") ||
		normalized.includes("layih") ||
		normalized.includes("event") ||
		normalized.includes("tədbir") ||
		normalized.includes("tedbir") ||
		normalized.includes("award") ||
		normalized.includes("təltif") ||
		normalized.includes("teltif")
	) {
		return limits.events;
	}
	return limits.training;
};

const getAcademicIndicator = (review?: PkpdSelfReviewDoc | null) => {
	if (!review) return null;
	return averageQuestionScores(Object.values(review.questionScores ?? {}));
};

const getTeacherCriteriaTotal = (review?: PkpdSelfReviewDoc | null) => {
	if (!review) return null;
	const questionTotal = sumQuestionScores(Object.values(review.questionScores ?? {}));
	return questionTotal ?? null;
};

const normalizeScale = (
	value: number,
	min?: number | null,
	max?: number | null,
) => {
	const safeMin = min ?? 1;
	const safeMax = max ?? 10;
	if (safeMin === 1 && safeMax === 10) return value;
	if (safeMax <= safeMin) return value;
	return ((value - safeMin) / (safeMax - safeMin)) * 10;
};

const formatScore = (value: number | null | undefined) => {
	if (value === null || value === undefined) return "—";
	return value.toFixed(2);
};

const formatScoreOrMissing = (value: number | null | undefined) =>
	value === null || value === undefined || Number.isNaN(value)
		? "Daxil edilməyib"
		: value.toFixed(2);

const evaluationTypeLabel = (isWithBiq: boolean) =>
	isWithBiq
		? "BİQ/KİQ nəticəsi olan müəllim"
		: "BİQ/KİQ nəticəsi olmayan müəllim";

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

const splitFullName = (fullName: string) => {
	const parts = fullName.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return { firstName: "", lastName: "" };
	if (parts.length === 1) return { firstName: parts[0], lastName: "" };
	return {
		firstName: parts[0],
		lastName: parts.slice(1).join(" "),
	};
};

const getTeacherDisplayName = (teacher: TeacherDoc, fallbackId: string) => {
	const nameFromParts = [teacher.firstName?.trim(), teacher.lastName?.trim()]
		.filter(Boolean)
		.join(" ");
	return nameFromParts || teacher.name?.trim() || fallbackId;
};

const getCycleBranchIds = (cycle?: SurveyCycleDoc | null) =>
	(cycle?.branchIds ?? []).filter(Boolean);

const escapeHtml = (value: string) =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");

type TeacherFeedback = {
	levelLabel: string;
	summary: string;
	strengths: string[];
	improvements: string[];
	actionPlan: string[];
};

const scoreLabel = (score: number | null) => {
	if (score === null) return "Məlumat yoxdur";
	if (score >= 9) return "Əla";
	if (score >= 8) return "Yaxşı";
	if (score >= 7) return "Kafi";
	if (score >= 6) return "Risk zonası";
	return "Kritik diqqət tələb olunur";
};

const buildTeacherFeedback = (teacher: TeacherRow): TeacherFeedback => {
	const performanceScore = averageNumbers(
		[
			teacher.studentAvg,
			teacher.managementAvg,
			teacher.selfAvg,
			teacher.biqAvg,
		].filter(
			(value): value is number =>
				typeof value === "number" && !Number.isNaN(value),
		),
	);
	const levelLabel = scoreLabel(performanceScore);
	const finalScoreText = formatScore(teacher.finalScore);

	const components = [
		{ key: "student", label: "Şagird sorğusu", value: teacher.studentAvg },
		{ key: "management", label: "Rəhbərlik sorğusu", value: teacher.managementAvg },
		{ key: "self", label: "Özünüqiymətləndirmə", value: teacher.selfAvg },
		{ key: "biq", label: "BİQ nəticəsi", value: teacher.biqAvg },
	];

	const strengths = components
		.filter((item) => item.value !== null && item.value >= 8)
		.map((item) => `${item.label}: ${formatScore(item.value)} / 10`);

	const improvements = components
		.filter((item) => item.value !== null && item.value < 7)
		.map((item) => `${item.label}: ${formatScore(item.value)} / 10`);

	const actionPlan: string[] = [];

	if ((teacher.studentAvg ?? 0) < 7) {
		actionPlan.push(
			"Sinif idarəetməsi və dərsin izah modeli üzrə hədəfli metodik dəstək planlaşdırılsın.",
		);
	}
	if ((teacher.managementAvg ?? 0) < 7) {
		actionPlan.push(
			"Rəhbərliklə aylıq monitorinq görüşü və dərs planı üzrə inkişaf checklist-i tətbiq olunsun.",
		);
	}
	if ((teacher.selfAvg ?? 0) < 7) {
		actionPlan.push(
			"Özünüqiymətləndirmə üçün aylıq refleksiya formu və fərdi inkişaf planı hazırlanıb izlənilsin.",
		);
	}
	if ((teacher.biqAvg ?? 0) < 7) {
		actionPlan.push(
			"BİQ nəticələri aşağı olan qrup/fənlər üçün əlavə təkrar, mini-diaqnostik və fərdi dəstək tətbiq edilsin.",
		);
	}

	if (actionPlan.length === 0) {
		actionPlan.push(
			"Mövcud performansın qorunması üçün uğurlu təcrübələr sənədləşdirilib digər müəllimlərlə paylaşım sessiyası keçirilsin.",
		);
	}

	const weakestClass = teacher.studentClassScores
		.slice()
		.sort((a, b) => a.avg - b.avg)[0];
	if (weakestClass && weakestClass.avg < 7) {
		actionPlan.push(
			`${weakestClass.groupName} sinfi üzrə əlavə fokus planı: ortalama ${formatScore(weakestClass.avg)} / 10.`,
		);
	}

	return {
		levelLabel,
		summary: `${teacher.name} üçün PKPD yekun balı ${finalScoreText}, ümumi performans səviyyəsi ${levelLabel}.`,
		strengths:
			strengths.length > 0
				? strengths
				: ["Yüksək nəticə göstərən komponent hələ formalaşmayıb və inkişaf potensialı mövcuddur."],
		improvements:
			improvements.length > 0
				? improvements
				: ["Aşağı performanslı komponent görünmür, cari nəticə stabil saxlanılır."],
		actionPlan,
	};
};

type PdfScoreRow = {
	key: string;
	label: string;
	value: number | null | undefined;
	max: number;
};

const isMissingScore = (value: number | null | undefined) =>
	value === null || value === undefined || Number.isNaN(value);

const getTeacherStatusInfo = (row: TeacherRow) => {
	if (!row.isComplete) {
		if (!row.leadershipComplete) {
			return { label: "Rəhbərlik səsi gözləyir", tone: "warning" as const };
		}
		if (isMissingScore(row.portfolioScore)) {
			return { label: "Portfolio gözləyir", tone: "warning" as const };
		}
		return { label: "Hesablama tamamlanmayıb", tone: "warning" as const };
	}
	if ((row.finalScore ?? row.baseTotalScore ?? 0) < 60) {
		return { label: "Risk qrupu", tone: "danger" as const };
	}
	return { label: "Tamamlanıb", tone: "success" as const };
};

const buildScoreBreakdownRows = (teacher: TeacherRow): ScoreBreakdownRow[] => {
	const rows = teacher.isBiqTeacher
		? [
				{
					key: "subject-mastery",
					label: "Balabilgənin fənni mənimsəməsi",
					value: teacher.biqWeightedScore,
					max: 15,
					meta: `Orta BİQ: ${formatScoreOrMissing(teacher.biqAvg)}`,
				},
				{
					key: "student-survey",
					label: "Balabilgə sorğusu",
					value: teacher.studentWeightedScore,
					max: 15,
					meta: `Cavab sayı: ${teacher.studentCount}`,
				},
				{
					key: "self-review",
					label: "Özünüqiymətləndirmə",
					value: teacher.selfWeightedScore,
					max: 10,
					meta: `Müəllimin verdiyi bal: ${formatScoreOrMissing(teacher.selfDeclaredScore)}`,
				},
				{
					key: "leadership",
					label: "Rəhbərlik qiymətləndirməsi",
					value: teacher.managementWeightedScore,
					max: 10,
					meta: `${teacher.leadershipSubmittedCount} / ${teacher.leadershipEligibleCount} səs`,
				},
				{
					key: "exam",
					label: "Attestasiya imtahanı",
					value: teacher.examScore,
					max: 30,
				},
				{
					key: "portfolio",
					label: "Portfolio",
					value: teacher.portfolioScore,
					max: 20,
				},
			]
		: [
				{
					key: "student-survey",
					label: "Balabilgə sorğusu",
					value: teacher.studentWeightedScore,
					max: 20,
					meta: `Cavab sayı: ${teacher.studentCount}`,
				},
				{
					key: "self-review",
					label: "Özünüqiymətləndirmə",
					value: teacher.selfWeightedScore,
					max: 10,
					meta: `Müəllimin verdiyi bal: ${formatScoreOrMissing(teacher.selfDeclaredScore)}`,
				},
				{
					key: "leadership",
					label: "Rəhbərlik qiymətləndirməsi",
					value: teacher.managementWeightedScore,
					max: 10,
					meta: `${teacher.leadershipSubmittedCount} / ${teacher.leadershipEligibleCount} səs`,
				},
				{
					key: "portfolio",
					label: "Portfolio",
					value: teacher.portfolioScore,
					max: 60,
				},
			];

	return rows.map((row) => ({
		...row,
		value: formatScoreOrMissing(row.value),
		tone: isMissingScore(row.value) ? "warning" : "success",
	}));
};

const getMissingScoreLabels = (teacher: TeacherRow) =>
	buildScoreBreakdownRows(teacher)
		.filter((row) => row.tone === "warning")
		.map((row) => String(row.label));

const buildFinalRecommendations = (
	baseTotalScore: number | null,
	rows: PdfScoreRow[],
) => {
	const weakRows = rows.filter(
		(row) =>
			row.key !== "total" &&
			!isMissingScore(row.value) &&
			row.max > 0 &&
			(row.value ?? 0) / row.max < 0.6,
	);

	if (weakRows.length === 0) {
		return [
			"Zəif komponent qeydə alınmadı. Növbəti dövrdə mövcud nəticələrin stabil saxlanılması və yaxşı təcrübələrin paylaşılması tövsiyə olunur.",
		];
	}

	const recommendations = weakRows.map(
		(row) =>
			`${row.label} üzrə nəticə ${formatScore(row.value ?? null)} / ${row.max} olduğuna görə bu komponent üzrə fərdi inkişaf tədbiri planlaşdırılsın.`,
	);

	if (baseTotalScore !== null && baseTotalScore < 60) {
		recommendations.push(
			"PKPD yekun balı 60-dan aşağı olduğu üçün növbəti qiymətləndirmə dövrünə qədər yazılı inkişaf planı və aralıq monitorinq tətbiq edilsin.",
		);
	}

	return recommendations;
};

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
			throw new Error(error.message ?? "Məlumat yüklənmədi");
		}

		const page = data ?? [];
		rows.push(...page);
		if (page.length < SUPABASE_BATCH_SIZE) {
			break;
		}

		from += SUPABASE_BATCH_SIZE;
	}

	return rows;
};

const fetchAllBatchedOrEmpty = async <T,>(
	label: string,
	fetchPage: (
		from: number,
		to: number,
	) => Promise<{ data: T[] | null; error: { message?: string } | null }>,
) => {
	try {
		return await fetchAllBatched<T>(fetchPage);
	} catch (error) {
		console.warn(`Admin cycle detail load skipped: ${label}`, error);
		return [];
	}
};

export const AdminCycleDetailPage = () => {
	const { cycleId } = useParams<{ cycleId: string }>();
	const { user, userDoc } = useAuth();
	const isHr = userDoc?.role === "hr";
	const scopedBranchId = "";
	const cycleListPath = isHr ? "/hr/cycles" : "/admin/cycles";

	const [cycle, setCycle] = useState<SurveyCycleDoc | null>(null);
	const [teachers, setTeachers] = useState<Array<DocEntry<TeacherDoc>>>([]);
	const [branches, setBranches] = useState<Array<DocEntry<BranchDoc>>>([]);
	const [departments, setDepartments] = useState<Array<DocEntry<DepartmentDoc>>>(
		[],
	);
	const [questions, setQuestions] = useState<Record<string, QuestionDoc>>({});
	const [tasks, setTasks] = useState<Array<DocEntry<TaskDoc>>>([]);
	const [assignments, setAssignments] = useState<
		Array<DocEntry<TeachingAssignmentDoc>>
	>([]);
	const [biqResults, setBiqResults] = useState<
		Array<DocEntry<BiqClassResultDoc>>
	>([]);
	const [teacherBiqResults, setTeacherBiqResults] = useState<
		Array<DocEntry<PkpdTeacherBiqResultDoc>>
	>([]);
	const [teacherBiqAverages, setTeacherBiqAverages] = useState<
		Array<DocEntry<PkpdTeacherBiqAverageDoc>>
	>([]);
	const [examResults, setExamResults] = useState<Array<DocEntry<PkpdExamDoc>>>([]);
	const [portfolios, setPortfolios] = useState<
		Array<DocEntry<PkpdPortfolioDoc>>
	>([]);
	const [selfReviews, setSelfReviews] = useState<
		Array<DocEntry<PkpdSelfReviewDoc>>
	>([]);
	const [achievements, setAchievements] = useState<
		Array<DocEntry<PkpdAchievementDoc>>
	>([]);
	const [submissions, setSubmissions] = useState<
		Array<DocEntry<SubmissionDoc>>
	>([]);
	const [answers, setAnswers] = useState<Array<DocEntry<AnswerDoc>>>([]);
	const [raters, setRaters] = useState<Array<DocEntry<UserDoc>>>([]);
	const [leadershipCompletion, setLeadershipCompletion] = useState<
		Record<string, LeadershipCompletionDoc>
	>({});

	const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
	const [showAllTeachers, setShowAllTeachers] = useState(false);
	const [teacherQuery, setTeacherQuery] = useState("");
	const [leadershipFilter, setLeadershipFilter] = useState("all");
	const [showRaters, setShowRaters] = useState(false);
	const [showComments, setShowComments] = useState(false);
	const [selfReviewQuestionScores, setSelfReviewQuestionScores] = useState<
		Record<string, string>
	>({});
	const [portfolioEducationDraft, setPortfolioEducationDraft] = useState("");
	const [portfolioAttendanceDraft, setPortfolioAttendanceDraft] = useState("");
	const [selfReviewNote, setSelfReviewNote] = useState("");
	const [selfReviewStatus, setSelfReviewStatus] = useFeedbackState();
	const [assessmentMode, setAssessmentMode] =
		useState<PkpdEvaluationType>("WITH_BIQ");
	const [biqAverageDraft, setBiqAverageDraft] = useState("");
	const [miqScoreDraft, setMiqScoreDraft] = useState("");
	const [assessmentStatus, setAssessmentStatus] = useFeedbackState();
	const [leadershipStatus, setLeadershipStatus] = useFeedbackState();
	const [selfReviewEditUnlocked, setSelfReviewEditUnlocked] = useState(false);
	const [selfReviewUnlockOpen, setSelfReviewUnlockOpen] = useState(false);
	const [selfReviewUnlockPassword, setSelfReviewUnlockPassword] = useState("");
	const [selfReviewUnlockReason, setSelfReviewUnlockReason] = useState("");
	const [selfReviewUnlockError, setSelfReviewUnlockError] = useFeedbackState();
	const [selfReviewUnlockSubmitting, setSelfReviewUnlockSubmitting] =
		useState(false);

	const [teacherPage, setTeacherPage] = useState(1);
	const [teacherPageSize, setTeacherPageSize] = useState(15);
	const [teacherSort, setTeacherSort] = useState<SortState>(null);
	const [raterPage, setRaterPage] = useState(1);
	const [raterPageSize, setRaterPageSize] = useState(15);
	const [commentPage, setCommentPage] = useState(1);
	const [commentPageSize, setCommentPageSize] = useState(15);

	useEffect(() => {
		const loadLookups = async () => {
			if (!cycleId) return;

			const cycleRes = await supabase
				.from("survey_cycles")
				.select("*")
				.eq("org_id", ORG_ID)
				.eq("id", cycleId)
				.maybeSingle();
			const mappedCycle = cycleRes.data ? mapSurveyCycleRow(cycleRes.data) : null;
			const cycleBranchIds = scopedBranchId
				? [scopedBranchId]
				: getCycleBranchIds(mappedCycle);

			let teacherQuery = supabase
				.from("teachers")
				.select("*")
				.eq("org_id", ORG_ID)
				.is("deleted_at", null);
			let raterQuery = supabase
				.from("users")
				.select("*")
				.eq("org_id", ORG_ID)
				.is("deleted_at", null)
				.in("role", ["student", "teacher", "manager"]);
			let branchQuery = supabase.from("branches").select("*").eq("org_id", ORG_ID);
			let departmentQuery = supabase
				.from("departments")
				.select("*")
				.eq("org_id", ORG_ID)
				.is("deleted_at", null);

			if (cycleBranchIds.length > 0) {
				teacherQuery = teacherQuery.in("branch_id", cycleBranchIds);
				raterQuery = raterQuery.in("branch_id", cycleBranchIds);
				branchQuery = branchQuery.in("id", cycleBranchIds);
				departmentQuery = departmentQuery.in("branch_id", cycleBranchIds);
			}

			const [
				teacherRes,
				questionRes,
				raterRes,
				branchRes,
				departmentRes,
			] = await Promise.all([
				teacherQuery,
					supabase.from("questions").select("*").eq("org_id", ORG_ID),
				raterQuery,
				branchQuery,
				departmentQuery,
			]);

			setCycle(mappedCycle);
			setTeachers(
				(teacherRes.data ?? []).map((row) => ({
					id: row.id,
					data: mapTeacherRow(row),
				})),
			);
			setBranches(
				(branchRes.data ?? []).map((row) => ({
					id: row.id,
					data: mapBranchRow(row),
				})),
			);
			setDepartments(
				(departmentRes.data ?? []).map((row) => ({
					id: row.id,
					data: mapDepartmentRow(row),
				})),
			);

			const questionMap: Record<string, QuestionDoc> = {};
			(questionRes.data ?? []).forEach((row) => {
				questionMap[row.id] = mapQuestionRow(row);
			});
			setQuestions(questionMap);

			setRaters(
				(raterRes.data ?? []).map((row) => ({
					id: row.id,
					data: mapUserRow(row),
				})),
			);
			setSelectedTeacherId(null);
		};

		void loadLookups();
	}, [cycleId, scopedBranchId]);

	useEffect(() => {
		const loadCycleData = async () => {
			if (!cycleId || !cycle) return;
			const cycleBranchIds = scopedBranchId
				? [scopedBranchId]
				: getCycleBranchIds(cycle);

			try {
				const [
					taskRows,
					submissionRows,
					biqRows,
					teacherBiqRows,
					teacherBiqAverageRows,
					examRows,
					portfolioRows,
					selfReviewRows,
					achievementRows,
					leadershipSummaryResult,
				] = await Promise.all([
						fetchAllBatchedOrEmpty<any>("tasks", async (from, to) =>
							await (() => {
								let query = supabase
									.from("tasks")
									.select("*")
									.eq("org_id", ORG_ID)
									.eq("cycle_id", cycleId);
								if (cycleBranchIds.length > 0) {
									query = query.in("branch_id", cycleBranchIds);
								}
								return query.range(from, to);
							})(),
						),
						fetchAllBatchedOrEmpty<any>("submissions", async (from, to) =>
							await (() => {
								let query = supabase
									.from("submissions")
									.select("*")
									.eq("org_id", ORG_ID)
									.eq("cycle_id", cycleId);
								if (cycleBranchIds.length > 0) {
									query = query.in("branch_id", cycleBranchIds);
								}
								return query.range(from, to);
							})(),
						),
						fetchAllBatchedOrEmpty<any>("biq_class_results", async (from, to) =>
							await (() => {
								let query = supabase
									.from("biq_class_results")
									.select("*")
									.eq("org_id", ORG_ID)
									.eq("cycle_id", cycleId);
								if (cycleBranchIds.length > 0) {
									query = query.in("branch_id", cycleBranchIds);
								}
								return query.range(from, to);
							})(),
						),
						fetchAllBatchedOrEmpty<any>("pkpd_teacher_biq_results", async (from, to) =>
							await (() => {
								let query = supabase
									.from("pkpd_teacher_biq_results")
									.select("*")
									.eq("org_id", ORG_ID)
									.eq("cycle_id", cycleId);
								if (cycleBranchIds.length > 0) {
									query = query.in("branch_id", cycleBranchIds);
								}
								return query.range(from, to);
							})(),
						),
						fetchAllBatchedOrEmpty<any>("pkpd_teacher_biq_averages", async (from, to) =>
							await (() => {
								let query = supabase
									.from("pkpd_teacher_biq_averages")
									.select("*")
									.eq("org_id", ORG_ID)
									.eq("cycle_id", cycleId);
								if (cycleBranchIds.length > 0) {
									query = query.in("branch_id", cycleBranchIds);
								}
								return query.range(from, to);
							})(),
						),
						fetchAllBatchedOrEmpty<any>("pkpd_exam_results", async (from, to) =>
							await (() => {
								let query = supabase
									.from("pkpd_exam_results")
									.select("*")
									.eq("org_id", ORG_ID)
									.eq("cycle_id", cycleId);
								if (cycleBranchIds.length > 0) {
									query = query.in("branch_id", cycleBranchIds);
								}
								return query.range(from, to);
							})(),
						),
						fetchAllBatchedOrEmpty<any>("pkpd_portfolios", async (from, to) =>
							await (() => {
								let query = supabase
									.from("pkpd_portfolios")
									.select("*")
									.eq("org_id", ORG_ID)
									.eq("cycle_id", cycleId);
								if (cycleBranchIds.length > 0) {
									query = query.in("branch_id", cycleBranchIds);
								}
								return query.range(from, to);
							})(),
						),
						fetchAllBatchedOrEmpty<any>("pkpd_self_reviews", async (from, to) =>
							await (() => {
								let query = supabase
									.from("pkpd_self_reviews")
									.select("*")
									.eq("org_id", ORG_ID)
									.eq("cycle_id", cycleId);
								if (cycleBranchIds.length > 0) {
									query = query.in("branch_id", cycleBranchIds);
								}
								return query.range(from, to);
							})(),
						),
						fetchAllBatchedOrEmpty<any>("pkpd_achievements", async (from, to) =>
							await (() => {
								let query = supabase
									.from("pkpd_achievements")
									.select("*")
									.eq("org_id", ORG_ID)
									.eq("cycle_id", cycleId);
								if (cycleBranchIds.length > 0) {
									query = query.in("branch_id", cycleBranchIds);
								}
								return query.range(from, to);
							})(),
						),
						supabase.rpc("leadership_score_summary", {
							p_cycle_id: cycleId,
							p_campus_id: scopedBranchId || null,
						}),
					]);

				setTasks(
					taskRows.map((row) => ({
						id: row.id,
						data: mapTaskRow(row),
					})),
				);
				setSubmissions(
					submissionRows.map((row) => ({
						id: row.task_id ?? row.id,
						data: mapSubmissionRow(row),
					})),
				);
				setBiqResults(
					biqRows.map((row) => ({
						id: row.id,
						data: mapBiqClassResultRow(row),
					})),
				);
				setTeacherBiqResults(
					teacherBiqRows.map((row) => ({
						id: row.id,
						data: mapPkpdTeacherBiqResultRow(row),
					})),
				);
				setTeacherBiqAverages(
					teacherBiqAverageRows.map((row) => ({
						id: row.id,
						data: mapPkpdTeacherBiqAverageRow(row),
					})),
				);
				setExamResults(
					examRows.map((row) => ({
						id: row.id,
						data: mapPkpdExamRow(row),
					})),
				);
				setPortfolios(
					portfolioRows.map((row) => ({
						id: row.id,
						data: mapPkpdPortfolioRow(row),
					})),
				);
				setSelfReviews(
					selfReviewRows.map((row) => ({
						id: row.id,
						data: mapPkpdSelfReviewRow(row),
					})),
				);
				setAchievements(
					achievementRows.map((row) => ({
						id: row.id,
						data: mapPkpdAchievementRow(row),
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

				if (cycle?.year) {
					const assignmentRows = await fetchAllBatchedOrEmpty<any>(
						"teaching_assignments",
						async (from, to) =>
							await (() => {
								let query = supabase
									.from("teaching_assignments")
									.select("*")
									.eq("org_id", ORG_ID)
									.eq("year", cycle.year)
									.is("deleted_at", null);
								if (cycleBranchIds.length > 0) {
									query = query.in("branch_id", cycleBranchIds);
								}
								return query.range(from, to);
							})(),
					);

					setAssignments(
						assignmentRows.map((row) => ({
							id: row.id,
							data: mapTeachingAssignmentRow(row),
						})),
					);
				} else {
					setAssignments([]);
				}

				const submissionIds = Array.from(
					new Set(submissionRows.map((row) => row.task_id ?? row.id)),
				);
				if (submissionIds.length === 0) {
					setAnswers([]);
					return;
				}

				const answerDocs: Array<DocEntry<AnswerDoc>> = [];
				const chunks = chunkValuesForInFilter(submissionIds);
				for (const chunk of chunks) {
					if (chunk.length === 0) continue;
					const answerRows = await fetchAllBatchedOrEmpty<any>(
						"answers",
						async (from, to) =>
							await supabase
								.from("answers")
								.select("*")
								.eq("org_id", ORG_ID)
								.in("submission_id", chunk)
								.range(from, to),
					);

					answerRows.forEach((row) => {
						const key = `${row.submission_id}_${row.question_id}`;
						answerDocs.push({ id: key, data: mapAnswerRow(row) });
					});
				}
				setAnswers(answerDocs);
			} catch (error) {
				console.warn("Admin cycle detail load failed", error);
			}
		};

		void loadCycleData();
	}, [cycle, cycleId, scopedBranchId]);

	const teacherMap = useMemo(
		() => Object.fromEntries(teachers.map((item) => [item.id, item.data])),
		[teachers],
	);
	const branchMap = useMemo(
		() => Object.fromEntries(branches.map((item) => [item.id, item.data])),
		[branches],
	);
	const departmentMap = useMemo(
		() => Object.fromEntries(departments.map((item) => [item.id, item.data])),
		[departments],
	);
	const taskMap = useMemo(
		() => Object.fromEntries(tasks.map((item) => [item.id, item.data])),
		[tasks],
	);

	const submissionCountByTeacher = useMemo(() => {
		const counts: Record<string, number> = {};
		submissions.forEach((submission) => {
			const task = taskMap[submission.id];
			if (!task || task.targetType !== "teacher") return;
			counts[task.targetId] = (counts[task.targetId] ?? 0) + 1;
		});
		return counts;
	}, [submissions, taskMap]);

	const submissionScaleStats = useMemo(() => {
		const stats: Record<string, FlowAggregate> = {};
		answers.forEach((answer) => {
			const question = questions[answer.data.questionId];
			if (!question || question.type !== "scale") return;

			const numeric = toNumber(answer.data.value);
			if (numeric === null) return;

			const normalized = normalizeScale(
				numeric,
				question.scaleMin,
				question.scaleMax,
			);
			const submissionId = answer.data.submissionId;
			stats[submissionId] = stats[submissionId] ?? { sum: 0, count: 0 };
			stats[submissionId].sum += normalized;
			stats[submissionId].count += 1;
		});
		return stats;
	}, [answers, questions]);

	const submissionScoreById = useMemo(() => {
		const scores: Record<string, number> = {};
		Object.entries(submissionScaleStats).forEach(([submissionId, agg]) => {
			if (agg.count > 0) {
				scores[submissionId] = agg.sum / agg.count;
			}
		});
		return scores;
	}, [submissionScaleStats]);

	const studentClassScoresByTeacher = useMemo(() => {
		const byTeacher: Record<
			string,
			Record<string, { groupId: string; groupName: string; sum: number; count: number }>
		> = {};

		submissions.forEach((submission) => {
			const task = taskMap[submission.id];
			if (!task || task.targetType !== "teacher" || task.raterRole !== "student") {
				return;
			}

			const submissionScore = submissionScoreById[submission.id];
			if (typeof submissionScore !== "number") return;

			const groupId = task.groupId ?? "no-group";
			const groupName = task.groupName?.trim() || groupId;
			byTeacher[task.targetId] = byTeacher[task.targetId] ?? {};
			const classStats = byTeacher[task.targetId][groupId] ?? {
				groupId,
				groupName,
				sum: 0,
				count: 0,
			};

			classStats.sum += submissionScore;
			classStats.count += 1;
			byTeacher[task.targetId][groupId] = classStats;
		});

		const result: Record<string, TeacherClassScore[]> = {};
		Object.entries(byTeacher).forEach(([teacherId, classMap]) => {
			result[teacherId] = Object.values(classMap)
				.map((item) => ({
					groupId: item.groupId,
					groupName: item.groupName,
					avg: item.count > 0 ? item.sum / item.count : 0,
					submissionCount: item.count,
				}))
				.sort((a, b) => a.groupName.localeCompare(b.groupName, "az"));
		});

		return result;
	}, [submissions, submissionScoreById, taskMap]);

	const studentSubmissionStatsByTeacher = useMemo(() => {
		const stats: Record<string, FlowAggregate> = {};

		submissions.forEach((submission) => {
			const task = taskMap[submission.id];
			if (!task || task.targetType !== "teacher" || task.raterRole !== "student") {
				return;
			}

			const submissionScore = submissionScoreById[submission.id];
			if (typeof submissionScore !== "number") return;

			stats[task.targetId] = stats[task.targetId] ?? { sum: 0, count: 0 };
			stats[task.targetId].sum += submissionScore;
			stats[task.targetId].count += 1;
		});

		return stats;
	}, [submissions, submissionScoreById, taskMap]);

	const flowStats = useMemo(() => {
		const stats: Record<string, TeacherFlowAggregate> = {};
		teachers.forEach((teacher) => {
			stats[teacher.id] = emptyFlowAggregate();
		});

		submissions.forEach((submission) => {
			const task = taskMap[submission.id];
			if (!task || task.targetType !== "teacher") return;

			const submissionScore = submissionScoreById[submission.id];
			if (typeof submissionScore !== "number") return;
			const targetId = task.targetId;
			stats[targetId] = stats[targetId] ?? emptyFlowAggregate();

			if (task.raterRole === "manager") {
				stats[targetId].management.sum += submissionScore;
				stats[targetId].management.count += 1;
				return;
			}
			if (task.raterRole === "teacher") {
				stats[targetId].self.sum += submissionScore;
				stats[targetId].self.count += 1;
			}
		});

		return stats;
	}, [submissions, submissionScoreById, taskMap, teachers]);

	const assignmentByTeacher = useMemo(() => {
		const map: Record<string, TeachingAssignmentDoc[]> = {};
		assignments.forEach((assignment) => {
			map[assignment.data.teacherId] = map[assignment.data.teacherId] || [];
			map[assignment.data.teacherId].push(assignment.data);
		});
		return map;
	}, [assignments]);

	const biqByKey = useMemo(
		() =>
			Object.fromEntries(
				biqResults.map((item) => [
					`${item.data.branchId}_${item.data.groupId}_${item.data.subjectId}`,
					item.data.score,
				]),
			),
		[biqResults],
	);

	const teacherBiqByKey = useMemo(
		() =>
			Object.fromEntries(
				teacherBiqResults.map((item) => [
					`${item.data.teacherId}_${item.data.groupId}_${item.data.subjectId}`,
					item.data.score,
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

	const selfReviewMap = useMemo(
		() =>
			Object.fromEntries(
				selfReviews.map((item) => [item.data.teacherId, item.data]),
			),
		[selfReviews],
	);
	const examMap = useMemo(
		() =>
			Object.fromEntries(
				examResults.map((item) => [item.data.teacherId, item.data]),
			),
		[examResults],
	);
	const portfolioMap = useMemo(
		() =>
			Object.fromEntries(
				portfolios.map((item) => [item.data.teacherId, item.data]),
			),
		[portfolios],
	);
	const achievementTotals = useMemo(() => {
		const totals: Record<string, number> = {};
		achievements.forEach((item) => {
			totals[item.data.teacherId] =
				(totals[item.data.teacherId] ?? 0) + item.data.points;
		});
		return totals;
	}, [achievements]);

	const teacherSelfResponses = useMemo<Record<string, TeacherSelfResponse>>(() => {
		const responseMap: Record<string, TeacherSelfResponse> = {};

		answers.forEach((answer) => {
			const task = taskMap[answer.data.submissionId];
			if (!task || task.targetType !== "teacher" || task.raterRole !== "teacher") {
				return;
			}

			const question = questions[answer.data.questionId];
			if (!question || question.category !== "teacher_self_pkpd") return;

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
	}, [answers, questions, taskMap]);

	const teacherRows = useMemo<TeacherRow[]>(() => {
		return teachers
			.map((teacher) => {
				const category = teacher.data.category ?? "standard";
				const isBiqTeacher = getIsBiqTeacher(teacher.data);
				const evaluationType = getPkpdEvaluationTypeFromBiq(isBiqTeacher);
				const weights = getPkpdWeights(category, isBiqTeacher);
				const assessmentResultLabel = isBiqTeacher
					? "Balabilgənin fənni mənimsəməsi"
					: "BİQ/KİQ tətbiq edilmir";
				const flow = flowStats[teacher.id] ?? emptyFlowAggregate();
				const classScores = studentClassScoresByTeacher[teacher.id] ?? [];
				const studentStats = studentSubmissionStatsByTeacher[teacher.id] ?? {
					sum: 0,
					count: 0,
				};
				const studentAvg = average(studentStats);
				const studentCount = studentStats.count;
				const leadershipSummary = leadershipCompletion[teacher.id];
				const managementAvg = leadershipSummary?.leadershipEvaluationScore ?? null;
				const selfDeclaredScore = average(flow.self);
				const teacherSelfReview = selfReviewMap[teacher.id] ?? null;
				const academicIndicator = getAcademicIndicator(teacherSelfReview);
				const teacherCriteriaTotal = getTeacherCriteriaTotal(teacherSelfReview);
				const hrEvaluationScore =
					typeof teacherSelfReview?.score === "number" &&
					!Number.isNaN(teacherSelfReview.score)
						? teacherSelfReview.score
						: null;
				const selfAvg = averageNumbers(
					[selfDeclaredScore, academicIndicator].filter(
						(value): value is number =>
							typeof value === "number" && !Number.isNaN(value),
					),
				);
				const assignmentsForTeacher = assignmentByTeacher[teacher.id] ?? [];
				const biqValues = assignmentsForTeacher
					.map((assignment) => {
						const teacherKey = `${teacher.id}_${assignment.groupId}_${assignment.subjectId}`;
						const teacherOverride = teacherBiqByKey[teacherKey];
						if (typeof teacherOverride === "number") return teacherOverride;

						const classKey = `${assignment.branchId}_${assignment.groupId}_${assignment.subjectId}`;
						const classScore = biqByKey[classKey];
						return typeof classScore === "number" ? classScore : null;
					})
					.filter((value): value is number => typeof value === "number");
				const computedBiqAvg =
					biqValues.length > 0
						? biqValues.reduce((acc, value) => acc + value, 0) / biqValues.length
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
				const studentWeightedScore =
					studentAvg === null ? null : (studentAvg * weights.student) / 10;
				const managementWeightedScore = managementAvg;
				const selfWeightedScore =
					selfDeclaredScore === null
						? null
						: (selfDeclaredScore * weights.self) / 10;
				const examInputScore = clampExamScore(examMap[teacher.id]?.score);
				const biqWeightedScore =
					isBiqTeacher
						? weights.biq === 0 || biqAvg === null
							? null
							: (biqAvg * weights.biq) / 100
						: null;
				const examScore = isBiqTeacher ? examInputScore : null;
				const portfolioScore = computePkpdPortfolioScore(
					portfolioMap[teacher.id] ?? null,
					category,
					isBiqTeacher,
				);
				const bonusScore = achievementTotals[teacher.id] ?? 0;

				const completion = computePkpdCompletion(evaluationType, {
					studentScore: studentWeightedScore,
					managementScore: managementWeightedScore,
					selfScore: selfWeightedScore,
					biqScore: biqWeightedScore,
					examScore,
					portfolioScore,
				});
				const currentEnteredScore = completion.currentEnteredScore;
				const isComplete =
					completion.isComplete && Boolean(leadershipSummary?.isComplete);
				const baseTotalScore = isComplete ? currentEnteredScore : null;
				const finalScoreWithExtra =
					baseTotalScore === null ? null : baseTotalScore + bonusScore;
				const finalScore = baseTotalScore;

				const resolvedName = getTeacherDisplayName(teacher.data, teacher.id);
				const nameParts = splitFullName(resolvedName);
				const firstName = teacher.data.firstName?.trim() || nameParts.firstName;
				const lastName = teacher.data.lastName?.trim() || nameParts.lastName;
				const departmentName = teacher.data.departmentId
					? (departmentMap[teacher.data.departmentId]?.name ?? "-")
					: "-";
				const branchName = teacher.data.branchId
					? (branchMap[teacher.data.branchId]?.name ?? "-")
					: "-";

				return {
					teacherId: teacher.id,
					name: resolvedName,
					firstName,
					lastName,
					departmentName,
					branchName,
					category,
					isBiqTeacher,
					evaluationType,
					assessmentResultLabel,
					studentAvg,
					managementAvg,
					selfAvg,
					selfDeclaredScore,
					academicIndicator,
					teacherCriteriaTotal,
					hrEvaluationScore,
					biqAvg,
					computedBiqAvg,
					manualBiqAvg,
					biqAverageSource,
					studentWeightedScore,
					managementWeightedScore,
					leadershipSubmittedCount: leadershipSummary?.submittedCount ?? 0,
					leadershipEligibleCount: leadershipSummary?.eligibleCount ?? 0,
					leadershipComplete: leadershipSummary?.isComplete ?? false,
					leadershipOverridden: leadershipSummary?.isOverridden ?? false,
					branchManagerSubmitted: leadershipSummary?.branchManagerSubmitted ?? false,
					deputySubmitted: leadershipSummary?.deputySubmitted ?? false,
					departmentHeadSubmitted: leadershipSummary?.departmentHeadSubmitted ?? false,
					selfWeightedScore,
					biqWeightedScore,
					examScore,
					portfolioScore,
					bonusScore,
					currentEnteredScore,
					isComplete,
					baseTotalScore,
					finalScoreWithExtra,
					finalScore,
					surveySubmissionCount: submissionCountByTeacher[teacher.id] ?? 0,
					studentCount,
					studentClassCount: classScores.length,
					studentClassScores: classScores,
					managementCount: leadershipSummary?.submittedCount ?? 0,
					selfCount: flow.self.count,
				};
			})
			.sort((a, b) => {
				if (a.finalScore === null && b.finalScore === null) {
					return a.name.localeCompare(b.name, "az");
				}
				if (a.finalScore === null) return 1;
				if (b.finalScore === null) return -1;
				if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
				return a.name.localeCompare(b.name, "az");
			});
	}, [
		assignmentByTeacher,
		achievementTotals,
		biqByKey,
		branchMap,
		departmentMap,
		examMap,
		flowStats,
		leadershipCompletion,
		portfolioMap,
		selfReviewMap,
		submissionCountByTeacher,
		studentSubmissionStatsByTeacher,
		studentClassScoresByTeacher,
		teacherBiqAverageMap,
		teacherBiqByKey,
		teachers,
	]);

	const selectedTeacher = useMemo(
		() =>
			selectedTeacherId
				? (teacherRows.find((item) => item.teacherId === selectedTeacherId) ?? null)
				: null,
		[selectedTeacherId, teacherRows],
	);
	const selectedTeacherSelfResponse = selectedTeacherId
		? (teacherSelfResponses[selectedTeacherId] ?? null)
		: null;
	const selectedTeacherSelfReview = selectedTeacherId
		? (selfReviewMap[selectedTeacherId] ?? null)
		: null;
	const selectedTeacherPortfolio = selectedTeacherId
		? (portfolioMap[selectedTeacherId] ?? null)
		: null;
	const selectedTeacherPortfolioLimits = selectedTeacher
		? getPkpdPortfolioLimits(selectedTeacher.category, selectedTeacher.isBiqTeacher)
		: null;
	const selectedTeacherOpenQuestionIds = useMemo(
		() => selectedTeacherSelfResponse?.textAnswers.map((item) => item.questionId) ?? [],
		[selectedTeacherSelfResponse],
	);
	const selectedTeacherHasOpenAnswers = Boolean(
		selectedTeacherSelfResponse &&
			selectedTeacherSelfResponse.textAnswers.length > 0,
	);
	const selectedTeacherHasSavedOpenReview = Boolean(
		selectedTeacherSelfReview &&
			(typeof selectedTeacherSelfReview.score === "number" ||
				Object.keys(selectedTeacherSelfReview.questionScores ?? {}).length > 0 ||
				Boolean(selectedTeacherSelfReview.reviewedAt)),
	);
	const selectedTeacherOpenReviewLocked =
		selectedTeacherHasSavedOpenReview && !selfReviewEditUnlocked;

	useEffect(() => {
		if (!selectedTeacherId) {
			setSelfReviewQuestionScores({});
			setPortfolioEducationDraft("");
			setPortfolioAttendanceDraft("");
			setSelfReviewNote("");
			setSelfReviewStatus(null);
			setAssessmentMode("WITH_BIQ");
			setBiqAverageDraft("");
			setMiqScoreDraft("");
			setAssessmentStatus(null);
			setLeadershipStatus(null);
			setSelfReviewEditUnlocked(false);
			setSelfReviewUnlockOpen(false);
			setSelfReviewUnlockPassword("");
			setSelfReviewUnlockReason("");
			setSelfReviewUnlockError(null);
			setSelfReviewUnlockSubmitting(false);
			return;
		}

		const nextScores = Object.fromEntries(
			selectedTeacherOpenQuestionIds.map((questionId) => [
				questionId,
				typeof selectedTeacherSelfReview?.questionScores?.[questionId] === "number"
					? String(selectedTeacherSelfReview.questionScores?.[questionId])
					: (() => {
							const questionText =
								selectedTeacherSelfResponse?.textAnswers.find(
									(item) => item.questionId === questionId,
								)?.questionText ?? "";
							const field = getSelfReviewPortfolioField(questionId, questionText);
							const savedScore = selectedTeacherPortfolio?.[field];
							return typeof savedScore === "number" ? String(savedScore) : "";
						})(),
			]),
		);
		setSelfReviewQuestionScores(nextScores);
		setPortfolioEducationDraft(
			typeof selectedTeacherPortfolio?.educationScore === "number"
				? String(selectedTeacherPortfolio.educationScore)
				: "",
		);
		setPortfolioAttendanceDraft(
			typeof selectedTeacherPortfolio?.attendanceScore === "number"
				? String(selectedTeacherPortfolio.attendanceScore)
				: "",
		);
		setSelfReviewNote(selectedTeacherSelfReview?.note ?? "");
		setSelfReviewStatus(null);
		const teacher = teacherMap[selectedTeacherId];
		setAssessmentMode(
			teacher && !getIsBiqTeacher(teacher) ? "WITHOUT_BIQ" : "WITH_BIQ",
		);
		const biqAverageScore = teacherBiqAverageMap[selectedTeacherId]?.score;
		setBiqAverageDraft(
			typeof biqAverageScore === "number" && !Number.isNaN(biqAverageScore)
				? String(biqAverageScore)
				: "",
		);
		const miqScore = examMap[selectedTeacherId]?.score;
		setMiqScoreDraft(
			typeof miqScore === "number" && !Number.isNaN(miqScore)
				? String(miqScore)
				: "",
		);
		setAssessmentStatus(null);
		setSelfReviewEditUnlocked(false);
		setSelfReviewUnlockOpen(false);
		setSelfReviewUnlockPassword("");
		setSelfReviewUnlockReason("");
		setSelfReviewUnlockError(null);
		setSelfReviewUnlockSubmitting(false);
	}, [
		selectedTeacherId,
		selectedTeacherOpenQuestionIds,
		selectedTeacherSelfResponse,
		selectedTeacherSelfReview,
		selectedTeacherPortfolio,
		teacherBiqAverageMap,
		teacherMap,
		examMap,
	]);

	const validTeacherScores = useMemo(
		() => teacherRows.filter((row) => row.finalScore !== null),
		[teacherRows],
	);
	const formatPkpdCategory = (row: TeacherRow) =>
		row.isComplete ? pkpdBucket(row.baseTotalScore) : "Hesablama tamamlanmayıb";
	const formatPkpdDecision = (row: TeacherRow) =>
		row.isComplete ? pkpdDecision(row.baseTotalScore) : "Qərar verilməyib";

	const visibleTeacherRows = useMemo(() => {
		const query = teacherQuery.trim().toLowerCase();
		return teacherRows.filter((row) => {
			const hasAnyData =
				row.finalScore !== null ||
				row.surveySubmissionCount > 0 ||
				row.studentCount > 0 ||
				row.managementCount > 0 ||
				row.selfCount > 0 ||
				row.biqAvg !== null;

			if (!showAllTeachers && !hasAnyData) return false;
			if (leadershipFilter === "complete" && !row.leadershipComplete) return false;
			if (leadershipFilter === "incomplete" && row.leadershipComplete) return false;
			if (leadershipFilter === "branch-manager-given" && !row.branchManagerSubmitted)
				return false;
			if (leadershipFilter === "branch-manager-missing" && row.branchManagerSubmitted)
				return false;
			if (leadershipFilter === "deputy-given" && !row.deputySubmitted) return false;
			if (leadershipFilter === "deputy-missing" && row.deputySubmitted) return false;
			if (leadershipFilter === "department-head-given" && !row.departmentHeadSubmitted)
				return false;
			if (leadershipFilter === "department-head-missing" && row.departmentHeadSubmitted)
				return false;
			if (!query) return true;

			return (
				row.name.toLowerCase().includes(query) ||
				row.departmentName.toLowerCase().includes(query) ||
				row.branchName.toLowerCase().includes(query)
			);
		});
	}, [leadershipFilter, showAllTeachers, teacherQuery, teacherRows]);

	const teacherTableColumns = useMemo<Array<DataTableColumn<TeacherRow>>>(
		() => [
			{
				key: "name",
				header: "Müəllim",
				sortValue: (row) => row.name,
				render: (row) => (
					<button
						className="btn ghost"
						type="button"
						onClick={() => setSelectedTeacherId(row.teacherId)}
					>
						{row.name}
					</button>
				),
			},
			{
				key: "campus",
				header: "Campus",
				sortValue: (row) => row.branchName,
				render: (row) => row.branchName,
			},
			{
				key: "department",
				header: "Kafedra",
				sortValue: (row) => row.departmentName,
				render: (row) => row.departmentName,
			},
			{
				key: "model",
				header: "Model",
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
				render: (row) => (
					<StatusBadge tone={row.leadershipComplete ? "success" : "warning"}>
						{row.leadershipSubmittedCount} / {row.leadershipEligibleCount}
					</StatusBadge>
				),
			},
			{
				key: "status",
				header: "Status",
				sortValue: (row) => getTeacherStatusInfo(row).label,
				render: (row) => {
					const statusInfo = getTeacherStatusInfo(row);
					return <StatusBadge tone={statusInfo.tone}>{statusInfo.label}</StatusBadge>;
				},
			},
			{
				key: "score",
				header: "PKPD balı",
				sortValue: (row) => (row.isComplete ? row.finalScore : row.currentEnteredScore),
				render: (row) =>
					row.isComplete
						? formatScore(row.finalScore)
						: `Cari: ${formatScore(row.currentEnteredScore)}`,
			},
			{
				key: "bonus",
				header: "Əlavə bal",
				sortValue: (row) => row.bonusScore,
				render: (row) => row.bonusScore.toFixed(2),
			},
			{
				key: "stimulus",
				header: "Stimullaşdırıcı yekun",
				sortValue: (row) => row.finalScoreWithExtra,
				render: (row) => formatScore(row.finalScoreWithExtra),
			},
			{
				key: "updated",
				header: "Son yenilənmə",
				sortValue: (row) => {
					const reviewedAt = selfReviewMap[row.teacherId]?.reviewedAt;
					return reviewedAt ? new Date(String(reviewedAt)).getTime() : 0;
				},
				render: (row) => {
					const reviewedAt = selfReviewMap[row.teacherId]?.reviewedAt;
					return reviewedAt
						? new Date(String(reviewedAt)).toLocaleDateString("az-AZ")
						: "—";
				},
			},
			{
				key: "submissions",
				header: "n",
				sortValue: (row) => row.surveySubmissionCount,
				render: (row) => row.surveySubmissionCount,
			},
		],
		[selfReviewMap],
	);
	const sortedTeacherRows = useMemo(
		() => sortData(visibleTeacherRows, teacherTableColumns, teacherSort),
		[teacherSort, teacherTableColumns, visibleTeacherRows],
	);

	const topTeacher = validTeacherScores[0];
	const bottomTeacher =
		validTeacherScores.length > 0
			? validTeacherScores[validTeacherScores.length - 1]
			: undefined;

	const overallSummary = useMemo(() => {
		const total = validTeacherScores.reduce(
			(acc, row) => acc + (row.finalScore ?? 0),
			0,
		);
		return {
			avg:
				validTeacherScores.length > 0 ? total / validTeacherScores.length : null,
			submissions: submissions.length,
		};
	}, [validTeacherScores, submissions.length]);

	const handleLeadershipOverride = async (enabled: boolean) => {
		if (!cycleId || !selectedTeacher) return;
		const { error } = await supabase.rpc("set_leadership_completion_override", {
			p_cycle_id: cycleId,
			p_teacher_id: selectedTeacher.teacherId,
			p_enabled: enabled,
			p_note: enabled ? "Cari verilmiş rəhbərlik səsləri əsasında yekunlaşdırıldı." : null,
		});
		if (error) {
			setLeadershipStatus(error.message);
			return;
		}
		setLeadershipCompletion((previous) => {
			const row = previous[selectedTeacher.teacherId];
			if (!row) return previous;
			return {
				...previous,
				[selectedTeacher.teacherId]: {
					...row,
					isOverridden: enabled,
					isComplete:
						row.eligibleCount > 0 &&
						(row.submittedCount >= row.eligibleCount ||
							(enabled && row.submittedCount > 0)),
				},
			};
		});
		setLeadershipStatus(
			enabled ? "Rəhbərlik səsi admin tərəfindən yekunlaşdırıldı." : "Admin yekunlaşdırması ləğv edildi.",
		);
	};

	const raterStats = useMemo(() => {
		const doneSet = new Set(submissions.map((item) => item.data.raterUid));
		const counts: Record<string, number> = {};
		submissions.forEach((item) => {
			counts[item.data.raterUid] = (counts[item.data.raterUid] ?? 0) + 1;
		});
		return {
			doneSet,
			counts,
		};
	}, [submissions]);

	const raterRows = useMemo(() => {
		return raters.map((rater) => ({
			id: rater.id,
			name: rater.data.displayName ?? rater.data.login ?? rater.id,
			role: rater.data.role,
			done: raterStats.doneSet.has(rater.id),
			submissions: raterStats.counts[rater.id] ?? 0,
		}));
	}, [raters, raterStats]);

	const comments = useMemo(() => {
		return answers
			.filter((answer) => questions[answer.data.questionId]?.type === "text")
			.map((answer) => {
				const task = taskMap[answer.data.submissionId];
				if (!task || task.targetType !== "teacher") return null;

				return {
					teacherId: task.targetId,
					text: String(answer.data.value ?? "").trim(),
					createdAt: answer.data.createdAt,
				};
			})
			.filter(
				(comment): comment is { teacherId: string; text: string; createdAt: unknown } =>
					Boolean(comment && comment.text.length > 0),
			)
			.sort((a, b) => {
				const aRaw = a.createdAt ? new Date(a.createdAt as string).getTime() : 0;
				const bRaw = b.createdAt ? new Date(b.createdAt as string).getTime() : 0;
				return bRaw - aRaw;
			});
	}, [answers, questions, taskMap]);

	const cycleBranchNames = useMemo(() => {
		const branchIds = getCycleBranchIds(cycle);
		if (branchIds.length === 0) return "Bütün kampuslar";
		return branchIds
			.map((branchId) => branchMap[branchId]?.name ?? branchId)
			.join(", ");
	}, [branchMap, cycle]);

	useEffect(() => {
		const totalPages = Math.max(
			1,
			Math.ceil(visibleTeacherRows.length / teacherPageSize),
		);
		if (teacherPage > totalPages) setTeacherPage(totalPages);
	}, [teacherPage, teacherPageSize, visibleTeacherRows.length]);

	useEffect(() => {
		const totalPages = Math.max(1, Math.ceil(raterRows.length / raterPageSize));
		if (raterPage > totalPages) setRaterPage(totalPages);
	}, [raterPage, raterPageSize, raterRows.length]);

	useEffect(() => {
		const totalPages = Math.max(1, Math.ceil(comments.length / commentPageSize));
		if (commentPage > totalPages) setCommentPage(totalPages);
	}, [commentPage, commentPageSize, comments.length]);

	const paginatedTeacherRows = useMemo(() => {
		const start = (teacherPage - 1) * teacherPageSize;
		return sortedTeacherRows.slice(start, start + teacherPageSize);
	}, [teacherPage, teacherPageSize, sortedTeacherRows]);

	const paginatedRaterRows = useMemo(() => {
		const start = (raterPage - 1) * raterPageSize;
		return raterRows.slice(start, start + raterPageSize);
	}, [raterPage, raterPageSize, raterRows]);

	const paginatedComments = useMemo(() => {
		const start = (commentPage - 1) * commentPageSize;
		return comments.slice(start, start + commentPageSize);
	}, [commentPage, commentPageSize, comments]);

	const handleExportCsv = () => {
		if (!cycleId) return;
		const year = cycle?.year ?? "-";
		const rows = teacherRows.map((item) => [
			item.branchName,
			item.firstName,
			item.lastName,
			item.departmentName,
			item.baseTotalScore === null ? "" : item.baseTotalScore.toFixed(2),
			item.bonusScore.toFixed(2),
			item.finalScoreWithExtra === null
				? ""
				: item.finalScoreWithExtra.toFixed(2),
		]);

		downloadCsv(
			`cycle-${year}-teacher-final-scores.csv`,
			[
				"campus",
				"ad",
				"soyad",
				"kafedra",
				"esas_pkpd_bali",
				"elave_bal",
				"stimullasdirici_yekun",
			],
			rows,
		);
	};

	const handleExportTeacherPdfLegacy = () => {
		if (!selectedTeacher) return;
		const feedback = buildTeacherFeedback(selectedTeacher);

		const toListHtml = (items: string[]) =>
			items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
		const studentWeightedScoreText = formatScore(
			selectedTeacher.studentWeightedScore,
		);
		const studentScoreMax = selectedTeacher.isBiqTeacher ? 15 : 20;
		const managementWeightedScoreText = formatScore(
			selectedTeacher.managementWeightedScore,
		);
		const selfWeightedScoreText = formatScore(selectedTeacher.selfWeightedScore);
		const biqAverageText = formatScore(selectedTeacher.biqAvg);
		const biqAverageSourceText =
			selectedTeacher.biqAverageSource === "manual"
				? "manual daxil edilib"
				: selectedTeacher.biqAverageSource === "computed"
					? "qrup/fənn üzrə hesablanıb"
					: "məlumat yoxdur";
		const biqWeightedScoreText = formatScore(selectedTeacher.biqWeightedScore);
		const examScoreText = formatScore(selectedTeacher.examScore);
		const portfolioScoreText = formatScore(selectedTeacher.portfolioScore);
		const bonusScoreText = selectedTeacher.bonusScore.toFixed(2);
		const baseTotalScoreText = formatScore(selectedTeacher.baseTotalScore);
		const finalScoreText = formatScore(selectedTeacher.finalScoreWithExtra);
		const decisionText = pkpdDecision(selectedTeacher.baseTotalScore);
		const assessmentResultLabel = escapeHtml(selectedTeacher.assessmentResultLabel);
		const academicReviewedAtText = selectedTeacherSelfReview?.reviewedAt
			? new Date(String(selectedTeacherSelfReview.reviewedAt)).toLocaleString("az-AZ")
			: null;
		const academicEditReasonText = selectedTeacherSelfReview?.editReason
			? escapeHtml(selectedTeacherSelfReview.editReason)
			: null;
		const openAnswerRowsHtml =
			selectedTeacherSelfResponse && selectedTeacherSelfResponse.textAnswers.length > 0
				? selectedTeacherSelfResponse.textAnswers
						.map((item, index) => {
							const questionScore =
								selectedTeacherSelfReview?.questionScores?.[item.questionId] ?? null;
							return `
								<tr>
									<td>${index + 1}</td>
									<td>${escapeHtml(item.questionText)}</td>
									<td>${escapeHtml(item.answerText)}</td>
									<td>${formatScore(questionScore)}</td>
								</tr>
							`;
						})
						.join("")
				: `
					<tr>
						<td colspan="4">Açıq özünüqiymətləndirmə cavabı yoxdur.</td>
					</tr>
				`;

		const classRowsHtml =
			selectedTeacher.studentClassScores.length > 0
				? selectedTeacher.studentClassScores
						.map(
							(item) => `
								<tr>
									<td>${escapeHtml(item.groupName)}</td>
									<td>${item.submissionCount}</td>
									<td>${formatScore(item.avg)}</td>
								</tr>
							`,
						)
						.join("")
				: `
					<tr>
						<td colspan="3">Sinif/blok üzrə şagird nəticəsi yoxdur.</td>
					</tr>
				`;

		const year = cycle?.year ?? "-";
		const generatedAt = new Date().toLocaleString("az-AZ");
		const teacherName = escapeHtml(selectedTeacher.name);
		const campus = escapeHtml(selectedTeacher.branchName);
		const department = escapeHtml(selectedTeacher.departmentName);
		const feedbackSummary = escapeHtml(feedback.summary);
		const feedbackLevel = escapeHtml(feedback.levelLabel);

		const html = `
			<!doctype html>
			<html lang="az">
				<head>
					<meta charset="utf-8" />
					<title>${teacherName} - Yekun Nəticə</title>
					<style>
						body {
							font-family: Arial, Helvetica, sans-serif;
							margin: 24px;
							color: #0f172a;
						}
						h1, h2 {
							margin: 0 0 8px 0;
						}
						.meta {
							margin: 0 0 4px 0;
							color: #334155;
							font-size: 14px;
						}
						.section {
							margin-top: 18px;
						}
						.grid {
							display: grid;
							grid-template-columns: 1fr 1fr;
							gap: 10px;
							margin-top: 8px;
						}
						.card {
							border: 1px solid #cbd5e1;
							border-radius: 8px;
							padding: 10px;
						}
						.label {
							font-size: 12px;
							color: #475569;
						}
						.value {
							font-size: 20px;
							font-weight: 700;
						}
						table {
							width: 100%;
							border-collapse: collapse;
							margin-top: 8px;
						}
						th, td {
							border: 1px solid #cbd5e1;
							padding: 8px;
							text-align: left;
							font-size: 14px;
						}
						th {
							background: #f1f5f9;
						}
						.feedback-box {
							border: 1px solid #cbd5e1;
							border-radius: 10px;
							padding: 12px;
							background: #f8fafc;
							margin-top: 10px;
						}
						.feedback-title {
							font-size: 16px;
							font-weight: 700;
							margin-bottom: 8px;
						}
						.feedback-meta {
							font-size: 13px;
							color: #334155;
							margin-bottom: 8px;
						}
						.feedback-section-title {
							margin: 10px 0 6px;
							font-size: 14px;
							font-weight: 600;
						}
						.feedback-list {
							margin: 0;
							padding-left: 18px;
						}
						.feedback-list li {
							margin-bottom: 5px;
							font-size: 14px;
						}
						.meta-stack {
							display: grid;
							gap: 6px;
							margin-top: 8px;
						}
						.signature-section {
							margin-top: 26px;
							padding-top: 8px;
							border-top: 2px solid #e2e8f0;
						}
						.signature-grid {
							display: grid;
							grid-template-columns: 1fr 1fr;
							gap: 14px;
							margin-top: 10px;
						}
						.signature-card {
							border: 1px solid #cbd5e1;
							border-radius: 8px;
							padding: 12px 10px;
							min-height: 86px;
						}
						.signature-role {
							font-size: 13px;
							font-weight: 600;
							margin-bottom: 22px;
						}
						.signature-line {
							border-bottom: 1px solid #334155;
							height: 18px;
						}
						.signature-note {
							margin-top: 6px;
							font-size: 12px;
							color: #64748b;
						}
						.signature-date {
							margin-top: 14px;
							font-size: 14px;
						}
						.stamp-box {
							margin-top: 14px;
							border: 1px dashed #94a3b8;
							border-radius: 8px;
							padding: 10px;
							min-height: 58px;
							display: flex;
							align-items: center;
							justify-content: center;
							font-size: 13px;
							color: #64748b;
						}
						@media print {
							body {
								margin: 12mm;
							}
							.signature-card {
								break-inside: avoid;
							}
						}
					</style>
				</head>
				<body>
					<h1>Müəllim Yekun Nəticə Hesabatı</h1>
					<p class="meta">Sorğu dövrü: ${year}</p>
					<p class="meta">Müəllim: ${teacherName}</p>
					<p class="meta">Kampus: ${campus}</p>
					<p class="meta">Kafedra: ${department}</p>
					<p class="meta">Hazırlanma vaxtı: ${generatedAt}</p>

					<div class="section">
						<h2>Yekun Göstəricilər</h2>
						<div class="grid">
							<div class="card"><div class="label">Rəhbərlik sorğusu (10 bal üzrə)</div><div class="value">${managementWeightedScoreText}</div></div>
							<div class="card"><div class="label">Özünüqiymətləndirmə (10 bal üzrə)</div><div class="value">${selfWeightedScoreText}</div></div>
							<div class="card"><div class="label">BİQ ortalaması</div><div class="value">${biqAverageText}</div><div class="meta">${escapeHtml(biqAverageSourceText)}</div></div>
							<div class="card"><div class="label">${assessmentResultLabel} (15 bal üzrə)</div><div class="value">${biqWeightedScoreText}</div></div>
							<div class="card"><div class="label">Şagird sorğusu (${studentScoreMax} bal üzrə)</div><div class="value">${studentWeightedScoreText}</div></div>
							<div class="card"><div class="label">Attestasiya imtahanı (30 bal üzrə)</div><div class="value">${examScoreText}</div></div>
							<div class="card"><div class="label">Portfolio</div><div class="value">${portfolioScoreText}</div></div>
							<div class="card"><div class="label">PKPD yekun balı</div><div class="value">${baseTotalScoreText}</div></div>
							<div class="card"><div class="label">Əlavə bal</div><div class="value">${bonusScoreText}</div></div>
							<div class="card"><div class="label">Stimullaşdırıcı yekun</div><div class="value">${finalScoreText}</div><div class="meta">${escapeHtml(decisionText)}</div></div>
						</div>
					</div>

					<div class="section">
							<h2>Daxil edilmiş balların cari cəmi və açıq cavablar</h2>
						<div class="meta-stack">
							<p class="meta">Son qiymətləndirmə: ${academicReviewedAtText ?? "—"}</p>
							<p class="meta">Son düzəliş səbəbi: ${academicEditReasonText ?? "—"}</p>
						</div>
						<table>
							<thead>
								<tr>
									<th>#</th>
									<th>Sual</th>
									<th>Cavab</th>
									<th>Bal</th>
								</tr>
							</thead>
							<tbody>
								${openAnswerRowsHtml}
							</tbody>
						</table>
					</div>

					<div class="section">
						<h2>Sinif/Blok Üzrə Şagird Balları</h2>
						<table>
							<thead>
								<tr>
									<th>Sinif / blok</th>
									<th>Cavab sayı</th>
									<th>Sinif orta balı</th>
								</tr>
							</thead>
							<tbody>
								${classRowsHtml}
							</tbody>
						</table>
					</div>

					<div class="section">
						<h2>Rəy və Tövsiyələr</h2>
						<div class="feedback-box">
							<div class="feedback-title">Avtomatik qiymətləndirmə rəyi</div>
							<div class="feedback-meta">Səviyyə: ${feedbackLevel}</div>
							<div class="feedback-meta">${feedbackSummary}</div>

							<div class="feedback-section-title">Güclü tərəflər</div>
							<ul class="feedback-list">
								${toListHtml(feedback.strengths)}
							</ul>

							<div class="feedback-section-title">İnkişaf tələb edən istiqamətlər</div>
							<ul class="feedback-list">
								${toListHtml(feedback.improvements)}
							</ul>

							<div class="feedback-section-title">Tövsiyə olunan fəaliyyət planı</div>
							<ul class="feedback-list">
								${toListHtml(feedback.actionPlan)}
							</ul>
						</div>
					</div>

					<div class="section signature-section">
						<h2>Təsdiq və İmzalar</h2>
						<div class="signature-grid">
							<div class="signature-card">
								<div class="signature-role">Müəllim</div>
								<div class="signature-line"></div>
								<div class="signature-note">Ad, soyad və imza</div>
							</div>
							<div class="signature-card">
								<div class="signature-role">Kafedra müdiri</div>
								<div class="signature-line"></div>
								<div class="signature-note">Ad, soyad və imza</div>
							</div>
							<div class="signature-card">
								<div class="signature-role">Filial rəhbəri</div>
								<div class="signature-line"></div>
								<div class="signature-note">Ad, soyad və imza</div>
							</div>
							<div class="signature-card">
								<div class="signature-role">Mərkəzi idarə nümayəndəsi</div>
								<div class="signature-line"></div>
								<div class="signature-note">Ad, soyad və imza</div>
							</div>
						</div>
						<div class="signature-date">Tarix: ____ / ____ / ______</div>
						<div class="stamp-box">Möhür üçün yer</div>
					</div>
				</body>
			</html>
		`;

		const blob = new Blob([html], { type: "text/html;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const popup = window.open(url, "_blank");
		if (!popup) {
			URL.revokeObjectURL(url);
			return;
		}

		popup.addEventListener("load", () => {
			popup.focus();
			popup.print();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		});
	};

	void handleExportTeacherPdfLegacy;

	const handleExportTeacherPdf = () => {
		if (!selectedTeacher) return;

		const year = cycle?.year ?? new Date().getFullYear();
		const isWithBiq = selectedTeacher.evaluationType === "WITH_BIQ";
		const modelLabel = isWithBiq ? "BİQ/KİQ nəticəsi olan müəllim" : "BİQ/KİQ nəticəsi olmayan müəllim";
		const now = new Date();
		const generatedDate = now.toLocaleDateString("az-AZ", { day: "2-digit", month: "2-digit", year: "numeric" });
		const generatedTime = now.toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit", hour12: false });
		const scoreText = (value: number | null | undefined) => isMissingScore(value) ? "Daxil edilməyib" : formatScore(value ?? null);
		const scoreWithMax = (value: number | null | undefined, max: number) => `${scoreText(value)} / ${max}`;
		const leadershipVoteStatus = `${selectedTeacher.leadershipSubmittedCount} / ${selectedTeacher.leadershipEligibleCount}`;
		const leadershipCompletionText = selectedTeacher.leadershipComplete
			? "Rəhbərlik qiymətləndirməsi tamamlanıb"
			: "Rəhbərlik qiymətləndirməsi tamamlanmayıb";

		const breakdownRows: PdfScoreRow[] = isWithBiq
			? [
					{ key: "subjectMasteryScore", label: "Balabilgənin fənni mənimsəməsi", value: selectedTeacher.biqWeightedScore, max: 15 },
					{ key: "studentSurveyScore", label: "Balabilgə sorğusu", value: selectedTeacher.studentWeightedScore, max: 15 },
					{ key: "selfEvaluationScore", label: "Özünü qiymətləndirmə", value: selectedTeacher.selfWeightedScore, max: 10 },
					{ key: "leadershipEvaluationScore", label: "Rəhbərlik qiymətləndirməsi", value: selectedTeacher.managementWeightedScore, max: 10 },
					{ key: "examScore", label: "Attestasiya imtahanı", value: selectedTeacher.examScore, max: 30 },
					{ key: "portfolioScore", label: "Portfolio", value: selectedTeacher.portfolioScore, max: 20 },
				]
			: [
					{ key: "studentSurveyScore", label: "Balabilgə sorğusu", value: selectedTeacher.studentWeightedScore, max: 20 },
					{ key: "selfEvaluationScore", label: "Özünü qiymətləndirmə", value: selectedTeacher.selfWeightedScore, max: 10 },
					{ key: "leadershipEvaluationScore", label: "Rəhbərlik qiymətləndirməsi", value: selectedTeacher.managementWeightedScore, max: 10 },
					{ key: "portfolioScore", label: "Portfolio", value: selectedTeacher.portfolioScore, max: 60 },
				];
		const portfolioMax = isWithBiq ? 20 : 60;
		const portfolioRows: PdfScoreRow[] = selectedTeacherPortfolioLimits ? [
			{ key: "educationQualificationScore", label: "Təhsil / kvalifikasiya", value: selectedTeacherPortfolio?.educationScore, max: selectedTeacherPortfolioLimits.education },
			{ key: "attendanceScore", label: "Davamiyyət", value: selectedTeacherPortfolio?.attendanceScore, max: selectedTeacherPortfolioLimits.attendance },
			{ key: "certificatesPublicationsScore", label: "Sertifikat / məqalə / təlim", value: selectedTeacherPortfolio?.trainingScore, max: selectedTeacherPortfolioLimits.training },
			{ key: isWithBiq ? "olympiadCompetitionScore" : "competitionFestivalScore", label: isWithBiq ? "Olimpiada / müsabiqə" : "Müsabiqə / festival / yarış", value: selectedTeacherPortfolio?.olympiadScore, max: selectedTeacherPortfolioLimits.olympiad },
			{ key: "projectsAwardsScore", label: "Layihə / tədbir / təltif", value: selectedTeacherPortfolio?.eventsScore, max: selectedTeacherPortfolioLimits.events },
		] : [];

		const missingRows = breakdownRows.filter((row) => isMissingScore(row.value));
		const isFinalReport = selectedTeacher.isComplete && missingRows.length === 0;
		const reportTitle = isFinalReport ? `PKPD Yekun Nəticə Hesabatı — ${year}` : `PKPD Cari Qiymətləndirmə Hesabatı — ${year}`;
		const statusText = isFinalReport ? "Yekun qiymətləndirmə tamamlanıb" : "Hesablama tamamlanmayıb";
		const baseTotalScore = isFinalReport ? selectedTeacher.baseTotalScore : null;
		const finalScoreWithExtra = isFinalReport ? selectedTeacher.finalScoreWithExtra : null;
		const categoryText = isFinalReport && baseTotalScore !== null ? pkpdBucket(baseTotalScore) : null;
		const decisionText = isFinalReport && baseTotalScore !== null ? pkpdDecision(baseTotalScore) : "Qərar verilməyib";
		const uniqueMissingLabels = Array.from(new Set(missingRows.map((row) => row.key === "portfolioScore" ? "Portfolio alt meyarları" : row.label)));
		const hasAnyPortfolioScore = portfolioRows.some((row) => !isMissingScore(row.value));
		const summaryHtml = isFinalReport
			? `<div class="summary-item"><span>PKPD yekun balı</span><strong>${scoreWithMax(baseTotalScore, 100)}</strong></div><div class="summary-item"><span>Əlavə bal</span><strong>${formatScore(selectedTeacher.bonusScore)}</strong></div><div class="summary-item"><span>Stimullaşdırıcı yekun</span><strong>${scoreText(finalScoreWithExtra)}</strong></div><div class="summary-item"><span>Kateqoriya</span><strong>${escapeHtml(categoryText ?? "Daxil edilməyib")}</strong></div><div class="summary-item"><span>Qərar</span><strong>${escapeHtml(decisionText)}</strong></div><div class="summary-item"><span>Verilmiş rəhbərlik səsi</span><strong>${leadershipVoteStatus}</strong></div>`
			: `<div class="summary-item"><span>Daxil edilmiş cari bal</span><strong>${scoreWithMax(selectedTeacher.currentEnteredScore, 100)}</strong></div><div class="summary-item"><span>Əlavə bal</span><strong>${formatScore(selectedTeacher.bonusScore)}</strong></div><div class="summary-item"><span>Status</span><strong>Hesablama tamamlanmayıb</strong></div><div class="summary-item"><span>Qərar</span><strong>Qərar verilməyib</strong></div><div class="summary-item"><span>Verilmiş rəhbərlik səsi</span><strong>${leadershipVoteStatus}</strong></div><div class="summary-item"><span>Rəhbərlik statusu</span><strong>${leadershipCompletionText}</strong></div><p class="note">Qeyd: Bu göstərici yekun PKPD balı deyil. Bütün tələb olunan qiymətləndirmə sahələri daxil edildikdən sonra yekun nəticə və qərar formalaşdırılacaq.</p>`;
		const totalLabel = isFinalReport ? "PKPD yekun balı" : "Daxil edilmiş cari cəm";
		const totalValue = isFinalReport ? baseTotalScore : selectedTeacher.currentEnteredScore;
		const breakdownHtml = [...breakdownRows.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${scoreText(row.value)}</td><td>${row.max}</td></tr>`), `<tr class="total-row"><td>${totalLabel}</td><td>${scoreText(totalValue)}</td><td>100</td></tr>`].join("");
		const missingHtml = !isFinalReport && uniqueMissingLabels.length > 0 ? `<section><h2>Çatışmayan sahələr</h2><ul class="missing-list">${uniqueMissingLabels.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>` : "";
		const portfolioHtml = hasAnyPortfolioScore ? `<table><thead><tr><th>Meyar</th><th>Bal</th><th>Maksimum</th></tr></thead><tbody>${[...portfolioRows.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${scoreText(row.value)}</td><td>${row.max}</td></tr>`), `<tr class="total-row"><td>Portfolio cəmi</td><td>${scoreText(selectedTeacher.portfolioScore)}</td><td>${portfolioMax}</td></tr>`].join("")}</tbody></table>` : `<p class="empty-note">Portfolio alt meyarları üzrə bal hələ daxil edilməyib.</p><p class="empty-note">Maksimum portfolio balı: ${portfolioMax}</p>`;
		const recommendations = isFinalReport ? buildFinalRecommendations(baseTotalScore, breakdownRows) : ["Rəy və tövsiyələr yekun qiymətləndirmə tamamlandıqdan sonra formalaşdırılacaq."];
		const recommendationsHtml = recommendations.map((item) => `<p>${escapeHtml(item)}</p>`).join("");
		const signaturesHtml = isFinalReport ? `<section class="signatures"><h2>Təsdiq və imzalar</h2><div class="signature-line"><strong>Müəllim:</strong><span></span></div><div class="signature-line"><strong>Kafedra rəhbəri:</strong><span></span></div><div class="signature-line"><strong>Filial rəhbəri:</strong><span></span></div><div class="signature-line"><strong>Attestasiya komissiyasının sədri:</strong><span></span></div><div class="signature-line"><strong>Tarix:</strong><span>____ / ____ / ______</span></div><div class="signature-line"><strong>Möhür üçün yer:</strong><span></span></div></section>` : "";
		const html = `<!doctype html><html lang="az"><head><meta charset="utf-8" /><title>${escapeHtml(selectedTeacher.name)} - ${reportTitle}</title><style>@page { size: A4; margin: 15mm; } body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; font-size: 12px; line-height: 1.45; } header { border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 14px; } .org { font-size: 13px; font-weight: 700; text-transform: uppercase; } h1 { font-size: 18px; margin: 4px 0; } .subtitle { font-size: 15px; font-weight: 700; } section { margin-top: 14px; break-inside: avoid; } h2 { font-size: 14px; margin: 0 0 8px; border-bottom: 1px solid #d1d5db; padding-bottom: 4px; } .info-grid, .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; } .info-item, .summary-item { border: 1px solid #d1d5db; padding: 7px 8px; min-height: 28px; } .info-item span, .summary-item span { display: block; color: #4b5563; font-size: 11px; } .info-item strong, .summary-item strong { font-size: 13px; } .note { grid-column: 1 / -1; margin: 2px 0 0; padding: 8px; border-left: 3px solid #92400e; background: #fffbeb; } table { width: 100%; border-collapse: collapse; margin-top: 6px; break-inside: avoid; } tr { break-inside: avoid; } th, td { border: 1px solid #d1d5db; padding: 7px 8px; text-align: left; vertical-align: top; } th { background: #f3f4f6; font-weight: 700; } .total-row td { font-weight: 700; background: #f9fafb; } .missing-list { margin: 6px 0 0; padding-left: 18px; } .empty-note { margin: 4px 0; } .student-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; } .student-summary div { border: 1px solid #d1d5db; padding: 7px 8px; } .student-summary span { display: block; color: #4b5563; font-size: 11px; } .signatures { margin-top: 20px; break-inside: avoid; } .signature-line { display: grid; grid-template-columns: 190px 1fr; gap: 12px; align-items: end; margin-top: 14px; } .signature-line span { display: block; min-height: 20px; border-bottom: 1px solid #111827; } .generated { margin-top: 18px; color: #4b5563; font-size: 11px; }</style></head><body><header><div class="org">Hədəf STEAM Liseyi MMC</div><h1>Pedaqoji Kadrların Performans Dəyərləndirilməsi</h1><div class="subtitle">${reportTitle}</div></header><section><h2>Müəllim məlumatları</h2><div class="info-grid"><div class="info-item"><span>Müəllim</span><strong>${escapeHtml(selectedTeacher.name)}</strong></div><div class="info-item"><span>Kampus</span><strong>${escapeHtml(selectedTeacher.branchName)}</strong></div><div class="info-item"><span>Kafedra</span><strong>${escapeHtml(selectedTeacher.departmentName)}</strong></div><div class="info-item"><span>Qiymətləndirmə modeli</span><strong>${escapeHtml(modelLabel)}</strong></div><div class="info-item"><span>Hesabat statusu</span><strong>${statusText}</strong></div></div></section><section><h2>Xülasə</h2><div class="summary-grid">${summaryHtml}</div></section><section><h2>Bal bölgüsü</h2><table><thead><tr><th>Meyar</th><th>Bal</th><th>Maksimum</th></tr></thead><tbody>${breakdownHtml}</tbody></table></section>${missingHtml}<section><h2>Portfolio xülasəsi</h2>${portfolioHtml}</section><section><h2>Balabilgə sorğusu xülasəsi</h2><div class="student-summary"><div><span>10 üzərindən orta bal</span><strong>${scoreText(selectedTeacher.studentAvg)}</strong></div><div><span>Cavab sayı</span><strong>${selectedTeacher.studentCount}</strong></div><div><span>Çevrilmiş bal</span><strong>${scoreWithMax(selectedTeacher.studentWeightedScore, isWithBiq ? 15 : 20)}</strong></div></div></section><section><h2>Rəy və tövsiyələr</h2>${recommendationsHtml}</section>${signaturesHtml}<div class="generated"><div>Hazırlanma tarixi: ${generatedDate}</div><div>Hazırlanma saatı: ${generatedTime}</div></div></body></html>`;
		const blob = new Blob([html], { type: "text/html;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const popup = window.open(url, "_blank");
		if (!popup) { URL.revokeObjectURL(url); return; }
		popup.addEventListener("load", () => { popup.focus(); popup.print(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
	};
const handleTeacherDetailOpenChange = (open: boolean) => {
		if (!open) {
			setSelectedTeacherId(null);
			setSelfReviewQuestionScores({});
			setPortfolioEducationDraft("");
			setPortfolioAttendanceDraft("");
			setSelfReviewStatus(null);
			setAssessmentMode("WITH_BIQ");
			setBiqAverageDraft("");
			setMiqScoreDraft("");
			setAssessmentStatus(null);
			setSelfReviewEditUnlocked(false);
			setSelfReviewUnlockOpen(false);
			setSelfReviewUnlockPassword("");
			setSelfReviewUnlockReason("");
			setSelfReviewUnlockError(null);
			setSelfReviewUnlockSubmitting(false);
		}
	};

	const handleSaveAssessmentMode = async () => {
		if (!cycleId || !selectedTeacherId) return;

		const teacherBranchId = teacherMap[selectedTeacherId]?.branchId;
		if (!teacherBranchId) {
			setAssessmentStatus("Müəllimin filialı tapılmadı");
			return;
		}

		const isBiqTeacher = assessmentMode === "WITH_BIQ";
		const rawBiqAverage = biqAverageDraft.trim();
		const parsedBiqAverage = rawBiqAverage
			? Number(rawBiqAverage.replace(",", "."))
			: null;
		if (
			isBiqTeacher &&
			rawBiqAverage &&
			(parsedBiqAverage === null ||
				Number.isNaN(parsedBiqAverage) ||
				parsedBiqAverage < 0 ||
				parsedBiqAverage > 100)
		) {
			setAssessmentStatus("BİQ ortalaması 0-100 arası olmalıdır");
			return;
		}
		const rawExamScore = miqScoreDraft.trim();
		const parsedExamScore = rawExamScore ? Number(rawExamScore) : null;
		if (
			isBiqTeacher &&
			rawExamScore &&
			(parsedExamScore === null ||
				Number.isNaN(parsedExamScore) ||
				parsedExamScore < 0 ||
				parsedExamScore > 30)
		) {
			setAssessmentStatus("Attestasiya imtahanı balı 0-30 arası olmalıdır");
			return;
		}

		const { error: teacherError } = await supabase
			.from("teachers")
			.update({ is_biq_teacher: isBiqTeacher })
			.eq("org_id", ORG_ID)
			.eq("id", selectedTeacherId);
		if (teacherError) {
			setAssessmentStatus(
				`PKPD modeli saxlanmadı: ${teacherError.message ?? "naməlum xəta"}`,
			);
			return;
		}

		setTeachers((prev) =>
			prev.map((teacher) =>
				teacher.id === selectedTeacherId
					? {
							...teacher,
							data: { ...teacher.data, isBiqTeacher },
						}
					: teacher,
			),
		);

		if (isBiqTeacher && rawBiqAverage) {
			const { error: biqAverageError } = await supabase
				.from("pkpd_teacher_biq_averages")
				.upsert(
					{
						org_id: ORG_ID,
						branch_id: teacherBranchId,
						cycle_id: cycleId,
						teacher_id: selectedTeacherId,
						score: parsedBiqAverage ?? 0,
					},
					{ onConflict: "org_id,cycle_id,teacher_id" },
				);
			if (biqAverageError) {
				setAssessmentStatus("BİQ ortalaması saxlanmadı");
				return;
			}
		}

		if (isBiqTeacher && rawExamScore) {
			const { error: examError } = await supabase
				.from("pkpd_exam_results")
				.upsert(
					{
						org_id: ORG_ID,
						branch_id: teacherBranchId,
						cycle_id: cycleId,
						teacher_id: selectedTeacherId,
						score: parsedExamScore ?? 0,
					},
					{ onConflict: "org_id,cycle_id,teacher_id" },
				);
			if (examError) {
				setAssessmentStatus("Attestasiya imtahanı balı saxlanmadı");
				return;
			}
		}

		const refreshedRows = await fetchAllBatched<any>(async (from, to) =>
			await supabase
				.from("pkpd_exam_results")
				.select("*")
				.eq("org_id", ORG_ID)
				.eq("cycle_id", cycleId)
				.range(from, to),
		);
		setExamResults(
			refreshedRows.map((row) => ({
				id: row.id,
				data: mapPkpdExamRow(row),
			})),
		);
		const refreshedBiqAverageRows = await fetchAllBatched<any>(async (from, to) =>
			await supabase
				.from("pkpd_teacher_biq_averages")
				.select("*")
				.eq("org_id", ORG_ID)
				.eq("cycle_id", cycleId)
				.range(from, to),
		);
		setTeacherBiqAverages(
			refreshedBiqAverageRows.map((row) => ({
				id: row.id,
				data: mapPkpdTeacherBiqAverageRow(row),
			})),
		);

		setAssessmentStatus(
			isBiqTeacher
				? "Müəllim BİQ müəllimi, BİQ ortalaması və attestasiya imtahanı ilə saxlanıldı"
				: "Müəllim BİQ olmayan fənn müəllimi kimi saxlanıldı; əvvəlki imtahan qeydləri silinmədi və hesaba qatılmır",
		);
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
			setSelfReviewUnlockError("Hesab şifrəsini daxil edin.");
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
		setSelfReviewUnlockSubmitting(false);
		setSelfReviewStatus("Düzəliş üçün sahələr açıldı.");
	};

	const handleSaveSelfReview = async () => {
		if (!cycleId || !selectedTeacherId) return;
		if (!selectedTeacherHasOpenAnswers) {
			setSelfReviewStatus("Açıq cavab olmadığı üçün bal verilə bilməz");
			return;
		}
		if (selectedTeacherOpenReviewLocked) {
			setSelfReviewStatus(
				"Bu qiymətləndirmə kilidlənib. Düzəliş üçün hesab şifrəsi tələb olunur.",
			);
			return;
		}

		const teacherBranchId = teacherMap[selectedTeacherId]?.branchId;
		if (!teacherBranchId) {
			setSelfReviewStatus("Müəllimin filialı tapılmadı");
			return;
		}
		if (!selectedTeacherPortfolioLimits) {
			setSelfReviewStatus("Portfolio limitləri tapılmadı");
			return;
		}

		const noteValue = selfReviewNote.trim() || null;
		const educationScore = toNumber(portfolioEducationDraft);
		const attendanceScore = toNumber(portfolioAttendanceDraft);
		if (
			(educationScore !== null &&
				(educationScore < 0 ||
					educationScore > selectedTeacherPortfolioLimits.education)) ||
			(attendanceScore !== null &&
				(attendanceScore < 0 ||
					attendanceScore > selectedTeacherPortfolioLimits.attendance))
		) {
			setSelfReviewStatus("Təhsil və davamiyyət balları 0-3 arasında olmalıdır");
			return;
		}
		const questionScores = Object.fromEntries(
			selectedTeacherOpenQuestionIds.map((questionId) => [
				questionId,
				selfReviewQuestionScores[questionId]?.trim() ?? "",
			]),
		);
		const hasAnyScore = Object.values(questionScores).some((value) => value !== "");

		if (!hasAnyScore) {
			if (!noteValue) {
				setSelfReviewStatus(
					"Boş açıq sual/HR qiymətləndirməsi saxlanmadı; mövcud qeyd silinmədi",
				);
				return;
			}

			setSelfReviewStatus("Hər açıq sual üçün bal daxil edilməlidir");
			return;
		}

		const normalizedQuestionScores: Record<string, number> = {};
		const portfolioQuestionScores: Record<SelfReviewPortfolioField, number | null> = {
			trainingScore: null,
			olympiadScore: null,
			eventsScore: null,
		};
		for (const [questionId, rawValue] of Object.entries(questionScores)) {
			if (rawValue === "") {
				setSelfReviewStatus("Hər açıq sual üçün bal daxil edilməlidir");
				return;
			}
			const scoreValue = Number(rawValue);
			const questionText =
				selectedTeacherSelfResponse?.textAnswers.find(
					(item) => item.questionId === questionId,
				)?.questionText ?? "";
			const maxScore = selectedTeacherPortfolioLimits
				? getSelfReviewQuestionLimit(
						questionId,
						questionText,
						selectedTeacherPortfolioLimits,
					)
				: 10;
			if (Number.isNaN(scoreValue) || scoreValue < 0 || scoreValue > maxScore) {
				setSelfReviewStatus(`Hər sualın balı 0-${maxScore} arasında olmalıdır`);
				return;
			}
			normalizedQuestionScores[questionId] = scoreValue;
			const portfolioField = getSelfReviewPortfolioField(questionId, questionText);
			portfolioQuestionScores[portfolioField] =
				(portfolioQuestionScores[portfolioField] ?? 0) + scoreValue;
		}

		const portfolioLimits: Record<SelfReviewPortfolioField, number> = {
			trainingScore: selectedTeacherPortfolioLimits.training,
			olympiadScore: selectedTeacherPortfolioLimits.olympiad,
			eventsScore: selectedTeacherPortfolioLimits.events,
		};
		for (const [field, value] of Object.entries(portfolioQuestionScores) as Array<
			[SelfReviewPortfolioField, number | null]
		>) {
			if (value !== null && value > portfolioLimits[field]) {
				setSelfReviewStatus("Açıq meyar ballarının cəmi portfolio limitini aşır");
				return;
			}
		}

		const teacherCriteriaTotal = sumQuestionScores(
			Object.values(normalizedQuestionScores),
		);
		if (teacherCriteriaTotal === null) {
			setSelfReviewStatus("Bal hesablanmadı");
			return;
		}
		const editReason = selectedTeacherHasSavedOpenReview
			? selfReviewUnlockReason.trim()
			: null;
		const payload = {
			org_id: ORG_ID,
			branch_id: teacherBranchId,
			cycle_id: cycleId,
			teacher_id: selectedTeacherId,
			question_scores: normalizedQuestionScores,
			note:
				selectedTeacherHasSavedOpenReview && editReason
					? buildPkpdSelfReviewNote(noteValue, null, editReason)
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
					normalizedQuestionScores,
					editReason,
				),
			};
			delete (fallbackPayload as { question_scores?: Record<string, number> })
				.question_scores;

			const fallbackResult = await supabase
				.from("pkpd_self_reviews")
				.upsert(fallbackPayload, {
					onConflict: "org_id,cycle_id,teacher_id",
				});
			error = fallbackResult.error;
		}
		if (error) {
			setSelfReviewStatus(
				`Açıq sual balı saxlanmadı: ${error.message ?? "naməlum xəta"}`,
			);
			return;
		}

		const { error: portfolioError } = await supabase.from("pkpd_portfolios").upsert(
			{
				org_id: ORG_ID,
				branch_id: teacherBranchId,
				cycle_id: cycleId,
				teacher_id: selectedTeacherId,
				education_score: educationScore,
				attendance_score: attendanceScore,
				training_score: portfolioQuestionScores.trainingScore,
				olympiad_score: portfolioQuestionScores.olympiadScore,
				events_score: portfolioQuestionScores.eventsScore,
				note: selectedTeacherPortfolio?.note ?? null,
			},
			{ onConflict: "org_id,cycle_id,teacher_id" },
		);
		if (portfolioError) {
			setSelfReviewStatus(
				`Rəsmi portfolio balları saxlanmadı: ${portfolioError.message ?? "naməlum xəta"}`,
			);
			return;
		}

		const refreshedRows = await fetchAllBatched<any>(async (from, to) =>
			await supabase
				.from("pkpd_self_reviews")
				.select("*")
				.eq("org_id", ORG_ID)
				.eq("cycle_id", cycleId)
				.range(from, to),
		);
		setSelfReviews(
			refreshedRows.map((row) => ({
				id: row.id,
				data: mapPkpdSelfReviewRow(row),
			})),
		);
		const refreshedPortfolioRows = await fetchAllBatched<
			{ id: string } & Record<string, unknown>
		>(
			async (from, to) =>
				await supabase
					.from("pkpd_portfolios")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("cycle_id", cycleId)
					.range(from, to),
		);
		setPortfolios(
			refreshedPortfolioRows.map((row) => ({
				id: row.id,
				data: mapPkpdPortfolioRow(row),
			})),
		);
		setSelfReviewStatus(
			`Portfolio balları (${[
				educationScore,
				attendanceScore,
				teacherCriteriaTotal,
			]
				.filter((value): value is number => value !== null)
				.reduce((sum, value) => sum + value, 0)
				.toFixed(1)}) rəsmi PKPD cəminə daxil edildi; HR qeydi cəmə daxil edilmir`,
		);
		setSelfReviewEditUnlocked(false);
		setSelfReviewUnlockReason("");
	};

	return (
		<div className="panel">
			<PageHeader
				eyebrow={isHr ? "HR paneli" : "Admin paneli"}
				title="PKPD Qiymətləndirmələri"
				description="Müəllimlərin cari və yekun PKPD nəticələrini izləyin."
				meta={
					cycle && (
						<>
							<StatusBadge tone="info">Dövr: {cycle.year}</StatusBadge>
							<StatusBadge tone="neutral">Status: {cycle.status}</StatusBadge>
							<StatusBadge tone="neutral">Kampus: {cycleBranchNames}</StatusBadge>
						</>
					)
				}
				actions={
					<>
					<Link className="btn ghost" to={cycleListPath}>
						Geri
					</Link>
					<button
						className="btn primary"
						type="button"
						onClick={handleExportCsv}
						disabled={!cycleId}
					>
						Excel export
					</button>
					</>
				}
			/>

			<SectionCard
				eyebrow="Xülasə"
				title="Ümumi vəziyyət"
				description="Yekun bal, tamamlanma və rəhbərlik səsi üzrə əsas göstəricilər."
			>
				<div className="grid three">
					<StatCard
						icon="PK"
						tone="info"
						label={
							<>
								PKPD yekun orta balı
								<InfoTip text="Yekun bal PKPD sənədinə görə hesablanır: BİQ olan müəllimlərdə şagird sorğusu, rəhbərlik, özünüqiymətləndirmə, BİQ, attestasiya imtahanı və portfolio; BİQ olmayan müəllimlərdə şagird sorğusu, rəhbərlik, özünüqiymətləndirmə və portfolio. HR qeydi rəsmi cəmə daxil edilmir." />
							</>
						}
						value={formatScore(overallSummary.avg)}
						meta={`nəticəsi olan müəllim: ${validTeacherScores.length} / ${teacherRows.length}`}
						progress={overallSummary.avg === null ? null : overallSummary.avg}
					/>
					<StatCard
						icon="OK"
						tone="success"
						label="Tamamlanan qiymətləndirmələr"
						value={teacherRows.filter((row) => row.isComplete).length}
						meta={`ümumi müəllim: ${teacherRows.length}`}
					/>
					<StatCard
						icon="ID"
						tone="warning"
						label="Rəhbərlik səsi gözləyənlər"
						value={teacherRows.filter((row) => !row.leadershipComplete).length}
						meta={`səs verənlər: ${raterStats.doneSet.size}`}
					/>
					<StatCard
						icon="PF"
						tone="accent"
						label="Portfolio daxil edilməyənlər"
						value={teacherRows.filter((row) => isMissingScore(row.portfolioScore)).length}
						meta="portfolio alt meyarları üzrə"
					/>
					<StatCard
						icon="RS"
						tone="danger"
						label="Risk qrupu"
						value={
							teacherRows.filter(
								(row) => row.isComplete && (row.finalScore ?? row.baseTotalScore ?? 0) < 60,
							).length
						}
						meta="yekun balı 60-dan aşağı"
					/>
					<StatCard
						icon="TS"
						tone="neutral"
						label="Tapşırıqlar"
						value={overallSummary.submissions}
						meta="ümumi səsvermə"
					/>
				</div>
				<div className="divider" />
				<div className="grid two">
					<StatCard
						tone="success"
						label="Ən yaxşı nəticə"
						value={topTeacher ? formatScore(topTeacher.finalScore) : "—"}
						meta={topTeacher ? topTeacher.name : "Məlumat yoxdur"}
					/>
					<StatCard
						tone="warning"
						label="Ən aşağı nəticə"
						value={bottomTeacher ? formatScore(bottomTeacher.finalScore) : "—"}
						meta={bottomTeacher ? bottomTeacher.name : "Məlumat yoxdur"}
					/>
				</div>
			</SectionCard>

			<FilterPanel
				title="Filterlər"
				description="Axtarış və rəhbərlik səsi statusuna görə siyahını daraldın."
				actions={
					<button
						className="btn ghost"
						type="button"
						onClick={() => {
							setTeacherQuery("");
							setLeadershipFilter("all");
							setShowAllTeachers(false);
							setTeacherPage(1);
						}}
					>
						Filterləri sıfırla
					</button>
				}
			>
				<label className="field">
					<span className="label">Axtarış</span>
					<input
						className="input"
						placeholder="Müəllim, kampus və ya kafedra axtar..."
						value={teacherQuery}
						onChange={(event) => {
							setTeacherQuery(event.target.value);
							setTeacherPage(1);
						}}
					/>
				</label>
				<label className="field">
					<span className="label">Rəhbərlik statusu</span>
					<select
						className="input"
						value={leadershipFilter}
						onChange={(event) => {
							setLeadershipFilter(event.target.value);
							setTeacherPage(1);
						}}
					>
						<option value="all">Hamısı</option>
						<option value="complete">Tamamlanıb</option>
						<option value="incomplete">Tamamlanmayıb</option>
						<option value="branch-manager-given">Filial müdiri səs verib</option>
						<option value="branch-manager-missing">Filial müdiri səs verməyib</option>
						<option value="deputy-given">Direktor müavini səs verib</option>
						<option value="deputy-missing">Direktor müavini səs verməyib</option>
						<option value="department-head-given">Kafedra müdiri səs verib</option>
						<option value="department-head-missing">Kafedra müdiri səs verməyib</option>
					</select>
				</label>
				<label className="field">
					<span className="label">Görünüş</span>
					<button
						className="btn"
						type="button"
						onClick={() => {
							setShowAllTeachers((prev) => !prev);
							setTeacherPage(1);
						}}
					>
						{showAllTeachers ? "Yalnız nəticə olanlar" : "Hamısını göstər"}
					</button>
				</label>
			</FilterPanel>

			<SectionCard
				eyebrow="Nəticələr"
				title="Müəllim nəticələri"
				description="Müəllim adına klik edin: detallar paneldə açılacaq."
				actions={<StatusBadge tone="neutral">Cəmi: {visibleTeacherRows.length}</StatusBadge>}
			>
					<DataTable
						columns={teacherTableColumns}
						rows={paginatedTeacherRows}
						getRowKey={(row) => row.teacherId}
						sort={teacherSort}
						onSortChange={(nextSort) => {
							setTeacherSort(nextSort);
							setTeacherPage(1);
						}}
						emptyTitle="Bu filterlərə uyğun müəllim tapılmadı."
						emptyDescription="Filterləri dəyişərək yenidən yoxlayın."
					/>
					{visibleTeacherRows.length > 0 && (
						<PaginationControls
							totalItems={visibleTeacherRows.length}
							page={teacherPage}
							pageSize={teacherPageSize}
							onPageChange={setTeacherPage}
						onPageSizeChange={(nextSize) => {
							setTeacherPageSize(nextSize);
							setTeacherPage(1);
						}}
					/>
				)}
			</SectionCard>

			<Dialog
				open={Boolean(selectedTeacher)}
				onOpenChange={handleTeacherDetailOpenChange}
			>
				<DialogContent className="left-auto right-0 top-0 h-screen max-h-screen w-full max-w-5xl translate-x-0 translate-y-0 overflow-y-auto rounded-none border-l p-0">
					{selectedTeacher && (
						<div className="panel gap-0">
							<div className="panel-header sticky top-0 z-10 border-b border-border bg-card px-6 py-5">
								<DialogHeader className="text-left">
									<DialogTitle>{selectedTeacher.name}</DialogTitle>
									<div className="mt-2 flex flex-wrap gap-2">
										<StatusBadge tone="neutral">{selectedTeacher.branchName}</StatusBadge>
										<StatusBadge tone="neutral">{selectedTeacher.departmentName}</StatusBadge>
										<StatusBadge tone="info">
											{evaluationTypeLabel(selectedTeacher.isBiqTeacher)}
										</StatusBadge>
										<StatusBadge tone={getTeacherStatusInfo(selectedTeacher).tone}>
											{getTeacherStatusInfo(selectedTeacher).label}
										</StatusBadge>
									</div>
								</DialogHeader>
								<div className="actions">
									<button
										className="btn primary"
										type="button"
										onClick={handleExportTeacherPdf}
									>
										PDF yüklə
									</button>
									<button
										className="btn"
										type="button"
										onClick={() => handleTeacherDetailOpenChange(false)}
									>
										Bağla
									</button>
								</div>
							</div>

							<div className="panel-content px-6 py-6">
								<SectionCard
									eyebrow="Müəllim detalı"
									title="Xülasə"
									description="Cari daxil edilən bal, yekun nəticə və qərar göstəriciləri."
								>
									<div className="grid three">
										<StatCard
											tone={selectedTeacher.isComplete ? "success" : "warning"}
											label={selectedTeacher.isComplete ? "PKPD yekun balı" : "Daxil edilmiş cari bal"}
											value={formatScore(
												selectedTeacher.isComplete
													? selectedTeacher.finalScore
													: selectedTeacher.currentEnteredScore,
											)}
											meta={formatPkpdCategory(selectedTeacher)}
										/>
										<StatCard
											tone="accent"
											label="Əlavə bal"
											value={selectedTeacher.bonusScore.toFixed(2)}
											meta="stimullaşdırıcı maddə üzrə"
										/>
										<StatCard
											tone="info"
											label="Stimullaşdırıcı yekun"
											value={formatScore(selectedTeacher.finalScoreWithExtra)}
											meta={formatPkpdDecision(selectedTeacher)}
										/>
										<StatCard
											tone={selectedTeacher.leadershipComplete ? "success" : "warning"}
											label="Rəhbərlik səsi"
											value={`${selectedTeacher.leadershipSubmittedCount} / ${selectedTeacher.leadershipEligibleCount}`}
											meta={selectedTeacher.leadershipComplete ? "Tamamlanıb" : "Gözləyir"}
										/>
										<StatCard
											tone="neutral"
											label="Qiymətləndirmə modeli"
											value={
												<span className="text-base leading-snug">
													{evaluationTypeLabel(selectedTeacher.isBiqTeacher)}
												</span>
											}
											meta={selectedTeacher.assessmentResultLabel}
										/>
										<StatCard
											tone={getTeacherStatusInfo(selectedTeacher).tone}
											label="Status"
											value={
												<span className="text-base leading-snug">
													{getTeacherStatusInfo(selectedTeacher).label}
												</span>
											}
										/>
									</div>
								</SectionCard>

								<SectionCard
									eyebrow="Bal bölgüsü"
									title="PKPD komponentləri"
									description="Seçilən modelə uyğun maksimum ballar və daxil edilmiş nəticələr."
								>
									<ScoreBreakdownTable rows={buildScoreBreakdownRows(selectedTeacher)} />
								</SectionCard>

								{!selectedTeacher.isComplete &&
									getMissingScoreLabels(selectedTeacher).length > 0 && (
										<SectionCard
											eyebrow="Tamamlama"
											title="Çatışmayan sahələr"
											description="Bu sahələr daxil edildikdən sonra yekun nəticə formalaşacaq."
										>
											<div className="check-grid">
												{getMissingScoreLabels(selectedTeacher).map((label) => (
													<div className="check-item" key={label}>
														<StatusBadge tone="warning">{label}</StatusBadge>
													</div>
												))}
											</div>
										</SectionCard>
									)}

								<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
									<div className="stat-card">
										<div className="stat-label">PKPD modeli</div>
										<div className="stat-value">
											{evaluationTypeLabel(selectedTeacher.isBiqTeacher)}
										</div>
										<div className="stat-meta">
											{selectedTeacher.assessmentResultLabel}
										</div>
									</div>
									<div className="stat-card">
										<div className="stat-label">Rəhbərlik qiymətləndirməsi (10 bal üzrə)</div>
										<div className="stat-value">
											{formatScore(selectedTeacher.managementWeightedScore)}
										</div>
										<div className="stat-meta">
											Verilmiş səs sayı: {selectedTeacher.leadershipSubmittedCount} /{" "}
											{selectedTeacher.leadershipEligibleCount} ·{" "}
											{selectedTeacher.leadershipComplete ? "tamamlanıb" : "tamamlanmayıb"}
											{selectedTeacher.leadershipOverridden ? " · admin yekunlaşdırıb" : ""}
										</div>
										{leadershipStatus && <div className="notice">{leadershipStatus}</div>}
										{userDoc?.role === "superadmin" &&
											selectedTeacher.leadershipSubmittedCount > 0 &&
											selectedTeacher.leadershipSubmittedCount <
												selectedTeacher.leadershipEligibleCount && (
												<button
													className="btn ghost"
													type="button"
													onClick={() =>
														void handleLeadershipOverride(
															!selectedTeacher.leadershipOverridden,
														)
													}
												>
													{selectedTeacher.leadershipOverridden
														? "Yekunlaşdırmanı ləğv et"
														: "Cari verilmiş səslər əsasında yekunlaşdır"}
												</button>
											)}
									</div>
									<div className="stat-card">
										<div className="stat-label">Özünüqiymətləndirmə (10 bal üzrə)</div>
										<div className="stat-value">
											{formatScore(selectedTeacher.selfWeightedScore)}
										</div>
										<div className="stat-meta">
											müəllimin verdiyi bal: {formatScore(selectedTeacher.selfDeclaredScore)}
										</div>
									</div>
									{selectedTeacher.isBiqTeacher && (
										<>
											<div className="stat-card">
												<div className="stat-label">BİQ ortalaması</div>
												<div className="stat-value">
													{formatScore(selectedTeacher.biqAvg)}
												</div>
												<div className="stat-meta">
													{selectedTeacher.biqAverageSource === "manual"
														? "manual daxil edilib"
														: selectedTeacher.biqAverageSource === "computed"
															? "qrup/fənn üzrə hesablanıb"
															: "məlumat yoxdur"}
												</div>
											</div>
											<div className="stat-card">
												<div className="stat-label">
													{selectedTeacher.assessmentResultLabel} (15 bal üzrə)
												</div>
												<div className="stat-value">
													{formatScore(selectedTeacher.biqWeightedScore)}
												</div>
												<div className="stat-meta">
													ümumi orta: {formatScore(selectedTeacher.biqAvg)}
												</div>
											</div>
											<div className="stat-card">
												<div className="stat-label">Attestasiya imtahanı</div>
												<div className="stat-value">
													{formatScore(selectedTeacher.examScore)}
												</div>
												<div className="stat-meta">0-30</div>
											</div>
										</>
									)}
									<div className="stat-card">
										<div className="stat-label">Portfolio</div>
										<div className="stat-value">
											{formatScore(selectedTeacher.portfolioScore)}
										</div>
										<div className="stat-meta">
											{selectedTeacher.isBiqTeacher ? "0-20" : "0-60"}
										</div>
									</div>
									<div className="stat-card">
										<div className="stat-label">Əlavə bal</div>
										<div className="stat-value">
											{selectedTeacher.bonusScore.toFixed(2)}
										</div>
										<div className="stat-meta">maddə 19 üzrə</div>
									</div>
									<div className="stat-card">
										<div className="stat-label">
											Şagird sorğusu ({selectedTeacher.isBiqTeacher ? 15 : 20} bal üzrə)
										</div>
										<div className="stat-value">
											{formatScore(selectedTeacher.studentWeightedScore)}
										</div>
										<div className="stat-meta">
											ümumi orta: {formatScore(selectedTeacher.studentAvg)} ⬢ cavab sayı:{" "}
											{selectedTeacher.studentCount}
										</div>
									</div>
									<div className="stat-card">
										<div className="stat-label">Daxil edilmiş balların cari cəmi</div>
										<div className="stat-value">
											{formatScore(selectedTeacher.teacherCriteriaTotal)}
										</div>
										<div className="stat-meta">
											{selectedTeacherSelfReview?.reviewedAt
												? `Son qiymətləndirmə: ${new Date(
														String(selectedTeacherSelfReview.reviewedAt),
													).toLocaleString("az-AZ")}`
												: "Hələ bal verilməyib"}
										</div>
									</div>
									<div className="stat-card">
											<div className="stat-label">HR qeydi (hesaba daxil deyil)</div>
											<div className="stat-value">
												{formatScore(selectedTeacher.hrEvaluationScore)}
											</div>
											<div className="stat-meta">daxili qeyd, rəsmi cəmə daxil deyil</div>
									</div>
									<div className="stat-card">
										<div className="stat-label">PKPD yekun balı</div>
										<div className="stat-value">
											{formatScore(
												selectedTeacher.isComplete
													? selectedTeacher.finalScore
													: selectedTeacher.currentEnteredScore,
											)}
										</div>
										<div className="stat-meta">
											{formatPkpdCategory(selectedTeacher)}
										</div>
									</div>
									<div className="stat-card">
										<div className="stat-label">Stimullaşdırıcı yekun</div>
										<div className="stat-value">
											{formatScore(selectedTeacher.finalScoreWithExtra)}
										</div>
										<div className="stat-meta">{formatPkpdDecision(selectedTeacher)}</div>
									</div>
								</div>

								{selectedTeacherPortfolioLimits && (
									<div className="card">
										<div className="section-header">
											<div>
												<h3>Portfolio alt meyarları</h3>
												<p>
													HR və superadmin tərəfindən daxil edilən alt ballar və
													avtomatik cəm.
												</p>
											</div>
											<div className="tag">
												Cəmi: {formatScore(selectedTeacher.portfolioScore)}
											</div>
										</div>
										<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
											<div className="stat-card"><div className="stat-label">Təhsil/kvalifikasiya</div><div className="stat-value">{formatScore(selectedTeacherPortfolio?.educationScore ?? null)}</div><div className="stat-meta">max {selectedTeacherPortfolioLimits.education}</div></div>
											<div className="stat-card"><div className="stat-label">Davamiyyət</div><div className="stat-value">{formatScore(selectedTeacherPortfolio?.attendanceScore ?? null)}</div><div className="stat-meta">max {selectedTeacherPortfolioLimits.attendance}</div></div>
											<div className="stat-card"><div className="stat-label">Sertifikat/təlim/məqalə</div><div className="stat-value">{formatScore(selectedTeacherPortfolio?.trainingScore ?? null)}</div><div className="stat-meta">max {selectedTeacherPortfolioLimits.training}</div></div>
											<div className="stat-card"><div className="stat-label">{selectedTeacher.isBiqTeacher ? "Olimpiada/müsabiqə" : "Müsabiqə/festival/yarış"}</div><div className="stat-value">{formatScore(selectedTeacherPortfolio?.olympiadScore ?? null)}</div><div className="stat-meta">max {selectedTeacherPortfolioLimits.olympiad}</div></div>
											<div className="stat-card"><div className="stat-label">Layihə/tədbir/təltif</div><div className="stat-value">{formatScore(selectedTeacherPortfolio?.eventsScore ?? null)}</div><div className="stat-meta">max {selectedTeacherPortfolioLimits.events}</div></div>
										</div>
									</div>
								)}

								<div className="card">
									<div className="section-header">
										<div>
											<h3>BİQ statusu və attestasiya imtahanı</h3>
											<p>
												BİQ müəllimində sistem BİQ ortalamasını və attestasiya imtahanını,
												digər müəllimdə isə Əlavə 2 üzrə portfolio modelini istifadə edir.
											</p>
										</div>
									</div>
									<div className="form-row">
										<div className="field min-w-[min(100%,28rem)] flex-1">
											<span className="label">PKPD modeli</span>
											<div className="grid gap-2 md:grid-cols-2">
												<label className={`check-item ${assessmentMode === "WITH_BIQ" ? "active" : ""}`}>
													<input
														type="radio"
														name="admin-assessment-mode"
														value="WITH_BIQ"
														checked={assessmentMode === "WITH_BIQ"}
														onChange={() => setAssessmentMode("WITH_BIQ")}
													/>
													BİQ/KİQ nəticəsi olan müəllim
												</label>
												<label className={`check-item ${assessmentMode === "WITHOUT_BIQ" ? "active" : ""}`}>
													<input
														type="radio"
														name="admin-assessment-mode"
														value="WITHOUT_BIQ"
														checked={assessmentMode === "WITHOUT_BIQ"}
														onChange={() => setAssessmentMode("WITHOUT_BIQ")}
													/>
													BİQ/KİQ nəticəsi olmayan müəllim
												</label>
											</div>
										</div>
										{assessmentMode === "WITH_BIQ" && (
											<label className="field">
												<span className="label">BİQ ortalaması</span>
												<input
													className="input"
													type="number"
													min="0"
													max="100"
													step="0.01"
													placeholder="0-100"
													value={biqAverageDraft}
													onChange={(event) => setBiqAverageDraft(event.target.value)}
												/>
											</label>
										)}
										{assessmentMode === "WITH_BIQ" && (
											<label className="field">
												<span className="label">Attestasiya imtahanı balı</span>
												<input
													className="input"
													type="number"
													min="0"
													max="30"
													step="0.01"
													placeholder="0-30"
													value={miqScoreDraft}
													onChange={(event) => setMiqScoreDraft(event.target.value)}
												/>
											</label>
										)}
										<button
											className="btn primary"
											type="button"
											onClick={() => void handleSaveAssessmentMode()}
										>
											Saxla
										</button>
									</div>
									{assessmentStatus && <div className="notice">{assessmentStatus}</div>}
								</div>

								<div className="card">
									<div className="section-header">
										<div>
											<h3>Açıq özünüqiymətləndirmə cavabları</h3>
											<p>
												HR və superadmin burada portfolio alt meyarlarına bal verə
												bilər. HR qeydi rəsmi PKPD cəminə daxil edilmir.
											</p>
										</div>
										{selectedTeacherHasSavedOpenReview && (
											<div className="actions">
												{selectedTeacherOpenReviewLocked ? (
													<button
														className="btn ghost"
														type="button"
														onClick={handleRequestSelfReviewEdit}
													>
														Düzəliş et
													</button>
												) : (
													<span className="tag success">Düzəliş açıqdır</span>
												)}
											</div>
										)}
									</div>
									{selectedTeacherHasSavedOpenReview && (
										<div className="notice">
											{selectedTeacherOpenReviewLocked
												? "Bu qiymətləndirmə kilidlənib. Dəyişiklik üçün hesab şifrəsi tələb olunur."
												: "Düzəliş rejimi aktivdir. Yenidən saxladıqdan sonra forma yenə kilidlənəcək."}
										</div>
									)}
									<div className="stat-card">
										<div className="stat-label">Müəllimin öz verdiyi bal</div>
										<div className="stat-value">
											{selectedTeacherSelfResponse?.declaredScore?.toFixed(1) ?? "—"}
										</div>
										<div className="stat-meta">0-10</div>
									</div>
									<div className="grid gap-4 md:grid-cols-2">
										<label className="field">
											<span className="label">
												Təhsil pilləsi üzrə qiymətləndirmə
											</span>
											<input
												className="input"
												type="number"
												min="0"
												max={selectedTeacherPortfolioLimits?.education ?? 3}
												step="0.1"
												placeholder={`0-${selectedTeacherPortfolioLimits?.education ?? 3}`}
												value={portfolioEducationDraft}
												disabled={selectedTeacherOpenReviewLocked}
												onChange={(event) =>
													setPortfolioEducationDraft(event.target.value)
												}
											/>
											<span className="stat-meta">
												max {selectedTeacherPortfolioLimits?.education ?? 3} bal
											</span>
										</label>
										<label className="field">
											<span className="label">
												İşə davamiyyəti (İnsan resursları şöbəsi)
											</span>
											<input
												className="input"
												type="number"
												min="0"
												max={selectedTeacherPortfolioLimits?.attendance ?? 3}
												step="0.1"
												placeholder={`0-${selectedTeacherPortfolioLimits?.attendance ?? 3}`}
												value={portfolioAttendanceDraft}
												disabled={selectedTeacherOpenReviewLocked}
												onChange={(event) =>
													setPortfolioAttendanceDraft(event.target.value)
												}
											/>
											<span className="stat-meta">
												max {selectedTeacherPortfolioLimits?.attendance ?? 3} bal
											</span>
										</label>
									</div>
									<div className="stat-card">
										<div className="stat-label">Daxil edilmiş balların cari cəmi</div>
										<div className="stat-value">
											{sumQuestionScores(
												[
													toNumber(portfolioEducationDraft),
													toNumber(portfolioAttendanceDraft),
													...selectedTeacherOpenQuestionIds.map((questionId) => {
														const value =
															selfReviewQuestionScores[questionId]?.trim() ?? "";
														return value === "" ? null : Number(value);
													}),
												],
											)?.toFixed(1) ?? "—"}
										</div>
										<div className="stat-meta">
											5 portfolio meyarı üzrə rəsmi cəm bal
										</div>
									</div>
									{selectedTeacherSelfReview?.editReason && (
										<div className="hint">
											Son düzəliş səbəbi: {selectedTeacherSelfReview.editReason}
										</div>
									)}
									<div className="stack">
										{selectedTeacherSelfResponse?.textAnswers.map((item, index) => (
											<div className="question" key={item.questionId}>
												<div className="label">Sual {index + 1}</div>
												<div className="mt-1 text-sm font-semibold text-foreground">
													{item.questionText}
												</div>
												<div className="divider" />
												<div className="label">Cavab</div>
												<div className="comment-text">{item.answerText}</div>
												<div className="form-row">
													<div className="field w-full max-w-40">
														<span className="label">Bal</span>
														<input
															className="input"
															type="number"
															min="0"
															max={
																selectedTeacherPortfolioLimits
																	? getSelfReviewQuestionLimit(
																			item.questionId,
																			item.questionText,
																			selectedTeacherPortfolioLimits,
																		)
																	: 10
															}
															step="0.1"
															placeholder={`0-${
																selectedTeacherPortfolioLimits
																	? getSelfReviewQuestionLimit(
																			item.questionId,
																			item.questionText,
																			selectedTeacherPortfolioLimits,
																		)
																	: 10
															}`}
															value={selfReviewQuestionScores[item.questionId] ?? ""}
															disabled={selectedTeacherOpenReviewLocked}
															onChange={(event) =>
																setSelfReviewQuestionScores((prev) => ({
																	...prev,
																	[item.questionId]: event.target.value,
																}))
															}
														/>
													</div>
												</div>
											</div>
										))}
										{(!selectedTeacherSelfResponse ||
											selectedTeacherSelfResponse.textAnswers.length === 0) && (
											<div className="empty">
												Bu müəllim açıq suallara hələ cavab yazmayıb.
											</div>
										)}
									</div>
									<div className="form-row">
										<input
											className="input"
											placeholder="Qeyd (istəyə bağlı)"
											value={selfReviewNote}
											disabled={selectedTeacherOpenReviewLocked}
											onChange={(event) => setSelfReviewNote(event.target.value)}
										/>
										<button
											className="btn primary"
											type="button"
											onClick={handleSaveSelfReview}
											disabled={
												!selectedTeacherHasOpenAnswers ||
												selectedTeacherOpenReviewLocked
											}
										>
											Saxla
										</button>
									</div>
									{selfReviewStatus && <div className="notice">{selfReviewStatus}</div>}
								</div>

								{selectedTeacher.studentClassScores.length > 0 && (
									<div className="card">
										<div className="section-header">
											<div>
												<h3>Sinif/blok üzrə şagird balları</h3>
												<p>Hər sinif üçün orta bal və cavab sayı.</p>
											</div>
										</div>
										<div className="data-table">
											<div className="data-row header">
												<div>Sinif / blok</div>
												<div>Cavab sayı</div>
												<div>Sinif orta balı</div>
											</div>
											{selectedTeacher.studentClassScores.map((item) => (
												<div
													className="data-row"
													key={`${selectedTeacher.teacherId}_${item.groupId}`}
												>
													<div>{item.groupName}</div>
													<div>{item.submissionCount}</div>
													<div>{formatScore(item.avg)}</div>
												</div>
											))}
										</div>
									</div>
								)}
							</div>
						</div>
					)}
				</DialogContent>
			</Dialog>

			<Dialog open={selfReviewUnlockOpen} onOpenChange={setSelfReviewUnlockOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Düzəlişi təsdiqlə</DialogTitle>
						<DialogDescription>
							Saxlanmış portfolio balını dəyişmək üçün hesab şifrəsini və
							düzəliş səbəbini daxil edin.
						</DialogDescription>
					</DialogHeader>
					<div className="stack">
						<label className="field">
							<span className="label">Hesab şifrəsi</span>
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

				<div className="card">
					<div className="section-header">
						<div>
							<h3>Əlavə Bölmələr</h3>
							<p>Ekranı sadə saxlamaq üçün bu bölmələr bağlıdır.</p>
						</div>
					</div>
					<div className="form-row">
						<button
							className="btn ghost"
							type="button"
							onClick={() => setShowRaters((prev) => !prev)}
						>
							{showRaters ? "İştirak edənləri gizlət" : "İştirak edənləri göstər"}
						</button>
						{comments.length > 0 && (
							<button
								className="btn ghost"
								type="button"
								onClick={() => setShowComments((prev) => !prev)}
							>
								{showComments ? "Şərhləri gizlət" : "Şərhləri göstər"}
							</button>
						)}
					</div>
				</div>

				{showRaters && (
					<div className="card">
					<div className="section-header">
						<div>
							<h3>İştirak edənlər</h3>
						<p>Anonim nəticələr: yalnız səs verib-verməməsi göstərilir.</p>
					</div>
				</div>
				<div className="data-table">
					<div className="data-row header">
						<div>Ad</div>
						<div>Rol</div>
						<div>Səs verib</div>
						<div>n</div>
					</div>
					{paginatedRaterRows.map((item) => (
						<div className="data-row" key={item.id}>
							<div>{item.name}</div>
							<div>{item.role}</div>
							<div>{item.done ? "Bəli" : "Xeyr"}</div>
							<div>{item.submissions}</div>
						</div>
					))}
					{raterRows.length === 0 && <div className="empty">Məlumat yoxdur.</div>}
				</div>
					{raterRows.length > 0 && (
						<PaginationControls
							totalItems={raterRows.length}
						page={raterPage}
						pageSize={raterPageSize}
						onPageChange={setRaterPage}
						onPageSizeChange={(nextSize) => {
							setRaterPageSize(nextSize);
							setRaterPage(1);
							}}
						/>
					)}
				</div>
				)}

				{showComments && comments.length > 0 && (
					<div className="card">
						<div className="section-header">
						<div>
							<h3>Şərhlər</h3>
							<p>Son yazılı rəylər.</p>
						</div>
					</div>
					<div className="comment-feed">
						{paginatedComments.map((comment, index) => (
							<div className="comment" key={`${comment.teacherId}_${index}`}>
								<div className="comment-title">
									{teacherMap[comment.teacherId]?.name ?? comment.teacherId}
								</div>
								<div className="comment-text">{comment.text}</div>
							</div>
						))}
					</div>
					<PaginationControls
						totalItems={comments.length}
						page={commentPage}
						pageSize={commentPageSize}
						onPageChange={setCommentPage}
						onPageSizeChange={(nextSize) => {
							setCommentPageSize(nextSize);
							setCommentPage(1);
						}}
					/>
				</div>
			)}
		</div>
	);
};
