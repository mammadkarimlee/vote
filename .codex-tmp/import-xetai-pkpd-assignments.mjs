import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import xlsx from "xlsx";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const ORG_ID = process.env.VITE_ORG_ID || "default";
const YEAR = 2026;
const BRANCH_CODE = "XET";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey =
	process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
	throw new Error("Supabase environment variables are missing");
}

const supabase = createClient(supabaseUrl, supabaseKey);

const SHEET_GROUP_MAP = new Map([
	["8 A", "8A"],
	["8-9 R ( A qrup)", "8-9R-A"],
	["8-9 R( Bqrup)", "8-9R-B"],
	["9A ( I-IV)", "9A-I+IV"],
	["9A ( II-III)", "9A-II+III"],
	["10 A( I )", "10A-I"],
	["10 A ( II-III)", "10A-II+III"],
	["10A(IV)", "10A-IV"],
	["10 R ( I-IV)", "10R-I+IV"],
	["10 R ( II-III)", "10R-II+III"],
	["11 A", "11A"],
	["11R", "11R"],
]);

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

const normalize = (value) =>
	String(value || "")
		.split("")
		.map((char) => AZ_CHAR_MAP[char] ?? char)
		.join("")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();

const slugify = (value) => normalize(value).replace(/\s+/g, "-") || "subject";

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

const canonicalSubject = (value) => {
	const raw = clean(value);
	const key = normalize(raw);
	const map = new Map([
		["azerbaycan dili", "Azərbaycan dili"],
		["edebiyyat", "Ədəbiyyat"],
		["riyaziyyat", "Riyaziyyat"],
		["ingilis dili", "İngilis dili"],
		["informatika", "İnformatika"],
		["fizika", "Fizika"],
		["kimya", "Kimya"],
		["biologiya", "Biologiya"],
		["biologiya", "Biologiya"],
		["rus dili", "Rus dili"],
		["tarix", "Tarix"],
		["cografiya", "Coğrafiya"],
	]);
	return map.get(key) || raw;
};

const TEACHER_NAME_ALIASES = new Map([
	[normalize("Ağabalıyeva Nurcahan Elxan"), normalize("Ağabalayeva Nurcahan Elxan")],
	[normalize("Musayeva Tatyana Yuriyevna"), normalize("Musayeva Tatyana")],
	[normalize("İbrahimli Xəzəngül Bahadur"), normalize("İbrahimli Xəzəngül")],
]);

const teacherLookupKey = (value) => {
	const key = normalize(value);
	return TEACHER_NAME_ALIASES.get(key) || key;
};

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

const findWorkbookPath = async () => {
	const downloadsDir = "C:\\Users\\mamma\\Downloads";
	const files = await fs.readdir(downloadsDir, { withFileTypes: true });
	const matches = [];
	for (const file of files) {
		if (!file.isFile()) continue;
		const nameKey = normalize(file.name);
		if (
			nameKey.includes("pkpd siyahi") &&
			nameKey.includes("xetai") &&
			nameKey.endsWith("xlsx")
		) {
			const fullPath = path.join(downloadsDir, file.name);
			const stat = await fs.stat(fullPath);
			matches.push({ fullPath, mtime: stat.mtimeMs });
		}
	}
	matches.sort((a, b) => b.mtime - a.mtime);
	if (!matches[0]) throw new Error("Xətai PKPD workbook not found in Downloads");
	return matches[0].fullPath;
};

const parseWorkbook = (filePath) => {
	const workbook = xlsx.readFile(filePath);
	const rows = [];
	const warnings = [];

	for (const sheetName of workbook.SheetNames) {
		const groupName = SHEET_GROUP_MAP.get(sheetName);
		if (!groupName) {
			warnings.push(`Sheet skipped, group map missing: ${sheetName}`);
			continue;
		}
		const sheetRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
			header: 1,
			defval: "",
		});
		const headerIndex = sheetRows.findIndex((row) =>
			row.some((cell) => normalize(cell) === "muellim"),
		);
		if (headerIndex < 0) {
			warnings.push(`Header not found: ${sheetName}`);
			continue;
		}
		const header = sheetRows[headerIndex].map((cell) => normalize(cell));
		const teacherIndex = header.findIndex((cell) => cell === "muellim");
		const subjectIndex = header.findIndex((cell) => cell === "ixtisas");
		if (teacherIndex < 0 || subjectIndex < 0) {
			warnings.push(`Teacher/subject columns missing: ${sheetName}`);
			continue;
		}
		for (const row of sheetRows.slice(headerIndex + 1)) {
			const teacherName = clean(row[teacherIndex]);
			const subjectName = canonicalSubject(row[subjectIndex]);
			if (!teacherName || !subjectName) continue;
			rows.push({ groupName, teacherName, subjectName });
		}
	}

	const dedup = new Map();
	for (const row of rows) {
		dedup.set(
			`${row.groupName}|${normalize(row.teacherName)}|${normalize(row.subjectName)}`,
			row,
		);
	}
	return { rows: [...dedup.values()], warnings };
};

const main = async () => {
	const workbookPath = await findWorkbookPath();
	const { rows: parsedRows, warnings } = parseWorkbook(workbookPath);
	const [branches, teachers, groups, subjects, departments, assignments] =
		await Promise.all([
			fetchAll("branches", (query) =>
				query.eq("code", BRANCH_CODE).is("deleted_at", null),
			),
			fetchAll("teachers", (query) => query.is("deleted_at", null)),
			fetchAll("groups", (query) => query.is("deleted_at", null)),
			fetchAll("subjects", (query) => query.is("deleted_at", null)),
			fetchAll("departments", (query) => query.is("deleted_at", null)),
			fetchAll("teaching_assignments", (query) =>
				query.eq("year", YEAR).is("deleted_at", null),
			),
		]);

	const branch = branches[0];
	if (!branch) throw new Error("Xətai branch not found");
	const branchTeachers = teachers.filter(
		(teacher) =>
			teacher.branch_id === branch.id || (teacher.branch_ids || []).includes(branch.id),
	);
	const teacherByName = new Map(
		branchTeachers.map((teacher) => [teacherLookupKey(teacher.name), teacher]),
	);
	const groupByName = new Map(
		groups
			.filter((group) => group.branch_id === branch.id)
			.map((group) => [group.name, group]),
	);
	let defaultDepartment = departments.find(
		(department) =>
			department.branch_id === branch.id &&
			["ümumi", "umumi"].includes(normalize(department.name)),
	);
	if (!defaultDepartment) {
		throw new Error("Xətai default department not found");
	}

	const subjectByName = new Map(
		subjects.map((subject) => [normalize(subject.name), subject]),
	);
	const existingAssignmentKeys = new Set(
		assignments
			.filter((assignment) => assignment.branch_id === branch.id)
			.map(
				(assignment) =>
					`${assignment.teacher_id}|${assignment.group_id}|${assignment.subject_id}`,
			),
	);

	const missingTeachers = new Map();
	const missingGroups = new Set();
	const subjectRowsToCreate = [];
	const assignmentRowsToCreate = [];

	for (const row of parsedRows) {
		const teacher = teacherByName.get(teacherLookupKey(row.teacherName));
		const group = groupByName.get(row.groupName);
		if (!teacher) {
			missingTeachers.set(row.teacherName, row);
			continue;
		}
		if (!group) {
			missingGroups.add(row.groupName);
			continue;
		}
		let subject = subjectByName.get(normalize(row.subjectName));
		if (!subject) {
			subject = {
				id: `xetai-subject-${slugify(row.subjectName)}`,
				org_id: ORG_ID,
				name: row.subjectName,
				code: slugify(row.subjectName),
				department_id: defaultDepartment.id,
			};
			subjectByName.set(normalize(row.subjectName), subject);
			subjectRowsToCreate.push(subject);
		}
		const key = `${teacher.id}|${group.id}|${subject.id}`;
		if (existingAssignmentKeys.has(key)) continue;
		existingAssignmentKeys.add(key);
		assignmentRowsToCreate.push({
			org_id: ORG_ID,
			teacher_id: teacher.id,
			group_id: group.id,
			subject_id: subject.id,
			branch_id: branch.id,
			year: YEAR,
		});
	}

	const backupDir = path.join(
		".codex-tmp",
		"xetai-pkpd-assignments",
		new Date().toISOString().replace(/[:.]/g, "-"),
	);
	await fs.mkdir(backupDir, { recursive: true });
	await fs.writeFile(
		path.join(backupDir, "before.json"),
		JSON.stringify(
			{ workbookPath, parsedRows, subjects, assignments, warnings },
			null,
			2,
		),
		"utf8",
	);

	console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
	console.log(`Workbook: ${workbookPath}`);
	console.log(`Backup: ${backupDir}`);
	console.log(`Parsed rows: ${parsedRows.length}`);
	console.log(`Subjects to create: ${subjectRowsToCreate.length}`);
	console.log(`Assignments to create: ${assignmentRowsToCreate.length}`);
	if (warnings.length) {
		for (const warning of warnings) console.log(`  ! ${warning}`);
	}
	if (missingGroups.size > 0) {
		console.log(`Missing groups: ${[...missingGroups].join(", ")}`);
	}
	if (missingTeachers.size > 0) {
		console.log("Missing teachers:");
		for (const name of missingTeachers.keys()) console.log(`  - ${name}`);
	}
	const byGroup = {};
	for (const row of assignmentRowsToCreate) {
		const group = groups.find((item) => item.id === row.group_id);
		byGroup[group?.name || row.group_id] = (byGroup[group?.name || row.group_id] || 0) + 1;
	}
	console.log(
		`Assignments by group: ${Object.entries(byGroup)
			.sort((a, b) => String(a[0]).localeCompare(String(b[0]), "az"))
			.map(([group, count]) => `${group}:${count}`)
			.join(" | ")}`,
	);

	if (!APPLY) return;
	if (missingTeachers.size > 0 || missingGroups.size > 0) {
		throw new Error("Cannot apply while teachers/groups are missing");
	}

	if (subjectRowsToCreate.length > 0) {
		const { error } = await supabase.from("subjects").upsert(subjectRowsToCreate, {
			onConflict: "id",
		});
		if (error) throw new Error(`subjects upsert: ${error.message}`);
	}
	if (assignmentRowsToCreate.length > 0) {
		const { error } = await supabase
			.from("teaching_assignments")
			.insert(assignmentRowsToCreate);
		if (error) throw new Error(`teaching_assignments insert: ${error.message}`);
	}
	console.log("Applied.");
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
