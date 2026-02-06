import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
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

const fieldMeta = {
	biq: { min: 0, max: 100, label: "BİQ ortalama (0–100)", weight: 15 },
	survey: { min: 0, max: 100, label: "Sorğu ortalama (0–100)", weight: 15 },
	self: { min: 0, max: 10, label: "Özünü dəyərləndirmə (0–10)", weight: 10 },
	leadership: {
		min: 0,
		max: 10,
		label: "Rəhbərlik dəyərləndirməsi (0–10)",
		weight: 10,
	},
	exam: { min: 0, max: 30, label: "İmtahan (0–30)", weight: 30 },
	portfolio: { min: 0, max: 20, label: "Portfolio (0–20)", weight: 20 },
};

type FieldKey = keyof typeof fieldMeta;

type FieldState = {
	value: string;
	error: string | null;
	numeric: number;
};

const parseField = (value: string, min: number, max: number): FieldState => {
	if (value.trim() === "") return { value, error: null, numeric: 0 };
	const parsed = Number(value);
	if (Number.isNaN(parsed))
		return { value, error: "Yalnız rəqəm daxil edin", numeric: 0 };
	if (parsed < min || parsed > max)
		return { value, error: `Aralıq ${min}–${max} olmalıdır`, numeric: parsed };
	return { value, error: null, numeric: parsed };
};

const buildParams = (fields: Record<FieldKey, string>, bonusIds: string[]) => {
	const params = new URLSearchParams();
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

export const PkpdCalculatorForm = () => {
	const [searchParams, setSearchParams] = useSearchParams();
	const [shareStatus, setShareStatus] = useState<string | null>(null);

	const [fields, setFields] = useState<Record<FieldKey, string>>(() => ({
		biq: searchParams.get("biq") ?? "",
		survey: searchParams.get("survey") ?? "",
		self: searchParams.get("self") ?? "",
		leadership: searchParams.get("leadership") ?? "",
		exam: searchParams.get("exam") ?? "",
		portfolio: searchParams.get("portfolio") ?? "",
	}));

	const [bonusIds, setBonusIds] = useState<string[]>(() => {
		const raw = searchParams.get("bonus");
		return raw ? raw.split(",").filter(Boolean) : [];
	});

	const values = useMemo(() => {
		const parsed: Record<FieldKey, FieldState> = {
			biq: parseField(fields.biq, fieldMeta.biq.min, fieldMeta.biq.max),
			survey: parseField(
				fields.survey,
				fieldMeta.survey.min,
				fieldMeta.survey.max,
			),
			self: parseField(fields.self, fieldMeta.self.min, fieldMeta.self.max),
			leadership: parseField(
				fields.leadership,
				fieldMeta.leadership.min,
				fieldMeta.leadership.max,
			),
			exam: parseField(fields.exam, fieldMeta.exam.min, fieldMeta.exam.max),
			portfolio: parseField(
				fields.portfolio,
				fieldMeta.portfolio.min,
				fieldMeta.portfolio.max,
			),
		};

		const biqPoints = parsed.biq.error
			? 0
			: (parsed.biq.numeric * fieldMeta.biq.weight) / 100;
		const surveyPoints = parsed.survey.error
			? 0
			: (parsed.survey.numeric * fieldMeta.survey.weight) / 100;
		const selfPoints = parsed.self.error ? 0 : parsed.self.numeric;
		const leadershipPoints = parsed.leadership.error
			? 0
			: parsed.leadership.numeric;
		const examPoints = parsed.exam.error ? 0 : parsed.exam.numeric;
		const portfolioPoints = parsed.portfolio.error
			? 0
			: parsed.portfolio.numeric;

		const bonusPoints = bonusIds
			.map((id) => bonusOptions.find((option) => option.id === id)?.points ?? 0)
			.reduce((sum, value) => sum + value, 0);

		const baseTotal =
			biqPoints +
			surveyPoints +
			selfPoints +
			leadershipPoints +
			examPoints +
			portfolioPoints;
		const total = baseTotal + bonusPoints;

		return {
			parsed,
			breakdown: {
				biqPoints,
				surveyPoints,
				selfPoints,
				leadershipPoints,
				examPoints,
				portfolioPoints,
				bonusPoints,
				baseTotal,
				total,
			},
		};
	}, [fields, bonusIds]);

	const breakdownItems = useMemo(
		() => [
			{ label: "BİQ (15 bal)", value: values.breakdown.biqPoints, max: 15 },
			{
				label: "Sorğu (15 bal)",
				value: values.breakdown.surveyPoints,
				max: 15,
			},
			{
				label: "Özünü dəyərləndirmə",
				value: values.breakdown.selfPoints,
				max: 10,
			},
			{ label: "Rəhbərlik", value: values.breakdown.leadershipPoints, max: 10 },
			{ label: "İmtahan", value: values.breakdown.examPoints, max: 30 },
			{ label: "Portfolio", value: values.breakdown.portfolioPoints, max: 20 },
			{ label: "Bonus", value: values.breakdown.bonusPoints, max: 10 },
		],
		[values.breakdown],
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
		const params = buildParams(fields, bonusIds);
		setSearchParams(params, { replace: true });
	};

	const handleShare = async () => {
		syncParams();
		const url = `${window.location.origin}${window.location.pathname}?${buildParams(fields, bonusIds).toString()}`;
		try {
			await navigator.clipboard.writeText(url);
			setShareStatus("Link kopyalandı");
		} catch {
			setShareStatus("Link kopyalana bilmədi");
		}
	};

	const handleReset = () => {
		setFields({
			biq: "",
			survey: "",
			self: "",
			leadership: "",
			exam: "",
			portfolio: "",
		});
		setBonusIds([]);
		setSearchParams({}, { replace: true });
		setShareStatus(null);
	};

	return (
		<div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
			<Card>
				<CardHeader>
					<CardTitle className="text-xl">PKPD Kalkulyatoru</CardTitle>
					<p className="text-sm text-muted-foreground">
						Dəyərləri daxil edin, sistem yekun nəticəni hesablayacaq.
					</p>
				</CardHeader>
				<CardContent className="space-y-5">
					<div className="grid gap-4 md:grid-cols-2">
						{(Object.keys(fieldMeta) as FieldKey[]).map((key) => {
							const meta = fieldMeta[key];
							const parsed = values.parsed[key];
							return (
								<label key={key} className="flex flex-col gap-1 text-sm">
									<span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
										{meta.label}
									</span>
									<input
										className={cn(
											"input",
											parsed.error && "border-destructive/60",
										)}
										type="number"
										min={meta.min}
										max={meta.max}
										value={fields[key]}
										onChange={(event) =>
											handleFieldChange(key, event.target.value)
										}
									/>
									{parsed.error && (
										<span className="text-xs text-destructive">
											{parsed.error}
										</span>
									)}
								</label>
							);
						})}
					</div>

					<div className="space-y-3">
						<div className="flex items-center justify-between">
							<h4 className="text-sm font-semibold">Bonus ballar</h4>
							<span className="text-xs text-muted-foreground">Maddə 19.*</span>
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
					title="Toplam bal"
					value={values.breakdown.total.toFixed(1)}
					subtitle="0–100 + bonus"
				/>
				<div className="rounded-2xl border border-border bg-card px-4 py-3">
					<div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
						Status
					</div>
					<div className="mt-2">
						<DecisionBadge score={values.breakdown.total} />
					</div>
				</div>
				<ScoreBreakdown items={breakdownItems} />
			</div>
		</div>
	);
};
