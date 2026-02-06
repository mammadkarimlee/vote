import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Theme = "light" | "dark" | "system";

type ThemeContextValue = {
	theme: Theme;
	resolvedTheme: "light" | "dark";
	setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const getSystemTheme = () => {
	if (typeof window === "undefined") return "light";
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
};

const applyTheme = (theme: Theme) => {
	const resolved = theme === "system" ? getSystemTheme() : theme;
	document.documentElement.classList.toggle("dark", resolved === "dark");
	document.documentElement.setAttribute("data-theme", resolved);
	return resolved;
};

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
	const [theme, setTheme] = useState<Theme>(() => {
		if (typeof window === "undefined") return "system";
		const stored = window.localStorage.getItem("theme") as Theme | null;
		return stored ?? "system";
	});
	const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => {
		if (typeof window === "undefined") return "light";
		return applyTheme(theme);
	});

	useEffect(() => {
		if (typeof window === "undefined") return;
		const resolved = applyTheme(theme);
		setResolvedTheme(resolved);
		window.localStorage.setItem("theme", theme);
	}, [theme]);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = () => {
			if (theme === "system") {
				setResolvedTheme(applyTheme("system"));
			}
		};
		media.addEventListener("change", handler);
		return () => media.removeEventListener("change", handler);
	}, [theme]);

	const value = useMemo(
		() => ({ theme, resolvedTheme, setTheme }),
		[theme, resolvedTheme],
	);

	return (
		<ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
	);
};

export const useTheme = () => {
	const ctx = useContext(ThemeContext);
	if (!ctx) {
		throw new Error("useTheme must be used within ThemeProvider");
	}
	return ctx;
};
