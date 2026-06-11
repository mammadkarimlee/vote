import {
	PKPD_EXAM_EXEMPT_LABEL,
	PKPD_EXAM_EXEMPT_NOTE,
	pkpdBucket,
	pkpdDecision,
} from "./pkpdScoring";
import type { PkpdFinalReviewDoc, PkpdTeacherSummaryDoc } from "./types";

type PkpdReportScoreRow = {
	key: string;
	label: string;
	value: number | string | null | undefined;
	max: number;
};

type PkpdReportHtmlOptions = {
	summary: PkpdTeacherSummaryDoc;
	finalReview?: PkpdFinalReviewDoc | null;
	subjectNames?: string[];
	generatedAt?: Date;
	titleSuffix?: string;
};

const escapeHtml = (value: string) =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");

const isMissingScore = (value: unknown) =>
	value === null ||
	value === undefined ||
	(typeof value === "number" && Number.isNaN(value));

const formatScore = (value: number | null | undefined) =>
	isMissingScore(value) ? "Daxil edilməyib" : Number(value).toFixed(2);

const formatPercent = (value: number | null | undefined) =>
	isMissingScore(value) ? "Daxil edilməyib" : `${Number(value).toFixed(2)}%`;

const scoreText = (value: number | string | null | undefined) =>
	typeof value === "string" ? value : formatScore(value);

const scoreWithMax = (value: number | null | undefined, max: number) =>
	`${formatScore(value)} / ${max}`;

const replaceControlCharacters = (value: string) =>
	Array.from(value)
		.map((char) => (char.charCodeAt(0) < 32 ? " " : char))
		.join("");

export const getPkpdReportComparableScore = (summary: PkpdTeacherSummaryDoc) =>
	summary.finalPercentage ?? summary.finalScore ?? summary.baseTotalScore;

export const sanitizePkpdReportFileName = (value: string) =>
	replaceControlCharacters(value)
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[<>:"/\\|?*]/g, " ")
		.replace(/\s+/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 140) || "pkpd-report";

export const buildPkpdReportFileName = (
	summary: PkpdTeacherSummaryDoc,
	extension = "html",
) =>
	`${sanitizePkpdReportFileName(
		[
			summary.branchName ?? "Campus",
			summary.departmentName ?? "Kafedra",
			summary.name,
			"PKPD",
		].join("_"),
	)}.${extension}`;

export const getPkpdReportScoreRows = (
	summary: PkpdTeacherSummaryDoc,
): PkpdReportScoreRow[] => {
	const examValue = summary.isExamExempt
		? PKPD_EXAM_EXEMPT_LABEL
		: summary.examScore;
	const rows = summary.isBiqTeacher
		? [
				{
					key: "subjectMasteryScore",
					label: "Balabilgənin fənni mənimsəməsi",
					value: summary.biqWeightedScore,
					max: 15,
				},
				{
					key: "studentSurveyScore",
					label: "Balabilgə sorğusu",
					value: summary.studentWeightedScore,
					max: 15,
				},
				{
					key: "selfEvaluationScore",
					label: "Özünü qiymətləndirmə",
					value: summary.selfWeightedScore,
					max: 10,
				},
				{
					key: "leadershipEvaluationScore",
					label: "Rəhbərlik qiymətləndirməsi",
					value: summary.managementWeightedScore,
					max: 10,
				},
				{
					key: "examScore",
					label: "Attestasiya imtahanı",
					value: examValue,
					max: 30,
				},
				{
					key: "portfolioScore",
					label: "Portfolio",
					value: summary.portfolioScore,
					max: 20,
				},
			]
		: [
				{
					key: "studentSurveyScore",
					label: "Balabilgə sorğusu",
					value: summary.studentWeightedScore,
					max: 20,
				},
				{
					key: "selfEvaluationScore",
					label: "Özünü qiymətləndirmə",
					value: summary.selfWeightedScore,
					max: 10,
				},
				{
					key: "leadershipEvaluationScore",
					label: "Rəhbərlik qiymətləndirməsi",
					value: summary.managementWeightedScore,
					max: 10,
				},
				{
					key: "portfolioScore",
					label: "Portfolio",
					value: summary.portfolioScore,
					max: 60,
				},
			];

	if (
		!summary.isBiqTeacher &&
		(summary.isExamExempt || !isMissingScore(summary.examScore))
	) {
		rows.splice(rows.length - 1, 0, {
			key: "examScore",
			label: "Attestasiya imtahanı",
			value: examValue,
			max: 30,
		});
	}

	return rows;
};

export const openPkpdReportPrintWindow = (html: string) => {
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

export const buildPkpdReportHtml = ({
	summary,
	finalReview,
	subjectNames = [],
	generatedAt = new Date(),
	titleSuffix,
}: PkpdReportHtmlOptions) => {
	const yearText = titleSuffix ?? "PKPD Yekun Nəticə Hesabatı";
	const modelLabel = summary.isBiqTeacher
		? "BİQ/KİQ nəticəsi olan müəllim"
		: "BİQ/KİQ nəticəsi olmayan müəllim";
	const scoreRows = getPkpdReportScoreRows(summary);
	const finalScore = summary.finalScore ?? summary.baseTotalScore;
	const comparableScore = getPkpdReportComparableScore(summary);
	const categoryText =
		comparableScore === null ? "Hesablama tamamlanmayıb" : pkpdBucket(comparableScore);
	const decisionText =
		comparableScore === null ? "Qərar verilməyib" : pkpdDecision(comparableScore);
	const reportStatus = summary.isComplete
		? "Yekun qiymətləndirmə tamamlanıb"
		: "Hesablama tamamlanmayıb";
	const scoreLabel = summary.isComplete
		? "PKPD yekun balı"
		: "Daxil edilmiş cari bal";
	const generatedDate = generatedAt.toLocaleDateString("az-AZ", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	});
	const generatedTime = generatedAt.toLocaleTimeString("az-AZ", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
	const subjectText = subjectNames.length > 0 ? subjectNames.join(", ") : "—";
	const maxScoreNote = summary.isExamExempt
		? `<p class="note">Qeyd: ${escapeHtml(PKPD_EXAM_EXEMPT_NOTE)} Faiz: ${escapeHtml(
				formatPercent(summary.finalPercentage),
			)}</p>`
		: "";
	const breakdownHtml = [
		...scoreRows.map(
			(row) =>
				`<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(
					scoreText(row.value),
				)}</td><td>${row.max}</td></tr>`,
		),
		`<tr class="total-row"><td>${escapeHtml(scoreLabel)}</td><td>${escapeHtml(
			scoreWithMax(finalScore, summary.finalMaxScore),
		)}</td><td>${summary.finalMaxScore}</td></tr>`,
	].join("");
	const missingLabels = scoreRows
		.filter((row) => isMissingScore(row.value))
		.map((row) => row.label);
	const missingHtml =
		missingLabels.length > 0
			? `<section><h2>Çatışmayan sahələr</h2><ul class="missing-list">${missingLabels
					.map((item) => `<li>${escapeHtml(item)}</li>`)
					.join("")}</ul></section>`
			: "";
	const finalReviewText =
		finalReview?.reviewText?.trim() || "Yekun rəy hələ hazırlanmayıb.";
	const finalRecommendationText =
		finalReview?.recommendationText?.trim() ||
		"Yekun tövsiyə hələ hazırlanmayıb.";

	return `<!doctype html>
<html lang="az">
<head>
	<meta charset="utf-8" />
	<title>${escapeHtml(summary.name)} - ${escapeHtml(yearText)}</title>
	<style>
		@page { size: A4; margin: 15mm; }
		body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; font-size: 12px; line-height: 1.45; }
		header { border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 14px; }
		.org { font-size: 13px; font-weight: 700; text-transform: uppercase; }
		h1 { font-size: 18px; margin: 4px 0; }
		h2 { font-size: 14px; margin: 0 0 8px; border-bottom: 1px solid #d1d5db; padding-bottom: 4px; }
		h3 { font-size: 13px; margin: 10px 0 4px; }
		.subtitle { font-size: 15px; font-weight: 700; }
		section { margin-top: 14px; break-inside: avoid; }
		.info-grid, .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; }
		.info-item, .summary-item { border: 1px solid #d1d5db; padding: 7px 8px; min-height: 28px; }
		.info-item span, .summary-item span { display: block; color: #4b5563; font-size: 11px; }
		.info-item strong, .summary-item strong { font-size: 13px; }
		.note { grid-column: 1 / -1; margin: 2px 0 0; padding: 8px; border-left: 3px solid #92400e; background: #fffbeb; }
		table { width: 100%; border-collapse: collapse; margin-top: 6px; break-inside: avoid; }
		th, td { border: 1px solid #d1d5db; padding: 7px 8px; text-align: left; vertical-align: top; }
		th { background: #f3f4f6; font-weight: 700; }
		.total-row td { font-weight: 700; background: #f9fafb; }
		.missing-list { margin: 6px 0 0; padding-left: 18px; }
		.signatures { margin-top: 20px; break-inside: avoid; }
		.signature-line { display: grid; grid-template-columns: 190px 1fr; gap: 12px; align-items: end; margin-top: 14px; }
		.signature-line span { display: block; min-height: 20px; border-bottom: 1px solid #111827; }
		.generated { margin-top: 18px; color: #4b5563; font-size: 11px; }
	</style>
</head>
<body>
	<header>
		<div class="org">Hədəf STEAM Liseyi MMC</div>
		<h1>Pedaqoji Kadrların Performans Dəyərləndirilməsi</h1>
		<div class="subtitle">${escapeHtml(yearText)}</div>
	</header>
	<section>
		<h2>Müəllim məlumatları</h2>
		<div class="info-grid">
			<div class="info-item"><span>Müəllim</span><strong>${escapeHtml(summary.name)}</strong></div>
			<div class="info-item"><span>Kampus</span><strong>${escapeHtml(summary.branchName ?? "—")}</strong></div>
			<div class="info-item"><span>Kafedra</span><strong>${escapeHtml(summary.departmentName ?? "—")}</strong></div>
			<div class="info-item"><span>Fənn / ixtisas</span><strong>${escapeHtml(subjectText)}</strong></div>
			<div class="info-item"><span>Qiymətləndirmə modeli</span><strong>${escapeHtml(modelLabel)}</strong></div>
			<div class="info-item"><span>Hesabat statusu</span><strong>${escapeHtml(reportStatus)}</strong></div>
		</div>
	</section>
	<section>
		<h2>Xülasə</h2>
		<div class="summary-grid">
			<div class="summary-item"><span>${escapeHtml(scoreLabel)}</span><strong>${escapeHtml(
				scoreWithMax(finalScore, summary.finalMaxScore),
			)}</strong></div>
			<div class="summary-item"><span>Faiz</span><strong>${escapeHtml(formatPercent(summary.finalPercentage))}</strong></div>
			<div class="summary-item"><span>Əlavə bal</span><strong>${escapeHtml(formatScore(summary.bonusScore))}</strong></div>
			<div class="summary-item"><span>Stimullaşdırıcı yekun</span><strong>${escapeHtml(formatScore(summary.finalScoreWithExtra))}</strong></div>
			<div class="summary-item"><span>Kateqoriya</span><strong>${escapeHtml(categoryText)}</strong></div>
			<div class="summary-item"><span>Qərar</span><strong>${escapeHtml(decisionText)}</strong></div>
			${maxScoreNote}
		</div>
	</section>
	<section>
		<h2>Bal bölgüsü</h2>
		<table>
			<thead><tr><th>Meyar</th><th>Bal</th><th>Maksimum</th></tr></thead>
			<tbody>${breakdownHtml}</tbody>
		</table>
	</section>
	${missingHtml}
	<section>
		<h2>Yekun rəy və tövsiyə</h2>
		<h3>Rəy</h3>
		<p>${escapeHtml(finalReviewText)}</p>
		<h3>Tövsiyə</h3>
		<p>${escapeHtml(finalRecommendationText)}</p>
	</section>
	<section class="signatures">
		<h2>Təsdiq və imzalar</h2>
		<div class="signature-line"><strong>Müəllim:</strong><span></span></div>
		<div class="signature-line"><strong>Kafedra rəhbəri:</strong><span></span></div>
		<div class="signature-line"><strong>Filial rəhbəri:</strong><span></span></div>
		<div class="signature-line"><strong>Attestasiya komissiyasının sədri:</strong><span></span></div>
		<div class="signature-line"><strong>Tarix:</strong><span>____ / ____ / ______</span></div>
	</section>
	<div class="generated">
		<div>Hazırlanma tarixi: ${generatedDate}</div>
		<div>Hazırlanma saatı: ${generatedTime}</div>
	</div>
</body>
</html>`;
};
