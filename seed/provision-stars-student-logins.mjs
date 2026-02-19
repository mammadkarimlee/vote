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

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_ID = process.env.VITE_ORG_ID || "default";
const LOGIN_EMAIL_DOMAIN =
	process.env.LOGIN_EMAIL_DOMAIN ||
	process.env.VITE_LOGIN_EMAIL_DOMAIN ||
	"vote.local";
const BRANCH_NAME = process.env.STARS_BRANCH_NAME || "Stars Campusu";
const OUTPUT_CSV_PATH = path.join(__dirname, "stars-campus-student-logins.csv");

if (!SUPABASE_URL) {
	console.error("Missing SUPABASE_URL / VITE_SUPABASE_URL in environment.");
	process.exit(1);
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
	console.error("Missing SUPABASE_SERVICE_ROLE_KEY in environment.");
	console.error(
		"Set it in .env.local, then run: node seed/provision-stars-student-logins.mjs",
	);
	process.exit(1);
}

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

const toLoginEmail = (login) => `${login.toLowerCase()}@${LOGIN_EMAIL_DOMAIN}`;

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

const getBranchId = async () => {
	const branch = await supabase
		.from("branches")
		.select("id")
		.eq("org_id", ORG_ID)
		.eq("name", BRANCH_NAME)
		.maybeSingle();
	if (branch.error) throw new Error(branch.error.message);
	if (!branch.data?.id) {
		throw new Error(
			`Branch not found: '${BRANCH_NAME}'. Run stars seed sql first.`,
		);
	}
	return branch.data.id;
};

const getStarsStudents = async (branchId) => {
	const result = await supabase
		.from("students")
		.select("id, name, group_id, class_level, user_id, login")
		.eq("org_id", ORG_ID)
		.eq("branch_id", branchId)
		.ilike("id", "stars-student-%")
		.order("id");
	return ensureOk(result, "Failed to read students");
};

const createAuthUserWithUniqueLogin = async (baseLogin) => {
	let attempt = 0;
	while (attempt < 200) {
		const loginSeed = attempt === 0 ? baseLogin : `${baseLogin}${attempt}`;
		// eslint-disable-next-line no-await-in-loop
		const login = await ensureUniqueLogin(loginSeed);
		const email = toLoginEmail(login);
		const password = login;

		// eslint-disable-next-line no-await-in-loop
		const created = await supabase.auth.admin.createUser({
			email,
			password,
			email_confirm: true,
		});

		if (!created.error && created.data.user) {
			return {
				uid: created.data.user.id,
				login,
				email,
				password,
			};
		}

		if (!/already registered/i.test(created.error?.message ?? "")) {
			throw new Error(created.error?.message || "Auth user create failed");
		}

		attempt += 1;
	}

	throw new Error(`Could not create auth user for base login '${baseLogin}'`);
};

const provisionStudent = async (student, branchId) => {
	if (student.user_id && student.login) {
		return {
			status: "skipped-existing",
			studentId: student.id,
			name: student.name,
			login: student.login,
			password: "",
			email: "",
			uid: student.user_id,
		};
	}

	const baseLogin = buildLoginFromName(student.name);
	const created = await createAuthUserWithUniqueLogin(baseLogin);

	let userInserted = false;
	let usernameInserted = false;
	let studentUpdated = false;

	try {
		const userInsert = await supabase.from("users").insert({
			id: created.uid,
			org_id: ORG_ID,
			role: "student",
			branch_id: branchId,
			display_name: student.name,
			login: created.login,
			email: created.email,
			auth_user_id: created.uid,
			deleted_at: null,
			archived_at: null,
		});
		ensureOk(userInsert, `users insert failed for '${student.name}'`);
		userInserted = true;

		const usernameInsert = await supabase.from("usernames").insert({
			org_id: ORG_ID,
			login: created.login,
			user_id: created.uid,
			role: "student",
			branch_id: branchId,
		});
		ensureOk(
			usernameInsert,
			`usernames insert failed for login '${created.login}'`,
		);
		usernameInserted = true;

		const studentUpdate = await supabase
			.from("students")
			.update({
				user_id: created.uid,
				login: created.login,
				deleted_at: null,
				archived_at: null,
			})
			.eq("org_id", ORG_ID)
			.eq("id", student.id);
		ensureOk(studentUpdate, `students update failed for '${student.id}'`);
		studentUpdated = true;

		return {
			status: "created",
			studentId: student.id,
			name: student.name,
			login: created.login,
			password: created.password,
			email: created.email,
			uid: created.uid,
		};
	} catch (error) {
		if (studentUpdated) {
			await supabase
				.from("students")
				.update({ user_id: null, login: null })
				.eq("org_id", ORG_ID)
				.eq("id", student.id);
		}
		if (usernameInserted) {
			await supabase
				.from("usernames")
				.delete()
				.eq("org_id", ORG_ID)
				.eq("login", created.login);
		}
		if (userInserted) {
			await supabase.from("users").delete().eq("org_id", ORG_ID).eq("id", created.uid);
		}
		await supabase.auth.admin.deleteUser(created.uid);
		throw error;
	}
};

const main = async () => {
	const branchId = await getBranchId();
	const students = await getStarsStudents(branchId);

	if (!students.length) {
		console.log("No Stars students found. Seed students first.");
		return;
	}

	const results = [];
	const failures = [];

	for (const student of students) {
		try {
			// eslint-disable-next-line no-await-in-loop
			const result = await provisionStudent(student, branchId);
			results.push(result);
			console.log(
				`[${result.status}] ${result.studentId} | ${result.name} | ${result.login}`,
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			failures.push({ studentId: student.id, name: student.name, message });
			console.error(`[failed] ${student.id} | ${student.name} | ${message}`);
		}
	}

	const csvLines = [
		"student_id,name,login,password,email,user_id,status",
		...results.map((row) =>
			[
				row.studentId,
				row.name,
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
	console.log(`Total: ${students.length}`);
	console.log(`Created: ${results.filter((x) => x.status === "created").length}`);
	console.log(
		`Skipped existing: ${results.filter((x) => x.status === "skipped-existing").length}`,
	);
	console.log(`Failed: ${failures.length}`);
	console.log(`Credentials CSV: ${OUTPUT_CSV_PATH}`);

	if (failures.length) {
		process.exitCode = 1;
	}
};

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});

