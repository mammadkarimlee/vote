import type { ReactNode } from "react";
import { cn } from "../../../lib/utils";

const variants = {
	info: "border-accent/30 bg-accent/10 text-foreground",
	warn: "border-destructive/30 bg-destructive/10 text-foreground",
	example: "border-primary/30 bg-primary/10 text-foreground",
};

type CalloutProps = {
	title?: string;
	variant?: keyof typeof variants;
	children: ReactNode;
};

export const Callout = ({
	title,
	variant = "info",
	children,
}: CalloutProps) => (
	<div
		className={cn(
			"rounded-2xl border px-4 py-3 text-sm leading-relaxed",
			variants[variant],
		)}
	>
		{title && (
			<div className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
				{title}
			</div>
		)}
		<div>{children}</div>
	</div>
);
