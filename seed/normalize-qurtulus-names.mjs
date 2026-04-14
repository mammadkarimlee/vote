import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const argv = process.argv.slice(2);
const shouldApply = argv.includes("apply") || argv.includes("--apply");

dotenv.config({ path: path.join(ROOT_DIR, ".env.local") });
dotenv.config({ path: path.join(ROOT_DIR, ".env"), override: false });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_ID = process.env.VITE_ORG_ID || "default";

const FILES = {
	teacherBranch: path.join(__dirname, "teacher-logins-qurtulu-campusu.csv"),
	teacherAll: path.join(__dirname, "teacher-logins-all.csv"),
	studentBranch: path.join(__dirname, "student-logins-qurtulu-campusu.csv"),
	studentLegacy: path.join(__dirname, "student-logins-qurtulus.csv"),
	studentAll: path.join(__dirname, "student-logins-all.csv"),
	sqlOutput: path.join(__dirname, "qurtulus-name-normalization.seed.sql"),
};

const TEACHER_OVERRIDES = new Map([
	["abseron-teacher-sakir-huseyn-vahid-oglu", "Şakir Hüseynli"],
	["abseron-teacher-servinaz-ceferova-ilham-qizi", "Sərvinaz Cəfərli"],
	["abseron-teacher-zerine-zubahirova-mayiz-qizi", "Zərinə Zübahirova"],
]);

const STUDENT_OVERRIDES = new Map([
	["qurtulus-campusu-student-10a3-allahverdiyeva-omer", "Allahverdiyev Ömər"],
	["qurtulus-campusu-student-9a3-haci-serdar-behruz", "Hacı Sərdar"],
]);

const stripBom = (value) => value.replace(/^\uFEFF/, "");

const splitCsvLine = (line) => {
	const cells = [];
	let current = "";
	let inQuotes = false;

	for (let index = 0; index < line.length; index += 1) {
		const char = line[index];

		if (char === "\"") {
			if (inQuotes && line[index + 1] === "\"") {
				current += "\"";
				index += 1;
				continue;
			}
			inQuotes = !inQuotes;
			continue;
		}

		if (char === "," && !inQuotes) {
			cells.push(current);
			current = "";
			continue;
		}

		current += char;
	}

	cells.push(current);
	return cells;
};

const escapeCsvCell = (value) => {
	const text = String(value ?? "");
	if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
		return `"${text.replace(/"/g, "\"\"")}"`;
	}
	return text;
};

const readCsv = (filePath) => {
	const raw = stripBom(fs.readFileSync(filePath, "utf8"));
	const lines = raw.split(/\r?\n/).filter((line) => line.length > 0);
	if (lines.length === 0) {
		return { headers: [], rows: [] };
	}

	const headers = splitCsvLine(lines[0]);
	const rows = lines.slice(1).map((line) => {
		const values = splitCsvLine(line);
		return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
	});

	return { headers, rows };
};

const writeCsv = (filePath, headers, rows) => {
	const lines = [
		headers.map((header) => escapeCsvCell(header)).join(","),
		...rows.map((row) =>
			headers.map((header) => escapeCsvCell(row[header] ?? "")).join(","),
		),
	];
	fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
};

const compactSpaces = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const keepFirstTwoParts = (value) => {
	const parts = compactSpaces(value).split(" ").filter(Boolean);
	if (parts.length <= 2) return parts.join(" ");
	return parts.slice(0, 2).join(" ");
};

const splitTeacherName = (value) => {
	const parts = compactSpaces(value).split(" ").filter(Boolean);
	return {
		firstName: parts[0] ?? "",
		lastName: parts.slice(1).join(" "),
	};
};

const escapeSql = (value) => String(value ?? "").replace(/'/g, "''");

const runInBatches = async (items, batchSize, handler) => {
	for (let index = 0; index < items.length; index += batchSize) {
		await Promise.all(items.slice(index, index + batchSize).map(handler));
	}
};

const supabase = shouldApply
	? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
			auth: { persistSession: false, autoRefreshToken: false },
		})
	: null;

const updateRecord = async (table, id, payload) => {
	const { error } = await supabase.from(table).update(payload).eq("org_id", ORG_ID).eq("id", id);
	if (error) {
		throw new Error(`Failed to update ${table}:${id}: ${error.message}`);
	}
};

const normalizeTeacherRows = (rows) =>
	rows.map((row) => {
		const teacherId = row.teacher_id;
		const normalizedName =
			TEACHER_OVERRIDES.get(teacherId) ?? keepFirstTwoParts(row.name);
		const { firstName, lastName } = splitTeacherName(normalizedName);

		return {
			...row,
			name: normalizedName,
			__normalizedName: normalizedName,
			__normalizedFirstName: firstName,
			__normalizedLastName: lastName,
		};
	});

const normalizeStudentRows = (rows) =>
	rows.map((row) => {
		const studentId = row.student_id;
		const normalizedName =
			STUDENT_OVERRIDES.get(studentId) ?? keepFirstTwoParts(row.name);

		return {
			...row,
			name: normalizedName,
			__normalizedName: normalizedName,
		};
	});

const syncRowsById = (rows, idField, normalizedById) =>
	rows.map((row) => {
		const normalized = normalizedById.get(row[idField]);
		if (!normalized) return row;
		return {
			...row,
			name: normalized.__normalizedName,
		};
	});

const teacherBranchCsv = readCsv(FILES.teacherBranch);
const teacherBranchRows = normalizeTeacherRows(teacherBranchCsv.rows);
const teacherById = new Map(teacherBranchRows.map((row) => [row.teacher_id, row]));

const studentBranchCsv = readCsv(FILES.studentBranch);
const studentBranchRows = normalizeStudentRows(studentBranchCsv.rows);
const studentById = new Map(studentBranchRows.map((row) => [row.student_id, row]));

writeCsv(FILES.teacherBranch, teacherBranchCsv.headers, teacherBranchRows);
writeCsv(
	FILES.teacherAll,
	readCsv(FILES.teacherAll).headers,
	syncRowsById(readCsv(FILES.teacherAll).rows, "teacher_id", teacherById),
);

writeCsv(FILES.studentBranch, studentBranchCsv.headers, studentBranchRows);
writeCsv(
	FILES.studentLegacy,
	readCsv(FILES.studentLegacy).headers,
	syncRowsById(readCsv(FILES.studentLegacy).rows, "student_id", studentById),
);
writeCsv(
	FILES.studentAll,
	readCsv(FILES.studentAll).headers,
	syncRowsById(readCsv(FILES.studentAll).rows, "student_id", studentById),
);

const sqlLines = [
	"-- Qurtulus name normalization",
	"-- Generated by seed/normalize-qurtulus-names.mjs",
	"",
	"begin;",
	"",
	"-- Teachers",
];

teacherBranchRows.forEach((row) => {
	sqlLines.push(
		`update public.teachers`,
		`   set name = '${escapeSql(row.__normalizedName)}',`,
		`       first_name = '${escapeSql(row.__normalizedFirstName)}',`,
		`       last_name = '${escapeSql(row.__normalizedLastName)}'`,
		` where org_id = '${escapeSql(ORG_ID)}' and id = '${escapeSql(row.teacher_id)}';`,
	);

	if (row.user_id) {
		sqlLines.push(
			`update public.users`,
			`   set display_name = '${escapeSql(row.__normalizedName)}'`,
			` where org_id = '${escapeSql(ORG_ID)}' and id = '${escapeSql(row.user_id)}';`,
		);
	}

	sqlLines.push("");
});

sqlLines.push("-- Students", "");

studentBranchRows.forEach((row) => {
	sqlLines.push(
		`update public.students`,
		`   set name = '${escapeSql(row.__normalizedName)}'`,
		` where org_id = '${escapeSql(ORG_ID)}' and id = '${escapeSql(row.student_id)}';`,
	);

	if (row.user_id) {
		sqlLines.push(
			`update public.users`,
			`   set display_name = '${escapeSql(row.__normalizedName)}'`,
			` where org_id = '${escapeSql(ORG_ID)}' and id = '${escapeSql(row.user_id)}';`,
		);
	}

	sqlLines.push("");
});

sqlLines.push("commit;", "");

fs.writeFileSync(FILES.sqlOutput, sqlLines.join("\n"), "utf8");

console.log(
	`Normalized Qurtulus names: ${teacherBranchRows.length} teachers, ${studentBranchRows.length} students.`,
);
console.log(`Updated CSV files and generated SQL: ${path.relative(ROOT_DIR, FILES.sqlOutput)}`);

if (shouldApply) {
	if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
		throw new Error("Missing SUPABASE_URL / VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
	}

	const teacherOperations = [];
	for (const row of teacherBranchRows) {
		teacherOperations.push(() =>
			updateRecord("teachers", row.teacher_id, {
				name: row.__normalizedName,
				first_name: row.__normalizedFirstName,
				last_name: row.__normalizedLastName,
			}),
		);
		if (row.user_id) {
			teacherOperations.push(() =>
				updateRecord("users", row.user_id, { display_name: row.__normalizedName }),
			);
		}
	}

	const studentOperations = [];
	for (const row of studentBranchRows) {
		studentOperations.push(() =>
			updateRecord("students", row.student_id, { name: row.__normalizedName }),
		);
		if (row.user_id) {
			studentOperations.push(() =>
				updateRecord("users", row.user_id, { display_name: row.__normalizedName }),
			);
		}
	}

	await runInBatches(teacherOperations, 20, (run) => run());
	await runInBatches(studentOperations, 20, (run) => run());

	console.log(
		`Applied normalized names to Supabase for ${teacherBranchRows.length} teachers and ${studentBranchRows.length} students.`,
	);
}
