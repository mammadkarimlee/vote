import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useFeedbackState } from "../../../components/feedback/FeedbackProvider";
import { Button } from "../../../components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "../../../components/ui/card";
import { cn } from "../../../lib/utils";
import { bonusOptions } from "../pkpdData";
import { DecisionBadge } from "./DecisionBadge";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { ScoreCard } from "./ScoreCard";

type EvaluationType = "WITH_BIQ" | "WITHOUT_BIQ";

type FieldKey =
	| "subjectMastery"
	| "studentSurvey"
	| "selfEvaluation"
	| "leadershipEvaluation"
	| "exam"
	| "educationQualification"
	| "attendance"
	| "certificatesPublications"
	| "olympiadCompetition"
	| "projectsAwards";

type FieldMeta = {
	key: FieldKey;
	label: string;
	max: number;
};

const bonusMax = bonusOptions.reduce((sum, option) => sum + option.points, 0);

const emptyFields: Record<FieldKey, string> = {
	subjectMastery: "",
	studentSurvey: "",
	selfEvaluation: "",
	leadershipEvaluation: "",
	exam: "",
	educationQualification: "",
	attendance: "",
	certificatesPublications: "",
	olympiadCompetition: "",
	projectsAwards: "",
};

const parseScore = (value: string, max: number) => {
	const trimmed = value.trim();
	if (trimmed === "") return { score: null as number | null, error: null };

	const parsed = Number(trimmed);
	if (Number.isNaN(parsed)) {
		return { score: null as number | null, error: "Yalnız rəqəm daxil edin" };
	}
	if (parsed < 0 || parsed > max) {
		return {
			score: parsed,
			error: `Aralıq 0-${max} olmalıdır`,
		};
	}

	return { score: parsed, error: null };
};

const sumEnteredScores = (scores: Array<number | null>) => {
	const entered = scores.filter(
		(score): score is number => score !== null && !Number.isNaN(score),
	);
	return entered.length > 0
		? entered.reduce((sum, score) => sum + score, 0)
		: null;
};

const buildParams = (
	evaluationType: EvaluationType,
	fields: Record<FieldKey, string>,
	bonusIds: string[],
) => {
	const params = new URLSearchParams();
	params.set("evaluationType", evaluationType);
	(Object.keys(fields) as FieldKey[]).forEach((key) => {
		if (fields[key].trim() !== "") {
			params.set(key, fields[key]);
		}
	});
	if (bonusIds.length > 0) {
		params.set("bonus", bonusIds.join(","));
	}
	return params;
};

const getComponentMetas = (evaluationType: EvaluationType): FieldMeta[] =>
	evaluationType === "WITH_BIQ"
		? [
				{
					key: "subjectMastery",
					label: "Balabilgənin fənni mənimsəməsi",
					max: 15,
				},
				{ key: "studentSurvey", label: "Balabilgə sorğusu", max: 15 },
				{ key: "selfEvaluation", label: "Özünü qiymətləndirmə", max: 10 },
				{
					key: "leadershipEvaluation",
					label: "Rəhbərlik qiymətləndirməsi",
					max: 10,
				},
				{ key: "exam", label: "Attestasiya imtahanı", max: 30 },
			]
		: [
				{ key: "studentSurvey", label: "Balabilgə sorğusu", max: 20 },
				{ key: "selfEvaluation", label: "Özünü qiymətləndirmə", max: 10 },
				{
					key: "leadershipEvaluation",
					label: "Rəhbərlik qiymətləndirməsi",
					max: 10,
				},
			];

const getPortfolioMetas = (evaluationType: EvaluationType): FieldMeta[] =>
	evaluationType === "WITH_BIQ"
		? [
				{ key: "educationQualification", label: "Təhsil / kvalifikasiya", max: 3 },
				{ key: "attendance", label: "Davamiyyət", max: 3 },
				{
					key: "certificatesPublications",
					label: "Sertifikat / məqalə / təlim",
					max: 4,
				},
				{ key: "olympiadCompetition", label: "Olimpiada / müsabiqə", max: 4 },
				{ key: "projectsAwards", label: "Layihə / tədbir / təltif", max: 6 },
			]
		: [
				{ key: "educationQualification", label: "Təhsil / kvalifikasiya", max: 3 },
				{ key: "attendance", label: "Davamiyyət", max: 3 },
				{
					key: "certificatesPublications",
					label: "Sertifikat / məqalə / təlim",
					max: 9,
				},
				{
					key: "olympiadCompetition",
					label: "Müsabiqə / festival / yarış",
					max: 20,
				},
				{ key: "projectsAwards", label: "Layihə / tədbir / təltif", max: 25 },
			];

const formatScore = (value: number | null) =>
	value === null ? "-" : value.toFixed(1);

export const PkpdCalculatorForm = () => {
	const [searchParams, setSearchParams] = useSearchParams();
	const [shareStatus, setShareStatus] = useFeedbackState();

	const initialType =
		searchParams.get("evaluationType") === "WITHOUT_BIQ"
			? "WITHOUT_BIQ"
			: "WITH_BIQ";
	const [evaluationType, setEvaluationType] =
		useState<EvaluationType>(initialType);
	const [fields, setFields] = useState<Record<FieldKey, string>>(() => ({
		...emptyFields,
		subjectMastery: searchParams.get("subjectMastery") ?? "",
		studentSurvey: searchParams.get("studentSurvey") ?? "",
		selfEvaluation: searchParams.get("selfEvaluation") ?? "",
		leadershipEvaluation: searchParams.get("leadershipEvaluation") ?? "",
		exam: searchParams.get("exam") ?? "",
		educationQualification:
			searchParams.get("educationQualification") ?? "",
		attendance: searchParams.get("attendance") ?? "",
		certificatesPublications:
			searchParams.get("certificatesPublications") ?? "",
		olympiadCompetition: searchParams.get("olympiadCompetition") ?? "",
		projectsAwards: searchParams.get("projectsAwards") ?? "",
	}));

	const [bonusIds, setBonusIds] = useState<string[]>(() => {
		const raw = searchParams.get("bonus");
		return raw ? raw.split(",").filter(Boolean) : [];
	});

	const values = useMemo(() => {
		const componentMetas = getComponentMetas(evaluationType);
		const portfolioMetas = getPortfolioMetas(evaluationType);
		const allMetas = [...componentMetas, ...portfolioMetas];
		const parsed = Object.fromEntries(
			allMetas.map((meta) => [meta.key, parseScore(fields[meta.key], meta.max)]),
		) as Record<FieldKey, ReturnType<typeof parseScore>>;

		const componentScores = componentMetas.map((meta) =>
			parsed[meta.key].error ? null : parsed[meta.key].score,
		);
		const portfolioScores = portfolioMetas.map((meta) =>
			parsed[meta.key].error ? null : parsed[meta.key].score,
		);
		const portfolioScore = sumEnteredScores(portfolioScores);
		const baseTotalScore = sumEnteredScores([...componentScores, portfolioScore]);
		const extraScore = bonusIds
			.map((id) => bonusOptions.find((option) => option.id === id)?.points ?? 0)
			.reduce((sum, value) => sum + value, 0);
		const finalScoreWithExtra =
			baseTotalScore === null && extraScore === 0
				? null
				: (baseTotalScore ?? 0) + extraScore;

		return {
			componentMetas,
			portfolioMetas,
			parsed,
			portfolioScore,
			portfolioMax: portfolioMetas.reduce((sum, meta) => sum + meta.max, 0),
			baseTotalScore,
			extraScore,
			finalScoreWithExtra,
		};
	}, [bonusIds, evaluationType, fields]);

	const breakdownItems = useMemo(
		() => [
			...values.componentMetas.map((meta) => ({
				label: `${meta.label} (${meta.max} bal)`,
				value: values.parsed[meta.key]?.score ?? null,
				max: meta.max,
			})),
			{
				label: `Portfolio (${values.portfolioMax} bal)`,
				value: values.portfolioScore,
				max: values.portfolioMax,
			},
			{ label: "Əlavə bal", value: values.extraScore, max: bonusMax },
		],
		[values],
	);

	const handleFieldChange = (key: FieldKey, value: string) => {
		setFields((prev) => ({ ...prev, [key]: value }));
		setShareStatus(null);
	};

	const handleBonusToggle = (id: string) => {
		setBonusIds((prev) =>
			prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
		);
		setShareStatus(null);
	};

	const syncParams = () => {
		setSearchParams(buildParams(evaluationType, fields, bonusIds), {
			replace: true,
		});
	};

	const handleShare = async () => {
		syncParams();
		const url = `${window.location.origin}${window.location.pathname}?${buildParams(
			evaluationType,
			fields,
			bonusIds,
		).toString()}`;
		try {
			await navigator.clipboard.writeText(url);
			setShareStatus("Link köçürüldü");
		} catch {
			setShareStatus("Link köçürülə bilmədi");
		}
	};

	const handleReset = () => {
		setFields(emptyFields);
		setBonusIds([]);
		setEvaluationType("WITH_BIQ");
		setSearchParams({}, { replace: true });
		setShareStatus(null);
	};

	return (
		<div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
			<Card>
				<CardHeader>
					<CardTitle className="text-xl">PKPD Kalkulyatoru</CardTitle>
					<p className="text-sm text-muted-foreground">
						Modeli seçin, alt balları daxil edin, sistem yekun nəticəni
						hesablasın.
					</p>
				</CardHeader>
				<CardContent className="space-y-5">
					<label className="flex flex-col gap-1 text-sm">
						<span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
							PKPD modeli
						</span>
						<select
							className="input"
							value={evaluationType}
							onChange={(event) => {
								setEvaluationType(event.target.value as EvaluationType);
								setShareStatus(null);
							}}
						>
							<option value="WITH_BIQ">
								BİQ/KİQ nəticəsi olan müəllim
							</option>
							<option value="WITHOUT_BIQ">
								BİQ/KİQ nəticəsi olmayan müəllim
							</option>
						</select>
					</label>

					<div className="grid gap-4 md:grid-cols-2">
						{values.componentMetas.map((meta) => {
							const parsed = values.parsed[meta.key];
							return (
								<label key={meta.key} className="flex flex-col gap-1 text-sm">
									<span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
										{meta.label} / {meta.max}
									</span>
									<input
										className={cn(
											"input",
											parsed?.error && "border-destructive/60",
										)}
										type="number"
										min={0}
										max={meta.max}
										value={fields[meta.key]}
										onChange={(event) =>
											handleFieldChange(meta.key, event.target.value)
										}
									/>
									{parsed?.error && (
										<span className="text-xs text-destructive">
											{parsed.error}
										</span>
									)}
								</label>
							);
						})}
					</div>

					<div className="space-y-3">
						<h4 className="text-sm font-semibold">Portfolio</h4>
						<div className="grid gap-4 md:grid-cols-2">
							{values.portfolioMetas.map((meta) => {
								const parsed = values.parsed[meta.key];
								return (
									<label key={meta.key} className="flex flex-col gap-1 text-sm">
										<span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
											{meta.label} / {meta.max}
										</span>
										<input
											className={cn(
												"input",
												parsed?.error && "border-destructive/60",
											)}
											type="number"
											min={0}
											max={meta.max}
											value={fields[meta.key]}
											onChange={(event) =>
												handleFieldChange(meta.key, event.target.value)
											}
										/>
										{parsed?.error && (
											<span className="text-xs text-destructive">
												{parsed.error}
											</span>
										)}
									</label>
								);
							})}
						</div>
						<div className="rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm">
							Portfolio cəmi: {formatScore(values.portfolioScore)} /{" "}
							{values.portfolioMax}
						</div>
					</div>

					<div className="space-y-3">
						<div className="flex items-center justify-between">
							<h4 className="text-sm font-semibold">Əlavə ballar</h4>
							<span className="text-xs text-muted-foreground">Maddə 19</span>
						</div>
						<div className="grid gap-2">
							{bonusOptions.map((option) => (
								<label
									key={option.id}
									className="flex items-center justify-between rounded-2xl border border-border bg-card px-3 py-2 text-sm"
								>
									<span>
										<span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
											{option.id}
										</span>
										<span className="ml-2 text-foreground">{option.label}</span>
									</span>
									<span className="flex items-center gap-3">
										<span className="text-xs text-muted-foreground">
											+{option.points} bal
										</span>
										<input
											type="checkbox"
											className="h-4 w-4 accent-current"
											checked={bonusIds.includes(option.id)}
											onChange={() => handleBonusToggle(option.id)}
										/>
									</span>
								</label>
							))}
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-3">
						<Button type="button" onClick={handleShare}>
							Linki paylaş
						</Button>
						<Button type="button" variant="outline" onClick={handleReset}>
							Sıfırla
						</Button>
						{shareStatus && (
							<span className="text-xs text-muted-foreground">
								{shareStatus}
							</span>
						)}
					</div>
				</CardContent>
			</Card>

			<div className="space-y-4">
				<ScoreCard
					title="PKPD yekun balı"
					value={formatScore(values.baseTotalScore)}
					subtitle="100 bal üzərindən"
				/>
				<ScoreCard
					title="Stimullaşdırıcı yekun"
					value={formatScore(values.finalScoreWithExtra)}
					subtitle="PKPD yekun balı + əlavə bal"
				/>
				<div className="rounded-2xl border border-border bg-card px-4 py-3">
					<div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
						Nəticə statusu
					</div>
					<div className="mt-2">
						{values.baseTotalScore === null ? (
							<span className="text-sm text-muted-foreground">
								Hələ bal daxil edilməyib
							</span>
						) : (
							<DecisionBadge score={values.baseTotalScore} />
						)}
					</div>
				</div>
				<ScoreBreakdown items={breakdownItems} />
			</div>
		</div>
	);
};
