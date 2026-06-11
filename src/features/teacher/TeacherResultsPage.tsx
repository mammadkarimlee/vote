import { useEffect, useMemo, useState } from "react";
import {
	EmptyState,
	PageHeader,
	ScoreBreakdownTable,
	SectionCard,
	StatCard,
	StatusBadge,
	type ScoreBreakdownRow,
} from "../../components/dashboard";
import {
	PKPD_EXAM_EXEMPT_NOTE,
	pkpdBucket,
	pkpdDecision,
} from "../../lib/pkpdScoring";
import {
	buildPkpdReportHtml,
	getPkpdReportComparableScore,
	getPkpdReportScoreRows,
	openPkpdReportPrintWindow,
} from "../../lib/pkpdReportHtml";
import { supabase } from "../../lib/supabase";
import {
	mapPkpdFinalReviewRow,
	mapPkpdTeacherSummaryRow,
} from "../../lib/supabaseMappers";
import type {
	PkpdFinalReviewDoc,
	PkpdTeacherSummaryDoc,
} from "../../lib/types";

type TeacherResultRpcRow = {
	visibility_enabled?: boolean;
	disabled_reason?: string | null;
	cycle_id?: string | null;
	cycle_year?: number | null;
	summary?: Record<string, unknown> | null;
	final_review?: Record<string, unknown> | null;
	subjects?: unknown;
};

type TeacherResultState =
	| { status: "loading" }
	| { status: "disabled"; message: string }
	| { status: "empty"; message: string }
	| { status: "error"; message: string }
	| {
			status: "ready";
			cycleYear: number | null;
			summary: PkpdTeacherSummaryDoc;
			finalReview: PkpdFinalReviewDoc | null;
			subjectNames: string[];
	  };

const formatScore = (value: number | null | undefined) =>
	value === null || value === undefined || Number.isNaN(value)
		? "—"
		: value.toFixed(2);

const formatPercent = (value: number | null | undefined) =>
	value === null || value === undefined || Number.isNaN(value)
		? "—"
		: `${value.toFixed(2)}%`;

const evaluationTypeLabel = (summary: PkpdTeacherSummaryDoc) =>
	summary.isBiqTeacher
		? "BİQ/KİQ nəticəsi olan müəllim"
		: "BİQ/KİQ nəticəsi olmayan müəllim";

const getStatusBadge = (summary: PkpdTeacherSummaryDoc) => {
	if (!summary.isComplete) {
		return { label: "Hesablama tamamlanmayıb", tone: "warning" as const };
	}
	const comparableScore = getPkpdReportComparableScore(summary);
	if ((comparableScore ?? 0) < 60) {
		return { label: "Risk qrupu", tone: "danger" as const };
	}
	return { label: "Tamamlanıb", tone: "success" as const };
};

const normalizeSubjects = (value: unknown) =>
	Array.isArray(value)
		? value
				.map((item) => (typeof item === "string" ? item.trim() : ""))
				.filter(Boolean)
		: [];

const buildScoreRows = (summary: PkpdTeacherSummaryDoc): ScoreBreakdownRow[] =>
	getPkpdReportScoreRows(summary).map((row) => ({
		key: row.key,
		label: row.label,
		value:
			typeof row.value === "string"
				? row.value
				: row.value === null || row.value === undefined || Number.isNaN(row.value)
					? "Daxil edilməyib"
					: row.value.toFixed(2),
		max: row.max,
		meta:
			row.key === "examScore" && summary.isExamExempt
				? PKPD_EXAM_EXEMPT_NOTE
				: undefined,
		tone:
			row.value === null || row.value === undefined || Number.isNaN(row.value)
				? summary.isExamExempt && row.key === "examScore"
					? "success"
					: "warning"
				: "success",
	}));

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
					message: "Sizin üçün PKPD nəticəsi tapılmadı",
				});
				return;
			}

			setState({
				status: "ready",
				cycleYear: row.cycle_year ?? null,
				summary: mapPkpdTeacherSummaryRow(row.summary),
				finalReview: row.final_review
					? mapPkpdFinalReviewRow(row.final_review)
					: null,
				subjectNames: normalizeSubjects(row.subjects),
			});
		};

		void loadResult();
		return () => {
			cancelled = true;
		};
	}, []);

	const readyState = state.status === "ready" ? state : null;
	const scoreRows = useMemo(
		() => (readyState ? buildScoreRows(readyState.summary) : []),
		[readyState],
	);
	const missingRows = useMemo(
		() =>
			scoreRows
				.filter((row) => row.tone === "warning")
				.map((row) => (typeof row.label === "string" ? row.label : row.key)),
		[scoreRows],
	);

	const handleDownload = () => {
		if (!readyState) return;
		openPkpdReportPrintWindow(
			buildPkpdReportHtml({
				summary: readyState.summary,
				finalReview: readyState.finalReview,
				subjectNames: readyState.subjectNames,
				titleSuffix: readyState.cycleYear
					? `${readyState.summary.isComplete ? "PKPD Yekun Nəticə Hesabatı" : "PKPD Cari Qiymətləndirmə Hesabatı"} — ${readyState.cycleYear}`
					: readyState.summary.isComplete
						? "PKPD Yekun Nəticə Hesabatı"
						: "PKPD Cari Qiymətləndirmə Hesabatı",
			}),
		);
	};

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

	const comparableScore = getPkpdReportComparableScore(state.summary);
	const statusInfo = getStatusBadge(state.summary);
	const subjectText =
		state.subjectNames.length > 0 ? state.subjectNames.join(", ") : "—";

	return (
		<div className="panel">
			<PageHeader
				eyebrow="Müəllim paneli"
				title="Nəticələrim"
				description="PKPD cari və yekun nəticə məlumatlarınız."
				meta={
					<>
						{state.cycleYear && (
							<StatusBadge tone="info">Dövr: {state.cycleYear}</StatusBadge>
						)}
						<StatusBadge tone={statusInfo.tone}>{statusInfo.label}</StatusBadge>
						<StatusBadge tone="neutral">
							{evaluationTypeLabel(state.summary)}
						</StatusBadge>
					</>
				}
				actions={
					<button className="btn primary" type="button" onClick={handleDownload}>
						PDF yüklə
					</button>
				}
			/>

			<SectionCard title="Müəllim məlumatları">
				<div className="grid two">
					<StatCard label="Müəllim" value={state.summary.name} />
					<StatCard label="Kampus" value={state.summary.branchName ?? "—"} />
					<StatCard label="Kafedra" value={state.summary.departmentName ?? "—"} />
					<StatCard label="Fənn / ixtisas" value={subjectText} />
				</div>
			</SectionCard>

			<SectionCard title="Yekun nəticə">
				<div className="grid three">
					<StatCard
						tone="info"
						label={state.summary.isComplete ? "Yekun bal" : "Cari bal"}
						value={state.summary.finalScoreLabel}
						meta={
							state.summary.isExamExempt
								? "Yekun nəticə 70 bal üzərindən hesablanıb"
								: undefined
						}
					/>
					<StatCard
						tone="accent"
						label="Faiz"
						value={formatPercent(state.summary.finalPercentage)}
					/>
					<StatCard
						tone="neutral"
						label="Qərar"
						value={
							comparableScore === null
								? "Qərar verilməyib"
								: pkpdDecision(comparableScore)
						}
						meta={
							comparableScore === null
								? undefined
								: pkpdBucket(comparableScore)
						}
					/>
				</div>
			</SectionCard>

			<SectionCard title="Bal bölgüsü">
				<ScoreBreakdownTable rows={scoreRows} />
			</SectionCard>

			{missingRows.length > 0 && (
				<SectionCard title="Çatışmayan sahələr">
					<div className="notice warning">
						<ul className="mt-2 list-disc pl-5">
							{missingRows.map((item) => (
								<li key={item}>{item}</li>
							))}
						</ul>
					</div>
				</SectionCard>
			)}

			<SectionCard title="Yekun rəy və tövsiyə">
				<div className="grid gap-4">
					<div>
						<div className="label">Rəy</div>
						<p className="mt-1 text-sm">
							{state.finalReview?.reviewText?.trim() ||
								"Yekun rəy hələ hazırlanmayıb"}
						</p>
					</div>
					<div>
						<div className="label">Tövsiyə</div>
						<p className="mt-1 text-sm">
							{state.finalReview?.recommendationText?.trim() ||
								"Yekun tövsiyə hələ hazırlanmayıb"}
						</p>
					</div>
				</div>
			</SectionCard>

			<SectionCard title="Əlavə göstəricilər">
				<div className="grid three">
					<StatCard
						label="Əlavə bal"
						value={formatScore(state.summary.bonusScore)}
					/>
					<StatCard
						label="Stimullaşdırıcı yekun"
						value={formatScore(state.summary.finalScoreWithExtra)}
					/>
					<StatCard
						label="Şagird cavab sayı"
						value={state.summary.studentCount}
					/>
				</div>
			</SectionCard>
		</div>
	);
};
