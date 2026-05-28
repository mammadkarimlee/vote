import type { ReactNode } from "react";
import { cn } from "../lib/utils";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const toneClasses: Record<Tone, string> = {
	neutral: "border-border bg-secondary/50 text-foreground",
	success: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200",
	warning: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200",
	danger: "border-red-200 bg-red-50 text-red-800 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200",
	info: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/70 dark:bg-blue-950/40 dark:text-blue-200",
	accent: "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900/70 dark:bg-indigo-950/40 dark:text-indigo-200",
};

export const PageHeader = ({
	eyebrow,
	title,
	description,
	actions,
	meta,
	className,
}: {
	eyebrow?: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	meta?: ReactNode;
	className?: string;
}) => (
	<div className={cn("page-hero", className)}>
		<div className="page-hero__content">
			{eyebrow && <div className="eyebrow">{eyebrow}</div>}
			<h1>{title}</h1>
			{description && <p>{description}</p>}
			{meta && <div className="mt-4 flex flex-wrap gap-2">{meta}</div>}
		</div>
		{actions && <div className="page-hero__aside">{actions}</div>}
	</div>
);

export const SectionCard = ({
	eyebrow,
	title,
	description,
	actions,
	children,
	className,
}: {
	eyebrow?: ReactNode;
	title?: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	children?: ReactNode;
	className?: string;
}) => (
	<section className={cn("card", className)}>
		{(title || description || actions || eyebrow) && (
			<div className="section-header">
				<div>
					{eyebrow && <div className="section-kicker">{eyebrow}</div>}
					{title && <h3 className="section-title">{title}</h3>}
					{description && <p className="hint mt-1">{description}</p>}
				</div>
				{actions && <div className="actions">{actions}</div>}
			</div>
		)}
		{children && <div className={title || description ? "mt-4" : ""}>{children}</div>}
	</section>
);

export const StatusBadge = ({
	children,
	tone = "neutral",
	className,
}: {
	children: ReactNode;
	tone?: Tone;
	className?: string;
}) => (
	<span
		className={cn(
			"inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
			toneClasses[tone],
			className,
		)}
	>
		<span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
		{children}
	</span>
);

export const StatCard = ({
	label,
	value,
	meta,
	tone = "neutral",
	icon,
	progress,
	className,
}: {
	label: ReactNode;
	value: ReactNode;
	meta?: ReactNode;
	tone?: Tone;
	icon?: ReactNode;
	progress?: number | null;
	className?: string;
}) => {
	const safeProgress =
		typeof progress === "number" && Number.isFinite(progress)
			? Math.min(Math.max(progress, 0), 100)
			: null;

	return (
		<div className={cn("stat-card modern-stat-card", className)}>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="stat-label">{label}</div>
					<div className="stat-value">{value}</div>
				</div>
				{icon && (
					<div
						className={cn(
							"flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-sm font-bold",
							toneClasses[tone],
						)}
						aria-hidden="true"
					>
						{icon}
					</div>
				)}
			</div>
			{meta && <div className="stat-meta mt-1">{meta}</div>}
			{safeProgress !== null && (
				<div className="progress-track" aria-hidden="true">
					<div
						className={cn(
							"progress-fill",
							tone === "success" && "bg-emerald-500",
							tone === "warning" && "bg-amber-500",
							tone === "danger" && "bg-red-500",
							tone === "info" && "bg-blue-500",
							tone === "accent" && "bg-indigo-500",
						)}
						style={{ width: `${safeProgress}%` }}
					/>
				</div>
			)}
		</div>
	);
};

export const ScoreCard = ({
	label,
	value,
	max,
	helper,
	tone = "neutral",
}: {
	label: ReactNode;
	value: ReactNode;
	max?: ReactNode;
	helper?: ReactNode;
	tone?: Tone;
}) => (
	<div className="rounded-xl border border-border bg-background/60 p-4">
		<div className="flex items-start justify-between gap-3">
			<div className="min-w-0">
				<div className="text-sm font-semibold text-foreground">{label}</div>
				{helper && <div className="mt-1 text-xs text-muted-foreground">{helper}</div>}
			</div>
			{max && <StatusBadge tone={tone}>max {max}</StatusBadge>}
		</div>
		<div className="mt-3 text-2xl font-semibold text-foreground">{value}</div>
	</div>
);

export type ScoreBreakdownRow = {
	key: string;
	label: ReactNode;
	value: ReactNode;
	max: ReactNode;
	meta?: ReactNode;
	tone?: Tone;
};

export const ScoreBreakdownTable = ({
	rows,
	emptyText = "Bal bölgüsü üçün məlumat yoxdur.",
}: {
	rows: ScoreBreakdownRow[];
	emptyText?: string;
}) => (
	<div className="dashboard-table-wrap">
		<table className="dashboard-table">
			<thead>
				<tr>
					<th>Meyar</th>
					<th>Bal</th>
					<th>Maksimum</th>
					<th>Status</th>
				</tr>
			</thead>
			<tbody>
				{rows.map((row) => (
					<tr key={row.key}>
						<td>
							<div className="font-semibold text-foreground">{row.label}</div>
							{row.meta && <div className="mt-1 text-xs text-muted-foreground">{row.meta}</div>}
						</td>
						<td className="font-semibold">{row.value}</td>
						<td>{row.max}</td>
						<td>
							<StatusBadge tone={row.tone ?? "neutral"}>
								{row.tone === "warning" ? "Daxil edilməyib" : "Daxil edilib"}
							</StatusBadge>
						</td>
					</tr>
				))}
				{rows.length === 0 && (
					<tr>
						<td colSpan={4}>
							<EmptyState title={emptyText} />
						</td>
					</tr>
				)}
			</tbody>
		</table>
	</div>
);

export const FilterPanel = ({
	title = "Filterlər",
	description,
	actions,
	children,
}: {
	title?: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	children: ReactNode;
}) => (
	<SectionCard title={title} description={description} actions={actions}>
		<div className="filters">{children}</div>
	</SectionCard>
);

export const EmptyState = ({
	title,
	description,
	action,
}: {
	title: ReactNode;
	description?: ReactNode;
	action?: ReactNode;
}) => (
	<div className="empty-state">
		<div className="empty-state__mark" aria-hidden="true" />
		<div className="empty-state__title">{title}</div>
		{description && <div className="empty-state__description">{description}</div>}
		{action && <div className="mt-3">{action}</div>}
	</div>
);

export const LoadingSkeleton = ({ rows = 3 }: { rows?: number }) => (
	<div className="grid gap-3" aria-label="Məlumatlar yüklənir">
		{Array.from({ length: rows }, (_, index) => (
			<div className="skeleton-row" key={index} />
		))}
	</div>
);
