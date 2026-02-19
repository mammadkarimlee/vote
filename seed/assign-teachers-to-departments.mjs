import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_ID = process.env.VITE_ORG_ID || "default";
const DEFAULT_BRANCH_NAME = process.env.STARS_BRANCH_NAME || "Stars Campusu";
const DEFAULT_FILE = "seed/teacher-department-assignments.csv";

const usage = `
Usage:
  node seed/assign-teachers-to-departments.mjs export [--branch "Branch Name"] [--file seed/teacher-department-assignments.csv]
  node seed/assign-teachers-to-departments.mjs apply  [--branch "Branch Name"] [--file seed/teacher-department-assignments.csv]

Notes:
  - export: Creates a template with current departments.
  - apply:  Reads template and updates teachers.department_id in bulk.
`.trim();

const [mode, ...argv] = process.argv.slice(2);

const readOption = (name, fallback) => {
	const prefix = `${name}=`;
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (token === name) {
			const next = argv[index + 1];
			if (next && !next.startsWith("--")) return next;
			return fallback;
		}
		if (token.startsWith(prefix)) {
			return token.slice(prefix.length);
		}
	}
	return fallback;
};

const branchName = readOption("--branch", DEFAULT_BRANCH_NAME);
const inputFile = readOption("--file", DEFAULT_FILE);
const filePath = path.isAbsolute(inputFile)
	? inputFile
	: path.join(ROOT_DIR, inputFile);

if (!mode || mode === "help" || mode === "--help" || mode === "-h") {
	console.log(usage);
	process.exit(0);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
	console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false },
});

const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const normalizeKey = (value) => normalize(value).toLowerCase();

const toCsvCell = (value) => {
	const text = String(value ?? "");
	if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
		return `"${text.replace(/"/g, "\"\"")}"`;
	}
	return text;
};

const findBranchId = async (name) => {
	const result = await supabase
		.from("branches")
		.select("id")
		.eq("org_id", ORG_ID)
		.eq("name", name)
		.maybeSingle();

	if (result.error) {
		throw new Error(`Failed to load branch: ${result.error.message}`);
	}
	if (!result.data?.id) {
		throw new Error(`Branch not found: "${name}"`);
	}

	return result.data.id;
};

const loadDepartments = async (branchId) => {
	const result = await supabase
		.from("departments")
		.select("id,name")
		.eq("org_id", ORG_ID)
		.eq("branch_id", branchId)
		.is("deleted_at", null)
		.order("name", { ascending: true });

	if (result.error) {
		throw new Error(`Failed to load departments: ${result.error.message}`);
	}

	return result.data ?? [];
};

const loadTeachers = async (branchId) => {
	const result = await supabase
		.from("teachers")
		.select("id,name,department_id")
		.eq("org_id", ORG_ID)
		.eq("branch_id", branchId)
		.is("deleted_at", null)
		.order("name", { ascending: true });

	if (result.error) {
		throw new Error(`Failed to load teachers: ${result.error.message}`);
	}

	return result.data ?? [];
};

const exportTemplate = async () => {
	const branchId = await findBranchId(branchName);
	const [departments, teachers] = await Promise.all([
		loadDepartments(branchId),
		loadTeachers(branchId),
	]);

	if (teachers.length === 0) {
		throw new Error(`No teachers found in branch "${branchName}".`);
	}

	const departmentNameById = new Map(
		departments.map((department) => [department.id, department.name]),
	);

	const header = [
		"teacher_id",
		"teacher_name",
		"current_department",
		"new_department",
	];
	const lines = [header.join(",")];

	for (const teacher of teachers) {
		const currentDepartment =
			departmentNameById.get(teacher.department_id) ?? "";
		lines.push(
			[
				teacher.id,
				teacher.name ?? "",
				currentDepartment,
				currentDepartment,
			]
				.map(toCsvCell)
				.join(","),
		);
	}

	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, `\uFEFF${lines.join("\n")}\n`, "utf8");
	console.log(`Template exported: ${filePath}`);
	console.log(
		`Rows: ${teachers.length}. Fill "new_department", then run apply.`,
	);
};

const readRows = (fullPath) => {
	const workbook = XLSX.readFile(fullPath, {
		raw: false,
		cellText: true,
	});
	const sheetName = workbook.SheetNames[0];
	const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
		defval: "",
	});
	return rows.map((row) => {
		const normalized = {};
		Object.entries(row).forEach(([key, value]) => {
			normalized[normalizeKey(key)] = normalize(value);
		});
		return normalized;
	});
};

const pick = (row, keys) => {
	for (const key of keys) {
		const value = row[key];
		if (value) return value;
	}
	return "";
};

const applyTemplate = async () => {
	if (!fs.existsSync(filePath)) {
		throw new Error(`File not found: ${filePath}`);
	}

	const branchId = await findBranchId(branchName);
	const [teachers, departments] = await Promise.all([
		loadTeachers(branchId),
		loadDepartments(branchId),
	]);

	const rows = readRows(filePath);
	if (rows.length === 0) {
		throw new Error("Input file has no rows.");
	}

	const teacherById = new Map(teachers.map((teacher) => [teacher.id, teacher]));
	const teacherIdsByName = new Map();
	for (const teacher of teachers) {
		const key = normalizeKey(teacher.name);
		const existing = teacherIdsByName.get(key) ?? [];
		existing.push(teacher.id);
		teacherIdsByName.set(key, existing);
	}

	const departmentByNameKey = new Map(
		departments.map((department) => [normalizeKey(department.name), department]),
	);

	let updated = 0;
	let skipped = 0;
	let failed = 0;
	let createdDepartments = 0;

	for (const row of rows) {
		const teacherIdFromFile = pick(row, ["teacher_id", "id"]);
		const teacherNameFromFile = pick(row, ["teacher_name", "name"]);
		const newDepartmentName = pick(row, [
			"new_department",
			"department",
			"department_name",
		]);

		if (!newDepartmentName) {
			skipped += 1;
			continue;
		}

		let teacherId = teacherIdFromFile;
		if (!teacherId && teacherNameFromFile) {
			const matches = teacherIdsByName.get(normalizeKey(teacherNameFromFile)) ?? [];
			if (matches.length === 1) {
				teacherId = matches[0];
			} else if (matches.length > 1) {
				console.warn(
					`Ambiguous teacher name (multiple matches): "${teacherNameFromFile}"`,
				);
				failed += 1;
				continue;
			}
		}

		if (!teacherId) {
			console.warn(`Missing teacher identity in row: ${JSON.stringify(row)}`);
			failed += 1;
			continue;
		}

		const teacher = teacherById.get(teacherId);
		if (!teacher) {
			console.warn(`Teacher not found in selected branch: ${teacherId}`);
			failed += 1;
			continue;
		}

		const departmentKey = normalizeKey(newDepartmentName);
		let department = departmentByNameKey.get(departmentKey);

		if (!department) {
			const newDepartmentId = crypto.randomUUID();
			const insertResult = await supabase.from("departments").insert({
				id: newDepartmentId,
				org_id: ORG_ID,
				branch_id: branchId,
				name: newDepartmentName,
			});

			if (insertResult.error) {
				console.warn(
					`Department create failed (${newDepartmentName}): ${insertResult.error.message}`,
				);
				failed += 1;
				continue;
			}

			department = { id: newDepartmentId, name: newDepartmentName };
			departmentByNameKey.set(departmentKey, department);
			createdDepartments += 1;
		}

		if (teacher.department_id === department.id) {
			skipped += 1;
			continue;
		}

		const updateResult = await supabase
			.from("teachers")
			.update({ department_id: department.id })
			.eq("org_id", ORG_ID)
			.eq("id", teacher.id);

		if (updateResult.error) {
			console.warn(
				`Teacher update failed (${teacher.id}): ${updateResult.error.message}`,
			);
			failed += 1;
			continue;
		}

		teacherById.set(teacher.id, {
			...teacher,
			department_id: department.id,
		});
		updated += 1;
	}

	console.log(
		`Done. Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}, Created departments: ${createdDepartments}`,
	);

	if (failed > 0) {
		process.exit(1);
	}
};

try {
	if (mode === "export") {
		await exportTemplate();
	} else if (mode === "apply") {
		await applyTemplate();
	} else {
		console.error(`Unknown mode: ${mode}`);
		console.log(usage);
		process.exit(1);
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}

