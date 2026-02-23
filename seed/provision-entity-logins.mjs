import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(ROOT_DIR, ".env.local") });
dotenv.config({ path: path.join(ROOT_DIR, ".env"), override: false });

const args = process.argv.slice(2);
const getArg = (name, fallback = "") => {
	const idx = args.indexOf(`--${name}`);
	if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
	return fallback;
};

const ENTITY = (getArg("entity", "teacher") || "teacher").toLowerCase();
if (ENTITY !== "teacher" && ENTITY !== "student") {
	console.error("Invalid --entity. Use: teacher | student");
	process.exit(1);
}

const BRANCH_NAME = getArg("branch", "").trim();
const INCLUDE_EXISTING = args.includes("--include-existing");
const SET_PASSWORD = (getArg("set-password", "") || "").toLowerCase();

if (SET_PASSWORD && SET_PASSWORD !== "login") {
	console.error("Invalid --set-password. Use: login");
	process.exit(1);
}

const SHOULD_SET_PASSWORD = SET_PASSWORD === "login";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_ID = process.env.VITE_ORG_ID || "default";
const LOGIN_EMAIL_DOMAIN =
	process.env.LOGIN_EMAIL_DOMAIN ||
	process.env.VITE_LOGIN_EMAIL_DOMAIN ||
	"vote.local";

if (!SUPABASE_URL) {
	console.error("Missing SUPABASE_URL / VITE_SUPABASE_URL in environment.");
	process.exit(1);
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
	console.error("Missing SUPABASE_SERVICE_ROLE_KEY in environment.");
	process.exit(1);
}

const branchSlug = BRANCH_NAME
	? BRANCH_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
	: "all";
const DEFAULT_OUTPUT_CSV_PATH = path.join(
	__dirname,
	`${ENTITY}-logins-${branchSlug}.csv`,
);
const OUTPUT_CSV_PATH = path.resolve(
	process.cwd(),
	getArg("output", DEFAULT_OUTPUT_CSV_PATH),
);

const SOURCE_TABLE = ENTITY === "teacher" ? "teachers" : "students";
const ENTITY_ROLE = ENTITY === "teacher" ? "teacher" : "student";
const ENTITY_ID_COL = ENTITY === "teacher" ? "teacher_id" : "student_id";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false },
});

const AZ_CHAR_MAP = {
	"\u018F": "e",
	"\u0259": "e",
	I: "i",
	"\u0131": "i",
	"\u0130": "i",
	"\u00D6": "o",
	"\u00F6": "o",
	"\u00DC": "u",
	"\u00FC": "u",
	"\u00C7": "c",
	"\u00E7": "c",
	"\u015E": "s",
	"\u015F": "s",
	"\u011E": "g",
	"\u011F": "g",
};

const normalizeLoginPart = (value) =>
	String(value || "")
		.split("")
		.map((char) => AZ_CHAR_MAP[char] ?? char)
		.join("")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]/g, "");

const buildLoginFromName = (fullName) => {
	const parts = String(fullName || "")
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	const first = parts[0] ?? "";
	const last = parts.length > 1 ? parts[parts.length - 1] : "";

	const firstPart = normalizeLoginPart(first).slice(0, 3);
	const lastPart = normalizeLoginPart(last).slice(0, 2);
	const fallback = normalizeLoginPart(fullName).slice(0, 5);

	return firstPart + lastPart || fallback || "user";
};

const toLoginEmail = (login) => `${login.toLowerCase()}@${LOGIN_EMAIL_DOMAIN}`;
const passwordForLogin = (login) => {
	const base = String(login || "").trim();
	if (!base) return "change123";
	return base.length >= 6 ? base : `${base}123`;
};

const toCsvCell = (value) => {
	if (value === null || value === undefined) return "";
	const text = String(value);
	if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
		return `"${text.replace(/"/g, "\"\"")}"`;
	}
	return text;
};

const ensureOk = (result, message) => {
	if (result.error) throw new Error(`${message}: ${result.error.message}`);
	return result.data;
};

const sleep = (ms) =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

const isRetryableError = (error) => {
	const message =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: String(error);
	const haystack = message.toLowerCase();
	return (
		haystack.includes("fetch failed") ||
		haystack.includes("econnreset") ||
		haystack.includes("etimedout") ||
		haystack.includes("enotfound") ||
		haystack.includes("eai_again") ||
		haystack.includes("429") ||
		haystack.includes("502") ||
		haystack.includes("503") ||
		haystack.includes("504")
	);
};

const withRetry = async (fn, label, maxAttempts = 5) => {
	let attempt = 1;
	let lastError = null;
	while (attempt <= maxAttempts) {
		try {
			// eslint-disable-next-line no-await-in-loop
			return await fn();
		} catch (error) {
			lastError = error;
			if (!isRetryableError(error) || attempt === maxAttempts) break;
			const backoffMs = 400 * attempt;
			console.warn(
				`[retry] ${label}: attempt ${attempt}/${maxAttempts} failed, retrying in ${backoffMs}ms`,
			);
			// eslint-disable-next-line no-await-in-loop
			await sleep(backoffMs);
			attempt += 1;
		}
	}
	throw lastError ?? new Error(`${label}: unknown error`);
};

let authUsersByEmail = null;
const errorMessageOf = (value) => {
	if (!value) return "";
	if (value instanceof Error) return value.message;
	if (typeof value === "object" && "message" in value) {
		return String(value.message || "");
	}
	return String(value);
};

const loadAuthUsersByEmail = async () => {
	if (authUsersByEmail) return authUsersByEmail;

	const map = new Map();
	let page = 1;
	while (page) {
		const listed = await withRetry(async () => {
			try {
				const response = await supabase.auth.admin.listUsers({
					page,
					perPage: 100,
				});
				if (response.error && isRetryableError(response.error.message)) {
					throw new Error(response.error.message);
				}
				return response;
			} catch (error) {
				if (isRetryableError(error)) throw error;
				return { data: null, error };
			}
		}, `list auth users page ${page}`);

		if (listed.error) {
			throw new Error(`Auth user list failed: ${errorMessageOf(listed.error)}`);
		}

		const users = listed.data?.users ?? [];
		for (const user of users) {
			const email = (user.email || "").trim().toLowerCase();
			if (email) map.set(email, user.id);
		}
		page = listed.data?.nextPage ?? null;
	}

	authUsersByEmail = map;
	return map;
};

const findAuthUserIdByEmail = async (email) => {
	const normalized = String(email || "").trim().toLowerCase();
	if (!normalized) return null;
	const cache = await loadAuthUsersByEmail();
	return cache.get(normalized) || null;
};

const rememberAuthUserEmail = (email, uid) => {
	if (!email || !uid) return;
	if (!authUsersByEmail) authUsersByEmail = new Map();
	authUsersByEmail.set(String(email).trim().toLowerCase(), uid);
};

const loginExists = async (login) => {
	const usernameRow = await supabase
		.from("usernames")
		.select("login")
		.eq("org_id", ORG_ID)
		.eq("login", login)
		.maybeSingle();
	if (usernameRow.error) throw new Error(usernameRow.error.message);
	if (usernameRow.data) return true;

	const userRow = await supabase
		.from("users")
		.select("id")
		.eq("org_id", ORG_ID)
		.eq("login", login)
		.maybeSingle();
	if (userRow.error) throw new Error(userRow.error.message);
	return Boolean(userRow.data);
};

const ensureUniqueLogin = async (base) => {
	let counter = 0;
	while (counter < 1000) {
		const candidate = counter === 0 ? base : `${base}${counter}`;
		// eslint-disable-next-line no-await-in-loop
		const exists = await loginExists(candidate);
		if (!exists) return candidate;
		counter += 1;
	}
	throw new Error(`Unique login not available for base '${base}'`);
};

const getBranchFilter = async () => {
	if (!BRANCH_NAME) return null;
	const branch = await supabase
		.from("branches")
		.select("id, name")
		.eq("org_id", ORG_ID)
		.eq("name", BRANCH_NAME)
		.maybeSingle();
	if (branch.error) throw new Error(branch.error.message);
	if (!branch.data?.id) {
		throw new Error(`Branch not found: '${BRANCH_NAME}'`);
	}
	return branch.data;
};

const getSourceRows = async (branchId) => {
	let query = supabase
		.from(SOURCE_TABLE)
		.select("id, name, branch_id, user_id, login")
		.eq("org_id", ORG_ID)
		.is("deleted_at", null)
		.order("id");

	if (branchId) query = query.eq("branch_id", branchId);

	const rows = ensureOk(
		await query,
		`Failed to read ${SOURCE_TABLE} from database`,
	);

	if (INCLUDE_EXISTING) return rows;
	return rows.filter((row) => !row.user_id || !row.login);
};

const getUserById = async (id) => {
	if (!id) return null;
	const result = await supabase
		.from("users")
		.select("id, login")
		.eq("org_id", ORG_ID)
		.eq("id", id)
		.maybeSingle();
	if (result.error) throw new Error(result.error.message);
	return result.data;
};

const getUserByLogin = async (login) => {
	if (!login) return null;
	const result = await supabase
		.from("users")
		.select("id, login")
		.eq("org_id", ORG_ID)
		.eq("login", login)
		.maybeSingle();
	if (result.error) throw new Error(result.error.message);
	return result.data;
};

const setAuthPassword = async (uid, password) => {
	const updated = await withRetry(
		async () => {
			const response = await supabase.auth.admin.updateUserById(uid, { password });
			if (response.error && isRetryableError(response.error.message)) {
				throw new Error(response.error.message);
			}
			return response;
		},
		`set auth password for ${uid}`,
	);

	if (updated.error) {
		throw new Error(`Auth password update failed for '${uid}': ${updated.error.message}`);
	}
};

const ensureUsernameRow = async (login, userId, branchId) => {
	const existing = await supabase
		.from("usernames")
		.select("login")
		.eq("org_id", ORG_ID)
		.eq("login", login)
		.maybeSingle();
	if (existing.error) throw new Error(existing.error.message);
	if (existing.data) return;

	const insert = await supabase.from("usernames").insert({
		org_id: ORG_ID,
		login,
		user_id: userId,
		role: ENTITY_ROLE,
		branch_id: branchId,
	});
	ensureOk(insert, `usernames insert failed for login '${login}'`);
};

const updateSourceLogin = async (id, userId, login) => {
	const update = await supabase
		.from(SOURCE_TABLE)
		.update({
			user_id: userId,
			login,
			deleted_at: null,
			archived_at: null,
		})
		.eq("org_id", ORG_ID)
		.eq("id", id);
	ensureOk(update, `${SOURCE_TABLE} update failed for '${id}'`);
};

const createAuthUserWithUniqueLogin = async (baseLogin) => {
	let attempt = 0;
	while (attempt < 200) {
		const loginSeed = attempt === 0 ? baseLogin : `${baseLogin}${attempt}`;
		// eslint-disable-next-line no-await-in-loop
		const login = await ensureUniqueLogin(loginSeed);
		const email = toLoginEmail(login);
		const password = passwordForLogin(login);

		const created = await withRetry(async () => {
			try {
				const response = await supabase.auth.admin.createUser({
					email,
					password,
					email_confirm: true,
				});
				if (response.error && isRetryableError(response.error.message)) {
					throw new Error(response.error.message);
				}
				return response;
			} catch (error) {
				if (isRetryableError(error)) throw error;
				return { data: null, error };
			}
		}, `create auth user for ${login}`);

		if (!created.error && created.data.user) {
			rememberAuthUserEmail(email, created.data.user.id);
			return {
				uid: created.data.user.id,
				login,
				email,
				password,
				existingAuth: false,
			};
		}

		const createdErrorMessage = errorMessageOf(created.error);
		if (/already registered/i.test(createdErrorMessage)) {
			// eslint-disable-next-line no-await-in-loop
			const existingUid = await findAuthUserIdByEmail(email);
			if (existingUid) {
				return {
					uid: existingUid,
					login,
					email,
					password,
					existingAuth: true,
				};
			}
			attempt += 1;
			continue;
		}
		throw new Error(createdErrorMessage || "Auth user create failed");
	}

	throw new Error(`Could not create auth user for base login '${baseLogin}'`);
};

const provisionRow = async (row) => {
	const baseLogin =
		normalizeLoginPart(row.login || "").slice(0, 16) ||
		buildLoginFromName(row.name);

	if (row.user_id && row.login) {
		const password = passwordForLogin(row.login);
		if (SHOULD_SET_PASSWORD) {
			await setAuthPassword(row.user_id, password);
		}
		return {
			status: "skipped-existing",
			id: row.id,
			name: row.name,
			branchId: row.branch_id,
			login: row.login,
			password: SHOULD_SET_PASSWORD ? password : "",
			email: toLoginEmail(row.login),
			uid: row.user_id,
		};
	}

	if (row.user_id && !row.login) {
		const existingUser = await getUserById(row.user_id);
		if (existingUser) {
			let login = existingUser.login;
			if (!login) {
				login = await ensureUniqueLogin(baseLogin);
				const updateUser = await supabase
					.from("users")
					.update({
						login,
						email: toLoginEmail(login),
						display_name: row.name,
						role: ENTITY_ROLE,
						branch_id: row.branch_id,
						deleted_at: null,
						archived_at: null,
					})
					.eq("org_id", ORG_ID)
					.eq("id", row.user_id);
				ensureOk(updateUser, `users update failed for '${row.user_id}'`);
			}

			await ensureUsernameRow(login, row.user_id, row.branch_id);
			await updateSourceLogin(row.id, row.user_id, login);
			const password = passwordForLogin(login);
			if (SHOULD_SET_PASSWORD) {
				await setAuthPassword(row.user_id, password);
			}

			return {
				status: "fixed-existing-user",
				id: row.id,
				name: row.name,
				branchId: row.branch_id,
				login,
				password: SHOULD_SET_PASSWORD ? password : "",
				email: toLoginEmail(login),
				uid: row.user_id,
			};
		}
	}

	if (!row.user_id && row.login) {
		const userByLogin = await getUserByLogin(row.login);
		if (userByLogin) {
			await ensureUsernameRow(row.login, userByLogin.id, row.branch_id);
			await updateSourceLogin(row.id, userByLogin.id, row.login);
			const password = passwordForLogin(row.login);
			if (SHOULD_SET_PASSWORD) {
				await setAuthPassword(userByLogin.id, password);
			}
			return {
				status: "fixed-existing-login",
				id: row.id,
				name: row.name,
				branchId: row.branch_id,
				login: row.login,
				password: SHOULD_SET_PASSWORD ? password : "",
				email: toLoginEmail(row.login),
				uid: userByLogin.id,
			};
		}
	}

	const created = await createAuthUserWithUniqueLogin(baseLogin);
	const existingUserById = await getUserById(created.uid);
	if (existingUserById) {
		let login = existingUserById.login || created.login;
		if (!existingUserById.login) {
			const updateUser = await supabase
				.from("users")
				.update({
					login,
					email: toLoginEmail(login),
					display_name: row.name,
					role: ENTITY_ROLE,
					branch_id: row.branch_id,
					auth_user_id: created.uid,
					deleted_at: null,
					archived_at: null,
				})
				.eq("org_id", ORG_ID)
				.eq("id", created.uid);
			ensureOk(updateUser, `users update failed for existing auth '${created.uid}'`);
		}

		await ensureUsernameRow(login, created.uid, row.branch_id);
		await updateSourceLogin(row.id, created.uid, login);
		const password = passwordForLogin(login);
		if (SHOULD_SET_PASSWORD) {
			await setAuthPassword(created.uid, password);
		}

		return {
			status: "linked-existing-auth",
			id: row.id,
			name: row.name,
			branchId: row.branch_id,
			login,
			password: SHOULD_SET_PASSWORD ? password : "",
			email: toLoginEmail(login),
			uid: created.uid,
		};
	}

	let userInserted = false;
	let usernameInserted = false;
	let sourceUpdated = false;

	try {
		const userInsert = await supabase.from("users").insert({
			id: created.uid,
			org_id: ORG_ID,
			role: ENTITY_ROLE,
			branch_id: row.branch_id,
			display_name: row.name,
			login: created.login,
			email: created.email,
			auth_user_id: created.uid,
			deleted_at: null,
			archived_at: null,
		});
		ensureOk(userInsert, `users insert failed for '${row.name}'`);
		userInserted = true;

		const usernameInsert = await supabase.from("usernames").insert({
			org_id: ORG_ID,
			login: created.login,
			user_id: created.uid,
			role: ENTITY_ROLE,
			branch_id: row.branch_id,
		});
		ensureOk(
			usernameInsert,
			`usernames insert failed for login '${created.login}'`,
		);
		usernameInserted = true;

		await updateSourceLogin(row.id, created.uid, created.login);
		sourceUpdated = true;

		return {
			status: "created",
			id: row.id,
			name: row.name,
			branchId: row.branch_id,
			login: created.login,
			password: created.password,
			email: created.email,
			uid: created.uid,
		};
	} catch (error) {
		if (sourceUpdated) {
			await supabase
				.from(SOURCE_TABLE)
				.update({ user_id: null, login: null })
				.eq("org_id", ORG_ID)
				.eq("id", row.id);
		}
		if (usernameInserted) {
			await supabase
				.from("usernames")
				.delete()
				.eq("org_id", ORG_ID)
				.eq("login", created.login);
		}
		if (userInserted) {
			await supabase
				.from("users")
				.delete()
				.eq("org_id", ORG_ID)
				.eq("id", created.uid);
		}
		if (!created.existingAuth) {
			await supabase.auth.admin.deleteUser(created.uid);
		}
		throw error;
	}
};

const main = async () => {
	const branchFilter = await getBranchFilter();
	const rows = await getSourceRows(branchFilter?.id ?? null);

	if (!rows.length) {
		console.log(
			`No ${SOURCE_TABLE} rows to process (${BRANCH_NAME || "all branches"}).`,
		);
		return;
	}

	const results = [];
	const failures = [];

	console.log(
		`Provisioning ${ENTITY_ROLE} logins for ${rows.length} rows (${BRANCH_NAME || "all branches"})...`,
	);
	if (SHOULD_SET_PASSWORD) {
		console.log("Password mode: login (password reset enabled)");
	}

	for (const row of rows) {
		try {
			// eslint-disable-next-line no-await-in-loop
			const result = await withRetry(
				() => provisionRow(row),
				`provision ${ENTITY_ROLE} row ${row.id}`,
				6,
			);
			results.push(result);
			console.log(`[${result.status}] ${row.id} | ${row.name} | ${result.login}`);
			// avoid API burst
			// eslint-disable-next-line no-await-in-loop
			await sleep(25);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			failures.push({ id: row.id, name: row.name, message });
			console.error(`[failed] ${row.id} | ${row.name} | ${message}`);
		}
	}

	const csvLines = [
		`${ENTITY_ID_COL},name,branch_id,login,password,email,user_id,status`,
		...results.map((row) =>
			[
				row.id,
				row.name,
				row.branchId,
				row.login,
				row.password,
				row.email,
				row.uid,
				row.status,
			]
				.map(toCsvCell)
				.join(","),
		),
	];
	fs.writeFileSync(OUTPUT_CSV_PATH, `${csvLines.join("\n")}\n`, "utf8");

	console.log("");
	console.log(`Total processed: ${rows.length}`);
	console.log(`Created: ${results.filter((x) => x.status === "created").length}`);
	console.log(
		`Skipped existing: ${results.filter((x) => x.status === "skipped-existing").length}`,
	);
	console.log(
		`Fixed existing: ${results.filter((x) => x.status.startsWith("fixed-")).length}`,
	);
	console.log(`Failed: ${failures.length}`);
	console.log(`Credentials CSV: ${OUTPUT_CSV_PATH}`);

	if (failures.length) process.exitCode = 1;
};

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
