type ScaleQuestionStat = {
	text: string;
	avg: number;
	count: number;
};

type ChoiceOption = {
	option: string;
	count: number;
};

type ChoiceQuestionStat = {
	text: string;
	distribution: ChoiceOption[];
};

export type TeacherAiFeedbackRequest = {
	teacherName: string;
	cycleYear: number | null;
	overallAvg: number | null;
	teacherAvg: number | null;
	submissionCount: number;
	scaleQuestions: ScaleQuestionStat[];
	choiceQuestions: ChoiceQuestionStat[];
	comments: string[];
};

export type TeacherAiFeedbackResponse = {
	summary: string;
	source: "ai" | "rule_based";
	warning?: string;
};

const normalizeBaseUrl = (value: string) => {
	const trimmed = value.trim();
	if (!trimmed) return "";
	if (trimmed === "/") return "/api";
	return trimmed.replace(/\/+$/, "");
};

const configuredBaseUrl = import.meta.env.VITE_AI_API_URL?.trim();
const fallbackBaseUrl = import.meta.env.PROD ? "/api" : "http://localhost:8787";

const AI_HTTP_BASES = Array.from(
	new Set(
		["/api", configuredBaseUrl, fallbackBaseUrl]
			.filter((value): value is string => Boolean(value && value.trim()))
			.map((value) => normalizeBaseUrl(value)),
	),
);

const isRetryableStatus = (status: number) =>
	status === 404 ||
	status === 408 ||
	status === 429 ||
	status === 500 ||
	status === 502 ||
	status === 503 ||
	status === 504;

const parseErrorMessage = async (response: Response) => {
	const body = await response.json().catch(() => null);
	const message =
		body && typeof body === "object" && "error" in body
			? (body.error as string)
			: "";
	if (typeof message === "string" && message.trim()) {
		return message;
	}
	return `HTTP ${response.status}`;
};

const isNetworkErrorMessage = (value: string) => {
	const normalized = value.toLowerCase();
	return (
		normalized.includes("failed to fetch") ||
		normalized.includes("network") ||
		normalized.includes("timeout") ||
		normalized.includes("econnrefused") ||
		normalized.includes("load failed")
	);
};

const postAiFeedback = async (
	baseUrl: string,
	token: string,
	payload: TeacherAiFeedbackRequest,
) => {
	const response = await fetch(`${baseUrl}/ai/teacher-feedback`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		const message = await parseErrorMessage(response);
		throw { retryable: isRetryableStatus(response.status), error: message };
	}

	const body = (await response.json().catch(() => null)) as
		| TeacherAiFeedbackResponse
		| null;
	if (!body || typeof body.summary !== "string" || !body.summary.trim()) {
		throw { retryable: false, error: "AI xidmeti duzgun cavab qaytarmadi." };
	}
	return body;
};

export const requestTeacherAiFeedback = async (
	token: string,
	payload: TeacherAiFeedbackRequest,
) => {
	let lastError = "AI xidmeti ile elaqe qurulmadi.";

	for (const baseUrl of AI_HTTP_BASES) {
		try {
			return await postAiFeedback(baseUrl, token, payload);
		} catch (error) {
			if (
				typeof error === "object" &&
				error !== null &&
				"retryable" in error &&
				"error" in error
			) {
				const wrapped = error as { retryable?: boolean; error?: unknown };
				lastError =
					typeof wrapped.error === "string"
						? wrapped.error
						: "AI xidmeti ile elaqe qurulmadi.";
				if (!wrapped.retryable) {
					break;
				}
				continue;
			}
			lastError = error instanceof Error ? error.message : lastError;
		}
	}

	if (isNetworkErrorMessage(lastError)) {
		throw new Error(
			"AI server elcatan deyil. `npm run dev:server` isle ve OPENAI_API_KEY teyin et.",
		);
	}

	throw new Error(lastError);
};
