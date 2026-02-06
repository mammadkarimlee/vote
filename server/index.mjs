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

app.get("/health", (_req, res) => {
	res.json({ ok: true });
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

		const isSuperAdmin = actor.role === "superadmin";
		const isBranchStaff =
			actor.role === "branch_admin" || actor.role === "moderator";
		if (!isSuperAdmin && !isBranchStaff)
			return respondError(res, 403, "Forbidden");

		if (!isSuperAdmin && role === "branch_admin") {
			return respondError(res, 403, "Cannot create branch admin");
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
	// eslint-disable-next-line no-console
	console.log(`Provision API running on http://localhost:${PORT}`);
});
