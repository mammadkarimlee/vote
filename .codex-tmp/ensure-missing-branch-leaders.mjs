import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const ORG_ID = process.env.VITE_ORG_ID || "default";
const YEAR = 2026;
const LOGIN_EMAIL_DOMAIN =
	process.env.LOGIN_EMAIL_DOMAIN ||
	process.env.VITE_LOGIN_EMAIL_DOMAIN ||
	"vote.local";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
	throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(supabaseUrl, serviceKey, {
	auth: { persistSession: false, autoRefreshToken: false },
});

const leadersToCreate = [
	{
		name: "Alcan Haciyev Təşkilat Oğlu",
		branchCode: "NES",
		role: "manager",
	},
	{
		name: "Məmməd Məmmədli Əhməd Oğlu",
		branchCode: "QUR",
		role: "manager",
	},
	{
		name: "Yaşar Zeynalov İsax Oğlu",
		branchCode: "AZA",
		role: "manager",
	},
	{
		name: "Elmin Yaqubbəyli Vaqif Oğlu",
		branchCode: "XET",
		role: "manager",
	},
];

const existingStarsLeaders = [
	{
		userId: "8199772c-dbf0-4fce-8c81-1109c2e0ee1d",
		name: "Zamilə Mustafayeva Məhərrəm qızı",
		branchCode: "STR",
	},
];

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
	String(value || "")
		.split("")
		.map((char) => AZ_CHAR_MAP[char] ?? char)
		.join("")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]/g, "");

const buildLoginFromName = (fullName) => {
	const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
	const first = parts[0] ?? "";
	const surname = parts[1] ?? parts.at(-1) ?? "";
	return (
		`${normalizeLoginPart(first).slice(0, 3)}${normalizeLoginPart(surname).slice(0, 2)}` ||
		normalizeLoginPart(fullName).slice(0, 6) ||
		"user"
	);
};

const toLoginEmail = (login) => `${login.toLowerCase()}@${LOGIN_EMAIL_DOMAIN}`;

const fetchAll = async (table, queryFn = (query) => query) => {
	const rows = [];
	let from = 0;
	while (true) {
		let query = supabase
			.from(table)
			.select("*")
			.eq("org_id", ORG_ID)
			.range(from, from + 999);
		query = queryFn(query);
		const { data, error } = await query;
		if (error) throw new Error(`${table}: ${error.message}`);
		rows.push(...(data || []));
		if (!data || data.length < 1000) break;
		from += 1000;
	}
	return rows;
};

const getUniqueLogin = async (baseLogin) => {
	let counter = 0;
	while (counter < 1000) {
		const login = counter === 0 ? baseLogin : `${baseLogin}${counter}`;
		const [{ data: username }, { data: user }] = await Promise.all([
			supabase
				.from("usernames")
				.select("login")
				.eq("org_id", ORG_ID)
				.eq("login", login)
				.maybeSingle(),
			supabase
				.from("users")
				.select("id")
				.eq("org_id", ORG_ID)
				.eq("login", login)
				.maybeSingle(),
		]);
		if (!username && !user) return login;
		counter += 1;
	}
	throw new Error(`Unique login not available for ${baseLogin}`);
};

const ensureManagementAssignment = async ({ managerId, branchId }) => {
	const { data: existing, error } = await supabase
		.from("management_assignments")
		.select("id")
		.eq("org_id", ORG_ID)
		.eq("manager_id", managerId)
		.eq("branch_id", branchId)
		.eq("year", YEAR)
		.is("department_id", null)
		.is("deleted_at", null)
		.maybeSingle();
	if (error) throw new Error(`management assignment lookup: ${error.message}`);
	if (existing) return { status: "exists", id: existing.id };
	if (!APPLY) return { status: "would-create" };
	const { data, error: insertError } = await supabase
		.from("management_assignments")
		.insert({
			org_id: ORG_ID,
			manager_id: managerId,
			branch_id: branchId,
			department_id: null,
			year: YEAR,
		})
		.select("id")
		.single();
	if (insertError) {
		throw new Error(`management assignment insert: ${insertError.message}`);
	}
	return { status: "created", id: data.id };
};

const createLeaderUser = async ({ name, branchId, role }) => {
	const { data: existingByName, error: existingError } = await supabase
		.from("users")
		.select("*")
		.eq("org_id", ORG_ID)
		.eq("display_name", name)
		.is("deleted_at", null)
		.maybeSingle();
	if (existingError) throw new Error(`users lookup: ${existingError.message}`);
	if (existingByName) {
		return {
			status: "exists",
			userId: existingByName.id,
			login: existingByName.login,
			password: "",
		};
	}

	const login = await getUniqueLogin(buildLoginFromName(name));
	const email = toLoginEmail(login);
	const password = login;

	if (!APPLY) {
		return { status: "would-create", userId: null, login, password };
	}

	const { data: authUser, error: authError } =
		await supabase.auth.admin.createUser({
			email,
			password,
			email_confirm: true,
		});
	if (authError || !authUser.user) {
		throw new Error(`auth create failed for ${name}: ${authError?.message}`);
	}

	const uid = authUser.user.id;
	let userInserted = false;
	let usernameInserted = false;
	try {
		const { error: userError } = await supabase.from("users").insert({
			id: uid,
			org_id: ORG_ID,
			role,
			branch_id: branchId,
			display_name: name,
			login,
			email,
			auth_user_id: uid,
			deleted_at: null,
			archived_at: null,
		});
		if (userError) throw new Error(`users insert: ${userError.message}`);
		userInserted = true;

		const { error: usernameError } = await supabase.from("usernames").insert({
			org_id: ORG_ID,
			login,
			user_id: uid,
			role,
			branch_id: branchId,
		});
		if (usernameError) throw new Error(`usernames insert: ${usernameError.message}`);
		usernameInserted = true;

		return { status: "created", userId: uid, login, password };
	} catch (error) {
		if (usernameInserted) {
			await supabase
				.from("usernames")
				.delete()
				.eq("org_id", ORG_ID)
				.eq("login", login);
		}
		if (userInserted) {
			await supabase.from("users").delete().eq("org_id", ORG_ID).eq("id", uid);
		}
		await supabase.auth.admin.deleteUser(uid);
		throw error;
	}
};

const main = async () => {
	const [branches, users, usernames, managementAssignments] = await Promise.all([
		fetchAll("branches", (query) => query.is("deleted_at", null)),
		fetchAll("users", (query) => query.is("deleted_at", null)),
		fetchAll("usernames"),
		fetchAll("management_assignments", (query) => query.is("deleted_at", null)),
	]);
	const branchByCode = new Map(branches.map((branch) => [branch.code, branch]));

	const backupDir = path.join(
		".codex-tmp",
		"missing-branch-leaders",
		new Date().toISOString().replace(/[:.]/g, "-"),
	);
	await fs.mkdir(backupDir, { recursive: true });
	await fs.writeFile(
		path.join(backupDir, "before.json"),
		JSON.stringify({ branches, users, usernames, managementAssignments }, null, 2),
		"utf8",
	);

	console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
	console.log(`Backup: ${backupDir}`);

	const credentials = [];
	for (const leader of leadersToCreate) {
		const branch = branchByCode.get(leader.branchCode);
		if (!branch) throw new Error(`Branch not found: ${leader.branchCode}`);
		const created = await createLeaderUser({
			name: leader.name,
			branchId: branch.id,
			role: leader.role,
		});
		const managerId = created.userId;
		const assignment = managerId
			? await ensureManagementAssignment({ managerId, branchId: branch.id })
			: { status: "would-create" };
		console.log(
			`${leader.name} | ${branch.name} | user=${created.status} | login=${created.login} | assignment=${assignment.status}`,
		);
		credentials.push({
			name: leader.name,
			branch: branch.name,
			role: leader.role,
			login: created.login,
			password: created.password || created.login || "",
			userId: managerId || "",
			userStatus: created.status,
			assignmentStatus: assignment.status,
		});
	}

	for (const leader of existingStarsLeaders) {
		const branch = branchByCode.get(leader.branchCode);
		if (!branch) throw new Error(`Branch not found: ${leader.branchCode}`);
		const assignment = await ensureManagementAssignment({
			managerId: leader.userId,
			branchId: branch.id,
		});
		console.log(
			`${leader.name} | ${branch.name} | existing user | assignment=${assignment.status}`,
		);
	}

	if (APPLY) {
		const csv = [
			"name,branch,role,login,password,user_id,user_status,assignment_status",
			...credentials.map((row) =>
				[
					row.name,
					row.branch,
					row.role,
					row.login,
					row.password,
					row.userId,
					row.userStatus,
					row.assignmentStatus,
				]
					.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
					.join(","),
			),
		].join("\n");
		const csvPath = path.join(backupDir, "created-leader-logins.csv");
		await fs.writeFile(csvPath, `${csv}\n`, "utf8");
		console.log(`Credentials: ${csvPath}`);
	}
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
