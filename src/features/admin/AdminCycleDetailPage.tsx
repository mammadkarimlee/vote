import { useCallback, useEffect, useMemo, useState } from "react";
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
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "../../components/ui/accordion";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../../components/ui/dialog";
import {
	buildPkpdSelfReviewNote,
	isPkpdSelfReviewQuestionScoresError,
} from "../../lib/pkpdSelfReview";
import {
	buildRuleBasedPkpdFinalReview,
	type GeneratedPkpdFinalReview,
} from "../../lib/pkpdFinalReview";
import { getLeadershipVoteRoleStatus } from "../../lib/leadership";
import {
	PKPD_EXAM_EXEMPT_LABEL,
	PKPD_EXAM_EXEMPT_NOTE,
	computePkpdCompletion,
	computePkpdPortfolioScore,
	getPkpdFinalScoreLabel,
	getPkpdEvaluationTypeFromBiq,
	getPkpdPortfolioLimits,
	getPkpdWeights,
	isEnteredPkpdExamScore,
	pkpdBucket,
	pkpdDecision,
} from "../../lib/pkpdScoring";
import { isPkpdNonParticipant as matchPkpdNonParticipant } from "../../lib/pkpdNonParticipants";
import {
	buildPkpdReportFileName,
	buildPkpdReportHtml,
	sanitizePkpdReportFileName,
} from "../../lib/pkpdReportHtml";
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
	mapPkpdFinalReviewRow,
	mapPkpdPortfolioRow,
	mapPkpdSelfReviewRow,
	mapPkpdTeacherBiqAverageRow,
	mapPkpdTeacherBiqResultRow,
	mapPkpdTeacherSummaryRow,
	mapQuestionRow,
	mapSubmissionRow,
	mapSubjectRow,
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
	PkpdFinalReviewDoc,
	PkpdPortfolioDoc,
	PkpdSelfReviewDoc,
	PkpdTeacherBiqAverageDoc,
	PkpdTeacherBiqResultDoc,
	PkpdTeacherSummaryDoc,
	QuestionDoc,
	SubmissionDoc,
	SubjectDoc,
	SurveyCycleDoc,
	TaskDoc,
	TeacherCategory,
	TeacherDoc,
	TeachingAssignmentDoc,
	UserDoc,
} from "../../lib/types";
import { chunkValuesForInFilter, toNumber } from "../../lib/utils";
import { downloadWorkbook } from "../../lib/xlsx";
import { downloadZip, type ZipFile } from "../../lib/zip";
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
	branchId: string | null;
	name: string;
	firstName: string;
	lastName: string;
	departmentId: string | null;
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
	studentClassScores: TeacherClassScore[];
	managementCount: number;
	selfCount: number;
	refreshedAt?: unknown;
};

type TeacherSelfResponse = {
	declaredScore: number | null;
	textAnswers: Array<{
		questionId: string;
		questionText: string;
		answerText: string;
	}>;
};

type MissingFilter =
	| "all"
	| "any"
	| "student"
	| "self"
	| "open-answers"
	| "leadership"
	| "biq"
	| "exam"
	| "portfolio"
	| "complete";

type BulkFinalReviewSaveResult = {
	review_id?: string | null;
	teacher_id?: string | null;
	result_teacher_id?: string | null;
	success?: boolean | null;
	error_message?: string | null;
};

type ExportScope =
	| "current-filtered"
	| "current-page"
	| "selected-teachers"
	| "all-matching"
	| "all-teachers";

type ExportSortKey =
	| "current"
	| "teacher"
	| "branch"
	| "department"
	| "final-score"
	| "portfolio"
	| "student-count"
	| "status"
	| "updated-at";

type ExportFilters = {
	branchIds: string[];
	departmentIds: string[];
	subjectIds: string[];
	teacherIds: string[];
	models: string[];
	statuses: string[];
	denominators: string[];
	examStatuses: string[];
	biqStatuses: string[];
	studentSurveyStatuses: string[];
	selfStatuses: string[];
	leadershipStatuses: string[];
	portfolioStatuses: string[];
	finalReviewStatuses: string[];
	recommendationStatuses: string[];
	minScore: string;
	maxScore: string;
	minSurveyCount: string;
	maxSurveyCount: string;
	minPortfolio: string;
	maxPortfolio: string;
};

type ExportColumnDefinition = {
	key: string;
	label: string;
	value: (row: TeacherRow) => string | number | boolean | null;
};

type ExportSelectOption = {
	value: string;
	label: string;
};

type ExportColumnGroup = {
	id: string;
	title: string;
	keys: string[];
};

const emptyExportFilters = (): ExportFilters => ({
	branchIds: [],
	departmentIds: [],
	subjectIds: [],
	teacherIds: [],
	models: [],
	statuses: [],
	denominators: [],
	examStatuses: [],
	biqStatuses: [],
	studentSurveyStatuses: [],
	selfStatuses: [],
	leadershipStatuses: [],
	portfolioStatuses: [],
	finalReviewStatuses: [],
	recommendationStatuses: [],
	minScore: "",
	maxScore: "",
	minSurveyCount: "",
	maxSurveyCount: "",
	minPortfolio: "",
	maxPortfolio: "",
});

const summaryExportColumns = [
	"teacher",
	"branch",
	"department",
	"subjects",
	"model",
	"status",
	"finalScore",
	"finalMaxScore",
	"percentage",
	"bonusScore",
	"incentiveFinalScore",
	"finalDecision",
];

const fullExportColumns = [
	...summaryExportColumns,
	"studentSurveyScore",
	"studentSurveyCount",
	"selfScore",
	"selfDeclaredScore",
	"leadershipScore",
	"leadershipVotes",
	"biqAverage",
	"biqWeightedScore",
	"examScore",
	"examStatus",
	"portfolioScore",
	"portfolioEducation",
	"portfolioAttendance",
	"portfolioTraining",
	"portfolioOlympiad",
	"portfolioEvents",
	"finalReview",
	"recommendation",
	"hrNote",
	"lastUpdated",
	"editedBy",
];

const exportStatusOptions = [
	{ value: "completed", label: "Tamamlanıb" },
	{ value: "in-progress", label: "Davam edir" },
	{ value: "leadership-missing", label: "Rəhbərlik səsi gözləyir" },
	{ value: "calculation-incomplete", label: "Hesablama tamamlanmayıb" },
	{ value: "risk", label: "Risk qrupu" },
	{ value: "portfolio-missing", label: "Portfolio gözləyir" },
];

const exportPresetOptions = [
	{ value: "full", label: "Tam PKPD hesabatı" },
	{ value: "summary", label: "Yalnız xülasə kolonları" },
	{ value: "missing", label: "Çatışmayan məlumat hesabatı" },
	{ value: "risk", label: "Risk qrupu hesabatı" },
	{ value: "portfolio", label: "Portfolio hesabatı" },
	{ value: "exam-exempt", label: "İmtahandan azad müəllimlər" },
	{ value: "leadership-missing", label: "Rəhbərlik səsi çatışmayanlar" },
	{ value: "final-review-missing", label: "Yekun rəyi olmayanlar" },
];

const exportScopeLabels: Record<ExportScope, string> = {
	"current-filtered": "Cari filterlənmiş cədvəl",
	"current-page": "Cari səhifə",
	"selected-teachers": "Seçilmiş müəllimlər",
	"all-matching": "Kriteriyaya uyğun hamısı",
	"all-teachers": "Bütün müəllimlər",
};

const exportColumnGroups: ExportColumnGroup[] = [
	{
		id: "main",
		title: "Əsas məlumatlar",
		keys: ["teacher", "branch", "department", "subjects", "model", "status"],
	},
	{
		id: "scores",
		title: "Bal və nəticələr",
		keys: [
			"finalScore",
			"finalMaxScore",
			"percentage",
			"bonusScore",
			"incentiveFinalScore",
			"finalDecision",
			"examScore",
			"examStatus",
		],
	},
	{
		id: "surveys",
		title: "Sorğu nəticələri",
		keys: [
			"studentSurveyScore",
			"studentSurveyCount",
			"selfScore",
			"selfDeclaredScore",
			"leadershipScore",
			"leadershipVotes",
			"biqAverage",
			"biqWeightedScore",
		],
	},
	{
		id: "portfolio",
		title: "Portfolio",
		keys: [
			"portfolioScore",
			"portfolioEducation",
			"portfolioAttendance",
			"portfolioTraining",
			"portfolioOlympiad",
			"portfolioEvents",
		],
	},
	{
		id: "review",
		title: "Rəy və HR",
		keys: ["finalReview", "recommendation", "hrNote"],
	},
	{
		id: "system",
		title: "Sistem məlumatları",
		keys: ["lastUpdated", "editedBy"],
	},
];

const toggleArrayValue = (values: string[], value: string) =>
	values.includes(value)
		? values.filter((item) => item !== value)
		: [...values, value];

const parseOptionalNumber = (value: string) => {
	const trimmed = value.trim();
	if (!trimmed) return null;
	const parsed = Number(trimmed.replace(",", "."));
	return Number.isFinite(parsed) ? parsed : null;
};

const isInRange = (
	value: number | null | undefined,
	minText: string,
	maxText: string,
) => {
	const min = parseOptionalNumber(minText);
	const max = parseOptionalNumber(maxText);
	if (min === null && max === null) return true;
	if (value === null || value === undefined || Number.isNaN(value)) return false;
	if (min !== null && value < min) return false;
	if (max !== null && value > max) return false;
	return true;
};

const toExportCell = (value: string | number | boolean | null | undefined) => {
	if (value === null || value === undefined) return "Məlumat yoxdur";
	if (typeof value === "number") {
		return Number.isNaN(value) ? "Məlumat yoxdur" : Number(value.toFixed(2));
	}
	if (typeof value === "string") return value.trim() || "Məlumat yoxdur";
	return value ? "Bəli" : "Xeyr";
};

const ExportMultiSelect = ({
	label,
	placeholder,
	options,
	value,
	onChange,
	countLabel,
}: {
	label: string;
	placeholder: string;
	options: ExportSelectOption[];
	value: string[];
	onChange: (nextValue: string[]) => void;
	countLabel: string;
}) => {
	const [query, setQuery] = useState("");
	const selectedOptions = options.filter((option) => value.includes(option.value));
	const visibleOptions = options.filter((option) =>
		option.label.toLocaleLowerCase("az").includes(query.toLocaleLowerCase("az")),
	);
	const displayText =
		value.length === 0
			? "Hamısı"
			: value.length === options.length
				? `${value.length} ${countLabel} seçilib`
				: `${value.length} ${countLabel} seçilib`;
	const chips = selectedOptions.slice(0, 3);
	const hiddenChipCount = Math.max(0, selectedOptions.length - chips.length);

	return (
		<div className="relative grid gap-2">
			<label className="text-sm font-semibold">{label}</label>
			<details className="group relative">
				<summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm">
					<div className="min-w-0 flex-1">
						{value.length === 0 ? (
							<span className="text-muted-foreground">{placeholder}</span>
						) : (
							<div className="flex min-w-0 flex-wrap gap-1">
								{chips.map((option) => (
									<span
										key={option.value}
										className="max-w-[180px] truncate rounded-full bg-muted px-2 py-0.5 text-xs"
										title={option.label}
									>
										{option.label}
									</span>
								))}
								{hiddenChipCount > 0 && (
									<span className="rounded-full bg-muted px-2 py-0.5 text-xs">
										+{hiddenChipCount} əlavə
									</span>
								)}
							</div>
						)}
						<div className="mt-1 text-xs text-muted-foreground">{displayText}</div>
					</div>
					<span className="text-muted-foreground">⌄</span>
				</summary>
				<div className="absolute left-0 right-0 z-50 mt-2 rounded-lg border border-border bg-card p-3 shadow-strong">
					<input
						className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Axtar..."
					/>
					<div className="mt-2 flex items-center justify-between gap-2">
						<button
							className="btn ghost"
							type="button"
							onClick={() => onChange(options.map((option) => option.value))}
						>
							Hamısını seç
						</button>
						<button className="btn ghost" type="button" onClick={() => onChange([])}>
							Təmizlə
						</button>
					</div>
					<div className="mt-2 max-h-[320px] overflow-y-auto pr-1">
						{visibleOptions.length === 0 ? (
							<div className="py-4 text-sm text-muted-foreground">Nəticə tapılmadı</div>
						) : (
							<div className="grid gap-1">
								{visibleOptions.map((option) => (
									<label
										key={option.value}
										className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
									>
										<input
											type="checkbox"
											checked={value.includes(option.value)}
											onChange={() => onChange(toggleArrayValue(value, option.value))}
										/>
										<span className="truncate" title={option.label}>
											{option.label}
										</span>
									</label>
								))}
							</div>
						)}
					</div>
				</div>
			</details>
		</div>
	);
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

const formatPercentage = (value: number | null | undefined) =>
	value === null || value === undefined || Number.isNaN(value)
		? "â€”"
		: `${value.toFixed(2)}%`;

const formatFinalScoreLabel = (
	value: number | null | undefined,
	maxScore: number,
) => getPkpdFinalScoreLabel(value, maxScore);

const toExportScore = (value: number | null | undefined) =>
	value === null || value === undefined || Number.isNaN(value)
		? null
		: Number(value.toFixed(2));

const toExportPercentage = (value: number | null | undefined) =>
	value === null || value === undefined || Number.isNaN(value)
		? null
		: Number(value.toFixed(2));

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

const assessmentResultLabel = (isBiqTeacher: boolean) =>
	isBiqTeacher
		? "Balabilgənin fənni mənimsəməsi"
		: "BİQ/KİQ tətbiq edilmir";

const getComparablePkpdScore = (row: TeacherRow) =>
	row.finalPercentage ?? row.finalScore ?? row.baseTotalScore;

const compareTeacherRows = (a: TeacherRow, b: TeacherRow) => {
	const scoreA = getComparablePkpdScore(a);
	const scoreB = getComparablePkpdScore(b);
	if (scoreA === null && scoreB === null) {
		return a.name.localeCompare(b.name, "az");
	}
	if (scoreA === null) return 1;
	if (scoreB === null) return -1;
	if (scoreB !== scoreA) return scoreB - scoreA;
	return a.name.localeCompare(b.name, "az");
};

const mapCachedTeacherRow = (summary: PkpdTeacherSummaryDoc): TeacherRow => {
	const nameParts = splitFullName(summary.name);
	const isBiqTeacher = summary.isBiqTeacher;
	return {
		...summary,
		branchId: summary.branchId ?? null,
		firstName: summary.firstName?.trim() || nameParts.firstName,
		lastName: summary.lastName?.trim() || nameParts.lastName,
		departmentId: null,
		departmentName: summary.departmentName ?? "-",
		branchName: summary.branchName ?? "-",
		evaluationType: getPkpdEvaluationTypeFromBiq(isBiqTeacher),
		assessmentResultLabel: assessmentResultLabel(isBiqTeacher),
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
	displayValue?: string;
};

type GeneratedFinalReview = GeneratedPkpdFinalReview;

type PkpdReportAudience = "TEACHER" | "LEADERSHIP";

type PkpdReportOptions = {
	audience?: PkpdReportAudience;
	includeOpenAnswers?: boolean;
	includeDetailedSurvey?: boolean;
	includeAudit?: boolean;
};

const isMissingScore = (value: unknown) =>
	value === null ||
	value === undefined ||
	(typeof value === "number" && Number.isNaN(value));

const normalizeSearchText = (value: string) =>
	value
		.toLocaleLowerCase("az")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/ə/g, "e")
		.replace(/ı/g, "i")
		.replace(/ö/g, "o")
		.replace(/ü/g, "u")
		.replace(/ğ/g, "g")
		.replace(/ş/g, "s")
		.replace(/ç/g, "c");

const getPdfScoreRows = (teacher: TeacherRow): PdfScoreRow[] => {
	const rows = teacher.isBiqTeacher
		? [
				{ key: "subjectMasteryScore", label: "Balabilgənin fənni mənimsəməsi", value: teacher.biqWeightedScore, max: 15 },
				{ key: "studentSurveyScore", label: "Balabilgə sorğusu", value: teacher.studentWeightedScore, max: 15 },
				{ key: "selfEvaluationScore", label: "Özünü qiymətləndirmə", value: teacher.selfWeightedScore, max: 10 },
				{ key: "leadershipEvaluationScore", label: "Rəhbərlik qiymətləndirməsi", value: teacher.managementWeightedScore, max: 10 },
				{
					key: "examScore",
					label: "Attestasiya imtahanı",
					value: teacher.isExamExempt ? null : teacher.examScore,
					max: 30,
					displayValue: teacher.isExamExempt ? PKPD_EXAM_EXEMPT_LABEL : undefined,
				},
				{ key: "portfolioScore", label: "Portfolio", value: teacher.portfolioScore, max: 20 },
			]
		: [
				{ key: "studentSurveyScore", label: "Balabilgə sorğusu", value: teacher.studentWeightedScore, max: 20 },
				{ key: "selfEvaluationScore", label: "Özünü qiymətləndirmə", value: teacher.selfWeightedScore, max: 10 },
				{ key: "leadershipEvaluationScore", label: "Rəhbərlik qiymətləndirməsi", value: teacher.managementWeightedScore, max: 10 },
				{ key: "portfolioScore", label: "Portfolio", value: teacher.portfolioScore, max: 60 },
			];

	if (!teacher.isBiqTeacher && (teacher.isExamExempt || !isMissingScore(teacher.examScore))) {
		rows.splice(rows.length - 1, 0, {
			key: "examScore",
			label: "Attestasiya imtahanı",
			value: teacher.isExamExempt ? null : teacher.examScore,
			max: 30,
			displayValue: teacher.isExamExempt ? PKPD_EXAM_EXEMPT_LABEL : undefined,
		});
	}

	return rows;
};

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
	if ((getComparablePkpdScore(row) ?? 0) < 60) {
		return { label: "Risk qrupu", tone: "danger" as const };
	}
	return { label: "Tamamlanıb", tone: "success" as const };
};

const matchesMissingFilter = (
	row: TeacherRow,
	filter: MissingFilter,
	selfResponses: Record<string, TeacherSelfResponse>,
) => {
	const hasOpenAnswers =
		(selfResponses[row.teacherId]?.textAnswers.length ?? 0) > 0;
	const isMissingAny =
		isMissingScore(row.studentWeightedScore) ||
		isMissingScore(row.selfWeightedScore) ||
		!row.leadershipComplete ||
		isMissingScore(row.portfolioScore) ||
		(row.isBiqTeacher && isMissingScore(row.biqWeightedScore));

	if (filter === "all") return true;
	if (filter === "any") return isMissingAny;
	if (filter === "student") return isMissingScore(row.studentWeightedScore);
	if (filter === "self") return isMissingScore(row.selfWeightedScore);
	if (filter === "open-answers") return !hasOpenAnswers;
	if (filter === "leadership") return !row.leadershipComplete;
	if (filter === "biq") return row.isBiqTeacher && isMissingScore(row.biqWeightedScore);
	if (filter === "exam") return !row.isExamExempt && isMissingScore(row.examScore);
	if (filter === "portfolio") return isMissingScore(row.portfolioScore);
	return row.isComplete;
};

const buildScoreBreakdownRows = (teacher: TeacherRow): ScoreBreakdownRow[] => {
	const leadershipRoleStatus = getLeadershipVoteRoleStatus(teacher);
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
					meta: (
						<>
							{teacher.leadershipSubmittedCount} / {teacher.leadershipEligibleCount} səs ·{" "}
							<span className={leadershipRoleStatus.hasPending ? "font-semibold text-red-600 dark:text-red-300" : ""}>
								{leadershipRoleStatus.pendingText}
							</span>
						</>
					),
				},
				{
					key: "exam",
					label: "Attestasiya imtahanı",
					value: teacher.isExamExempt
						? PKPD_EXAM_EXEMPT_LABEL
						: teacher.examScore,
					max: 30,
					meta: teacher.isExamExempt ? PKPD_EXAM_EXEMPT_NOTE : undefined,
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
					meta: (
						<>
							{teacher.leadershipSubmittedCount} / {teacher.leadershipEligibleCount} səs ·{" "}
							<span className={leadershipRoleStatus.hasPending ? "font-semibold text-red-600 dark:text-red-300" : ""}>
								{leadershipRoleStatus.pendingText}
							</span>
						</>
					),
				},
				{
					key: "portfolio",
					label: "Portfolio",
					value: teacher.portfolioScore,
					max: 60,
				},
			];

	if (!teacher.isBiqTeacher && (teacher.isExamExempt || !isMissingScore(teacher.examScore))) {
		rows.splice(rows.length - 1, 0, {
			key: "exam",
			label: "Attestasiya imtahanı",
			value: teacher.isExamExempt ? PKPD_EXAM_EXEMPT_LABEL : teacher.examScore,
			max: 30,
			meta: teacher.isExamExempt
				? PKPD_EXAM_EXEMPT_NOTE
				: "Xam cəm 130 maksimumdan 100 şkalasına normallaşdırılır",
		});
	}

	return rows.map((row) => ({
		...row,
		value:
			typeof row.value === "string"
				? row.value
				: formatScoreOrMissing(row.value),
		tone: isMissingScore(row.value) ? "warning" : "success",
	}));
};

const getMissingScoreLabels = (teacher: TeacherRow) =>
	buildScoreBreakdownRows(teacher)
		.filter((row) => row.tone === "warning")
		.map((row) => String(row.label));

const buildRuleBasedFinalReview = (teacher: TeacherRow): GeneratedFinalReview =>
	buildRuleBasedPkpdFinalReview({
		isComplete: teacher.isComplete,
		baseTotalScore: teacher.baseTotalScore,
		finalMaxScore: teacher.finalMaxScore,
		currentEnteredScore: teacher.currentEnteredScore,
		leadershipComplete: teacher.leadershipComplete,
		missingFields: getMissingScoreLabels(teacher),
		components: getPdfScoreRows(teacher),
	});

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
	const [subjects, setSubjects] = useState<Array<DocEntry<SubjectDoc>>>([]);
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
	const [finalReviews, setFinalReviews] = useState<
		Array<DocEntry<PkpdFinalReviewDoc>>
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
	const [cachedTeacherRows, setCachedTeacherRows] = useState<TeacherRow[]>([]);
	const [summaryCacheLoading, setSummaryCacheLoading] = useState(true);
	const [cycleDataLoading, setCycleDataLoading] = useState(true);
	const [cycleDataError, setCycleDataError] = useState<string | null>(null);
	const [teacherResultsVisible, setTeacherResultsVisible] = useState(false);
	const [teacherResultsVisibilityLoading, setTeacherResultsVisibilityLoading] =
		useState(false);
	const [teacherResultsVisibilityStatus, setTeacherResultsVisibilityStatus] =
		useFeedbackState();

	const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
	const [showAllTeachers, setShowAllTeachers] = useState(false);
	const [teacherQuery, setTeacherQuery] = useState("");
	const [leadershipFilter, setLeadershipFilter] = useState("all");
	const [missingFilter, setMissingFilter] = useState<MissingFilter>("all");
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
	const [finalReviewDraft, setFinalReviewDraft] = useState("");
	const [finalRecommendationDraft, setFinalRecommendationDraft] = useState("");
	const [generatedFinalReviewDraft, setGeneratedFinalReviewDraft] =
		useState<GeneratedFinalReview | null>(null);
	const [finalReviewGeneratedAtDraft, setFinalReviewGeneratedAtDraft] = useState<
		string | null
	>(null);
	const [finalReviewStatus, setFinalReviewStatus] = useFeedbackState();
	const [bulkBranchFilter, setBulkBranchFilter] = useState("all");
	const [bulkDepartmentFilter, setBulkDepartmentFilter] = useState("all");
	const [bulkSubjectFilter, setBulkSubjectFilter] = useState("all");
	const [bulkModelFilter, setBulkModelFilter] = useState("all");
	const [bulkStatusFilter, setBulkStatusFilter] = useState("all");
	const [bulkOverwriteFinalReviews, setBulkOverwriteFinalReviews] =
		useState(false);
	const [bulkFinalReviewConfirmOpen, setBulkFinalReviewConfirmOpen] =
		useState(false);
	const [bulkFinalReviewRunning, setBulkFinalReviewRunning] = useState(false);
	const [bulkZipRunning, setBulkZipRunning] = useState(false);
	const [bulkActionStatus, setBulkActionStatus] = useFeedbackState();
	const [bulkActionFailures, setBulkActionFailures] = useState<string[]>([]);
	const [exportDialogOpen, setExportDialogOpen] = useState(false);
	const [exportRunning, setExportRunning] = useState(false);
	const [exportStatus, setExportStatus] = useFeedbackState();
	const [exportScope, setExportScope] =
		useState<ExportScope>("current-filtered");
	const [exportFilters, setExportFilters] = useState<ExportFilters>(() =>
		emptyExportFilters(),
	);
	const [exportColumnKeys, setExportColumnKeys] =
		useState<string[]>(fullExportColumns);
	const [exportSortKey, setExportSortKey] = useState<ExportSortKey>("current");
	const [exportSortDirection, setExportSortDirection] =
		useState<"asc" | "desc">("asc");

	const [teacherPage, setTeacherPage] = useState(1);
	const [teacherPageSize, setTeacherPageSize] = useState(15);
	const [teacherSort, setTeacherSort] = useState<SortState>(null);
	const [raterPage, setRaterPage] = useState(1);
	const [raterPageSize, setRaterPageSize] = useState(15);
	const [commentPage, setCommentPage] = useState(1);
	const [commentPageSize, setCommentPageSize] = useState(15);

	const applySummaryRows = useCallback((rows: Array<Record<string, unknown>>) => {
		setCachedTeacherRows(
			rows
				.map((row) => mapCachedTeacherRow(mapPkpdTeacherSummaryRow(row)))
				.sort(compareTeacherRows),
		);
	}, []);

	const refreshSummaryCache = useCallback(async () => {
		if (!cycleId) return;
		const { data, error } = await supabase.rpc("refresh_pkpd_teacher_summaries", {
			p_cycle_id: cycleId,
			p_campus_id: scopedBranchId || null,
		});
		if (!error) {
			applySummaryRows((data ?? []) as Array<Record<string, unknown>>);
		}
	}, [applySummaryRows, cycleId, scopedBranchId]);

	useEffect(() => {
		let cancelled = false;

		const loadSummaryCache = async () => {
			if (!cycleId) return;
			setSummaryCacheLoading(true);
			setCachedTeacherRows([]);
			const { data, error } = await supabase.rpc("get_pkpd_teacher_summaries", {
				p_cycle_id: cycleId,
				p_campus_id: scopedBranchId || null,
			});
			if (cancelled) return;
			if (!error) {
				applySummaryRows((data ?? []) as Array<Record<string, unknown>>);
			}
			setSummaryCacheLoading(false);
			void refreshSummaryCache();
		};

		void loadSummaryCache();
		return () => {
			cancelled = true;
		};
	}, [applySummaryRows, cycleId, refreshSummaryCache, scopedBranchId]);

	useEffect(() => {
		let cancelled = false;

		const loadTeacherResultsVisibility = async () => {
			if (!cycleId || isHr) {
				setTeacherResultsVisible(false);
				return;
			}
			setTeacherResultsVisibilityLoading(true);
			const { data, error } = await supabase.rpc("get_pkpd_result_visibility", {
				p_cycle_id: cycleId,
			});
			if (cancelled) return;
			if (error) {
				console.warn("PKPD result visibility setting load failed", error);
				setTeacherResultsVisibilityStatus(
					"Nəticələrim görünürlük ayarı yüklənmədi.",
				);
			} else {
				const row = Array.isArray(data) ? data[0] : data;
				setTeacherResultsVisible(
					Boolean((row as { is_visible_to_teachers?: boolean } | null)?.is_visible_to_teachers),
				);
			}
			setTeacherResultsVisibilityLoading(false);
		};

		void loadTeacherResultsVisibility();
		return () => {
			cancelled = true;
		};
	}, [cycleId, isHr, setTeacherResultsVisibilityStatus]);

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
			const subjectQuery = supabase
				.from("subjects")
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
				subjectRes,
			] = await Promise.all([
				teacherQuery,
					supabase.from("questions").select("*").eq("org_id", ORG_ID),
				raterQuery,
				branchQuery,
				departmentQuery,
				subjectQuery,
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
			setSubjects(
				(subjectRes.data ?? []).map((row) => ({
					id: row.id,
					data: mapSubjectRow(row),
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
			setCycleDataLoading(true);
			setCycleDataError(null);
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
					finalReviewRows,
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
						fetchAllBatchedOrEmpty<{ id: string } & Record<string, unknown>>("pkpd_final_reviews", async (from, to) =>
							await (() => {
								let query = supabase
									.from("pkpd_final_reviews")
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
				setFinalReviews(
					finalReviewRows.map((row) => ({
						id: row.id,
						data: mapPkpdFinalReviewRow(row),
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

				const chunks = chunkValuesForInFilter(submissionIds);
				const answerChunks = await Promise.all(
					chunks
						.filter((chunk) => chunk.length > 0)
						.map((chunk) =>
							fetchAllBatchedOrEmpty<any>("answers", async (from, to) =>
								await supabase
									.from("answers")
									.select("*")
									.eq("org_id", ORG_ID)
									.in("submission_id", chunk)
									.range(from, to),
							),
						),
				);
				const answerDocs: Array<DocEntry<AnswerDoc>> = [];
				answerChunks.flat().forEach((row) => {
						const key = `${row.submission_id}_${row.question_id}`;
						answerDocs.push({ id: key, data: mapAnswerRow(row) });
				});
				setAnswers(answerDocs);
			} catch (error) {
				console.warn("Admin cycle detail load failed", error);
				setCycleDataError("Detallı məlumatların bir hissəsi yüklənmədi.");
			} finally {
				setCycleDataLoading(false);
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
	const subjectMap = useMemo(
		() => Object.fromEntries(subjects.map((item) => [item.id, item.data])),
		[subjects],
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

	const teacherSubjectIdsByTeacher = useMemo(() => {
		const map: Record<string, Set<string>> = {};
		assignments.forEach((assignment) => {
			map[assignment.data.teacherId] = map[assignment.data.teacherId] ?? new Set();
			map[assignment.data.teacherId].add(assignment.data.subjectId);
		});
		return map;
	}, [assignments]);

	const teacherSubjectNamesByTeacher = useMemo(() => {
		const map: Record<string, string[]> = {};
		Object.entries(teacherSubjectIdsByTeacher).forEach(([teacherId, subjectIds]) => {
			map[teacherId] = Array.from(subjectIds)
				.map((subjectId) => subjectMap[subjectId]?.name)
				.filter((name): name is string => Boolean(name))
				.sort((a, b) => a.localeCompare(b, "az"));
		});
		return map;
	}, [subjectMap, teacherSubjectIdsByTeacher]);

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

	const teacherBiqScoresByTeacher = useMemo(() => {
		const map: Record<string, Record<string, number>> = {};
		teacherBiqResults.forEach((item) => {
			if (typeof item.data.score !== "number") return;
			map[item.data.teacherId] = map[item.data.teacherId] ?? {};
			map[item.data.teacherId][`${item.data.groupId}_${item.data.subjectId}`] =
				item.data.score;
		});
		return map;
	}, [teacherBiqResults]);

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
	const finalReviewMap = useMemo(
		() =>
			Object.fromEntries(
				finalReviews.map((item) => [item.data.teacherId, item.data]),
			),
		[finalReviews],
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

	const calculatedTeacherRows = useMemo<TeacherRow[]>(() => {
		return teachers
			.map((teacher) => {
				const category = teacher.data.category ?? "standard";
				const isBiqTeacher = getIsBiqTeacher(teacher.data);
				const evaluationType = getPkpdEvaluationTypeFromBiq(isBiqTeacher);
				const weights = getPkpdWeights(category, isBiqTeacher);
				const teacherAssessmentResultLabel = assessmentResultLabel(isBiqTeacher);
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
				const branchMatchName =
					branchName === "-" ? (teacher.data.branchId ?? "") : branchName;
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
				const biqScoreMap = new Map(
					Object.entries(teacherBiqScoresByTeacher[teacher.id] ?? {}),
				);
				assignmentsForTeacher.forEach((assignment) => {
					const resultKey = `${assignment.groupId}_${assignment.subjectId}`;
					if (biqScoreMap.has(resultKey)) return;

					const classKey = `${assignment.branchId}_${assignment.groupId}_${assignment.subjectId}`;
					const classScore = biqByKey[classKey];
					if (typeof classScore === "number") {
						biqScoreMap.set(resultKey, classScore);
					}
				});
				const biqValues = Array.from(biqScoreMap.values());
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
				const isListedPkpdNonParticipant = matchPkpdNonParticipant(
					branchMatchName,
					resolvedName,
				);
				const isExamExempt =
					isListedPkpdNonParticipant ||
					(isBiqTeacher && !isEnteredPkpdExamScore(examInputScore));
				const isPkpdNonParticipant = isExamExempt;
				const biqWeightedScore =
					isBiqTeacher
						? weights.biq === 0 || biqAvg === null
							? null
							: (biqAvg * weights.biq) / 100
						: null;
				const examScore = isExamExempt ? null : examInputScore;
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
				}, {
					examExempt: isExamExempt,
				});
				const currentEnteredScore = completion.currentEnteredScore;
				const isComplete =
					completion.isComplete && Boolean(leadershipSummary?.isComplete);
				const baseTotalScore = completion.baseTotalScore;
				const finalScoreWithExtra = baseTotalScore + bonusScore;
				const finalScore = baseTotalScore;
				const finalMaxScore = completion.finalMaxScore;
				const finalScoreLabel = completion.finalScoreLabel;
				const finalPercentage = completion.percentage;

				return {
					teacherId: teacher.id,
					branchId: teacher.data.branchId ?? null,
					name: resolvedName,
					firstName,
					lastName,
					departmentId: teacher.data.departmentId ?? null,
					departmentName,
					branchName,
					category,
					isBiqTeacher,
					evaluationType,
					assessmentResultLabel: teacherAssessmentResultLabel,
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
					branchManagerEligible: leadershipSummary?.branchManagerEligible ?? false,
					deputyEligible: leadershipSummary?.deputyEligible ?? false,
					departmentHeadEligible: leadershipSummary?.departmentHeadEligible ?? false,
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
					finalMaxScore,
					finalScoreLabel,
					finalPercentage,
					isPkpdNonParticipant,
					isExamExempt,
					surveySubmissionCount: submissionCountByTeacher[teacher.id] ?? 0,
					studentCount,
					studentClassCount: classScores.length,
					studentClassScores: classScores,
					managementCount: leadershipSummary?.submittedCount ?? 0,
					selfCount: flow.self.count,
					refreshedAt: teacherSelfReview?.reviewedAt ?? null,
				};
			})
			.sort(compareTeacherRows);
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
		teacherBiqScoresByTeacher,
		teachers,
	]);
	const teacherRows =
		calculatedTeacherRows.length > 0 ? calculatedTeacherRows : cachedTeacherRows;

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
	const selectedTeacherFinalReview = selectedTeacherId
		? (finalReviewMap[selectedTeacherId] ?? null)
		: null;
	const selectedTeacherPortfolioLimits = selectedTeacher
		? getPkpdPortfolioLimits(selectedTeacher.category, selectedTeacher.isBiqTeacher)
		: null;
	const selectedTeacherOpenQuestionIds = useMemo(
		() => selectedTeacherSelfResponse?.textAnswers.map((item) => item.questionId) ?? [],
		[selectedTeacherSelfResponse],
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
			setFinalReviewDraft("");
			setFinalRecommendationDraft("");
			setGeneratedFinalReviewDraft(null);
			setFinalReviewGeneratedAtDraft(null);
			setFinalReviewStatus(null);
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
		setFinalReviewDraft(selectedTeacherFinalReview?.reviewText ?? "");
		setFinalRecommendationDraft(
			selectedTeacherFinalReview?.recommendationText ?? "",
		);
		setGeneratedFinalReviewDraft(null);
		setFinalReviewGeneratedAtDraft(
			selectedTeacherFinalReview?.generatedAt
				? String(selectedTeacherFinalReview.generatedAt)
				: null,
		);
		setFinalReviewStatus(null);
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
		selectedTeacherFinalReview,
		teacherBiqAverageMap,
		teacherMap,
		examMap,
		setAssessmentStatus,
		setFinalReviewStatus,
		setLeadershipStatus,
		setSelfReviewStatus,
		setSelfReviewUnlockError,
	]);

	const validTeacherScores = useMemo(
		() => teacherRows.filter((row) => getComparablePkpdScore(row) !== null),
		[teacherRows],
	);
	const formatPkpdCategory = (row: TeacherRow) =>
		getComparablePkpdScore(row) !== null
			? pkpdBucket(getComparablePkpdScore(row))
			: "Hesablama tamamlanmayıb";
	const formatPkpdDecision = (row: TeacherRow) =>
		getComparablePkpdScore(row) !== null
			? pkpdDecision(getComparablePkpdScore(row))
			: "Qərar verilməyib";

	const visibleTeacherRows = useMemo(() => {
		const query = normalizeSearchText(teacherQuery.trim());
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
			if (!matchesMissingFilter(row, missingFilter, teacherSelfResponses))
				return false;
			if (!query) return true;

			return normalizeSearchText(
				[
					row.name,
					row.departmentName,
					row.branchName,
					evaluationTypeLabel(row.isBiqTeacher),
					getTeacherStatusInfo(row).label,
					row.finalScoreLabel,
					getLeadershipVoteRoleStatus(row).submittedText,
					getLeadershipVoteRoleStatus(row).pendingText,
				].join(" "),
			).includes(query);
		});
	}, [
		leadershipFilter,
		missingFilter,
		showAllTeachers,
		teacherQuery,
		teacherRows,
		teacherSelfResponses,
	]);

	const bulkFilteredTeacherRows = useMemo(() => {
		return teacherRows.filter((row) => {
			if (
				bulkBranchFilter !== "all" &&
				row.branchId !== bulkBranchFilter &&
				row.branchName !== (branchMap[bulkBranchFilter]?.name ?? "")
			) {
				return false;
			}
			if (
				bulkDepartmentFilter !== "all" &&
				row.departmentId !== bulkDepartmentFilter &&
				row.departmentName !== (departmentMap[bulkDepartmentFilter]?.name ?? "")
			) {
				return false;
			}
			if (
				bulkSubjectFilter !== "all" &&
				!teacherSubjectIdsByTeacher[row.teacherId]?.has(bulkSubjectFilter)
			) {
				return false;
			}
			if (bulkModelFilter === "with-biq" && !row.isBiqTeacher) return false;
			if (bulkModelFilter === "without-biq" && row.isBiqTeacher) return false;

			const comparableScore = getComparablePkpdScore(row);
			if (bulkStatusFilter === "complete" && !row.isComplete) return false;
			if (bulkStatusFilter === "incomplete" && row.isComplete) return false;
			if (
				bulkStatusFilter === "risk" &&
				(comparableScore === null || comparableScore >= 60)
			) {
				return false;
			}
			if (bulkStatusFilter === "leadership-pending" && row.leadershipComplete) {
				return false;
			}
			return true;
		});
	}, [
		branchMap,
		bulkBranchFilter,
		bulkDepartmentFilter,
		bulkModelFilter,
		bulkStatusFilter,
		bulkSubjectFilter,
		departmentMap,
		teacherRows,
		teacherSubjectIdsByTeacher,
	]);

	const bulkFinalReviewCandidates = useMemo(
		() =>
			bulkFilteredTeacherRows.filter(
				(row) =>
					getComparablePkpdScore(row) !== null || row.currentEnteredScore > 0,
			),
		[bulkFilteredTeacherRows],
	);
	const bulkFinalReviewTargets = useMemo(
		() =>
			bulkFinalReviewCandidates.filter((row) => {
				const existingReview = finalReviewMap[row.teacherId];
				if (!existingReview) return true;
				return bulkOverwriteFinalReviews;
			}),
		[bulkFinalReviewCandidates, bulkOverwriteFinalReviews, finalReviewMap],
	);
	const bulkSkippedExistingReviewCount =
		bulkFinalReviewCandidates.length - bulkFinalReviewTargets.length;

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
				sortValue: (row) => getComparablePkpdScore(row) ?? row.currentEnteredScore,
				render: (row) =>
					formatFinalScoreLabel(
						row.finalScore ?? row.currentEnteredScore,
						row.finalMaxScore,
					),
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
					const reviewedAt = selfReviewMap[row.teacherId]?.reviewedAt ?? row.refreshedAt;
					return reviewedAt ? new Date(String(reviewedAt)).getTime() : 0;
				},
				render: (row) => {
					const reviewedAt = selfReviewMap[row.teacherId]?.reviewedAt ?? row.refreshedAt;
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
			(acc, row) => acc + (getComparablePkpdScore(row) ?? 0),
			0,
		);
		return {
			avg:
				validTeacherScores.length > 0 ? total / validTeacherScores.length : null,
			submissions: teacherRows.reduce(
				(sum, row) => sum + row.surveySubmissionCount,
				0,
			),
		};
	}, [teacherRows, validTeacherScores]);

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
		void refreshSummaryCache();
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

	const getBulkFilterLabel = () => {
		const parts = [
			bulkBranchFilter !== "all"
				? (branchMap[bulkBranchFilter]?.name ?? bulkBranchFilter)
				: null,
			bulkDepartmentFilter !== "all"
				? (departmentMap[bulkDepartmentFilter]?.name ?? bulkDepartmentFilter)
				: null,
			bulkSubjectFilter !== "all"
				? (subjectMap[bulkSubjectFilter]?.name ?? bulkSubjectFilter)
				: null,
			bulkModelFilter === "with-biq"
				? "BIQ"
				: bulkModelFilter === "without-biq"
					? "BIQ-siz"
					: null,
			bulkStatusFilter !== "all" ? bulkStatusFilter : null,
		].filter((item): item is string => Boolean(item));
		return parts.length > 0 ? parts.join("_") : "butun-muellimler";
	};

	const handleTeacherResultsVisibilityToggle = async () => {
		if (!cycleId || isHr) return;
		const nextValue = !teacherResultsVisible;
		setTeacherResultsVisibilityLoading(true);
		setTeacherResultsVisibilityStatus(null);
		const { data, error } = await supabase.rpc("set_pkpd_result_visibility", {
			p_cycle_id: cycleId,
			p_is_visible: nextValue,
		});
		const row = Array.isArray(data) ? data[0] : data;
		if (error || !row) {
			setTeacherResultsVisibilityStatus(
				`Görünürlük ayarı saxlanmadı: ${error?.message ?? "naməlum xəta"}`,
			);
			setTeacherResultsVisibilityLoading(false);
			return;
		}
		setTeacherResultsVisible(
			Boolean((row as { is_visible_to_teachers?: boolean }).is_visible_to_teachers),
		);
		setTeacherResultsVisibilityStatus(
			nextValue
				? "Müəllimlər üçün Nəticələrim bölməsi aktiv edildi."
				: "Müəllimlər üçün Nəticələrim bölməsi bağlandı.",
		);
		setTeacherResultsVisibilityLoading(false);
	};

	const handleBulkGenerateFinalReviews = async () => {
		if (!cycleId || userDoc?.role !== "superadmin") {
			setBulkActionStatus("Bu əməliyyat yalnız superadmin üçün aktivdir.");
			return;
		}
		const targets = bulkFinalReviewTargets.slice();
		if (targets.length === 0) {
			setBulkActionStatus("Rəy hazırlanacaq müəllim tapılmadı.");
			return;
		}

		setBulkFinalReviewConfirmOpen(false);
		setBulkFinalReviewRunning(true);
		setBulkActionStatus(null);
		setBulkActionFailures([]);

		const payloadByTeacher: Record<
			string,
			{
				row: TeacherRow;
				branchId: string;
				generatedReview: GeneratedFinalReview;
				generatedAt: string;
			}
		> = {};
		const payload: Array<Record<string, string>> = [];
		const failures: string[] = [];

		for (const row of targets) {
			const teacherBranchId =
				row.branchId ?? teacherMap[row.teacherId]?.branchId ?? null;
			if (!teacherBranchId) {
				failures.push(`${row.name}: kampus tapılmadı`);
				continue;
			}

			try {
				const generatedReview = buildRuleBasedFinalReview(row);
				const generatedAt = new Date().toISOString();
				payloadByTeacher[row.teacherId] = {
					row,
					branchId: teacherBranchId,
					generatedReview,
					generatedAt,
				};
				payload.push({
					teacher_id: row.teacherId,
					review_text: generatedReview.reviewText,
					recommendation_text: generatedReview.recommendationText,
					generated_at: generatedAt,
				});
			} catch (error) {
				failures.push(
					`${row.name}: ${error instanceof Error ? error.message : "naməlum xəta"}`,
				);
			}
		}

		if (payload.length === 0) {
			setBulkActionFailures(failures);
			setBulkActionStatus(
				`Bulk rəy tamamlandı: 0 uğurlu, ${failures.length} xəta.`,
			);
			setBulkFinalReviewRunning(false);
			return;
		}

		const { data, error } = await supabase.rpc("bulk_save_pkpd_final_reviews", {
			p_cycle_id: cycleId,
			p_reviews: payload,
		});

		if (error) {
			setBulkActionFailures([error.message, ...failures]);
			setBulkActionStatus(`Bulk rəy saxlanmadı: ${error.message}`);
			setBulkFinalReviewRunning(false);
			return;
		}

		const saveResults = (data ?? []) as BulkFinalReviewSaveResult[];
		const savedReviews: Array<DocEntry<PkpdFinalReviewDoc>> = [];
		for (const result of saveResults) {
			const teacherId = result.teacher_id ?? result.result_teacher_id ?? "";
			const source = payloadByTeacher[teacherId];
			if (!result.success || !source) {
				const teacherName = (source?.row.name ?? teacherId) || "Müəllim";
				failures.push(
					`${teacherName}: ${result.error_message ?? "naməlum xəta"}`,
				);
				continue;
			}
			savedReviews.push({
				id: result.review_id ?? `${cycleId}_${teacherId}`,
				data: {
					cycleId,
					branchId: source.branchId,
					teacherId,
					reviewText: source.generatedReview.reviewText,
					recommendationText: source.generatedReview.recommendationText,
					generatedBy: user?.id ?? null,
					generatedAt: source.generatedAt,
					updatedBy: user?.id ?? null,
					updatedAt: source.generatedAt,
					isManualEdited: false,
					createdAt: null,
				},
			});
		}

		if (savedReviews.length > 0) {
			const savedIds = new Set(savedReviews.map((item) => item.data.teacherId));
			setFinalReviews((previous) => [
				...previous.filter((item) => !savedIds.has(item.data.teacherId)),
				...savedReviews,
			]);
		}

		setBulkActionFailures(failures);
		setBulkActionStatus(
			`Bulk rəy tamamlandı: ${savedReviews.length} uğurlu, ${failures.length} xəta.`,
		);
		setBulkFinalReviewRunning(false);
	};

	const handleBulkZipExport = async () => {
		if (userDoc?.role !== "superadmin") {
			setBulkActionStatus("ZIP export yalnız superadmin üçün aktivdir.");
			return;
		}
		const rows = bulkFilteredTeacherRows.slice();
		if (rows.length === 0) {
			setBulkActionStatus("ZIP export üçün uyğun müəllim tapılmadı.");
			return;
		}

		setBulkZipRunning(true);
		setBulkActionStatus(null);
		setBulkActionFailures([]);

		const files: ZipFile[] = [];
		const failures: string[] = [];
		for (const row of rows) {
			try {
				const summary = row as PkpdTeacherSummaryDoc;
				files.push({
					name: buildPkpdReportFileName(summary, "html"),
					content: buildPkpdReportHtml({
						summary,
						finalReview: finalReviewMap[row.teacherId] ?? null,
						subjectNames: teacherSubjectNamesByTeacher[row.teacherId] ?? [],
						titleSuffix: cycle?.year
							? `PKPD Yekun Nəticə Hesabatı — ${cycle.year}`
							: "PKPD Yekun Nəticə Hesabatı",
					}),
				});
			} catch (error) {
				failures.push(
					`${row.name}: ${error instanceof Error ? error.message : "naməlum xəta"}`,
				);
			}
		}

		if (failures.length > 0) {
			files.push({
				name: "EXPORT_XETALARI.txt",
				content: failures.join("\n"),
			});
		}
		if (files.length === 0) {
			setBulkActionStatus("ZIP export hazırlanmadı.");
			setBulkZipRunning(false);
			return;
		}

		const dateStamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
		const zipName = `${sanitizePkpdReportFileName(
			`pkpd_${cycle?.year ?? "cycle"}_${getBulkFilterLabel()}_${dateStamp}`,
		)}.zip`;
		downloadZip(zipName, files);
		setBulkActionFailures(failures);
		setBulkActionStatus(
			`ZIP export hazırlandı: ${files.length - (failures.length > 0 ? 1 : 0)} hesabat, ${failures.length} xəta.`,
		);
		setBulkZipRunning(false);
	};

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

	const exportColumnDefinitions = useMemo<ExportColumnDefinition[]>(
		() => [
			{ key: "teacher", label: "Müəllim", value: (row) => row.name },
			{ key: "branch", label: "Campus", value: (row) => row.branchName },
			{ key: "department", label: "Kafedra", value: (row) => row.departmentName },
			{
				key: "subjects",
				label: "Fənn / ixtisas",
				value: (row) =>
					teacherSubjectNamesByTeacher[row.teacherId]?.join(", ") ||
					"Məlumat yoxdur",
			},
			{ key: "model", label: "Qiymətləndirmə modeli", value: (row) => evaluationTypeLabel(row.isBiqTeacher) },
			{ key: "status", label: "Status", value: (row) => getTeacherStatusInfo(row).label },
			{ key: "finalScore", label: "PKPD yekun balı", value: (row) => toExportScore(row.finalScore) },
			{ key: "finalMaxScore", label: "Maksimum bal", value: (row) => row.finalMaxScore },
			{ key: "percentage", label: "Faiz", value: (row) => toExportPercentage(row.finalPercentage) },
			{ key: "bonusScore", label: "Əlavə bal", value: (row) => toExportScore(row.bonusScore) },
			{ key: "incentiveFinalScore", label: "Stimullaşdırıcı yekun", value: (row) => toExportScore(row.finalScoreWithExtra) },
			{ key: "finalDecision", label: "Yekun qərar", value: (row) => formatPkpdDecision(row) },
			{ key: "studentSurveyScore", label: "Şagird sorğusu balı", value: (row) => toExportScore(row.studentWeightedScore) },
			{ key: "studentSurveyCount", label: "Şagird cavab sayı", value: (row) => row.studentCount },
			{ key: "selfScore", label: "Özünüqiymətləndirmə balı", value: (row) => toExportScore(row.selfWeightedScore) },
			{ key: "selfDeclaredScore", label: "Müəllimin verdiyi bal", value: (row) => toExportScore(row.selfDeclaredScore) },
			{ key: "leadershipScore", label: "Rəhbərlik qiymətləndirməsi", value: (row) => toExportScore(row.managementWeightedScore) },
			{
				key: "leadershipVotes",
				label: "Rəhbərlik səs statusu",
				value: (row) => {
					const status = getLeadershipVoteRoleStatus(row);
					return `${row.leadershipSubmittedCount} / ${row.leadershipEligibleCount}; ${status.submittedText}${status.pendingText ? `; ${status.pendingText}` : ""}`;
				},
			},
			{ key: "biqAverage", label: "BİQ/KİQ orta", value: (row) => toExportScore(row.biqAvg) },
			{ key: "biqWeightedScore", label: "Fənn mənimsəmə balı", value: (row) => toExportScore(row.biqWeightedScore) },
			{
				key: "examScore",
				label: "Attestasiya imtahanı",
				value: (row) => row.isExamExempt ? PKPD_EXAM_EXEMPT_LABEL : toExportScore(row.examScore),
			},
			{
				key: "examStatus",
				label: "İmtahan statusu",
				value: (row) => row.isExamExempt ? PKPD_EXAM_EXEMPT_LABEL : isMissingScore(row.examScore) ? "Daxil edilməyib" : "Daxil edilib",
			},
			{ key: "portfolioScore", label: "Portfolio cəmi", value: (row) => toExportScore(row.portfolioScore) },
			{ key: "portfolioEducation", label: "Təhsil/kvalifikasiya", value: (row) => toExportScore(portfolioMap[row.teacherId]?.educationScore) },
			{ key: "portfolioAttendance", label: "Davamiyyət", value: (row) => toExportScore(portfolioMap[row.teacherId]?.attendanceScore) },
			{ key: "portfolioTraining", label: "Sertifikat/təlim/məqalə", value: (row) => toExportScore(portfolioMap[row.teacherId]?.trainingScore) },
			{ key: "portfolioOlympiad", label: "Müsabiqə/festival/yarış", value: (row) => toExportScore(portfolioMap[row.teacherId]?.olympiadScore) },
			{ key: "portfolioEvents", label: "Layihə/tədbir/təltif", value: (row) => toExportScore(portfolioMap[row.teacherId]?.eventsScore) },
			{ key: "finalReview", label: "Yekun rəy", value: (row) => finalReviewMap[row.teacherId]?.reviewText || "Rəy hazırlanmayıb" },
			{ key: "recommendation", label: "Tövsiyə", value: (row) => finalReviewMap[row.teacherId]?.recommendationText || "Tövsiyə hazırlanmayıb" },
			{ key: "hrNote", label: "HR qeydi", value: (row) => selfReviewMap[row.teacherId]?.note ?? "Məlumat yoxdur" },
			{
				key: "lastUpdated",
				label: "Son yenilənmə",
				value: (row) => typeof row.refreshedAt === "string" ? new Date(row.refreshedAt).toLocaleString("az-AZ") : "Məlumat yoxdur",
			},
			{ key: "editedBy", label: "Redaktə edən", value: (row) => finalReviewMap[row.teacherId]?.updatedBy ?? "Məlumat yoxdur" },
		],
		[finalReviewMap, portfolioMap, selfReviewMap, teacherSubjectNamesByTeacher],
	);

	const exportColumnMap = useMemo(
		() => Object.fromEntries(exportColumnDefinitions.map((column) => [column.key, column])),
		[exportColumnDefinitions],
	);
	const branchExportOptions = useMemo<ExportSelectOption[]>(
		() => branches.map((branch) => ({ value: branch.id, label: branch.data.name })),
		[branches],
	);
	const departmentExportOptions = useMemo<ExportSelectOption[]>(
		() =>
			departments.map((department) => ({
				value: department.id,
				label: department.data.name,
			})),
		[departments],
	);
	const subjectExportOptions = useMemo<ExportSelectOption[]>(
		() => subjects.map((subject) => ({ value: subject.id, label: subject.data.name })),
		[subjects],
	);
	const teacherExportOptions = useMemo<ExportSelectOption[]>(
		() =>
			teacherRows.map((row) => ({
				value: row.teacherId,
				label: row.name,
			})),
		[teacherRows],
	);

	const applyExportPreset = (preset: string) => {
		const nextFilters = emptyExportFilters();
		let nextColumns = fullExportColumns;
		if (preset === "summary") nextColumns = summaryExportColumns;
		if (preset === "missing") {
			nextFilters.statuses = ["leadership-missing", "calculation-incomplete", "portfolio-missing"];
			nextColumns = ["teacher", "branch", "department", "subjects", "model", "status", "studentSurveyScore", "selfScore", "leadershipVotes", "biqAverage", "examStatus", "portfolioScore", "finalReview", "recommendation"];
		}
		if (preset === "risk") {
			nextFilters.statuses = ["risk"];
			nextColumns = summaryExportColumns;
		}
		if (preset === "portfolio") nextColumns = ["teacher", "branch", "department", "portfolioScore", "portfolioEducation", "portfolioAttendance", "portfolioTraining", "portfolioOlympiad", "portfolioEvents", "hrNote"];
		if (preset === "exam-exempt") {
			nextFilters.examStatuses = ["exempt"];
			nextColumns = ["teacher", "branch", "department", "model", "status", "examScore", "examStatus", "finalScore", "finalMaxScore", "percentage"];
		}
		if (preset === "leadership-missing") {
			nextFilters.leadershipStatuses = ["missing", "partial"];
			nextColumns = ["teacher", "branch", "department", "status", "leadershipScore", "leadershipVotes", "finalScore"];
		}
		if (preset === "final-review-missing") {
			nextFilters.finalReviewStatuses = ["missing"];
			nextColumns = ["teacher", "branch", "department", "status", "finalScore", "finalReview", "recommendation"];
		}
		setExportFilters(nextFilters);
		setExportColumnKeys(nextColumns);
		setExportStatus(null);
	};

	const updateExportFilter = <K extends keyof ExportFilters>(key: K, value: ExportFilters[K]) => {
		setExportFilters((previous) => ({ ...previous, [key]: value }));
	};

	const toggleExportFilterValue = (key: keyof ExportFilters, value: string) => {
		setExportFilters((previous) => ({
			...previous,
			[key]: toggleArrayValue(previous[key] as string[], value),
		}));
	};

	const filterRowsForExportCriteria = (rows: TeacherRow[]) =>
		rows.filter((row) => {
			const filters = exportFilters;
			const statusInfo = getTeacherStatusInfo(row).label;
			const comparableScore = getComparablePkpdScore(row);
			const finalReview = finalReviewMap[row.teacherId];
			if (filters.branchIds.length && !filters.branchIds.includes(row.branchId ?? "")) return false;
			if (filters.departmentIds.length && !filters.departmentIds.includes(row.departmentId ?? "")) return false;
			if (filters.subjectIds.length && !filters.subjectIds.some((subjectId) => teacherSubjectIdsByTeacher[row.teacherId]?.has(subjectId))) return false;
			if (filters.teacherIds.length && !filters.teacherIds.includes(row.teacherId)) return false;
			if ((filters.models.includes("with-biq") && !row.isBiqTeacher) || (filters.models.includes("without-biq") && row.isBiqTeacher)) return false;
			if (filters.statuses.length) {
				const matchesStatus =
					(filters.statuses.includes("completed") && row.isComplete) ||
					(filters.statuses.includes("in-progress") && !row.isComplete) ||
					(filters.statuses.includes("leadership-missing") && !row.leadershipComplete) ||
					(filters.statuses.includes("calculation-incomplete") && statusInfo === "Hesablama tamamlanmayıb") ||
					(filters.statuses.includes("portfolio-missing") && isMissingScore(row.portfolioScore)) ||
					(filters.statuses.includes("risk") && comparableScore !== null && comparableScore < 60);
				if (!matchesStatus) return false;
			}
			if (filters.denominators.length && !filters.denominators.includes(String(row.finalMaxScore))) return false;
			if (filters.examStatuses.length) {
				const matchesExam =
					(filters.examStatuses.includes("entered") && !row.isExamExempt && !isMissingScore(row.examScore)) ||
					(filters.examStatuses.includes("missing") && !row.isExamExempt && isMissingScore(row.examScore)) ||
					(filters.examStatuses.includes("exempt") && row.isExamExempt);
				if (!matchesExam) return false;
			}
			if (filters.biqStatuses.length) {
				const matchesBiq =
					(filters.biqStatuses.includes("entered") && !isMissingScore(row.biqAvg)) ||
					(filters.biqStatuses.includes("missing") && row.isBiqTeacher && isMissingScore(row.biqAvg));
				if (!matchesBiq) return false;
			}
			if (filters.studentSurveyStatuses.length) {
				const matchesStudent =
					(filters.studentSurveyStatuses.includes("entered") && !isMissingScore(row.studentWeightedScore)) ||
					(filters.studentSurveyStatuses.includes("missing") && isMissingScore(row.studentWeightedScore));
				if (!matchesStudent) return false;
			}
			if (filters.selfStatuses.length) {
				const matchesSelf =
					(filters.selfStatuses.includes("entered") && !isMissingScore(row.selfWeightedScore)) ||
					(filters.selfStatuses.includes("missing") && isMissingScore(row.selfWeightedScore));
				if (!matchesSelf) return false;
			}
			if (filters.leadershipStatuses.length) {
				const matchesLeadership =
					(filters.leadershipStatuses.includes("completed") && row.leadershipComplete) ||
					(filters.leadershipStatuses.includes("missing") && row.leadershipSubmittedCount === 0) ||
					(filters.leadershipStatuses.includes("partial") && row.leadershipSubmittedCount > 0 && !row.leadershipComplete);
				if (!matchesLeadership) return false;
			}
			if (filters.portfolioStatuses.length) {
				const matchesPortfolio =
					(filters.portfolioStatuses.includes("entered") && !isMissingScore(row.portfolioScore)) ||
					(filters.portfolioStatuses.includes("missing") && isMissingScore(row.portfolioScore));
				if (!matchesPortfolio) return false;
			}
			if (filters.finalReviewStatuses.length) {
				const hasReview = Boolean(finalReview?.reviewText?.trim());
				if ((filters.finalReviewStatuses.includes("has") && !hasReview) || (filters.finalReviewStatuses.includes("missing") && hasReview)) return false;
			}
			if (filters.recommendationStatuses.length) {
				const hasRecommendation = Boolean(finalReview?.recommendationText?.trim());
				if ((filters.recommendationStatuses.includes("has") && !hasRecommendation) || (filters.recommendationStatuses.includes("missing") && hasRecommendation)) return false;
			}
			if (!isInRange(comparableScore, filters.minScore, filters.maxScore)) return false;
			if (!isInRange(row.studentCount, filters.minSurveyCount, filters.maxSurveyCount)) return false;
			if (!isInRange(row.portfolioScore, filters.minPortfolio, filters.maxPortfolio)) return false;
			return true;
		});

	const sortRowsForExport = (rows: TeacherRow[]) => {
		if (exportSortKey === "current") return rows;
		const direction = exportSortDirection === "asc" ? 1 : -1;
		const sortValue = (row: TeacherRow): string | number => {
			if (exportSortKey === "teacher") return row.name;
			if (exportSortKey === "branch") return row.branchName;
			if (exportSortKey === "department") return row.departmentName;
			if (exportSortKey === "final-score") return getComparablePkpdScore(row) ?? -1;
			if (exportSortKey === "portfolio") return row.portfolioScore ?? -1;
			if (exportSortKey === "student-count") return row.studentCount;
			if (exportSortKey === "status") return getTeacherStatusInfo(row).label;
			if (exportSortKey === "updated-at") return typeof row.refreshedAt === "string" ? new Date(row.refreshedAt).getTime() : 0;
			return row.name;
		};
		return rows.slice().sort((a, b) => {
			const aValue = sortValue(a);
			const bValue = sortValue(b);
			if (typeof aValue === "number" && typeof bValue === "number") return (aValue - bValue) * direction;
			return String(aValue).localeCompare(String(bValue), "az") * direction;
		});
	};

	const handleExportWorkbook = async () => {
		if (!cycleId) return;
		const year = cycle?.year ?? "-";
		const rows = teacherRows.map((item) => [
			item.branchName,
			item.name,
			item.firstName,
			item.lastName,
			item.departmentName,
			evaluationTypeLabel(item.isBiqTeacher),
			getTeacherStatusInfo(item).label,
			toExportScore(item.currentEnteredScore),
			toExportScore(item.baseTotalScore),
			item.finalMaxScore,
			item.finalScoreLabel,
			toExportPercentage(item.finalPercentage),
			toExportScore(item.bonusScore),
			toExportScore(item.finalScoreWithExtra),
			toExportScore(item.studentWeightedScore),
			item.studentCount,
			toExportScore(item.selfWeightedScore),
			toExportScore(item.selfDeclaredScore),
			toExportScore(item.managementWeightedScore),
			item.leadershipSubmittedCount,
			item.leadershipEligibleCount,
			item.leadershipComplete ? "Tamamlanıb" : "Gözləyir",
			toExportScore(item.biqAvg),
			toExportScore(item.biqWeightedScore),
			item.isExamExempt ? PKPD_EXAM_EXEMPT_LABEL : toExportScore(item.examScore),
			toExportScore(item.portfolioScore),
			toExportScore(item.teacherCriteriaTotal),
			toExportScore(item.hrEvaluationScore),
			item.isPkpdNonParticipant ? "Bəli" : "Xeyr",
			item.surveySubmissionCount,
		]);

		await downloadWorkbook(`cycle-${year}-pkpd-results.xlsx`, [
			{
				name: "PKPD neticeleri",
				headers: [
					"campus",
					"muellim",
					"ad",
					"soyad",
					"kafedra",
					"model",
					"status",
					"cari_daxil_edilmis_bal",
					"yekun_pkpd_bali",
					"yekun_maksimum_bal",
					"yekun_bal_label",
					"yekun_faiz",
					"elave_bal",
					"stimullasdirici_yekun",
					"sagird_sorgusu_bali",
					"sagird_cavab_sayi",
					"ozunuqiymetlendirme_bali",
					"muellimin_verdiyi_bal",
					"rehberlik_qiymetlendirmesi",
					"rehberlik_verilmis_ses",
					"rehberlik_gozlenen_ses",
					"rehberlik_statusu",
					"biq_orta",
					"biq_cevrilmis_bal",
					"attestasiya_imtahani",
					"portfolio",
					"akademik_meyarlar_cemi",
					"hr_qiymetlendirmesi",
					"pkpd_70_uzre_hesablanib",
					"umumi_sorgu_yazisi_sayi",
				],
				rows,
			},
		]);
	};

	void handleExportWorkbook;

	const handleConfiguredExportWorkbook = async () => {
		if (!cycleId) return;
		if (!["admin", "superadmin", "hr"].includes(userDoc?.role ?? "")) {
			setExportStatus("Excel export üçün icazəniz yoxdur.");
			return;
		}
		if (exportColumnKeys.length === 0) {
			setExportStatus("Ən azı bir kolon seçin.");
			return;
		}
		setExportRunning(true);
		setExportStatus(null);
		const year = cycle?.year ?? "-";
		const baseRows =
			exportScope === "current-page"
				? paginatedTeacherRows
				: exportScope === "current-filtered"
					? sortedTeacherRows
					: teacherRows;
		const scopedRows =
			exportScope === "selected-teachers" && exportFilters.teacherIds.length === 0
				? []
				: exportScope === "all-teachers"
					? baseRows
					: filterRowsForExportCriteria(baseRows);
		const rows = sortRowsForExport(scopedRows);
		if (rows.length === 0) {
			setExportStatus("Seçilmiş kriteriyalara uyğun müəllim tapılmadı.");
			setExportRunning(false);
			return;
		}
		const selectedColumns = exportColumnKeys
			.map((key) => exportColumnMap[key])
			.filter(Boolean);
		const filterSummary = [
			`Export əhatəsi: ${exportScopeLabels[exportScope]}`,
			`Sətir sayı: ${rows.length}`,
			exportFilters.branchIds.length
				? `Campus: ${exportFilters.branchIds.map((id) => branchMap[id]?.name ?? id).join(", ")}`
				: "",
			exportFilters.departmentIds.length
				? `Kafedra: ${exportFilters.departmentIds.map((id) => departmentMap[id]?.name ?? id).join(", ")}`
				: "",
			exportFilters.subjectIds.length
				? `Fənn: ${exportFilters.subjectIds.map((id) => subjectMap[id]?.name ?? id).join(", ")}`
				: "",
			exportFilters.statuses.length
				? `Status: ${exportFilters.statuses.join(", ")}`
				: "",
		]
			.filter(Boolean)
			.join(" | ");

		try {
			await downloadWorkbook(`cycle-${year}-pkpd-results.xlsx`, [
				{
					name: "PKPD nəticələri",
					title: `PKPD nəticələri — ${year}`,
					metaRows: [
						["Export tarixi", new Date().toLocaleString("az-AZ")],
						["Seçilmiş filterlər", filterSummary || "Filter seçilməyib"],
					],
					headers: selectedColumns.map((column) => column.label),
					rows: rows.map((row) =>
						selectedColumns.map((column) => toExportCell(column.value(row))),
					),
				},
			]);
			setExportStatus(`Excel export hazırlandı: ${rows.length} müəllim.`);
			setExportDialogOpen(false);
		} catch (error) {
			setExportStatus(
				`Excel export alınmadı: ${error instanceof Error ? error.message : "naməlum xəta"}`,
			);
		} finally {
			setExportRunning(false);
		}
	};

	const handleGenerateFinalReview = async () => {
		if (!cycleId || !selectedTeacher) return;
		if (
			selectedTeacherFinalReview &&
			!window.confirm(
				"Mövcud rəy yenidən hazırlanacaq. Davam etmək istəyirsiniz?",
			)
		) {
			return;
		}

		const generatedReview = buildRuleBasedFinalReview(selectedTeacher);
		const generatedAt = new Date().toISOString();
		setFinalReviewDraft(generatedReview.reviewText);
		setFinalRecommendationDraft(generatedReview.recommendationText);
		setGeneratedFinalReviewDraft(generatedReview);
		setFinalReviewGeneratedAtDraft(generatedAt);
		setFinalReviewStatus(
			"Rəy hazırlandı. Yoxlayıb redaktə etdikdən sonra Saxla düyməsinə klik edin.",
		);

		const { error } = await supabase.rpc("log_pkpd_final_review_generation", {
			p_cycle_id: cycleId,
			p_teacher_id: selectedTeacher.teacherId,
			p_action: selectedTeacherFinalReview ? "REGENERATED" : "GENERATED",
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
		if (!cycleId || !selectedTeacher) return;
		const reviewText = finalReviewDraft.trim();
		const recommendationText = finalRecommendationDraft.trim();
		if (!reviewText || !recommendationText) {
			setFinalReviewStatus("Rəy və tövsiyə mətnlərini daxil edin.");
			return;
		}

		const teacherBranchId =
			teacherMap[selectedTeacher.teacherId]?.branchId ??
			selectedTeacherFinalReview?.branchId;
		if (!teacherBranchId) {
			setFinalReviewStatus("Müəllimin kampusu tapılmadı.");
			return;
		}

		const changedFromGenerated =
			generatedFinalReviewDraft !== null &&
			(generatedFinalReviewDraft.reviewText !== reviewText ||
				generatedFinalReviewDraft.recommendationText !== recommendationText);
		const changedFromSaved =
			selectedTeacherFinalReview !== null &&
			(selectedTeacherFinalReview.reviewText !== reviewText ||
				selectedTeacherFinalReview.recommendationText !== recommendationText);
		const payload = {
			org_id: ORG_ID,
			branch_id: teacherBranchId,
			cycle_id: cycleId,
			teacher_id: selectedTeacher.teacherId,
			review_text: reviewText,
			recommendation_text: recommendationText,
			generated_by: generatedFinalReviewDraft
				? (user?.id ?? null)
				: (selectedTeacherFinalReview?.generatedBy ?? null),
			generated_at:
				finalReviewGeneratedAtDraft ??
				(selectedTeacherFinalReview?.generatedAt
					? String(selectedTeacherFinalReview.generatedAt)
					: null),
			updated_by: user?.id ?? null,
			updated_at: new Date().toISOString(),
			is_manual_edited: generatedFinalReviewDraft
				? changedFromGenerated
				: selectedTeacherFinalReview
					? Boolean(selectedTeacherFinalReview.isManualEdited) ||
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
		const examScoreText = selectedTeacher.isExamExempt
			? PKPD_EXAM_EXEMPT_LABEL
			: formatScore(selectedTeacher.examScore);
		const portfolioScoreText = formatScore(selectedTeacher.portfolioScore);
		const bonusScoreText = selectedTeacher.bonusScore.toFixed(2);
		const baseTotalScoreText = selectedTeacher.finalScoreLabel;
		const finalPercentageText = formatPercentage(selectedTeacher.finalPercentage);
		const finalScoreText = formatScore(selectedTeacher.finalScoreWithExtra);
		const decisionText = pkpdDecision(getComparablePkpdScore(selectedTeacher));
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
							<div class="card"><div class="label">PKPD yekun balı</div><div class="value">${baseTotalScoreText}</div><div class="meta">${selectedTeacher.isExamExempt ? PKPD_EXAM_EXEMPT_NOTE : ""}</div></div>
							<div class="card"><div class="label">Faiz</div><div class="value">${finalPercentageText}</div></div>
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

	const exportPKPDReport = (options: PkpdReportOptions = {}) => {
		if (!selectedTeacher) return;

		const {
			audience = "TEACHER",
			includeOpenAnswers = false,
			includeDetailedSurvey = false,
		} = options;
		void options.includeAudit;
		const isTeacherAudience = audience === "TEACHER";
		const year = cycle?.year ?? new Date().getFullYear();
		const isWithBiq = selectedTeacher.evaluationType === "WITH_BIQ";
		const modelLabel = isWithBiq ? "BİQ/KİQ nəticəsi olan müəllim" : "BİQ/KİQ nəticəsi olmayan müəllim";
		const now = new Date();
		const generatedDate = now.toLocaleDateString("az-AZ", { day: "2-digit", month: "2-digit", year: "numeric" });
		const generatedTime = now.toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit", hour12: false });
		const scoreText = (value: number | string | null | undefined) =>
			typeof value === "string"
				? escapeHtml(value)
				: isMissingScore(value)
					? "Daxil edilməyib"
					: formatScore(value ?? null);
		const scoreWithMax = (value: number | null | undefined, max: number) => `${scoreText(value)} / ${max}`;
		const leadershipVoteStatus = `${selectedTeacher.leadershipSubmittedCount} / ${selectedTeacher.leadershipEligibleCount}`;
		const leadershipRoleStatus = getLeadershipVoteRoleStatus(selectedTeacher);
		const leadershipCompletionText = selectedTeacher.leadershipComplete
			? "Rəhbərlik qiymətləndirməsi tamamlanıb"
			: "Rəhbərlik qiymətləndirməsi tamamlanmayıb";

		const breakdownRows = getPdfScoreRows(selectedTeacher);
		const portfolioMax = isWithBiq ? 20 : 60;
		const portfolioRows: PdfScoreRow[] = selectedTeacherPortfolioLimits ? [
			{ key: "educationQualificationScore", label: "Təhsil / kvalifikasiya", value: selectedTeacherPortfolio?.educationScore, max: selectedTeacherPortfolioLimits.education },
			{ key: "attendanceScore", label: "Davamiyyət", value: selectedTeacherPortfolio?.attendanceScore, max: selectedTeacherPortfolioLimits.attendance },
			{ key: "certificatesPublicationsScore", label: "Sertifikat / məqalə / təlim", value: selectedTeacherPortfolio?.trainingScore, max: selectedTeacherPortfolioLimits.training },
			{ key: isWithBiq ? "olympiadCompetitionScore" : "competitionFestivalScore", label: isWithBiq ? "Olimpiada / müsabiqə" : "Müsabiqə / festival / yarış", value: selectedTeacherPortfolio?.olympiadScore, max: selectedTeacherPortfolioLimits.olympiad },
			{ key: "projectsAwardsScore", label: "Layihə / tədbir / təltif", value: selectedTeacherPortfolio?.eventsScore, max: selectedTeacherPortfolioLimits.events },
		] : [];

		const missingRows = breakdownRows.filter(
			(row) => !row.displayValue && isMissingScore(row.value),
		);
		const isFinalReport = selectedTeacher.isComplete && missingRows.length === 0;
		const reportTitle = isFinalReport ? `PKPD Yekun Nəticə Hesabatı — ${year}` : `PKPD Cari Qiymətləndirmə Hesabatı — ${year}`;
		const statusText = isFinalReport ? "Yekun qiymətləndirmə tamamlanıb" : "Hesablama tamamlanmayıb";
		const baseTotalScore = isFinalReport ? selectedTeacher.baseTotalScore : null;
		const finalScoreWithExtra = isFinalReport ? selectedTeacher.finalScoreWithExtra : null;
		const comparableScore = isFinalReport ? getComparablePkpdScore(selectedTeacher) : null;
		const categoryText = comparableScore !== null ? pkpdBucket(comparableScore) : null;
		const decisionText = comparableScore !== null ? pkpdDecision(comparableScore) : "Qərar verilməyib";
		const uniqueMissingLabels = Array.from(new Set(missingRows.map((row) => row.key === "portfolioScore" ? "Portfolio alt meyarları" : row.label)));
		const hasAnyPortfolioScore = portfolioRows.some((row) => !isMissingScore(row.value));
		const maxScoreNote = selectedTeacher.isExamExempt
			? `<p class="note">Qeyd: ${escapeHtml(PKPD_EXAM_EXEMPT_NOTE)} Faiz: ${formatPercentage(selectedTeacher.finalPercentage)}</p>`
			: "";
		const teacherSummaryHtml = isFinalReport
			? `<div class="summary-item"><span>PKPD yekun balı</span><strong>${scoreWithMax(baseTotalScore, selectedTeacher.finalMaxScore)}</strong></div><div class="summary-item"><span>Faiz</span><strong>${formatPercentage(selectedTeacher.finalPercentage)}</strong></div><div class="summary-item"><span>Əlavə bal</span><strong>${formatScore(selectedTeacher.bonusScore)}</strong></div><div class="summary-item"><span>Stimullaşdırıcı yekun</span><strong>${scoreText(finalScoreWithExtra)}</strong></div><div class="summary-item"><span>Kateqoriya</span><strong>${escapeHtml(categoryText ?? "Daxil edilməyib")}</strong></div><div class="summary-item"><span>Qərar</span><strong>${escapeHtml(decisionText)}</strong></div>${maxScoreNote}`
			: `<div class="summary-item"><span>Daxil edilmiş cari bal</span><strong>${scoreWithMax(selectedTeacher.currentEnteredScore, selectedTeacher.finalMaxScore)}</strong></div><div class="summary-item"><span>Faiz</span><strong>${formatPercentage(selectedTeacher.finalPercentage)}</strong></div><div class="summary-item"><span>Status</span><strong>Hesablama tamamlanmayıb</strong></div><p class="note">Qeyd: Bu cari hesabatdır. Yekun nəticə və qərar bütün tələb olunan qiymətləndirmə sahələri daxil edildikdən sonra formalaşdırılacaq.</p>${maxScoreNote}`;
		const leadershipSummaryHtml = isFinalReport
			? `${teacherSummaryHtml}<div class="summary-item"><span>Verilmiş rəhbərlik səsi</span><strong>${leadershipVoteStatus}</strong></div><div class="summary-item"><span>Rəhbərlik rolları</span><strong>${escapeHtml(leadershipRoleStatus.submittedText)}</strong></div>`
			: `${teacherSummaryHtml}<div class="summary-item"><span>Əlavə bal</span><strong>${formatScore(selectedTeacher.bonusScore)}</strong></div><div class="summary-item"><span>Verilmiş rəhbərlik səsi</span><strong>${leadershipVoteStatus}</strong></div><div class="summary-item"><span>Rəhbərlik statusu</span><strong>${leadershipCompletionText}</strong></div><div class="summary-item"><span>Rəhbərlik rolları</span><strong>${escapeHtml(leadershipRoleStatus.submittedText)}</strong></div><div class="summary-item"><span>Gözlənilən rəhbərlik səsi</span><strong>${escapeHtml(leadershipRoleStatus.pendingText)}</strong></div>`;
		const summaryHtml = isTeacherAudience ? teacherSummaryHtml : leadershipSummaryHtml;
		const totalLabel = isFinalReport ? "PKPD yekun balı" : "Daxil edilmiş cari cəm";
		const totalValue = isFinalReport ? baseTotalScore : selectedTeacher.currentEnteredScore;
		const breakdownHtml = [...breakdownRows.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${scoreText(row.displayValue ?? row.value)}</td><td>${row.max}</td></tr>`), `<tr class="total-row"><td>${totalLabel}</td><td>${scoreText(totalValue)}</td><td>${selectedTeacher.finalMaxScore}</td></tr>`].join("");
		const missingHtml = !isFinalReport && uniqueMissingLabels.length > 0 ? `<section><h2>Çatışmayan sahələr</h2><ul class="missing-list">${uniqueMissingLabels.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>` : "";
		const portfolioHtml = hasAnyPortfolioScore ? `<table><thead><tr><th>Meyar</th><th>Bal</th><th>Maksimum</th></tr></thead><tbody>${[...portfolioRows.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${scoreText(row.value)}</td><td>${row.max}</td></tr>`), `<tr class="total-row"><td>Portfolio cəmi</td><td>${scoreText(selectedTeacher.portfolioScore)}</td><td>${portfolioMax}</td></tr>`].join("")}</tbody></table>` : `<p class="empty-note">Portfolio alt meyarları üzrə bal hələ daxil edilməyib.</p><p class="empty-note">Maksimum portfolio balı: ${portfolioMax}</p>`;
		const leadershipRoleRows = [
			{ label: "İcraçı direktor", submitted: selectedTeacher.branchManagerSubmitted },
			{ label: "Tədris işləri üzrə direktor müavini", submitted: selectedTeacher.deputySubmitted },
			{ label: "Kafedra rəhbəri", submitted: selectedTeacher.departmentHeadSubmitted },
		];
		const leadershipRolesHtml = leadershipRoleRows
			.map((row) => `<li>${escapeHtml(row.label)}: ${row.submitted ? "səs verib" : "gözlənilir"}</li>`)
			.join("");
		const leadershipDetailsHtml = isTeacherAudience ? "" : `<section><h2>Rəhbərlik qiymətləndirməsi</h2><div class="summary-grid"><div class="summary-item"><span>Verilmiş səs sayı</span><strong>${leadershipVoteStatus}</strong></div><div class="summary-item"><span>Orta bal</span><strong>${scoreWithMax(selectedTeacher.managementWeightedScore, 10)}</strong></div><div class="summary-item"><span>Status</span><strong>${selectedTeacher.leadershipComplete ? "Tamamlanıb" : "Tamamlanmayıb"}</strong></div></div><h3>Rollar</h3><ul>${leadershipRolesHtml}</ul></section>`;
		const portfolioSectionHtml = isTeacherAudience ? "" : `<section><h2>Portfolio xülasəsi</h2>${portfolioHtml}</section>`;
		const studentSummaryHtml = isTeacherAudience ? "" : `<section><h2>Balabilgə sorğusu xülasəsi</h2><div class="student-summary"><div><span>10 üzərindən orta bal</span><strong>${scoreText(selectedTeacher.studentAvg)}</strong></div><div><span>Cavab sayı</span><strong>${selectedTeacher.studentCount}</strong></div><div><span>Çevrilmiş bal</span><strong>${scoreWithMax(selectedTeacher.studentWeightedScore, isWithBiq ? 15 : 20)}</strong></div></div></section>`;
		const classRowsHtml = selectedTeacher.studentClassScores
			.map((row) => `<tr><td>${escapeHtml(row.groupName)}</td><td>${row.submissionCount}</td><td>${formatScore(row.avg)}</td></tr>`)
			.join("");
		const detailedSurveyHtml = !isTeacherAudience && includeDetailedSurvey && classRowsHtml
			? `<section><h2>Sinif/blok üzrə nəticələr</h2><table><thead><tr><th>Sinif / blok</th><th>Cavab sayı</th><th>Orta bal</th></tr></thead><tbody>${classRowsHtml}</tbody></table></section>`
			: "";
		const openAnswers = selectedTeacherSelfResponse?.textAnswers ?? [];
		const openAnswerDetailsHtml = includeOpenAnswers && openAnswers.length > 0
			? `<ul>${openAnswers.map((item) => `<li><strong>${escapeHtml(item.questionText)}</strong><br />${escapeHtml(item.answerText)}</li>`).join("")}</ul>`
			: `<p>Açıq cavab sayı: ${openAnswers.length}. Tam mətn daxili ekrandan baxıla bilər.</p>`;
		const openAnswersHtml = isTeacherAudience ? "" : `<section><h2>Açıq cavabların xülasəsi</h2>${openAnswerDetailsHtml}</section>`;
		const achievementRows = achievements
			.filter((item) => item.data.teacherId === selectedTeacher.teacherId)
			.map((item) => `<li>${escapeHtml(item.data.type)}: ${formatScore(item.data.points)}</li>`)
			.join("");
		const achievementHtml = isTeacherAudience ? "" : `<section><h2>Əlavə bal detalları</h2>${achievementRows ? `<ul>${achievementRows}</ul>` : "<p>Əlavə bal qeydə alınmayıb.</p>"}</section>`;
		const finalReviewText = selectedTeacherFinalReview?.reviewText?.trim()
			|| (isTeacherAudience ? "Yekun rəy hələ hazırlanmayıb." : isFinalReport ? "Yekun rəy hələ əlavə edilməyib." : "Rəy və tövsiyə yekun qiymətləndirmə tamamlandıqdan sonra formalaşdırılacaq.");
		const finalRecommendationText = selectedTeacherFinalReview?.recommendationText?.trim()
			|| (isTeacherAudience ? "Yekun tövsiyə hələ hazırlanmayıb." : isFinalReport ? "Yekun tövsiyə hələ əlavə edilməyib." : "Qiymətləndirmənin tamamlanması gözlənilir.");
		const finalReviewHtml = `<section><h2>Yekun rəy və tövsiyə</h2><h3>Rəy</h3><p>${escapeHtml(finalReviewText)}</p><h3>Tövsiyə</h3><p>${escapeHtml(finalRecommendationText)}</p></section>`;
		const signaturesHtml = isTeacherAudience && isFinalReport ? `<section class="signatures"><h2>Təsdiq və imzalar</h2><div class="signature-line"><strong>Müəllim:</strong><span></span></div><div class="signature-line"><strong>Kafedra rəhbəri:</strong><span></span></div><div class="signature-line"><strong>Filial rəhbəri:</strong><span></span></div><div class="signature-line"><strong>Attestasiya komissiyasının sədri:</strong><span></span></div><div class="signature-line"><strong>Tarix:</strong><span>____ / ____ / ______</span></div><div class="signature-line"><strong>Möhür üçün yer:</strong><span></span></div></section>` : "";
		const html = `<!doctype html><html lang="az"><head><meta charset="utf-8" /><title>${escapeHtml(selectedTeacher.name)} - ${reportTitle}</title><style>@page { size: A4; margin: 15mm; } body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; font-size: 12px; line-height: 1.45; } header { border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 14px; } .org { font-size: 13px; font-weight: 700; text-transform: uppercase; } h1 { font-size: 18px; margin: 4px 0; } h3 { font-size: 13px; margin: 10px 0 4px; } .subtitle { font-size: 15px; font-weight: 700; } section { margin-top: 14px; break-inside: avoid; } h2 { font-size: 14px; margin: 0 0 8px; border-bottom: 1px solid #d1d5db; padding-bottom: 4px; } .info-grid, .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; } .info-item, .summary-item { border: 1px solid #d1d5db; padding: 7px 8px; min-height: 28px; } .info-item span, .summary-item span { display: block; color: #4b5563; font-size: 11px; } .info-item strong, .summary-item strong { font-size: 13px; } .note { grid-column: 1 / -1; margin: 2px 0 0; padding: 8px; border-left: 3px solid #92400e; background: #fffbeb; } table { width: 100%; border-collapse: collapse; margin-top: 6px; break-inside: avoid; } tr { break-inside: avoid; } th, td { border: 1px solid #d1d5db; padding: 7px 8px; text-align: left; vertical-align: top; } th { background: #f3f4f6; font-weight: 700; } .total-row td { font-weight: 700; background: #f9fafb; } .missing-list { margin: 6px 0 0; padding-left: 18px; } .empty-note { margin: 4px 0; } .student-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; } .student-summary div { border: 1px solid #d1d5db; padding: 7px 8px; } .student-summary span { display: block; color: #4b5563; font-size: 11px; } .signatures { margin-top: 20px; break-inside: avoid; } .signature-line { display: grid; grid-template-columns: 190px 1fr; gap: 12px; align-items: end; margin-top: 14px; } .signature-line span { display: block; min-height: 20px; border-bottom: 1px solid #111827; } .generated { margin-top: 18px; color: #4b5563; font-size: 11px; }</style></head><body><header><div class="org">Hədəf STEAM Liseyi MMC</div><h1>Pedaqoji Kadrların Performans Dəyərləndirilməsi</h1><div class="subtitle">${reportTitle}</div></header><section><h2>Müəllim məlumatları</h2><div class="info-grid"><div class="info-item"><span>Müəllim</span><strong>${escapeHtml(selectedTeacher.name)}</strong></div><div class="info-item"><span>Kampus</span><strong>${escapeHtml(selectedTeacher.branchName)}</strong></div><div class="info-item"><span>Kafedra</span><strong>${escapeHtml(selectedTeacher.departmentName)}</strong></div><div class="info-item"><span>Qiymətləndirmə modeli</span><strong>${escapeHtml(modelLabel)}</strong></div><div class="info-item"><span>Hesabat statusu</span><strong>${statusText}</strong></div></div></section><section><h2>Xülasə</h2><div class="summary-grid">${summaryHtml}</div></section><section><h2>Bal bölgüsü</h2><table><thead><tr><th>Meyar</th><th>Bal</th><th>Maksimum</th></tr></thead><tbody>${breakdownHtml}</tbody></table></section>${missingHtml}${leadershipDetailsHtml}${portfolioSectionHtml}${studentSummaryHtml}${detailedSurveyHtml}${openAnswersHtml}${achievementHtml}${finalReviewHtml}${signaturesHtml}<div class="generated"><div>Hazırlanma tarixi: ${generatedDate}</div><div>Hazırlanma saatı: ${generatedTime}</div></div></body></html>`;
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
		const parsedExamScore = rawExamScore
			? Number(rawExamScore.replace(",", "."))
			: null;
		if (
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

		const examScoreCleared = !rawExamScore && selectedTeacher?.examScore !== null;
		if (rawExamScore) {
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
		} else if (examScoreCleared) {
			const { error: examDeleteError } = await supabase
				.from("pkpd_exam_results")
				.delete()
				.eq("org_id", ORG_ID)
				.eq("cycle_id", cycleId)
				.eq("teacher_id", selectedTeacherId);
			if (examDeleteError) {
				setAssessmentStatus("Attestasiya imtahanı silinmədi");
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
			rawExamScore
				? isBiqTeacher
					? "Müəllim BİQ müəllimi, BİQ ortalaması və attestasiya imtahanı ilə saxlanıldı"
					: "Müəllim BİQ olmayan fənn müəllimi kimi attestasiya imtahanı ilə saxlanıldı; xam cəm 130 maksimumdan 100 şkalasına çevrilir"
				: examScoreCleared
					? "Attestasiya imtahanı balı silindi"
					: isBiqTeacher
						? "Müəllim BİQ müəllimi kimi saxlanıldı"
						: "Müəllim BİQ olmayan fənn müəllimi kimi saxlanıldı",
		);
		void refreshSummaryCache();
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
		const hasOpenQuestions = selectedTeacherOpenQuestionIds.length > 0;

		const normalizedQuestionScores: Record<string, number> = {};
		const portfolioQuestionScores: Record<SelfReviewPortfolioField, number | null> = {
			trainingScore: selectedTeacherPortfolio?.trainingScore ?? null,
			olympiadScore: selectedTeacherPortfolio?.olympiadScore ?? null,
			eventsScore: selectedTeacherPortfolio?.eventsScore ?? null,
		};
		if (hasOpenQuestions) {
			portfolioQuestionScores.trainingScore = null;
			portfolioQuestionScores.olympiadScore = null;
			portfolioQuestionScores.eventsScore = null;

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
			[
				educationScore,
				attendanceScore,
				portfolioQuestionScores.trainingScore,
				portfolioQuestionScores.olympiadScore,
				portfolioQuestionScores.eventsScore,
			],
		);
		const shouldSaveSelfReview =
			hasOpenQuestions || Boolean(noteValue) || selectedTeacherHasSavedOpenReview;
		const shouldSavePortfolio =
			teacherCriteriaTotal !== null || Boolean(selectedTeacherPortfolio);
		if (!shouldSaveSelfReview && !shouldSavePortfolio) {
			setSelfReviewStatus("Saxlamaq üçün ən azı bir bal və ya qeyd daxil edilməlidir");
			return;
		}
		const editReason = selectedTeacherHasSavedOpenReview
			? selfReviewUnlockReason.trim()
			: null;
		if (shouldSaveSelfReview) {
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
		}

		if (shouldSavePortfolio) {
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
			teacherCriteriaTotal === null
				? "HR qeydi saxlanıldı; rəsmi PKPD cəminə daxil edilmir"
				: `Portfolio balları (${teacherCriteriaTotal.toFixed(1)}) rəsmi PKPD cəminə daxil edildi; HR qeydi cəmə daxil edilmir`,
		);
		setSelfReviewEditUnlocked(false);
		setSelfReviewUnlockReason("");
		void refreshSummaryCache();
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
						onClick={() => setExportDialogOpen(true)}
						disabled={!cycleId}
					>
						Excel export
					</button>
					</>
				}
			/>

			<Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
				<DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
					<DialogHeader>
						<DialogTitle>PKPD Excel ixracı</DialogTitle>
						<DialogDescription>
							Export olunacaq müəllimləri, kriteriyaları və Excel kolonlarını seçin.
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-5 pb-20">
						<section className="grid gap-3 rounded-xl border border-border bg-card p-4">
							<div>
								<h3 className="text-base font-semibold">Export ayarları</h3>
								<p className="text-sm text-muted-foreground">
									Preset, scope və sıralama seçin.
								</p>
							</div>
						<div className="grid gap-3 md:grid-cols-3">
							<label className="field">
								<span>Preset</span>
								<select
									onChange={(event) => applyExportPreset(event.target.value)}
									defaultValue=""
								>
									<option value="" disabled>
										Preset seçin
									</option>
									{exportPresetOptions.map((preset) => (
										<option key={preset.value} value={preset.value}>
											{preset.label}
										</option>
									))}
								</select>
							</label>
							<label className="field">
								<span>Export əhatəsi</span>
								<select
									value={exportScope}
									onChange={(event) => setExportScope(event.target.value as ExportScope)}
								>
									<option value="current-filtered">Cari filterlənmiş cədvəl</option>
									<option value="current-page">Cari səhifə</option>
									<option value="selected-teachers">Seçilmiş müəllimlər</option>
									<option value="all-matching">Kriteriyaya uyğun hamısı</option>
									<option value="all-teachers">Bütün müəllimlər</option>
								</select>
							</label>
							<label className="field">
								<span>Sıralama</span>
								<select
									value={exportSortKey}
									onChange={(event) => setExportSortKey(event.target.value as ExportSortKey)}
								>
									<option value="current">Cari cədvəl sıralaması</option>
									<option value="teacher">Müəllim adı</option>
									<option value="branch">Campus</option>
									<option value="department">Kafedra</option>
									<option value="final-score">Yekun bal</option>
									<option value="portfolio">Portfolio</option>
									<option value="student-count">Şagird cavab sayı</option>
									<option value="status">Status</option>
									<option value="updated-at">Son yenilənmə</option>
								</select>
							</label>
						</div>
						</section>

						<section className="grid gap-3 rounded-xl border border-border bg-card p-4">
							<div>
								<h3 className="text-base font-semibold">Data filterləri</h3>
								<p className="text-sm text-muted-foreground">
									Campus, kafedra, fənn və müəllim siyahıları search-li dropdown daxilində göstərilir.
								</p>
							</div>
						<div className="grid gap-3 md:grid-cols-2">
							<ExportMultiSelect
								label="Campus"
								placeholder="Campus seçin"
								options={branchExportOptions}
								value={exportFilters.branchIds}
								onChange={(nextValue) => updateExportFilter("branchIds", nextValue)}
								countLabel="campus"
							/>
							<ExportMultiSelect
								label="Kafedra"
								placeholder="Kafedra seçin"
								options={departmentExportOptions}
								value={exportFilters.departmentIds}
								onChange={(nextValue) => updateExportFilter("departmentIds", nextValue)}
								countLabel="kafedra"
							/>
							<ExportMultiSelect
								label="Fənn / ixtisas"
								placeholder="Fənn seçin"
								options={subjectExportOptions}
								value={exportFilters.subjectIds}
								onChange={(nextValue) => updateExportFilter("subjectIds", nextValue)}
								countLabel="fənn"
							/>
						</div>

						<div className="md:col-span-2">
							<ExportMultiSelect
								label="Müəllimlər"
								placeholder="Müəllim seçin"
								options={teacherExportOptions}
								value={exportFilters.teacherIds}
								onChange={(nextValue) => updateExportFilter("teacherIds", nextValue)}
								countLabel="müəllim"
							/>
						</div>

						</section>

						<section className="grid gap-3 rounded-xl border border-border bg-card p-4">
							<div>
								<h3 className="text-base font-semibold">Əlavə filterlər</h3>
								<p className="text-sm text-muted-foreground">
									Model, status və çatışmayan məlumat kriteriyaları.
								</p>
							</div>
							<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
								{[
									["with-biq", "BİQ/KİQ nəticəsi olan", "models"],
									["without-biq", "BİQ/KİQ nəticəsi olmayan", "models"],
									["70", "70 bal üzərindən", "denominators"],
									["100", "100 bal üzərindən", "denominators"],
									["entered", "İmtahan balı daxil edilib", "examStatuses"],
									["missing", "İmtahan balı yoxdur", "examStatuses"],
									["exempt", "İmtahandan azad", "examStatuses"],
									["entered", "BİQ daxil edilib", "biqStatuses"],
									["missing", "BİQ yoxdur", "biqStatuses"],
									["entered", "Şagird sorğusu var", "studentSurveyStatuses"],
									["missing", "Şagird sorğusu yoxdur", "studentSurveyStatuses"],
									["entered", "Özünüqiymətləndirmə var", "selfStatuses"],
									["missing", "Özünüqiymətləndirmə yoxdur", "selfStatuses"],
									["completed", "Rəhbərlik tamamlanıb", "leadershipStatuses"],
									["partial", "Rəhbərlik qismən", "leadershipStatuses"],
									["missing", "Rəhbərlik yoxdur", "leadershipStatuses"],
									["entered", "Portfolio var", "portfolioStatuses"],
									["missing", "Portfolio yoxdur", "portfolioStatuses"],
									["has", "Rəy var", "finalReviewStatuses"],
									["missing", "Rəy yoxdur", "finalReviewStatuses"],
									["has", "Tövsiyə var", "recommendationStatuses"],
									["missing", "Tövsiyə yoxdur", "recommendationStatuses"],
								].map(([value, label, key]) => (
									<label key={`${key}-${value}-${label}`} className="flex min-w-0 items-center gap-2 text-sm">
										<input
											type="checkbox"
											checked={(exportFilters[key as keyof ExportFilters] as string[]).includes(value)}
											onChange={() => toggleExportFilterValue(key as keyof ExportFilters, value)}
										/>
										<span className="truncate" title={label}>{label}</span>
									</label>
								))}
								{exportStatusOptions.map((status) => (
									<label key={status.value} className="flex min-w-0 items-center gap-2 text-sm">
										<input
											type="checkbox"
											checked={exportFilters.statuses.includes(status.value)}
											onChange={() => toggleExportFilterValue("statuses", status.value)}
										/>
										<span className="truncate" title={status.label}>{status.label}</span>
									</label>
								))}
							</div>
						</section>

						<section className="grid gap-3 rounded-xl border border-border bg-card p-4">
							<div>
								<h3 className="text-base font-semibold">Aralıqlar</h3>
								<p className="text-sm text-muted-foreground">
									Minimum və maksimum dəyərlər yan-yana tənzimlənir.
								</p>
							</div>
							<div className="grid gap-3 lg:grid-cols-3">
								<fieldset className="grid gap-2 rounded-lg border border-border p-3">
									<legend className="px-1 text-sm font-semibold">Yekun bal</legend>
									<div className="grid gap-2 sm:grid-cols-2">
										<label className="field"><span>Minimum yekun bal</span><input value={exportFilters.minScore} onChange={(event) => updateExportFilter("minScore", event.target.value)} /></label>
										<label className="field"><span>Maksimum yekun bal</span><input value={exportFilters.maxScore} onChange={(event) => updateExportFilter("maxScore", event.target.value)} /></label>
									</div>
								</fieldset>
								<fieldset className="grid gap-2 rounded-lg border border-border p-3">
									<legend className="px-1 text-sm font-semibold">Şagird cavabı</legend>
									<div className="grid gap-2 sm:grid-cols-2">
										<label className="field"><span>Minimum şagird cavabı</span><input value={exportFilters.minSurveyCount} onChange={(event) => updateExportFilter("minSurveyCount", event.target.value)} /></label>
										<label className="field"><span>Maksimum şagird cavabı</span><input value={exportFilters.maxSurveyCount} onChange={(event) => updateExportFilter("maxSurveyCount", event.target.value)} /></label>
									</div>
								</fieldset>
								<fieldset className="grid gap-2 rounded-lg border border-border p-3">
									<legend className="px-1 text-sm font-semibold">Portfolio</legend>
									<div className="grid gap-2 sm:grid-cols-2">
										<label className="field"><span>Minimum portfolio</span><input value={exportFilters.minPortfolio} onChange={(event) => updateExportFilter("minPortfolio", event.target.value)} /></label>
										<label className="field"><span>Maksimum portfolio</span><input value={exportFilters.maxPortfolio} onChange={(event) => updateExportFilter("maxPortfolio", event.target.value)} /></label>
									</div>
								</fieldset>
							</div>
						</section>

						<section className="grid gap-3 rounded-xl border border-border bg-card p-4">
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div>
									<h3 className="text-base font-semibold">Kolonlar</h3>
									<p className="text-sm text-muted-foreground">
										{exportColumnKeys.length === fullExportColumns.length ? "Bütün kolonlar seçilib" : `${exportColumnKeys.length} kolon seçilib`}
									</p>
								</div>
								<div className="flex gap-2">
									<button className="btn ghost" type="button" onClick={() => setExportColumnKeys(summaryExportColumns)}>Xülasə</button>
									<button className="btn ghost" type="button" onClick={() => setExportColumnKeys(fullExportColumns)}>Hamısı</button>
								</div>
							</div>
							<Accordion type="multiple" defaultValue={["main", "scores"]}>
								{exportColumnGroups.map((group) => (
									<AccordionItem key={group.id} value={group.id}>
										<AccordionTrigger>{group.title}</AccordionTrigger>
										<AccordionContent>
											<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
												{group.keys.map((key) => exportColumnMap[key]).filter(Boolean).map((column) => (
													<label key={column.key} className="flex min-w-0 items-center gap-2 text-sm">
														<input type="checkbox" checked={exportColumnKeys.includes(column.key)} onChange={() => setExportColumnKeys((previous) => toggleArrayValue(previous, column.key))} />
														<span className="truncate" title={column.label}>{column.label}</span>
													</label>
												))}
											</div>
										</AccordionContent>
									</AccordionItem>
								))}
							</Accordion>
						</section>
					</div>

					{exportStatus && <div className="notice warning">{exportStatus}</div>}

					<DialogFooter className="sticky bottom-0 -mx-6 -mb-6 mt-4 border-t border-border bg-card px-6 py-4">
						<button
							className="btn ghost"
							type="button"
							onClick={() => {
								setExportFilters(emptyExportFilters());
								setExportColumnKeys(fullExportColumns);
								setExportSortKey("current");
								setExportSortDirection("asc");
								setExportStatus(null);
							}}
						>
							Sıfırla
						</button>
						<div className="ml-auto flex gap-2">
							<button className="btn ghost" type="button" onClick={() => setExportDialogOpen(false)}>
								Bağla
							</button>
							<button
								className="btn primary"
								type="button"
								onClick={() => void handleConfiguredExportWorkbook()}
								disabled={exportRunning}
							>
								{exportRunning ? "Export hazırlanır..." : "Export"}
							</button>
						</div>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{(summaryCacheLoading || cycleDataLoading) && (
				<div className="card grid gap-3">
					<div className="flex items-center justify-between gap-3">
						<div>
							<div className="font-semibold">
								{cachedTeacherRows.length > 0
									? "Nəticələr göstərildi, detallar yenilənir"
									: "Nəticələr yüklənir"}
							</div>
							<div className="hint">
								Məlumatlar arxa planda hazırlanır. Səhifəni yeniləməyə ehtiyac yoxdur.
							</div>
						</div>
						<StatusBadge tone="info">Yüklənir</StatusBadge>
					</div>
					<div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
						<div className="h-full w-1/3 animate-pulse rounded-full bg-blue-500" />
					</div>
				</div>
			)}

			{cycleDataError && (
				<div className="notice warning">{cycleDataError}</div>
			)}

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
							teacherRows.filter((row) => {
								const score = getComparablePkpdScore(row);
								return score !== null && score < 60;
							}).length
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
						value={topTeacher ? topTeacher.finalScoreLabel : "—"}
						meta={topTeacher ? topTeacher.name : "Məlumat yoxdur"}
					/>
					<StatCard
						tone="warning"
						label="Ən aşağı nəticə"
						value={bottomTeacher ? bottomTeacher.finalScoreLabel : "—"}
						meta={bottomTeacher ? bottomTeacher.name : "Məlumat yoxdur"}
					/>
				</div>
			</SectionCard>

			{!isHr && (
				<SectionCard
					eyebrow="Admin əməliyyatları"
					title="Kütləvi PKPD əməliyyatları"
					description="Seçilən filterlər bütün müəllim siyahısına tətbiq olunur; pagination nəticəyə təsir etmir."
					actions={
						<StatusBadge tone="neutral">
							Seçildi: {bulkFilteredTeacherRows.length}
						</StatusBadge>
					}
				>
					<div className="filters">
						<label className="field">
							<span className="label">Campus</span>
							<select
								className="input"
								value={bulkBranchFilter}
								onChange={(event) => setBulkBranchFilter(event.target.value)}
							>
								<option value="all">Bütün campuslar</option>
								{branches.map((branch) => (
									<option key={branch.id} value={branch.id}>
										{branch.data.name}
									</option>
								))}
							</select>
						</label>
						<label className="field">
							<span className="label">Kafedra</span>
							<select
								className="input"
								value={bulkDepartmentFilter}
								onChange={(event) => setBulkDepartmentFilter(event.target.value)}
							>
								<option value="all">Bütün kafedralar</option>
								{departments.map((department) => (
									<option key={department.id} value={department.id}>
										{department.data.name}
									</option>
								))}
							</select>
						</label>
						<label className="field">
							<span className="label">Fənn / ixtisas</span>
							<select
								className="input"
								value={bulkSubjectFilter}
								onChange={(event) => setBulkSubjectFilter(event.target.value)}
							>
								<option value="all">Bütün fənlər</option>
								{subjects.map((subject) => (
									<option key={subject.id} value={subject.id}>
										{subject.data.name}
									</option>
								))}
							</select>
						</label>
						<label className="field">
							<span className="label">Model</span>
							<select
								className="input"
								value={bulkModelFilter}
								onChange={(event) => setBulkModelFilter(event.target.value)}
							>
								<option value="all">Bütün modellər</option>
								<option value="with-biq">BİQ/KİQ nəticəsi olan</option>
								<option value="without-biq">BİQ/KİQ nəticəsi olmayan</option>
							</select>
						</label>
						<label className="field">
							<span className="label">Status</span>
							<select
								className="input"
								value={bulkStatusFilter}
								onChange={(event) => setBulkStatusFilter(event.target.value)}
							>
								<option value="all">Bütün statuslar</option>
								<option value="complete">Tamamlanıb</option>
								<option value="incomplete">Hesablama tamamlanmayıb</option>
								<option value="risk">Risk qrupu</option>
								<option value="leadership-pending">Rəhbərlik səsi gözləyir</option>
							</select>
						</label>
						<label className="field">
							<span className="label">Mövcud rəylər</span>
							<label className="inline-flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={bulkOverwriteFinalReviews}
									onChange={(event) =>
										setBulkOverwriteFinalReviews(event.target.checked)
									}
								/>
								Mövcud rəyləri yenilə
							</label>
						</label>
					</div>
					<div className="mt-4 flex flex-wrap gap-2">
						<button
							className="btn primary"
							type="button"
							onClick={() => setBulkFinalReviewConfirmOpen(true)}
							disabled={
								bulkFinalReviewRunning ||
								bulkFinalReviewTargets.length === 0 ||
								userDoc?.role !== "superadmin"
							}
						>
							{bulkFinalReviewRunning ? "Hazırlanır..." : "Bulk rəy hazırla"}
						</button>
						<button
							className="btn"
							type="button"
							onClick={() => void handleBulkZipExport()}
							disabled={
								bulkZipRunning ||
								bulkFilteredTeacherRows.length === 0 ||
								userDoc?.role !== "superadmin"
							}
						>
							{bulkZipRunning ? "ZIP hazırlanır..." : "PDF ZIP export"}
						</button>
						<StatusBadge tone="info">
							Rəy hədəfi: {bulkFinalReviewTargets.length}
						</StatusBadge>
						{bulkSkippedExistingReviewCount > 0 && (
							<StatusBadge tone="warning">
								Keçiləcək mövcud rəy: {bulkSkippedExistingReviewCount}
							</StatusBadge>
						)}
					</div>
					{teacherResultsVisibilityStatus && (
						<div className="notice info mt-4">{teacherResultsVisibilityStatus}</div>
					)}
					{bulkActionStatus && (
						<div className="notice info mt-4">{bulkActionStatus}</div>
					)}
					{bulkActionFailures.length > 0 && (
						<div className="notice warning mt-4">
							<div className="font-semibold">Xəta siyahısı</div>
							<ul className="mt-2 list-disc pl-5">
								{bulkActionFailures.slice(0, 10).map((failure) => (
									<li key={failure}>{failure}</li>
								))}
							</ul>
						</div>
					)}
				</SectionCard>
			)}

			{!isHr && (
				<SectionCard
					eyebrow="Görünürlük"
					title="Müəllim nəticə səhifəsi"
					description="Aktiv ediləndə müəllimlər yalnız öz PKPD nəticəsini və PDF hesabatını görə bilər."
					actions={
						<StatusBadge tone={teacherResultsVisible ? "success" : "neutral"}>
							{teacherResultsVisible ? "Aktiv" : "Bağlı"}
						</StatusBadge>
					}
				>
					<button
						className={teacherResultsVisible ? "btn" : "btn primary"}
						type="button"
						onClick={() => void handleTeacherResultsVisibilityToggle()}
						disabled={teacherResultsVisibilityLoading || userDoc?.role !== "superadmin"}
					>
						{teacherResultsVisibilityLoading
							? "Saxlanır..."
							: teacherResultsVisible
								? "Nəticələrim bölməsini bağla"
								: "Nəticələrim bölməsini aktiv et"}
					</button>
				</SectionCard>
			)}

			<FilterPanel
				title="Filterlər"
				description="Axtarış, rəhbərlik səsi və çatışmayan sahəyə görə siyahını daraldın."
				actions={
					<button
						className="btn ghost"
						type="button"
						onClick={() => {
							setTeacherQuery("");
							setLeadershipFilter("all");
							setMissingFilter("all");
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
					<span className="label">Çatışmayan sahə</span>
					<select
						className="input"
						value={missingFilter}
						onChange={(event) => {
							setMissingFilter(event.target.value as MissingFilter);
							setTeacherPage(1);
						}}
					>
						<option value="all">Hamısı</option>
						<option value="any">Hər hansı əsas sahə çatışmır</option>
						<option value="student">Balabilgə sorğusu yoxdur</option>
						<option value="self">Özünüqiymətləndirmə yoxdur</option>
						<option value="open-answers">Açıq cavab yazmayıb</option>
						<option value="leadership">Rəhbərlik səsi tamamlanmayıb</option>
						<option value="biq">BİQ/KİQ nəticəsi yoxdur</option>
						<option value="exam">Attestasiya balı yoxdur</option>
						<option value="portfolio">Portfolio yoxdur</option>
						<option value="complete">Tamamlanmış nəticələr</option>
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
				open={bulkFinalReviewConfirmOpen}
				onOpenChange={setBulkFinalReviewConfirmOpen}
			>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>Bulk rəy hazırlanmasını təsdiqlə</DialogTitle>
						<DialogDescription>
							Seçilən filterlər üzrə {bulkFinalReviewTargets.length} müəllim üçün
							rəy və tövsiyə hazırlanacaq.
							{bulkSkippedExistingReviewCount > 0
								? ` ${bulkSkippedExistingReviewCount} mövcud rəy yenilənmədən saxlanılacaq.`
								: ""}
						</DialogDescription>
					</DialogHeader>
					{bulkOverwriteFinalReviews && (
						<div className="notice warning">
							Mövcud rəylər, o cümlədən manual redaktə edilmiş mətnlər yenidən
							yazılacaq.
						</div>
					)}
					<DialogFooter>
						<button
							className="btn"
							type="button"
							onClick={() => setBulkFinalReviewConfirmOpen(false)}
						>
							Ləğv et
						</button>
						<button
							className="btn primary"
							type="button"
							onClick={() => void handleBulkGenerateFinalReviews()}
							disabled={bulkFinalReviewRunning || bulkFinalReviewTargets.length === 0}
						>
							Təsdiqlə
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

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
										onClick={() => exportPKPDReport({ audience: "TEACHER" })}
									>
										Müəllim üçün PDF
									</button>
									<button
										className="btn"
										type="button"
										onClick={() => exportPKPDReport({ audience: "LEADERSHIP" })}
									>
										Rəhbərlik üçün PDF
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
											label="PKPD yekun balı"
											value={formatFinalScoreLabel(
												selectedTeacher.finalScore ?? selectedTeacher.currentEnteredScore,
												selectedTeacher.finalMaxScore,
											)}
											meta={
												selectedTeacher.isExamExempt
													? `${formatPkpdCategory(selectedTeacher)} · ${PKPD_EXAM_EXEMPT_NOTE}`
													: formatPkpdCategory(selectedTeacher)
											}
										/>
										<StatCard
											tone="neutral"
											label="Faiz"
											value={formatPercentage(selectedTeacher.finalPercentage)}
											meta="yekun maksimum bala görə"
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
											meta={
												<span className={getLeadershipVoteRoleStatus(selectedTeacher).hasPending ? "font-semibold text-red-600 dark:text-red-300" : ""}>
													{getLeadershipVoteRoleStatus(selectedTeacher).pendingText}
												</span>
											}
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

								<SectionCard
									eyebrow="Yekun sənəd"
									title="Yekun rəy və tövsiyə"
									description="Rule-based şablon nəticələrə əsasən ilkin mətn hazırlayır. Saxlamadan əvvəl mətni redaktə edə bilərsiniz."
									actions={
										<button
											className="btn primary"
											type="button"
											onClick={() => void handleGenerateFinalReview()}
										>
											{selectedTeacherFinalReview
												? "Yenidən hazırla"
												: "Yekun rəyi hazırla"}
										</button>
									}
								>
									<div className="grid gap-4">
										<label className="field">
											<span className="label">Rəy</span>
											<textarea
												className="input min-h-36"
												rows={6}
												value={finalReviewDraft}
												onChange={(event) => setFinalReviewDraft(event.target.value)}
											/>
										</label>
										<label className="field">
											<span className="label">Tövsiyə</span>
											<textarea
												className="input min-h-28"
												rows={5}
												value={finalRecommendationDraft}
												onChange={(event) =>
													setFinalRecommendationDraft(event.target.value)
												}
											/>
										</label>
										<div className="form-row">
											<button
												className="btn primary"
												type="button"
												onClick={() => void handleSaveFinalReview()}
												disabled={
													!finalReviewDraft.trim() ||
													!finalRecommendationDraft.trim()
												}
											>
												Saxla
											</button>
											{selectedTeacherFinalReview && (
												<button
													className="btn ghost"
													type="button"
													onClick={() => void handleGenerateFinalReview()}
												>
													Yenidən hazırla
												</button>
											)}
										</div>
										{selectedTeacherFinalReview && (
											<div className="hint">
												Son yenilənmə:{" "}
												{selectedTeacherFinalReview.updatedAt
													? new Date(
															String(selectedTeacherFinalReview.updatedAt),
														).toLocaleString("az-AZ")
													: "—"}
												{" · "}
												Redaktə edən:{" "}
												{selectedTeacherFinalReview.updatedBy === user?.id
													? (userDoc?.displayName ??
														userDoc?.login ??
														selectedTeacherFinalReview.updatedBy)
													: (selectedTeacherFinalReview.updatedBy ?? "—")}
											</div>
										)}
										{finalReviewStatus && (
											<div className="notice">{finalReviewStatus}</div>
										)}
									</div>
								</SectionCard>

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
										<div className="stat-meta">
											{getLeadershipVoteRoleStatus(selectedTeacher).submittedText}
										</div>
										<div className={getLeadershipVoteRoleStatus(selectedTeacher).hasPending ? "stat-meta font-semibold text-red-600 dark:text-red-300" : "stat-meta"}>
											{getLeadershipVoteRoleStatus(selectedTeacher).pendingText}
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
													{selectedTeacher.isExamExempt
														? PKPD_EXAM_EXEMPT_LABEL
														: formatScore(selectedTeacher.examScore)}
												</div>
												<div className="stat-meta">
													{selectedTeacher.isExamExempt ? PKPD_EXAM_EXEMPT_NOTE : "0-30"}
												</div>
											</div>
										</>
									)}
									{!selectedTeacher.isBiqTeacher &&
										(selectedTeacher.isExamExempt || !isMissingScore(selectedTeacher.examScore)) && (
											<div className="stat-card">
												<div className="stat-label">Attestasiya imtahanı</div>
												<div className="stat-value">
													{selectedTeacher.isExamExempt
														? PKPD_EXAM_EXEMPT_LABEL
														: formatScore(selectedTeacher.examScore)}
												</div>
												<div className="stat-meta">
													{selectedTeacher.isExamExempt
														? PKPD_EXAM_EXEMPT_NOTE
														: "Xam cəm 130 maksimumdan 100 şkalasına çevrilir"}
												</div>
											</div>
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
											{formatFinalScoreLabel(
												selectedTeacher.isComplete
													? selectedTeacher.finalScore
													: selectedTeacher.currentEnteredScore,
												selectedTeacher.finalMaxScore,
											)}
										</div>
										<div className="stat-meta">
											{selectedTeacher.isExamExempt
												? `${formatPkpdCategory(selectedTeacher)} · ${PKPD_EXAM_EXEMPT_NOTE}`
												: formatPkpdCategory(selectedTeacher)}
										</div>
									</div>
									<div className="stat-card">
										<div className="stat-label">Faiz</div>
										<div className="stat-value">
											{formatPercentage(selectedTeacher.finalPercentage)}
										</div>
										<div className="stat-meta">yekun maksimum bala görə</div>
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
										<label className="field">
											<span className="label">Attestasiya imtahanı balı</span>
											<input
												className="input"
												type="number"
												min="0"
												max="30"
												step="0.01"
												placeholder="Boş və ya 0-30"
												value={miqScoreDraft}
												onChange={(event) => setMiqScoreDraft(event.target.value)}
											/>
											<span className="stat-meta">
												Optionaldır: boş saxlanılsa hesaba daxil edilməyəcək.
											</span>
										</label>
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
											disabled={selectedTeacherOpenReviewLocked}
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
