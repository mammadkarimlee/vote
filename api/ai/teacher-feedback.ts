import { createClient } from "@supabase/supabase-js";

type NextApiRequest = {
	method?: string;
	headers: Record<string, string | string[] | undefined>;
	body?: unknown;
};

type NextApiResponse = {
	status: (code: number) => NextApiResponse;
	json: (data: unknown) => void;
	setHeader: (name: string, value: string) => void;
	end: () => void;
};

type SupabaseUser = {
	id: string;
};

type ActorRow = {
	id: string;
	org_id: string;
	role: string;
};

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

type TeacherFeedbackPayload = {
	teacherName: string;
	cycleYear: number | null;
	overallAvg: number | null;
	teacherAvg: number | null;
	submissionCount: number;
	scaleQuestions: ScaleQuestionStat[];
	choiceQuestions: ChoiceQuestionStat[];
	comments: string[];
};

type FeedbackDraft = {
	summary: string;
	strengths: string[];
	improvements: string[];
	actionPlan: string[];
	rationale: string[];
};

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1")
	.trim()
	.replace(/\/+$/, "");

const allowedOrigins = (
	process.env.AI_ALLOWED_ORIGINS ||
	process.env.PROVISION_ALLOWED_ORIGINS ||
	""
)
	.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);

if (!SUPABASE_URL) {
	throw new Error("Missing SUPABASE_URL");
}
if (!SERVICE_ROLE_KEY) {
	throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false },
});

const respondError = (res: NextApiResponse, status: number, message: string) => {
	res.status(status).json({ error: message });
};

const getOrigin = (req: NextApiRequest) => {
	const header = req.headers.origin;
	if (!header) return null;
	return Array.isArray(header) ? header[0] : header;
};

const applyCors = (req: NextApiRequest, res: NextApiResponse) => {
	const origin = getOrigin(req);
	if (!origin) return true;
	if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
		res.setHeader("Access-Control-Allow-Origin", origin);
		res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
		res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
		return true;
	}
	return false;
};

const parseBody = (body: unknown): Record<string, unknown> => {
	if (!body) return {};
	if (typeof body === "object") return body as Record<string, unknown>;
	if (typeof body === "string") {
		try {
			return JSON.parse(body) as Record<string, unknown>;
		} catch {
			return {};
		}
	}
	return {};
};

const toFiniteNumber = (value: unknown) => {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : null;
};

const sanitizeText = (value: unknown, maxLength = 220) =>
	String(value ?? "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, maxLength);

const normalizeTeacherFeedbackPayload = (input: unknown) => {
	const body = parseBody(input);
	const teacherName = sanitizeText(body.teacherName, 120);
	if (!teacherName) {
		return { error: "Müəllim adı tələb olunur." } as const;
	}

	const cycleYearRaw = toFiniteNumber(body.cycleYear);
	const cycleYear = cycleYearRaw === null ? null : Math.trunc(cycleYearRaw);

	const overallAvgRaw = toFiniteNumber(body.overallAvg);
	const teacherAvgRaw = toFiniteNumber(body.teacherAvg);
	const overallAvg = overallAvgRaw === null ? null : Number(overallAvgRaw.toFixed(2));
	const teacherAvg = teacherAvgRaw === null ? null : Number(teacherAvgRaw.toFixed(2));

	const submissionCountRaw = toFiniteNumber(body.submissionCount);
	const submissionCount =
		submissionCountRaw === null ? 0 : Math.max(0, Math.trunc(submissionCountRaw));

	const scaleQuestions = Array.isArray(body.scaleQuestions)
		? (body.scaleQuestions as unknown[])
				.map((item) => {
					const obj = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
					const text = sanitizeText(obj.text, 220);
					const avgRaw = toFiniteNumber(obj.avg);
					const countRaw = toFiniteNumber(obj.count);
					if (!text || avgRaw === null) return null;
					const avg = Math.max(0, Math.min(10, Number(avgRaw.toFixed(2))));
					const count = countRaw === null ? 0 : Math.max(0, Math.trunc(countRaw));
					return { text, avg, count } satisfies ScaleQuestionStat;
				})
				.filter((value): value is ScaleQuestionStat => Boolean(value))
				.slice(0, 12)
		: [];

	const choiceQuestions = Array.isArray(body.choiceQuestions)
		? (body.choiceQuestions as unknown[])
				.map((item) => {
					const obj = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
					const text = sanitizeText(obj.text, 220);
					if (!text) return null;
					const distRaw = Array.isArray(obj.distribution) ? (obj.distribution as unknown[]) : [];
					const distribution = distRaw
						.map((entry) => {
							const e = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
							const option = sanitizeText(e.option, 120);
							const countRaw = toFiniteNumber(e.count);
							const count = countRaw === null ? 0 : Math.max(0, Math.trunc(countRaw));
							if (!option) return null;
							return { option, count } satisfies ChoiceOption;
						})
						.filter((value): value is ChoiceOption => Boolean(value))
						.slice(0, 8);
					return { text, distribution } satisfies ChoiceQuestionStat;
				})
				.filter((value): value is ChoiceQuestionStat => Boolean(value))
				.slice(0, 8)
		: [];

	const comments = Array.isArray(body.comments)
		? (body.comments as unknown[])
				.map((item) => sanitizeText(item, 260))
				.filter(Boolean)
				.slice(0, 12)
		: [];

	return {
		payload: {
			teacherName,
			cycleYear,
			overallAvg,
			teacherAvg,
			submissionCount,
			scaleQuestions,
			choiceQuestions,
			comments,
		} satisfies TeacherFeedbackPayload,
	} as const;
};

const normalizeList = (value: unknown) => {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => sanitizeText(item, 260))
		.filter(Boolean)
		.slice(0, 4);
};

const parseJsonObject = (value: unknown) => {
	if (typeof value !== "string") return null;
	const start = value.indexOf("{");
	const end = value.lastIndexOf("}");
	if (start < 0 || end < 0 || end <= start) return null;
	try {
		return JSON.parse(value.slice(start, end + 1)) as unknown;
	} catch {
		return null;
	}
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const extractProviderErrorMessage = (value: unknown) => {
	if (!isRecord(value)) return null;
	const err = value.error;
	if (!isRecord(err)) return null;
	const message = err.message;
	return typeof message === "string" ? message : null;
};

const extractChatCompletionContent = (value: unknown) => {
	if (!isRecord(value)) return null;
	const choices = value.choices;
	if (!Array.isArray(choices) || choices.length === 0) return null;
	const first = choices[0];
	if (!isRecord(first)) return null;
	const message = first.message;
	if (!isRecord(message)) return null;
	const content = message.content;
	return typeof content === "string" ? content : null;
};

const buildRuleBasedFeedback = (payload: TeacherFeedbackPayload): FeedbackDraft => {
	const { teacherName, cycleYear, overallAvg, teacherAvg, submissionCount } = payload;
	const scaleSortedDesc = [...payload.scaleQuestions].sort((a, b) => b.avg - a.avg);
	const scaleSortedAsc = [...payload.scaleQuestions].sort((a, b) => a.avg - b.avg);
	const topScale = scaleSortedDesc.slice(0, 3);
	const lowScale = scaleSortedAsc.slice(0, 3);
	const commentsCount = payload.comments.length;

	let comparison = "Filial ortalaması ilə müqayisə üçün məlumat kifayət deyil.";
	if (teacherAvg !== null && overallAvg !== null) {
		const diff = Number((teacherAvg - overallAvg).toFixed(2));
		if (diff >= 0.4) {
			comparison = `Nəticə filial ortalamasından +${diff.toFixed(2)} bal yuxarıdır.`;
		} else if (diff <= -0.4) {
			comparison = `Nəticə filial ortalamasından ${diff.toFixed(2)} bal aşağıdır.`;
		} else {
			comparison = `Nəticə filial ortalamasına yaxındır (fərq ${diff.toFixed(2)} bal).`;
		}
	}

	const strengths = topScale.map(
		(item) => `${item.text}: orta ${item.avg.toFixed(2)} (n=${item.count})`,
	);
	while (strengths.length < 3) {
		strengths.push("Sabit dərs ritmi və qiymətləndirmə ardıcıllığı müşahidə olunur.");
	}

	const improvements = lowScale.map(
		(item) =>
			`${item.text}: orta ${item.avg.toFixed(2)}. Bu mövzu üzrə əlavə fokus lazımdır.`,
	);
	if (payload.choiceQuestions.length > 0) {
		const choice = payload.choiceQuestions[0];
		const topChoice = [...choice.distribution].sort((a, b) => b.count - a.count)[0];
		if (topChoice) {
			improvements.push(
				`${choice.text}: ən çox seçilən cavab "${topChoice.option}" (${topChoice.count}).`,
			);
		}
	}
	while (improvements.length < 3) {
		improvements.push("Dərsdə iştirak və geribildirim dövrəsini daha sistemli edin.");
	}

	const actionPlan = [
		lowScale[0]
			? `"${lowScale[0].text}" mövzusu üzrə hər həftə 1 ölçülə bilən mini-hədəf qoyun.`
			: "Hər həftə 1 ölçülə bilən mini-hədəf qoyun və nəticəni qeyd edin.",
		"2 həftədə bir anonim mini-sorğu aparın və nəticələri əvvəlki dövrlə müqayisə edin.",
		"30 günün sonunda qısa özünütəhlil yazın: nə işlədi, nə işləmədi, növbəti addım nədir.",
	];

	const rationale = [
		cycleYear ? `${cycleYear} sorğu dövrünün nəticələri istifadə olunub.` : "Seçilmiş sorğu dövrü istifadə olunub.",
		teacherAvg !== null ? `Müəllimin ümumi ortalaması: ${teacherAvg.toFixed(2)}.` : "Müəllim üzrə ortalama bal hesablanmayıb.",
		`Qiymətləndirmə sayı: ${submissionCount}. Yazılı rəy sayı: ${commentsCount}.`,
	];

	const summary = `${teacherName} üçün nəticə xülasəsi hazırlandı. ${comparison}`;
	return { summary, strengths, improvements, actionPlan, rationale };
};

const mergeFeedbackDraft = (candidate: unknown, fallback: FeedbackDraft): FeedbackDraft => {
	const obj = candidate && typeof candidate === "object" ? (candidate as Record<string, unknown>) : {};
	const summary = sanitizeText(obj.summary, 900) || fallback.summary;
	const strengths = normalizeList(obj.strengths);
	const improvements = normalizeList(obj.improvements);
	const actionPlan = normalizeList(obj.actionPlan);
	const rationale = normalizeList(obj.rationale);

	return {
		summary,
		strengths: strengths.length > 0 ? strengths : fallback.strengths,
		improvements: improvements.length > 0 ? improvements : fallback.improvements,
		actionPlan: actionPlan.length > 0 ? actionPlan : fallback.actionPlan,
		rationale: rationale.length > 0 ? rationale : fallback.rationale,
	};
};

const formatFeedbackSummary = (draft: FeedbackDraft) => {
	const section = (title: string, items: string[]) => [title, ...items.map((item) => `- ${item}`)];
	return [
		"Qısa xülasə",
		draft.summary,
		"",
		...section("Güclü tərəflər", draft.strengths),
		"",
		...section("İnkişaf sahələri", draft.improvements),
		"",
		...section("30 günlük plan", draft.actionPlan),
		"",
		...section("Əsaslandırma", draft.rationale),
	]
		.join("\n")
		.trim();
};

const buildAiFeedbackDraft = async (payload: TeacherFeedbackPayload) => {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 25000);
	try {
		const systemPrompt = [
			"Sən təhsil keyfiyyəti üzrə analitiksən.",
			"Cavabı yalnız Azərbaycan dilində yaz.",
			"Cavabı yalnız JSON formatında qaytar:",
			'{"summary":"","strengths":[],"improvements":[],"actionPlan":[],"rationale":[]}',
			"summary 2-3 cümlə olsun, digər massivlərdə 3 konkret maddə ver.",
			"Yalnız verilən dataya əsaslan, heç nə uydurma.",
		].join(" ");

		const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${OPENAI_API_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: OPENAI_MODEL,
				temperature: 0.2,
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: JSON.stringify(payload) },
				],
			}),
			signal: controller.signal,
		});

		const body: unknown = await response.json().catch(() => null);
		if (!response.ok) {
			const message =
				extractProviderErrorMessage(body) ??
				`AI provider HTTP ${response.status}`;
			throw new Error(message);
		}

		const content = extractChatCompletionContent(body);
		const parsed = parseJsonObject(content);
		if (!parsed) {
			throw new Error("AI xidməti JSON cavab qaytarmadı.");
		}
		return parsed;
	} finally {
		clearTimeout(timeoutId);
	}
};

const generateTeacherFeedback = async (payload: TeacherFeedbackPayload) => {
	const fallbackDraft = buildRuleBasedFeedback(payload);

	if (!OPENAI_API_KEY) {
		return {
			source: "rule_based" as const,
			summary: formatFeedbackSummary(fallbackDraft),
			warning: "OPENAI_API_KEY təyin edilməyib. Qayda əsaslı rəy yaradıldı.",
		};
	}

	try {
		const aiDraft = await buildAiFeedbackDraft(payload);
		const merged = mergeFeedbackDraft(aiDraft, fallbackDraft);
		return { source: "ai" as const, summary: formatFeedbackSummary(merged) };
	} catch (error) {
		console.error("AI feedback failed:", error);
		return {
			source: "rule_based" as const,
			summary: formatFeedbackSummary(fallbackDraft),
			warning: "AI xidməti əlçatan olmadı. Qayda əsaslı rəy yaradıldı.",
		};
	}
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (!applyCors(req, res)) {
		return respondError(res, 403, "Not allowed by CORS");
	}

	if (req.method === "OPTIONS") {
		res.status(204).end();
		return;
	}

	if (req.method !== "POST") {
		return respondError(res, 405, "Method Not Allowed");
	}

	try {
		const authHeader = req.headers.authorization || "";
		const token = Array.isArray(authHeader)
			? authHeader[0]?.replace("Bearer ", "").trim()
			: authHeader.replace("Bearer ", "").trim();
		if (!token) return respondError(res, 401, "Unauthorized");

		const { data: authData, error: authError } = await supabase.auth.getUser(token);
		if (authError || !authData.user) return respondError(res, 401, "Unauthorized");

		const { data: actor, error: actorError } = await supabase
			.from("users")
			.select("id, org_id, role")
			.eq("id", (authData.user as SupabaseUser).id)
			.maybeSingle();

		if (actorError || !actor) return respondError(res, 403, "Forbidden");
		const actorRow = actor as ActorRow;
		if (actorRow.role !== "superadmin") return respondError(res, 403, "Forbidden");

		const normalized = normalizeTeacherFeedbackPayload(req.body);
		if ("error" in normalized) {
			return respondError(res, 400, normalized.error);
		}

		const feedback = await generateTeacherFeedback(normalized.payload);
		return res.json({
			summary: feedback.summary,
			source: feedback.source,
			warning: feedback.warning,
		});
	} catch (error) {
		return respondError(
			res,
			500,
			error instanceof Error ? error.message : "Unexpected error",
		);
	}
}
