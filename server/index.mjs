import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import cors from "cors";
import express from "express";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOGIN_EMAIL_DOMAIN =
	process.env.LOGIN_EMAIL_DOMAIN ||
	process.env.VITE_LOGIN_EMAIL_DOMAIN ||
	"vote.local";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const OPENAI_BASE_URL = (
	process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
).replace(/\/+$/, "");
const PORT = Number(process.env.PROVISION_API_PORT || 8787);
const allowedOrigins = (
	process.env.PROVISION_ALLOWED_ORIGINS || "http://localhost:5173"
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

const app = express();

app.use(
	cors({
		origin(origin, callback) {
			if (!origin) return callback(null, true);
			if (allowedOrigins.includes(origin)) return callback(null, true);
			return callback(new Error("Not allowed by CORS"));
		},
		allowedHeaders: ["Content-Type", "Authorization"],
	}),
);
app.use(express.json({ limit: "1mb" }));

const AZ_CHAR_MAP = {
	Ə: "e",
	ə: "e",
	I: "i",
	ı: "i",
	İ: "i",
	Ö: "o",
	ö: "o",
	Ü: "u",
	ü: "u",
	Ç: "c",
	ç: "c",
	Ş: "s",
	ş: "s",
	Ğ: "g",
	ğ: "g",
};

const normalizeLoginPart = (value) =>
	value
		.split("")
		.map((char) => AZ_CHAR_MAP[char] ?? char)
		.join("")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]/g, "");

const buildLoginFromName = (fullName) => {
	const parts = fullName.trim().split(/\s+/).filter(Boolean);
	const first = parts[0] ?? "";
	const last = parts.length > 1 ? parts[parts.length - 1] : "";

	const firstPart = normalizeLoginPart(first).slice(0, 3);
	const lastPart = normalizeLoginPart(last).slice(0, 2);
	const fallback = normalizeLoginPart(fullName).slice(0, 5);

	return firstPart + lastPart || fallback || "user";
};

const toLoginEmail = (loginOrEmail) => {
	const trimmed = loginOrEmail.trim().toLowerCase();
	if (trimmed.includes("@")) return trimmed;
	return `${trimmed}@${LOGIN_EMAIL_DOMAIN}`;
};

const ensureUniqueLogin = async (orgId, base) => {
	let candidate = base;
	let counter = 1;
	while (counter < 1000) {
		const { data, error } = await supabase
			.from("usernames")
			.select("login")
			.eq("org_id", orgId)
			.eq("login", candidate)
			.maybeSingle();

		if (error) {
			throw error;
		}
		if (!data) return candidate;
		candidate = `${base}${counter}`;
		counter += 1;
	}
	throw new Error("Unique login not available");
};

const respondError = (res, status, message) => {
	res.status(status).json({ error: message });
};

const ALLOWED_CREATE_ROLES = new Set([
	"student",
	"teacher",
	"manager",
	"moderator",
	"branch_admin",
	"hr",
]);

const BRANCH_STAFF_CREATE_ROLES = new Set([
	"student",
	"teacher",
	"manager",
	"moderator",
]);

const toFiniteNumber = (value) => {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : null;
};

const sanitizeText = (value, maxLength = 220) =>
	String(value ?? "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, maxLength);

const normalizeTeacherFeedbackPayload = (input) => {
	const payload = input && typeof input === "object" ? input : {};
	const teacherName = sanitizeText(payload.teacherName, 120);
	if (!teacherName) {
		return { error: "Müəllim adı tələb olunur." };
	}

	const cycleYearRaw = toFiniteNumber(payload.cycleYear);
	const cycleYear = cycleYearRaw === null ? null : Math.trunc(cycleYearRaw);

	const overallAvgRaw = toFiniteNumber(payload.overallAvg);
	const teacherAvgRaw = toFiniteNumber(payload.teacherAvg);
	const overallAvg =
		overallAvgRaw === null ? null : Number(overallAvgRaw.toFixed(2));
	const teacherAvg =
		teacherAvgRaw === null ? null : Number(teacherAvgRaw.toFixed(2));

	const submissionCountRaw = toFiniteNumber(payload.submissionCount);
	const submissionCount =
		submissionCountRaw === null ? 0 : Math.max(0, Math.trunc(submissionCountRaw));

	const scaleQuestions = Array.isArray(payload.scaleQuestions)
		? payload.scaleQuestions
				.map((item) => {
					const text = sanitizeText(item?.text, 220);
					const avgRaw = toFiniteNumber(item?.avg);
					const countRaw = toFiniteNumber(item?.count);
					if (!text || avgRaw === null) return null;
					const avg = Math.max(0, Math.min(10, Number(avgRaw.toFixed(2))));
					const count = countRaw === null ? 0 : Math.max(0, Math.trunc(countRaw));
					return { text, avg, count };
				})
				.filter(Boolean)
				.slice(0, 12)
		: [];

	const choiceQuestions = Array.isArray(payload.choiceQuestions)
		? payload.choiceQuestions
				.map((item) => {
					const text = sanitizeText(item?.text, 220);
					if (!text) return null;
					const distributionRaw = Array.isArray(item?.distribution)
						? item.distribution
						: [];
					const distribution = distributionRaw
						.map((entry) => {
							const option = sanitizeText(entry?.option, 120);
							const countRaw = toFiniteNumber(entry?.count);
							const count =
								countRaw === null ? 0 : Math.max(0, Math.trunc(countRaw));
							if (!option) return null;
							return { option, count };
						})
						.filter(Boolean)
						.slice(0, 8);
					return { text, distribution };
				})
				.filter(Boolean)
				.slice(0, 8)
		: [];

	const comments = Array.isArray(payload.comments)
		? payload.comments
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
		},
	};
};

const parseJsonObject = (value) => {
	if (typeof value !== "string") return null;
	const start = value.indexOf("{");
	const end = value.lastIndexOf("}");
	if (start < 0 || end < 0 || end <= start) return null;
	try {
		return JSON.parse(value.slice(start, end + 1));
	} catch {
		return null;
	}
};

const isRecord = (value) => typeof value === "object" && value !== null;

const extractProviderErrorMessage = (value) => {
	if (!isRecord(value)) return null;
	const error = value.error;
	if (!isRecord(error)) return null;
	const message = error.message;
	return typeof message === "string" && message.trim() ? message : null;
};

const extractResponsesContent = (value) => {
	if (!isRecord(value)) return null;
	if (typeof value.output_text === "string" && value.output_text.trim()) {
		return value.output_text;
	}

	const output = Array.isArray(value.output) ? value.output : [];
	for (const item of output) {
		if (!isRecord(item)) continue;
		if (typeof item.text === "string" && item.text.trim()) {
			return item.text;
		}
		const content = Array.isArray(item.content) ? item.content : [];
		for (const entry of content) {
			if (!isRecord(entry)) continue;
			if (typeof entry.text === "string" && entry.text.trim()) {
				return entry.text;
			}
			if (
				typeof entry.output_text === "string" &&
				entry.output_text.trim()
			) {
				return entry.output_text;
			}
		}
	}
	return null;
};

const extractChatCompletionContent = (value) => {
	if (!isRecord(value)) return null;
	const choices = value.choices;
	if (!Array.isArray(choices) || choices.length === 0) return null;
	const first = choices[0];
	if (!isRecord(first)) return null;
	const message = first.message;
	if (!isRecord(message)) return null;
	const content = message.content;
	return typeof content === "string" && content.trim() ? content : null;
};

const normalizeList = (value) => {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => sanitizeText(item, 260))
		.filter(Boolean)
		.slice(0, 4);
};

const buildRuleBasedFeedback = (payload) => {
	const { teacherName, cycleYear, overallAvg, teacherAvg, submissionCount } =
		payload;
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
		teacherAvg !== null
			? `Müəllimin ümumi ortalaması: ${teacherAvg.toFixed(2)}.`
			: "Müəllim üzrə ortalama bal hesablanmayıb.",
		`Qiymətləndirmə sayı: ${submissionCount}. Yazılı rəy sayı: ${commentsCount}.`,
	];

	const summary = `${teacherName} üçün nəticə xülasəsi hazırlandı. ${comparison}`;
	return { summary, strengths, improvements, actionPlan, rationale };
};

const mergeFeedbackDraft = (candidate, fallback) => {
	const summary = sanitizeText(candidate?.summary, 900) || fallback.summary;
	const strengths = normalizeList(candidate?.strengths);
	const improvements = normalizeList(candidate?.improvements);
	const actionPlan = normalizeList(candidate?.actionPlan);
	const rationale = normalizeList(candidate?.rationale);

	return {
		summary,
		strengths: strengths.length > 0 ? strengths : fallback.strengths,
		improvements: improvements.length > 0 ? improvements : fallback.improvements,
		actionPlan: actionPlan.length > 0 ? actionPlan : fallback.actionPlan,
		rationale: rationale.length > 0 ? rationale : fallback.rationale,
	};
};

const formatFeedbackSummary = (draft) => {
	const section = (title, items) => [title, ...items.map((item) => `- ${item}`)];
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

const buildAiFeedbackDraft = async (payload) => {
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

		const requestOpenAi = async (path, body) => {
			const response = await fetch(`${OPENAI_BASE_URL}${path}`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${OPENAI_API_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
				signal: controller.signal,
			});

			const responseBody = await response.json().catch(() => null);
			if (!response.ok) {
				const message =
					extractProviderErrorMessage(responseBody) ??
					`AI provider HTTP ${response.status}`;
				throw new Error(message);
			}

			return responseBody;
		};

		const payloadText = JSON.stringify(payload);
		let responsesError = null;

		try {
			const responsesBody = await requestOpenAi("/responses", {
				model: OPENAI_MODEL,
				temperature: 0.2,
				input: [
					{
						role: "system",
						content: [{ type: "input_text", text: systemPrompt }],
					},
					{
						role: "user",
						content: [{ type: "input_text", text: payloadText }],
					},
				],
			});
			const responsesContent = extractResponsesContent(responsesBody);
			const parsedResponses = parseJsonObject(responsesContent);
			if (parsedResponses) {
				return parsedResponses;
			}
			responsesError = new Error("AI responses endpoint JSON cavab qaytarmadı.");
		} catch (error) {
			responsesError =
				error instanceof Error
					? error
					: new Error("AI responses endpoint xətası.");
		}

		const chatBody = await requestOpenAi("/chat/completions", {
			model: OPENAI_MODEL,
			temperature: 0.2,
			messages: [
				{ role: "system", content: systemPrompt },
				{ role: "user", content: payloadText },
			],
		});
		const chatContent = extractChatCompletionContent(chatBody);
		const parsedChat = parseJsonObject(chatContent);
		if (parsedChat) {
			return parsedChat;
		}
		if (responsesError) {
			throw new Error(
				`AI JSON cavab qaytarmadı. Responses xətası: ${responsesError.message}`,
			);
		}
		throw new Error("AI xidməti JSON cavab qaytarmadı.");
	} finally {
		clearTimeout(timeoutId);
	}
};

const generateTeacherFeedback = async (payload) => {
	const fallbackDraft = buildRuleBasedFeedback(payload);

	if (!OPENAI_API_KEY) {
		throw new Error("OPENAI_API_KEY təyin edilməyib.");
	}

	try {
		const aiDraft = await buildAiFeedbackDraft(payload);
		const merged = mergeFeedbackDraft(aiDraft, fallbackDraft);
		return {
			source: "ai",
			summary: formatFeedbackSummary(merged),
		};
	} catch (error) {
		console.error("AI feedback failed:", error);
		throw error instanceof Error
			? error
			: new Error("AI xidmətində naməlum xəta baş verdi.");
	}
};

app.get("/health", (_req, res) => {
	res.json({ ok: true });
});

app.post("/ai/teacher-feedback", async (req, res) => {
	try {
		const authHeader = req.headers.authorization || "";
		const token = authHeader.replace("Bearer ", "").trim();
		if (!token) return respondError(res, 401, "Unauthorized");

		const { data: authData, error: authError } =
			await supabase.auth.getUser(token);
		if (authError || !authData.user)
			return respondError(res, 401, "Unauthorized");

		const { data: actor, error: actorError } = await supabase
			.from("users")
			.select("id, role, org_id")
			.eq("id", authData.user.id)
			.maybeSingle();

		if (actorError || !actor || actor.role !== "superadmin") {
			return respondError(res, 403, "Forbidden");
		}

		const normalized = normalizeTeacherFeedbackPayload(req.body);
		if (normalized.error) {
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
});

app.post("/provision-user", async (req, res) => {
	try {
		const authHeader = req.headers.authorization || "";
		const token = authHeader.replace("Bearer ", "").trim();
		if (!token) return respondError(res, 401, "Unauthorized");

		const { data: authData, error: authError } =
			await supabase.auth.getUser(token);
		if (authError || !authData.user)
			return respondError(res, 401, "Unauthorized");

		const { data: actor, error: actorError } = await supabase
			.from("users")
			.select("*")
			.eq("id", authData.user.id)
			.maybeSingle();

		if (actorError || !actor) return respondError(res, 403, "Forbidden");

		const payload = req.body || {};
		const mode = payload.mode;
		const name = typeof payload.name === "string" ? payload.name.trim() : "";
		const role = payload.role;

		if (!name) return respondError(res, 400, "Name is required");
		if (mode !== "login" && mode !== "email")
			return respondError(res, 400, "Invalid mode");
		if (typeof role !== "string" || !ALLOWED_CREATE_ROLES.has(role)) {
			return respondError(res, 400, "Invalid role");
		}

		const isSuperAdmin = actor.role === "superadmin";
		const isBranchStaff =
			actor.role === "branch_admin" || actor.role === "moderator";
		if (!isSuperAdmin && !isBranchStaff)
			return respondError(res, 403, "Forbidden");

		if (!isSuperAdmin && !BRANCH_STAFF_CREATE_ROLES.has(role)) {
			return respondError(res, 403, "Role is not allowed");
		}

		const branchId = payload.branchId ?? actor.branch_id ?? null;
		if (!branchId) return respondError(res, 400, "Branch is required");
		if (
			!isSuperAdmin &&
			payload.branchId &&
			actor.branch_id !== payload.branchId
		) {
			return respondError(res, 403, "Branch mismatch");
		}

		if (mode === "email" && (!payload.email || !payload.password)) {
			return respondError(res, 400, "Email and password are required");
		}

		const orgId = actor.org_id;
		let login = null;
		let password = null;
		let email = "";

		if (mode === "login") {
			const base = buildLoginFromName(name);
			login = await ensureUniqueLogin(orgId, base);
			password = login;
			email = toLoginEmail(login);
		} else {
			email = String(payload.email).trim().toLowerCase();
			password = String(payload.password);
			login = email;
		}

		const { data: created, error: createError } =
			await supabase.auth.admin.createUser({
				email,
				password,
				email_confirm: true,
			});

		if (createError || !created.user) {
			return respondError(
				res,
				400,
				createError?.message || "Auth user not created",
			);
		}

		const uid = created.user.id;

		const { error: userError } = await supabase.from("users").insert({
			id: uid,
			org_id: orgId,
			role,
			branch_id: branchId,
			display_name: name,
			login,
			email,
			auth_user_id: uid,
		});
		if (userError) {
			await supabase.auth.admin.deleteUser(uid);
			return respondError(res, 400, userError.message);
		}

		if (mode === "login") {
			const { error: usernameError } = await supabase.from("usernames").insert({
				org_id: orgId,
				login,
				user_id: uid,
				role,
				branch_id: branchId,
			});
			if (usernameError) {
				await supabase.from("users").delete().eq("id", uid);
				await supabase.auth.admin.deleteUser(uid);
				return respondError(res, 400, usernameError.message);
			}
		}

		if (role === "student") {
			const { error: studentError } = await supabase.from("students").insert({
				id: uid,
				org_id: orgId,
				name,
				branch_id: branchId,
				group_id: payload.docData?.groupId,
				class_level: payload.docData?.classLevel,
				user_id: uid,
				login,
			});
			if (studentError) {
				if (mode === "login") {
					await supabase
						.from("usernames")
						.delete()
						.eq("org_id", orgId)
						.eq("login", login);
				}
				await supabase.from("users").delete().eq("id", uid);
				await supabase.auth.admin.deleteUser(uid);
				return respondError(res, 400, studentError.message);
			}
		}

		if (role === "teacher") {
			const { error: teacherError } = await supabase.from("teachers").insert({
				id: uid,
				org_id: orgId,
				name,
				branch_id: branchId,
				user_id: uid,
				login,
				first_name: payload.docData?.firstName ?? null,
				last_name: payload.docData?.lastName ?? null,
				department_id: payload.docData?.departmentId ?? null,
				photo_url: payload.docData?.photoUrl ?? null,
				teacher_category: payload.docData?.teacherCategory ?? "standard",
			});
			if (teacherError) {
				if (mode === "login") {
					await supabase
						.from("usernames")
						.delete()
						.eq("org_id", orgId)
						.eq("login", login);
				}
				await supabase.from("users").delete().eq("id", uid);
				await supabase.auth.admin.deleteUser(uid);
				return respondError(res, 400, teacherError.message);
			}
		}

		return res.json({ uid, login, password, email });
	} catch (error) {
		return respondError(
			res,
			500,
			error instanceof Error ? error.message : "Unexpected error",
		);
	}
});

app.listen(PORT, () => {
	console.log(`Provision API running on http://localhost:${PORT}`);
});
