import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(ROOT_DIR, ".env.local") });
dotenv.config({ path: path.join(ROOT_DIR, ".env"), override: false });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_ID = process.env.VITE_ORG_ID || "default";
const DEFAULT_BRANCH_NAME = process.env.STARS_BRANCH_NAME || "Stars Campusu";
const DEFAULT_FILE = path.join(__dirname, "teacher-name-fixes.csv");

const usage = `
Usage:
  node seed/fix-teacher-names.mjs export [--branch "Branch Name"] [--file seed/teacher-name-fixes.csv]
  node seed/fix-teacher-names.mjs apply [--file seed/teacher-name-fixes.csv]

Notes:
  - export: Creates a CSV template from DB.
  - apply:  Reads CSV and updates teachers.name/first_name/last_name and users.display_name.
`.trim();

const [mode, ...argv] = process.argv.slice(2);

const readOption = (name, fallback) => {
	const longPrefix = `${name}=`;
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (token === name) {
			const next = argv[index + 1];
			if (next && !next.startsWith("--")) return next;
			return fallback;
		}
		if (token.startsWith(longPrefix)) {
			return token.slice(longPrefix.length);
		}
	}
	return fallback;
};

const resolveFilePath = (value) =>
	path.isAbsolute(value) ? value : path.join(ROOT_DIR, value);

const branchName = readOption("--branch", DEFAULT_BRANCH_NAME);
const filePath = resolveFilePath(readOption("--file", DEFAULT_FILE));

if (!mode || mode === "help" || mode === "--help" || mode === "-h") {
	console.log(usage);
	process.exit(0);
}

if (!SUPABASE_URL) {
	console.error("Missing SUPABASE_URL / VITE_SUPABASE_URL.");
	process.exit(1);
}

if (!SERVICE_ROLE_KEY) {
	console.error("Missing SUPABASE_SERVICE_ROLE_KEY.");
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false },
});

const toCsvCell = (value) => {
	if (value === null || value === undefined) return "";
	const text = String(value);
	if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
		return `"${text.replace(/"/g, "\"\"")}"`;
	}
	return text;
};

const normalize = (value) => String(value ?? "").trim();

const compactSpaces = (value) => value.replace(/\s+/g, " ").trim();

const toKeyMap = (row) => {
	const mapped = {};
	Object.entries(row).forEach(([key, value]) => {
		mapped[String(key).trim().toLowerCase()] = normalize(value);
	});
	return mapped;
};

const pickFirst = (map, keys) => {
	for (const key of keys) {
		const value = map[key];
		if (value) return value;
	}
	return "";
};

const loadTeachersInBranch = async (branchId) => {
	const result = await supabase
		.from("teachers")
		.select("id,name,first_name,last_name,user_id")
		.eq("org_id", ORG_ID)
		.eq("branch_id", branchId)
		.is("deleted_at", null)
		.order("name", { ascending: true });

	if (result.error) {
		throw new Error(`Failed to read teachers: ${result.error.message}`);
	}

	return result.data ?? [];
};

const exportTemplate = async () => {
	const branchResult = await supabase
		.from("branches")
		.select("id")
		.eq("org_id", ORG_ID)
		.eq("name", branchName)
		.maybeSingle();

	if (branchResult.error) {
		throw new Error(`Failed to load branch: ${branchResult.error.message}`);
	}
	if (!branchResult.data?.id) {
		throw new Error(`Branch not found: "${branchName}"`);
	}

	const teachers = await loadTeachersInBranch(branchResult.data.id);
	if (teachers.length === 0) {
		throw new Error(`No teachers found in branch "${branchName}".`);
	}

	const header = [
		"teacher_id",
		"current_name",
		"current_first_name",
		"current_last_name",
		"new_name",
		"new_first_name",
		"new_last_name",
	];

	const lines = [header.join(",")];
	for (const teacher of teachers) {
		const currentName = teacher.name ?? "";
		const currentFirstName = teacher.first_name ?? "";
		const currentLastName = teacher.last_name ?? "";
		lines.push(
			[
				teacher.id,
				currentName,
				currentFirstName,
				currentLastName,
				currentName,
				currentFirstName,
				currentLastName,
			]
				.map(toCsvCell)
				.join(","),
		);
	}

	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, `\uFEFF${lines.join("\n")}\n`, "utf8");
	console.log(`Template exported: ${filePath}`);
	console.log(
		"Edit new_name/new_first_name/new_last_name in UTF-8, then run apply.",
	);
};

const applyFixes = async () => {
	if (!fs.existsSync(filePath)) {
		throw new Error(`File not found: ${filePath}`);
	}

	const workbook = XLSX.readFile(filePath, { raw: false, cellText: true });
	const firstSheet = workbook.SheetNames[0];
	const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], {
		defval: "",
	});

	if (rows.length === 0) {
		throw new Error("Input file has no data rows.");
	}

	const parsed = rows
		.map((row) => {
			const map = toKeyMap(row);
			const teacherId = pickFirst(map, ["teacher_id", "id", "teacherid"]);
			const nextFirst = pickFirst(map, [
				"new_first_name",
				"first_name",
				"current_first_name",
			]);
			const nextLast = pickFirst(map, [
				"new_last_name",
				"last_name",
				"current_last_name",
			]);
			const nextNameRaw = pickFirst(map, [
				"new_name",
				"name",
				"current_name",
			]);
			const nextName =
				compactSpaces(nextNameRaw) ||
				compactSpaces(`${nextFirst} ${nextLast}`);

			return {
				teacherId: normalize(teacherId),
				name: nextName,
				firstName: compactSpaces(nextFirst),
				lastName: compactSpaces(nextLast),
			};
		})
		.filter((row) => row.teacherId && row.name);

	if (parsed.length === 0) {
		throw new Error("No valid rows found (teacher_id + name are required).");
	}

	const uniqueByTeacherId = new Map();
	for (const row of parsed) {
		uniqueByTeacherId.set(row.teacherId, row);
	}
	const updates = Array.from(uniqueByTeacherId.values());
	const teacherIds = updates.map((row) => row.teacherId);

	const teacherResult = await supabase
		.from("teachers")
		.select("id,name,first_name,last_name,user_id")
		.eq("org_id", ORG_ID)
		.in("id", teacherIds);

	if (teacherResult.error) {
		throw new Error(`Failed to load current teachers: ${teacherResult.error.message}`);
	}

	const existingTeachers = teacherResult.data ?? [];
	const existingMap = new Map(existingTeachers.map((item) => [item.id, item]));

	let updated = 0;
	let skipped = 0;
	let failed = 0;

	for (const row of updates) {
		const existing = existingMap.get(row.teacherId);
		if (!existing) {
			console.warn(`Skip missing teacher: ${row.teacherId}`);
			skipped += 1;
			continue;
		}

		const nextFirstName = row.firstName || null;
		const nextLastName = row.lastName || null;

		const isSame =
			normalize(existing.name) === normalize(row.name) &&
			normalize(existing.first_name) === normalize(nextFirstName) &&
			normalize(existing.last_name) === normalize(nextLastName);

		if (isSame) {
			skipped += 1;
			continue;
		}

		const teacherUpdate = await supabase
			.from("teachers")
			.update({
				name: row.name,
				first_name: nextFirstName,
				last_name: nextLastName,
			})
			.eq("org_id", ORG_ID)
			.eq("id", row.teacherId);

		if (teacherUpdate.error) {
			console.error(
				`Teacher update failed (${row.teacherId}): ${teacherUpdate.error.message}`,
			);
			failed += 1;
			continue;
		}

		if (existing.user_id) {
			const userUpdate = await supabase
				.from("users")
				.update({ display_name: row.name })
				.eq("org_id", ORG_ID)
				.eq("id", existing.user_id);

			if (userUpdate.error) {
				console.warn(
					`User display_name update failed (${existing.user_id}): ${userUpdate.error.message}`,
				);
			}
		}

		updated += 1;
	}

	console.log(`Done. Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`);
	if (failed > 0) {
		process.exit(1);
	}
};

try {
	if (mode === "export") {
		await exportTemplate();
	} else if (mode === "apply") {
		await applyFixes();
	} else {
		console.error(`Unknown mode: ${mode}`);
		console.log(usage);
		process.exit(1);
	}
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(message);
	process.exit(1);
}
