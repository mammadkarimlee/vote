import { createClient } from "@supabase/supabase-js";

type ProvisionPayload = {
	mode?: "login" | "email";
	name?: string;
	role?: string;
	branchId?: string | null;
	email?: string;
	password?: string;
	docData?: Record<string, unknown> | null;
};

type SupabaseUser = {
	id: string;
	email?: string | null;
};

type ActorRow = {
	id: string;
	org_id: string;
	role: string;
	branch_id: string | null;
};

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

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOGIN_EMAIL_DOMAIN =
	process.env.LOGIN_EMAIL_DOMAIN ||
	process.env.VITE_LOGIN_EMAIL_DOMAIN ||
	"vote.local";

const allowedOrigins = (process.env.PROVISION_ALLOWED_ORIGINS || "")
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

const AZ_CHAR_MAP: Record<string, string> = {
	Ə: "e",
	ə: "e",
	İ: "i",
	ı: "i",
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

const normalizeLoginPart = (value: string) =>
	value
		.split("")
		.map((char) => AZ_CHAR_MAP[char] ?? char)
		.join("")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]/g, "");

const buildLoginFromName = (fullName: string) => {
	const parts = fullName.trim().split(/\s+/).filter(Boolean);
	const first = parts[0] ?? "";
	const last = parts.length > 1 ? parts[parts.length - 1] : "";

	const firstPart = normalizeLoginPart(first).slice(0, 3);
	const lastPart = normalizeLoginPart(last).slice(0, 2);
	const fallback = normalizeLoginPart(fullName).slice(0, 5);

	return firstPart + lastPart || fallback || "user";
};

const toLoginEmail = (loginOrEmail: string) => {
	const trimmed = loginOrEmail.trim().toLowerCase();
	if (trimmed.includes("@")) return trimmed;
	return `${trimmed}@${LOGIN_EMAIL_DOMAIN}`;
};

const ensureUniqueLogin = async (orgId: string, base: string) => {
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

const parseBody = (body: unknown): ProvisionPayload => {
	if (!body) return {};
	if (typeof body === "object") return body as ProvisionPayload;
	if (typeof body === "string") {
		try {
			return JSON.parse(body) as ProvisionPayload;
		} catch {
			return {};
		}
	}
	return {};
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

		const { data: authData, error: authError } =
			await supabase.auth.getUser(token);
		if (authError || !authData.user)
			return respondError(res, 401, "Unauthorized");

		const { data: actor, error: actorError } = await supabase
			.from("users")
			.select("*")
			.eq("id", (authData.user as SupabaseUser).id)
			.maybeSingle();

		if (actorError || !actor)
			return respondError(res, 403, "Forbidden");

		const payload = parseBody(req.body);
		const mode = payload.mode;
		const name =
			typeof payload.name === "string" ? payload.name.trim() : "";
		const role = payload.role;

		if (!name) return respondError(res, 400, "Name is required");
		if (mode !== "login" && mode !== "email")
			return respondError(res, 400, "Invalid mode");

		const actorRow = actor as ActorRow;
		const isSuperAdmin = actorRow.role === "superadmin";
		const isBranchStaff =
			actorRow.role === "branch_admin" || actorRow.role === "moderator";
		if (!isSuperAdmin && !isBranchStaff)
			return respondError(res, 403, "Forbidden");

		if (!isSuperAdmin && role === "branch_admin") {
			return respondError(res, 403, "Cannot create branch admin");
		}

		const branchId = payload.branchId ?? actorRow.branch_id ?? null;
		if (!branchId) return respondError(res, 400, "Branch is required");
		if (!isSuperAdmin && payload.branchId && actorRow.branch_id !== payload.branchId) {
			return respondError(res, 403, "Branch mismatch");
		}

		if (mode === "email" && (!payload.email || !payload.password)) {
			return respondError(res, 400, "Email and password are required");
		}

		const orgId = actorRow.org_id;
		let login: string | null = null;
		let password: string | null = null;
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
				password: password ?? "",
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
				group_id: payload.docData?.groupId ?? null,
				class_level: payload.docData?.classLevel ?? null,
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
}
