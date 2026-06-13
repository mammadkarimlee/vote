import { useEffect, useState } from "react";
import {
	EmptyState,
	PageHeader,
	SectionCard,
	StatCard,
	StatusBadge,
} from "../../components/dashboard";
import { supabase } from "../../lib/supabase";

type TeacherResultSummary = {
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
};

type ReadyState = {
	status: "ready";
	academicYear: number | null;
	finalScore: number | null;
	finalMaxScore: number | null;
	finalPercentage: number | null;
	isBiqTeacher: boolean | null;
	isExamExempt: boolean | null;
	resultStatus: string;
	feedback: TeacherResultFeedback | null;
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

const resolveFinalMaxScore = (
	summary: TeacherResultSummary,
	usesScoreWithExtra: boolean,
) => {
	const baseMaxScore =
		toNullableNumber(summary.finalMaxScore) ??
		toNullableNumber(summary.final_max_score) ??
		(summary.isExamExempt === true || summary.is_exam_exempt === true ? 70 : 100);

	return usesScoreWithExtra ? baseMaxScore + 10 : baseMaxScore;
};

const resolveFinalPercentage = (
	summary: TeacherResultSummary,
	finalScore: number | null,
	finalMaxScore: number | null,
) =>
	toNullableNumber(summary.finalPercentage) ??
	toNullableNumber(summary.final_percentage) ??
	(finalScore !== null && finalMaxScore !== null && finalMaxScore > 0
		? (finalScore / finalMaxScore) * 100
		: null);

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
			const finalMaxScore = resolveFinalMaxScore(
				row.summary,
				usesScoreWithExtra,
			);
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
				finalMaxScore,
				finalPercentage,
				isBiqTeacher: resolveBoolean(
					row.summary.isBiqTeacher,
					row.summary.is_biq_teacher,
				),
				isExamExempt: resolveBoolean(
					row.summary.isExamExempt,
					row.summary.is_exam_exempt,
				),
				resultStatus: resolveResultStatus(row.summary, finalScore),
				feedback: row.final_review ?? null,
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
									? state.finalMaxScore === null
										? `${formatScore(state.finalScore)} bal`
										: `${formatScore(state.finalScore)} / ${formatScore(
												state.finalMaxScore,
											)} bal`
									: "-"
							}
						/>
					</div>
					<div className="notice info">{getResultMessage(state)}</div>
				</div>
			</SectionCard>

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
