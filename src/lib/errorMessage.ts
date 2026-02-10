export const toErrorMessage = (error: unknown, fallback: string) => {
	if (!error) return fallback;

	if (typeof error === "string" && error.trim()) return error.trim();

	if (error instanceof Error) {
		const message = error.message?.trim();
		return message ? message : fallback;
	}

	if (typeof error === "object") {
		const record = error as Record<string, unknown>;
		const parts: string[] = [];

		const message = record.message;
		if (typeof message === "string" && message.trim()) parts.push(message.trim());

		const details = record.details;
		if (typeof details === "string" && details.trim()) parts.push(details.trim());

		const hint = record.hint;
		if (typeof hint === "string" && hint.trim()) parts.push(hint.trim());

		if (parts.length > 0) return parts.join(" • ");
	}

	return fallback;
};

