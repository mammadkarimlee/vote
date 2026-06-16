import { useEffect, useState } from "react";
import {
	EmptyState,
	PageHeader,
	SectionCard,
	StatCard,
	StatusBadge,
} from "../../components/dashboard";
import { supabase } from "../../lib/supabase";

type TeacherResultSummary = Record<string, unknown> & {
	finalScore?: number | null;
	final_score?: number | null;
	finalScoreWithExtra?: number | null;
	final_score_with_extra?: number | null;
	finalMaxScore?: number | null;
	final_max_score?: number | null;
	finalPercentage?: number | null;
	final_percentage?: number | null;
	status?: "completed" | "calculating" | "incomplete" | string | null;
	academicYear?: number | null;
	academic_year?: number | null;
	is_complete?: boolean | null;
	isBiqTeacher?: boolean | null;
	is_biq_teacher?: boolean | null;
	isExamExempt?: boolean | null;
	is_exam_exempt?: boolean | null;
};

type PortfolioDetails = Record<string, unknown> & {
	educationScore?: number | null;
	education_score?: number | null;
	attendanceScore?: number | null;
	attendance_score?: number | null;
	trainingScore?: number | null;
	training_score?: number | null;
	olympiadScore?: number | null;
	olympiad_score?: number | null;
	eventsScore?: number | null;
	events_score?: number | null;
	note?: string | null;
};

type StudentClassScore = {
	groupId?: string | null;
	group_id?: string | null;
	groupName?: string | null;
	group_name?: string | null;
	avg?: number | string | null;
	submissionCount?: number | string | null;
	submission_count?: number | string | null;
};

type TeacherResultFeedback = {
	reviewText?: string | null;
	review_text?: string | null;
	recommendationText?: string | null;
	recommendation_text?: string | null;
};

type TeacherResultRpcRow = {
	visibility_enabled?: boolean;
	disabled_reason?: string | null;
	cycle_id?: string | null;
	cycle_year?: number | null;
	summary?: TeacherResultSummary | null;
	final_review?: TeacherResultFeedback | null;
	subjects?: unknown;
};

type ReadyState = {
	status: "ready";
	academicYear: number | null;
	finalScore: number | null;
	baseScore: number | null;
	finalScoreWithExtra: number | null;
	finalMaxScore: number | null;
	finalPercentage: number | null;
	bonusScore: number;
	currentEnteredScore: number | null;
	isBiqTeacher: boolean | null;
	isExamExempt: boolean | null;
	resultStatus: string;
	summary: TeacherResultSummary;
	feedback: TeacherResultFeedback | null;
	subjects: string[];
	studentClassScores: StudentClassScore[];
	portfolioDetails: PortfolioDetails | null;
};

type TeacherResultState =
	| { status: "loading" }
	| { status: "disabled"; message: string }
	| { status: "empty"; message: string }
	| { status: "error"; message: string }
	| ReadyState;

const formatScore = (value: number | null) =>
	value === null || Number.isNaN(value) ? "-" : value.toFixed(2);

const formatPercent = (value: number | null) =>
	value === null || Number.isNaN(value) ? "-" : `${value.toFixed(2)}%`;

const toNullableNumber = (value: unknown) => {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value.replace(",", "."));
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
};

const pickNumber = (source: Record<string, unknown>, ...keys: string[]) => {
	for (const key of keys) {
		const value = toNullableNumber(source[key]);
		if (value !== null) return value;
	}
	return null;
};

const pickString = (source: Record<string, unknown>, ...keys: string[]) => {
	for (const key of keys) {
		const value = source[key];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return "";
};

const resolveFinalScore = (summary: TeacherResultSummary) =>
	toNullableNumber(summary.finalScore) ?? toNullableNumber(summary.final_score);

const resolveFinalScoreWithExtra = (summary: TeacherResultSummary) =>
	toNullableNumber(summary.finalScoreWithExtra) ??
	toNullableNumber(summary.final_score_with_extra);

const shouldUseScoreWithExtra = (
	finalScore: number | null,
	finalScoreWithExtra: number | null,
) =>
	finalScore !== null &&
	finalScoreWithExtra !== null &&
	finalScoreWithExtra > finalScore;

const resolveFinalMaxScore = (summary: TeacherResultSummary) =>
	toNullableNumber(summary.finalMaxScore) ??
	toNullableNumber(summary.final_max_score) ??
	(summary.isExamExempt === true || summary.is_exam_exempt === true ? 70 : 100);

const resolveFinalPercentage = (
	summary: TeacherResultSummary,
	finalScore: number | null,
	finalMaxScore: number | null,
) => {
	if (finalScore !== null && finalMaxScore !== null && finalMaxScore > 0) {
		return (finalScore / finalMaxScore) * 100;
	}
	return (
		toNullableNumber(summary.finalPercentage) ??
		toNullableNumber(summary.final_percentage) ??
		null
	);
};

const resolveSubjects = (value: unknown) =>
	Array.isArray(value)
		? value
				.map((item) => (typeof item === "string" ? item.trim() : ""))
				.filter(Boolean)
		: [];

const resolveStudentClassScores = (summary: TeacherResultSummary) => {
	const value = summary.studentClassScores ?? summary.student_class_scores;
	if (!Array.isArray(value)) return [];
	return value.filter(
		(item): item is StudentClassScore =>
			item !== null && typeof item === "object",
	);
};

const resolvePortfolioDetails = (summary: TeacherResultSummary) => {
	const value = summary.portfolioDetails ?? summary.portfolio_details;
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as PortfolioDetails;
};

const formatScoreWithMax = (
	value: number | null,
	maxScore: number | null,
) =>
	maxScore === null
		? `${formatScore(value)} bal`
		: `${formatScore(value)} / ${formatScore(maxScore)} bal`;

const formatOptionalScoreWithMax = (
	value: number | null,
	maxScore: number,
) =>
	value === null ? "-" : `${formatScore(value)} / ${maxScore}`;

const formatCount = (value: number | null) =>
	value === null ? "-" : String(Math.round(value));

const getPortfolioMaxes = (isBiqTeacher: boolean | null) =>
	isBiqTeacher === false
		? { education: 3, attendance: 3, training: 9, olympiad: 20, events: 25 }
		: { education: 3, attendance: 3, training: 4, olympiad: 4, events: 6 };

type ScoreRow = {
	key: string;
	label: string;
	value: number | string | null;
	max: number;
	meta?: string;
};

const getScoreRows = (state: ReadyState) => {
	const { summary } = state;
	const isBiqTeacher = state.isBiqTeacher !== false;
	const rows: ScoreRow[] = [
		{
			key: "student",
			label: "Şagird sorğusu",
			value: pickNumber(summary, "studentWeightedScore", "student_weighted_score"),
			max: isBiqTeacher ? 15 : 20,
			meta: `Orta: ${formatScore(pickNumber(summary, "studentAvg", "student_avg"))} · cavab: ${formatCount(
				pickNumber(summary, "studentCount", "student_count"),
			)}`,
		},
		{
			key: "self",
			label: "Özünüqiymətləndirmə",
			value:
				pickNumber(summary, "selfWeightedScore", "self_weighted_score") ??
				pickNumber(summary, "selfDeclaredScore", "self_declared_score", "selfAvg", "self_avg"),
			max: 10,
			meta: `Cavab: ${formatCount(pickNumber(summary, "selfCount", "self_count"))}`,
		},
		{
			key: "leadership",
			label: "Rəhbərlik qiymətləndirməsi",
			value:
				pickNumber(summary, "managementWeightedScore", "management_weighted_score") ??
				pickNumber(summary, "managementAvg", "management_avg"),
			max: 10,
			meta: `${formatCount(
				pickNumber(summary, "leadershipSubmittedCount", "leadership_submitted_count", "managementCount", "management_count"),
			)} / ${formatCount(
				pickNumber(summary, "leadershipEligibleCount", "leadership_eligible_count"),
			)} səs`,
		},
	];

	if (isBiqTeacher) {
		rows.push({
			key: "biq",
			label: "BİQ/KİQ nəticəsi",
			value: pickNumber(summary, "biqWeightedScore", "biq_weighted_score"),
			max: 15,
			meta: `Orta: ${formatScore(pickNumber(summary, "biqAvg", "biq_avg"))} · ${
				pickString(summary, "biqAverageSource", "biq_average_source") || "mənbə yoxdur"
			}`,
		});
	}

	if (
		isBiqTeacher ||
		state.isExamExempt ||
		pickNumber(summary, "examScore", "exam_score") !== null
	) {
		rows.push({
			key: "exam",
			label: "Attestasiya imtahanı",
			value: state.isExamExempt
				? "İmtahandan azad"
				: pickNumber(summary, "examScore", "exam_score"),
			max: 30,
			meta: state.isExamExempt
				? "Yekun nəticə 70 bal üzərindən hesablanıb"
				: "0-30",
		});
	}

	rows.push({
		key: "portfolio",
		label: "Portfolio",
		value: pickNumber(summary, "portfolioScore", "portfolio_score"),
		max: isBiqTeacher ? 20 : 60,
		meta: isBiqTeacher ? "0-20" : "0-60",
	});

	return rows;
};

const getClassScoreLabel = (item: StudentClassScore) =>
	item.groupName ?? item.group_name ?? item.groupId ?? item.group_id ?? "Sinif";

const getClassScoreAvg = (item: StudentClassScore) =>
	toNullableNumber(item.avg);

const getClassSubmissionCount = (item: StudentClassScore) =>
	toNullableNumber(item.submissionCount ?? item.submission_count);

const resolveBoolean = (
	camelValue: boolean | null | undefined,
	snakeValue: boolean | null | undefined,
) => (typeof camelValue === "boolean" ? camelValue : snakeValue ?? null);

const resolveResultStatus = (
	summary: TeacherResultSummary,
	finalScore: number | null,
) => {
	if (finalScore !== null) return "completed";
	return summary.status ?? (summary.is_complete ? "incomplete" : "calculating");
};

const getCalculationBasisText = (state: ReadyState) => {
	const basisParts = [
		state.isExamExempt ? "imtahandan azad olunmuş" : null,
		state.isBiqTeacher === false
			? "BİQ/KİQ nəticələri nəzərə alınmayan"
			: state.isBiqTeacher === true
				? "BİQ/KİQ nəticələri nəzərə alınan"
				: null,
	].filter(Boolean);

	const teacherType =
		basisParts.length > 0
			? `${basisParts.join(", ")} müəllim`
			: "müvafiq qiymətləndirmə qrupu üzrə müəllim";

	if (state.finalMaxScore === null) {
		return `Siz ${teacherType} kimi qiymətləndirilmisiniz. Yekun nəticə faizi mövcud maksimum bala əsasən hesablanır.`;
	}

	if (state.finalScore === null || state.finalPercentage === null) {
		return `Siz ${teacherType} kimi ${formatScore(
			state.finalMaxScore,
		)} bal üzərindən qiymətləndirilirsiniz. Yekun nəticə tamamlandıqdan sonra faiz göstəricisi formalaşacaq.`;
	}

	return `Siz ${teacherType} kimi ${formatScore(
		state.finalMaxScore,
	)} bal üzərindən qiymətləndirilmisiniz. Yekun nəticəniz ${formatScore(
		state.finalScore,
	)} / ${formatScore(state.finalMaxScore)} baldır və bu ${formatPercent(
		state.finalPercentage,
	)} təşkil edir.`;
};

const getResultMessage = (state: ReadyState) => {
	if (state.resultStatus !== "completed" || state.finalScore === null) {
		return "Yekun nəticəniz hazırda hesablanma mərhələsindədir.";
	}

	const yearText = state.academicYear
		? `${state.academicYear}-cı tədris ili üzrə`
		: "Cari tədris ili üzrə";

	const scoreText =
		state.finalMaxScore === null
			? `${formatScore(state.finalScore)} bal`
			: `${formatScore(state.finalScore)} / ${formatScore(
					state.finalMaxScore,
				)} bal`;

	return `${yearText} Pedaqoji Kadrların Performans Dəyərləndirilməsi nəticəsinə əsasən yekun nəticəniz ${scoreText}, yəni ${formatPercent(
		state.finalPercentage,
	)} olaraq müəyyən edilmişdir.`;
};

const getFeedbackText = (
	feedback: TeacherResultFeedback | null,
	field: "review" | "recommendation",
) => {
	if (!feedback) return "";
	return field === "review"
		? (feedback.reviewText ?? feedback.review_text ?? "").trim()
		: (feedback.recommendationText ?? feedback.recommendation_text ?? "").trim();
};

export const TeacherResultsPage = () => {
	const [state, setState] = useState<TeacherResultState>({ status: "loading" });

	useEffect(() => {
		let cancelled = false;

		const loadResult = async () => {
			setState({ status: "loading" });
			const { data, error } = await supabase.rpc("get_my_latest_pkpd_result");
			if (cancelled) return;
			if (error) {
				setState({
					status: "error",
					message: `Nəticə yüklənmədi: ${error.message}`,
				});
				return;
			}

			const row = (
				Array.isArray(data) ? data[0] : data
			) as TeacherResultRpcRow | null;
			if (!row || row.visibility_enabled !== true) {
				setState({
					status: "disabled",
					message:
						row?.disabled_reason ??
						"PKPD nəticələrinin müəllimlər üçün görünməsi hazırda bağlıdır.",
				});
				return;
			}
			if (!row.summary) {
				setState({
					status: "empty",
					message: "Yekun nəticəniz hazırda hesablanma mərhələsindədir.",
				});
				return;
			}

			const baseFinalScore = resolveFinalScore(row.summary);
			const finalScoreWithExtra = resolveFinalScoreWithExtra(row.summary);
			const usesScoreWithExtra = shouldUseScoreWithExtra(
				baseFinalScore,
				finalScoreWithExtra,
			);
			const finalScore = usesScoreWithExtra
				? finalScoreWithExtra
				: baseFinalScore;
			const finalMaxScore = resolveFinalMaxScore(row.summary);
			const finalPercentage = resolveFinalPercentage(
				row.summary,
				finalScore,
				finalMaxScore,
			);
			setState({
				status: "ready",
				academicYear:
					row.summary.academicYear ??
					row.summary.academic_year ??
					row.cycle_year ??
					null,
				finalScore,
				baseScore: pickNumber(row.summary, "baseTotalScore", "base_total_score") ?? baseFinalScore,
				finalScoreWithExtra,
				finalMaxScore,
				finalPercentage,
				bonusScore: pickNumber(row.summary, "bonusScore", "bonus_score") ?? 0,
				currentEnteredScore: pickNumber(
					row.summary,
					"currentEnteredScore",
					"current_entered_score",
				),
				isBiqTeacher: resolveBoolean(
					row.summary.isBiqTeacher,
					row.summary.is_biq_teacher,
				),
				isExamExempt: resolveBoolean(
					row.summary.isExamExempt,
					row.summary.is_exam_exempt,
				),
				resultStatus: resolveResultStatus(row.summary, finalScore),
				summary: row.summary,
				feedback: row.final_review ?? null,
				subjects: resolveSubjects(
					row.subjects ?? row.summary.subjects ?? row.summary.subject_names,
				),
				studentClassScores: resolveStudentClassScores(row.summary),
				portfolioDetails: resolvePortfolioDetails(row.summary),
			});
		};

		void loadResult();
		return () => {
			cancelled = true;
		};
	}, []);

	if (state.status === "loading") {
		return (
			<div className="panel">
				<PageHeader
					eyebrow="Müəllim paneli"
					title="Nəticələrim"
					description="PKPD yekun nəticəniz yüklənir."
				/>
				<div className="card">
					<StatusBadge tone="info">Yüklənir</StatusBadge>
				</div>
			</div>
		);
	}

	if (state.status === "disabled" || state.status === "empty") {
		return (
			<div className="panel">
				<PageHeader
					eyebrow="Müəllim paneli"
					title="Nəticələrim"
					description="PKPD nəticə bölməsi"
				/>
				<SectionCard>
					<EmptyState title={state.message} />
				</SectionCard>
			</div>
		);
	}

	if (state.status === "error") {
		return (
			<div className="panel">
				<PageHeader
					eyebrow="Müəllim paneli"
					title="Nəticələrim"
					description="PKPD nəticə bölməsi"
				/>
				<div className="notice warning">{state.message}</div>
			</div>
		);
	}

	const reviewText = getFeedbackText(state.feedback, "review");
	const recommendationText = getFeedbackText(state.feedback, "recommendation");
	const isCompleted = state.resultStatus === "completed" && state.finalScore !== null;
	const calculationBasisText = getCalculationBasisText(state);
	const scoreRows = getScoreRows(state);
	const portfolioMaxes = getPortfolioMaxes(state.isBiqTeacher);
	const hasPortfolioDetails = state.portfolioDetails
		? [
				"educationScore",
				"education_score",
				"attendanceScore",
				"attendance_score",
				"trainingScore",
				"training_score",
				"olympiadScore",
				"olympiad_score",
				"eventsScore",
				"events_score",
			].some(
				(key) =>
					state.portfolioDetails?.[key] !== null &&
					state.portfolioDetails?.[key] !== undefined,
			)
		: false;

	return (
		<div className="panel">
			<PageHeader
				eyebrow="Müəllim paneli"
				title="Nəticələrim"
				description="PKPD yekun nəticə məlumatınız."
				meta={
					<>
						{state.academicYear && (
							<StatusBadge tone="info">Dövr: {state.academicYear}</StatusBadge>
						)}
						<StatusBadge tone={isCompleted ? "success" : "warning"}>
							{isCompleted ? "Tamamlanıb" : "Hesablanır"}
						</StatusBadge>
					</>
				}
			/>

			<SectionCard title="Yekun nəticə">
				<div className="grid gap-4">
					<div className="grid two">
						<StatCard
							tone={isCompleted ? "info" : "neutral"}
							label="Yekun faiz"
							value={isCompleted ? formatPercent(state.finalPercentage) : "-"}
							meta="əsas müqayisə göstəricisi"
						/>
						<StatCard
							tone="neutral"
							label="Yekun bal"
							value={
								isCompleted
									? formatScoreWithMax(state.finalScore, state.finalMaxScore)
									: "-"
							}
						/>
						<StatCard
							tone="neutral"
							label="PKPD əsas balı"
							value={formatScoreWithMax(state.baseScore, state.finalMaxScore)}
							meta="əlavə bal daxil olmadan"
						/>
						<StatCard
							tone="neutral"
							label="Əlavə bal"
							value={formatScore(state.bonusScore)}
							meta={
								state.finalScoreWithExtra !== null
									? `Stimullaşdırıcı yekun: ${formatScore(state.finalScoreWithExtra)}`
									: "stimullaşdırıcı maddə üzrə"
							}
						/>
					</div>
					<div className="notice info">{getResultMessage(state)}</div>
				</div>
			</SectionCard>

			<SectionCard title="Bal bölgüsü">
				<div className="grid gap-4">
					<div className="grid three">
						{scoreRows.map((row) => (
							<StatCard
								key={row.key}
								tone={row.value === null ? "neutral" : "info"}
								label={row.label}
								value={
									typeof row.value === "string"
										? row.value
										: formatOptionalScoreWithMax(row.value, row.max)
								}
								meta={row.meta}
							/>
						))}
						<StatCard
							tone="neutral"
							label="Cari daxil edilmiş cəm"
							value={formatScoreWithMax(state.currentEnteredScore, state.finalMaxScore)}
							meta="mövcud komponentlər üzrə"
						/>
					</div>
				</div>
			</SectionCard>

			{hasPortfolioDetails && state.portfolioDetails && (
				<SectionCard title="Portfolio alt meyarları">
					<div className="grid three">
						<StatCard
							tone="neutral"
							label="Təhsil/kvalifikasiya"
							value={formatOptionalScoreWithMax(
								pickNumber(state.portfolioDetails, "educationScore", "education_score"),
								portfolioMaxes.education,
							)}
						/>
						<StatCard
							tone="neutral"
							label="Davamiyyət"
							value={formatOptionalScoreWithMax(
								pickNumber(state.portfolioDetails, "attendanceScore", "attendance_score"),
								portfolioMaxes.attendance,
							)}
						/>
						<StatCard
							tone="neutral"
							label="Sertifikat/təlim/məqalə"
							value={formatOptionalScoreWithMax(
								pickNumber(state.portfolioDetails, "trainingScore", "training_score"),
								portfolioMaxes.training,
							)}
						/>
						<StatCard
							tone="neutral"
							label={
								state.isBiqTeacher === false
									? "Müsabiqə/festival/yarış"
									: "Olimpiada/müsabiqə"
							}
							value={formatOptionalScoreWithMax(
								pickNumber(state.portfolioDetails, "olympiadScore", "olympiad_score"),
								portfolioMaxes.olympiad,
							)}
						/>
						<StatCard
							tone="neutral"
							label="Layihə/tədbir/təltif"
							value={formatOptionalScoreWithMax(
								pickNumber(state.portfolioDetails, "eventsScore", "events_score"),
								portfolioMaxes.events,
							)}
						/>
					</div>
					{typeof state.portfolioDetails.note === "string" &&
						state.portfolioDetails.note.trim() && (
							<div className="notice info mt-4">{state.portfolioDetails.note}</div>
						)}
				</SectionCard>
			)}

			{state.studentClassScores.length > 0 && (
				<SectionCard title="Siniflər üzrə şagird nəticələri">
					<div className="grid three">
						{state.studentClassScores.map((item, index) => (
							<StatCard
								key={`${getClassScoreLabel(item)}-${index}`}
								tone="neutral"
								label={getClassScoreLabel(item)}
								value={formatScore(getClassScoreAvg(item))}
								meta={`Cavab sayı: ${formatCount(getClassSubmissionCount(item))}`}
							/>
						))}
					</div>
				</SectionCard>
			)}

			{state.subjects.length > 0 && (
				<SectionCard title="Fənlər">
					<div className="flex flex-wrap gap-2">
						{state.subjects.map((subject) => (
							<span className="tag" key={subject}>
								{subject}
							</span>
						))}
					</div>
				</SectionCard>
			)}

			<SectionCard title="Yekun rəy və tövsiyə">
				<div className="grid gap-4">
					<div className="notice info">{calculationBasisText}</div>
					<div>
						<div className="label">Rəy</div>
						<p className="mt-1 text-sm">
							{reviewText || "Yekun rəy hələ hazırlanmayıb"}
						</p>
					</div>
					<div>
						<div className="label">Tövsiyə</div>
						<p className="mt-1 text-sm">
							{recommendationText || "Yekun tövsiyə hələ hazırlanmayıb"}
						</p>
					</div>
				</div>
			</SectionCard>
		</div>
	);
};
