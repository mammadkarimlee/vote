import { cn } from "../../lib/utils";
import { useTheme } from "./ThemeProvider";

type ThemeOption = "light" | "dark" | "system";

const options: Array<{ value: ThemeOption; label: string }> = [
	{ value: "system", label: "Sistem" },
	{ value: "light", label: "Light" },
	{ value: "dark", label: "Dark" },
];

export const ThemeToggle = () => {
	const { theme, setTheme } = useTheme();

	return (
		<div className="theme-toggle inline-flex items-center gap-1 rounded-full border border-border bg-card p-1 text-xs">
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					onClick={() => setTheme(option.value)}
					className={cn(
						"rounded-full px-3 py-1 font-semibold transition",
						theme === option.value
							? "bg-primary text-primary-foreground shadow-soft"
							: "text-muted-foreground hover:bg-secondary hover:text-foreground",
					)}
					aria-pressed={theme === option.value}
				>
					{option.label}
				</button>
			))}
		</div>
	);
};
