import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(".env.local") });

const APPLY = process.argv.includes("--apply");
const ORG_ID = process.env.VITE_ORG_ID || "default";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DOWNLOADS_DIR = "C:/Users/mamma/Downloads";
const OUT_DIR = path.resolve(".codex-tmp/qurtulus-20260611-import");
const SUMMARY_PATH = path.join(OUT_DIR, "import-summary.json");
const PREPARED_CLASS_PATH = path.join(OUT_DIR, "prepared-class-results.json");
const PREPARED_TEACHER_PATH = path.join(OUT_DIR, "prepared-teacher-results.json");

if (!SUPABASE_URL || !SUPABASE_KEY) {
	throw new Error("Missing Supabase URL or service role key in .env.local");
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false },
});

const charMap = new Map(
	Object.entries({
		"\u018f": "e",
		"\u0259": "e",
		"\u0131": "i",
		"\u0130": "i",
		I: "i",
		i: "i",
		"\u00f6": "o",
		"\u00d6": "o",
		"\u00fc": "u",
		"\u00dc": "u",
		"\u015f": "s",
		"\u015e": "s",
		"\u00e7": "c",
		"\u00C7": "c",
		"\u011f": "g",
		"\u011e": "g",
	}),
);

const normalize = (value) =>
	String(value ?? "")
		.split("")
		.map((char) => charMap.get(char) ?? char)
		.join("")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(/\s+/g, " ");

const firstTwo = (value) => normalize(value).split(" ").slice(0, 2).join(" ");
const round2 = (value) =>
	Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const resolveDownloadFile = (predicate) => {
	const entries = fs.readdirSync(DOWNLOADS_DIR, { withFileTypes: true });
	const match = entries
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name)
		.find((name) => predicate(name, normalize(name)));
	if (!match) throw new Error("Input file not found");
	return path.join(DOWNLOADS_DIR, match);
};

const files = {
	fullReady: resolveDownloadFile((name) => name === "biq_full_ready_qurtulus-campusu (2).xlsx"),
	tenthResults: resolveDownloadFile((name, key) =>
		key.includes("qurtulus") &&
		key.includes("x") &&
		key.includes("neticeler") &&
		key.includes("2026"),
	),
	primaryBlocks: resolveDownloadFile((name, key) =>
		key.includes("pkpd") &&
		key.includes("ibtidailer") &&
		key.includes("qurtulus") &&
		key.includes("blok"),
	),
};

const parseNumericScore = (value) => {
	if (value === null || value === undefined) return null;
	if (typeof value === "number" && Number.isFinite(value)) return value;
	const text = String(value).trim().replace(",", ".");
	if (!text || text === "-") return null;
	const split = /^(\d+(?:\.\d+)?)\s*\/\s*\d+(?:\.\d+)?$/.exec(text);
	const numeric = Number(split ? split[1] : text);
	if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) return null;
	return numeric;
};

const readWorkbookRows = (filePath, sheetName) => {
	const workbook = XLSX.readFile(filePath, { cellDates: false });
	const sheet = workbook.Sheets[sheetName];
	if (!sheet) return [];
	return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
};

const findHeaderRow = (rows, requiredHeaders) =>
	rows.findIndex((row) => {
		const keys = row.map((cell) => normalize(cell));
		return requiredHeaders.every((header) => keys.includes(header));
	});

const headerMap = (row) => {
	const map = new Map();
	row.forEach((value, index) => {
		const key = normalize(value);
		if (key) map.set(key, index);
	});
	return map;
};

const cell = (row, map, key) => row[map.get(key)] ?? null;

const fetchAll = async (table, select = "*", filters = {}) => {
	const rows = [];
	let from = 0;
	const pageSize = 1000;
	while (true) {
		let query = supabase
			.from(table)
			.select(select)
			.eq("org_id", ORG_ID)
			.range(from, from + pageSize - 1);
		for (const [key, value] of Object.entries(filters)) {
			query = query.eq(key, value);
		}
		if (!["branches", "survey_cycles"].includes(table)) {
			query = query.order("id", { ascending: true });
		}
		const { data, error } = await query;
		if (error) throw error;
		rows.push(...(data ?? []));
		if ((data ?? []).length < pageSize) break;
		from += pageSize;
	}
	return rows;
};

const chunkArray = (items, size) => {
	const chunks = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
};

const [
	branches,
	cycles,
	groups,
	students,
	memberships,
	assignments,
	subjects,
	existingClassResults,
	existingTeacherResults,
] = await Promise.all([
	fetchAll("branches", "id,name,code"),
	fetchAll("survey_cycles", "id,year,status,branch_ids,created_at"),
	fetchAll("groups", "id,name,branch_id,class_level"),
	fetchAll("students", "id,name,branch_id,group_id,deleted_at"),
	fetchAll(
		"student_group_memberships",
		"id,student_id,group_id,year,membership_type,branch_id,deleted_at",
	),
	fetchAll(
		"teaching_assignments",
		"id,teacher_id,branch_id,group_id,subject_id,year,deleted_at",
	),
	fetchAll("subjects", "id,name"),
	fetchAll("biq_class_results", "id,branch_id,cycle_id,group_id,subject_id,score"),
	fetchAll(
		"pkpd_teacher_biq_results",
		"id,branch_id,cycle_id,teacher_id,group_id,subject_id,score",
	),
]);

const qurtulusBranch = branches.find((branch) => branch.code === "QUR");
if (!qurtulusBranch) throw new Error("Qurtulus branch not found");
const qurtulusCycle = cycles.find((cycle) =>
	(cycle.branch_ids ?? []).includes(qurtulusBranch.id),
);
if (!qurtulusCycle) throw new Error("Qurtulus cycle not found");

const activeYear = Number(qurtulusCycle.year);
const groupById = Object.fromEntries(groups.map((group) => [group.id, group]));
const subjectById = Object.fromEntries(subjects.map((subject) => [subject.id, subject]));
const groupByName = new Map(
	groups
		.filter((group) => group.branch_id === qurtulusBranch.id)
		.map((group) => [group.name, group]),
);

const subjectByGroupNorm = new Map();
for (const assignment of assignments) {
	if (
		assignment.branch_id !== qurtulusBranch.id ||
		Number(assignment.year) !== activeYear
	) {
		continue;
	}
	const group = groupById[assignment.group_id];
	const subject = subjectById[assignment.subject_id];
	if (!group || !subject) continue;
	const key = assignment.group_id;
	if (!subjectByGroupNorm.has(key)) subjectByGroupNorm.set(key, new Map());
	const subjectsByName = subjectByGroupNorm.get(key);
	const subjectKey = normalize(subject.name);
	if (!subjectsByName.has(subjectKey)) subjectsByName.set(subjectKey, []);
	if (!subjectsByName.get(subjectKey).some((item) => item.id === subject.id)) {
		subjectsByName.get(subjectKey).push(subject);
	}
}

const findSubjects = (groupId, aliases) => {
	const subjectsByName = subjectByGroupNorm.get(groupId);
	if (!subjectsByName) return [];
	const found = [];
	for (const alias of aliases) {
		for (const subject of subjectsByName.get(alias) ?? []) {
			if (!found.some((item) => item.id === subject.id)) found.push(subject);
		}
	}
	return found;
};

const qurtulusStudents = students.filter(
	(student) => student.branch_id === qurtulusBranch.id,
);

const matchStudent = (fileName, preferredGroupName = null) => {
	const fileNorm = normalize(fileName);
	const candidates = qurtulusStudents.filter((student) => {
		const groupName = groupById[student.group_id]?.name ?? "";
		if (
			preferredGroupName &&
			groupName !== preferredGroupName &&
			!groupName.startsWith(preferredGroupName)
		) {
			return false;
		}
		const studentNorm = normalize(student.name);
		return (
			studentNorm === fileNorm ||
			studentNorm.startsWith(`${fileNorm} `) ||
			fileNorm.startsWith(`${studentNorm} `) ||
			firstTwo(student.name) === firstTwo(fileName)
		);
	});
	candidates.sort(
		(a, b) => Number(Boolean(a.deleted_at)) - Number(Boolean(b.deleted_at)),
	);
	return candidates[0] ?? null;
};

const membershipsForStudent = (studentId) =>
	memberships
		.filter(
			(membership) =>
				membership.student_id === studentId &&
				Number(membership.year) === activeYear &&
				!membership.deleted_at,
		)
		.map((membership) => membership.group_id);

const subjectAliases = (label) => {
	const key = normalize(label);
	if (key === "tedris dili") return ["azerb dili", "azerbaycan dili"];
	if (key === "edebiyyat") return ["edebiyyat"];
	if (key === "ingilis dili" || key.startsWith("xarici dil")) {
		return ["grammar", "ingilis dili"];
	}
	if (key === "rus dili" || key.startsWith("ikinci xarici")) {
		return ["rus dili", "alman dili"];
	}
	if (key === "riyaziyyat") return ["riyaziyyat"];
	if (key === "informatika") return ["informatika", "info kimya", "info si"];
	if (key === "azerbaycan tarixi" || key === "umumi tarix") {
		return ["tarix", "azerb t", "umumi t"];
	}
	if (key === "fizika") return ["fizika", "fizik t"];
	if (key === "kimya") return ["kimya", "info kimya"];
	if (key === "biologiya") return ["biologiya"];
	if (key === "cografiya") return ["cografiya"];
	if (key === "heyat bilgisi") return ["heyat b"];
	if (key === "texnologiya") return ["texnologiya", "texno steam"];
	if (key === "fiziki terbiye") return ["fizik t", "fiziki terbiye"];
	if (key === "musiqi") return ["musiqi"];
	if (key === "tesviri incesenet" || key === "tesviri ince senet") {
		return ["tesv incs", "tesviri incesenet"];
	}
	return [];
};

const classBucket = new Map();
const teacherBucket = new Map();
const skipped = [];

const addClassValue = (meta, value) => {
	const key = `${meta.branch_id}|${meta.cycle_id}|${meta.group_id}|${meta.subject_id}`;
	if (!classBucket.has(key)) {
		classBucket.set(key, { ...meta, values: [], sources: new Set() });
	}
	classBucket.get(key).values.push(Number(value));
	classBucket.get(key).sources.add(meta.source);
};

const addTeacherValue = (meta, value) => {
	const key = `${meta.branch_id}|${meta.cycle_id}|${meta.teacher_id}|${meta.group_id}|${meta.subject_id}`;
	if (!teacherBucket.has(key)) {
		teacherBucket.set(key, { ...meta, values: [], sources: new Set() });
	}
	teacherBucket.get(key).values.push(Number(value));
	teacherBucket.get(key).sources.add(meta.source);
};

const importBiqWorkbook = (filePath, sourceName) => {
	for (const sheetName of ["biq_sinif_fenn", "biq_muellim"]) {
		const rows = readWorkbookRows(filePath, sheetName);
		const headerIndex = findHeaderRow(rows, [
			sheetName === "biq_muellim" ? "teacher id" : "branch id",
			"group id",
			"subject id",
			"bal",
		]);
		if (headerIndex === -1) continue;
		const headers = headerMap(rows[headerIndex]);
		for (const row of rows.slice(headerIndex + 1)) {
			const score = parseNumericScore(cell(row, headers, "bal"));
			if (score === null) continue;
			const branchId = String(cell(row, headers, "branch id") ?? "").trim();
			const groupId = String(cell(row, headers, "group id") ?? "").trim();
			const subjectId = String(cell(row, headers, "subject id") ?? "").trim();
			if (branchId !== qurtulusBranch.id || !groupId || !subjectId) continue;
			if (sheetName === "biq_muellim") {
				const teacherId = String(cell(row, headers, "teacher id") ?? "").trim();
				if (!teacherId) continue;
				addTeacherValue(
					{
						org_id: ORG_ID,
						branch_id: branchId,
						cycle_id: qurtulusCycle.id,
						teacher_id: teacherId,
						group_id: groupId,
						subject_id: subjectId,
						teacher_name: String(cell(row, headers, "muellim") ?? ""),
						group_name: String(cell(row, headers, "sinif") ?? ""),
						subject_name: String(cell(row, headers, "fenn") ?? ""),
						source: sourceName,
					},
					score,
				);
			} else {
				addClassValue(
					{
						org_id: ORG_ID,
						branch_id: branchId,
						cycle_id: qurtulusCycle.id,
						group_id: groupId,
						subject_id: subjectId,
						group_name: String(cell(row, headers, "sinif") ?? ""),
						subject_name: String(cell(row, headers, "fenn") ?? ""),
						source: sourceName,
					},
					score,
				);
			}
		}
	}
};

importBiqWorkbook(files.fullReady, path.basename(files.fullReady));
importBiqWorkbook(files.primaryBlocks, path.basename(files.primaryBlocks));

const tenthRows = readWorkbookRows(files.tenthResults, "Sheet1");
const tenthHeaderIndex = tenthRows.findIndex((row) =>
	row.some((cellValue) => normalize(cellValue) === "ad soyad"),
);
if (tenthHeaderIndex === -1) throw new Error("10th grade header row not found");
const tenthHeaders = tenthRows[tenthHeaderIndex].map((value) => String(value ?? "").trim());
const tenthHeaderMap = headerMap(tenthRows[tenthHeaderIndex]);
const tenthNameIndex = tenthHeaderMap.get("ad soyad");
if (tenthNameIndex === undefined) throw new Error("10th grade name column not found");
const baseTenthGroup = groupByName.get("10A3");
if (!baseTenthGroup) throw new Error("10A3 group not found");

for (const row of tenthRows.slice(tenthHeaderIndex + 1)) {
	const studentName = String(row[tenthNameIndex] ?? "").trim();
	if (!studentName) continue;
	const matchedStudent = matchStudent(studentName, "10A3");
	const candidateGroupIds = new Set([baseTenthGroup.id]);
	if (matchedStudent) {
		for (const groupId of membershipsForStudent(matchedStudent.id)) {
			candidateGroupIds.add(groupId);
		}
	}

	for (let index = 0; index < tenthHeaders.length; index += 1) {
		const label = tenthHeaders[index];
		const labelKey = normalize(label);
		if (!labelKey || labelKey === "ad soyad") continue;
		const score = parseNumericScore(row[index]);
		if (score === null) continue;
		const aliases = subjectAliases(label);
		if (aliases.length === 0) {
			skipped.push({ source: path.basename(files.tenthResults), reason: "subject_ignored", label });
			continue;
		}

		let foundTarget = false;
		for (const groupId of candidateGroupIds) {
			const group = groupById[groupId];
			const subjectsFound = findSubjects(groupId, aliases);
			for (const subject of subjectsFound) {
				addClassValue(
					{
						org_id: ORG_ID,
						branch_id: qurtulusBranch.id,
						cycle_id: qurtulusCycle.id,
						group_id: groupId,
						subject_id: subject.id,
						group_name: group.name,
						subject_name: subject.name,
						source: path.basename(files.tenthResults),
					},
					score,
				);
				foundTarget = true;
			}
		}
		if (!foundTarget) {
			skipped.push({
				source: path.basename(files.tenthResults),
				reason: "no_assignment_target",
				student: studentName,
				label,
			});
		}
	}
}

const prepareRows = (bucket) =>
	Array.from(bucket.values()).map((row) => ({
		org_id: row.org_id,
		branch_id: row.branch_id,
		cycle_id: row.cycle_id,
		teacher_id: row.teacher_id,
		group_id: row.group_id,
		subject_id: row.subject_id,
		score: round2(row.values.reduce((sum, value) => sum + value, 0) / row.values.length),
		teacher_name: row.teacher_name,
		group_name: row.group_name,
		subject_name: row.subject_name,
		source: Array.from(row.sources).join("; "),
		sample_size: row.values.length,
	}));

const classRows = prepareRows(classBucket).sort((a, b) =>
	`${a.group_name}|${a.subject_name}`.localeCompare(
		`${b.group_name}|${b.subject_name}`,
		"az",
		{ numeric: true },
	),
);
const teacherRows = prepareRows(teacherBucket).sort((a, b) =>
	`${a.teacher_name}|${a.group_name}|${a.subject_name}`.localeCompare(
		`${b.teacher_name}|${b.group_name}|${b.subject_name}`,
		"az",
		{ numeric: true },
	),
);

const existingClassByKey = new Map(
	existingClassResults.map((row) => [
		`${row.branch_id}|${row.cycle_id}|${row.group_id}|${row.subject_id}`,
		row,
	]),
);
const existingTeacherByKey = new Map(
	existingTeacherResults.map((row) => [
		`${row.branch_id}|${row.cycle_id}|${row.teacher_id}|${row.group_id}|${row.subject_id}`,
		row,
	]),
);

const summarizeChanges = (rows, existingByKey, keyFn) => {
	const changes = [];
	let inserts = 0;
	let updates = 0;
	let unchanged = 0;
	for (const row of rows) {
		const existing = existingByKey.get(keyFn(row));
		if (!existing) {
			inserts += 1;
			continue;
		}
		if (Math.abs(Number(existing.score) - Number(row.score)) < 0.005) {
			unchanged += 1;
		} else {
			updates += 1;
			changes.push({
				teacher: row.teacher_name,
				group: row.group_name,
				subject: row.subject_name,
				oldScore: Number(existing.score),
				newScore: row.score,
				source: row.source,
			});
		}
	}
	return { inserts, updates, unchanged, changes };
};

const classChangeSummary = summarizeChanges(
	classRows,
	existingClassByKey,
	(row) => `${row.branch_id}|${row.cycle_id}|${row.group_id}|${row.subject_id}`,
);
const teacherChangeSummary = summarizeChanges(
	teacherRows,
	existingTeacherByKey,
	(row) =>
		`${row.branch_id}|${row.cycle_id}|${row.teacher_id}|${row.group_id}|${row.subject_id}`,
);

const toDbRows = (rows) =>
	rows.map(({ org_id, branch_id, cycle_id, teacher_id, group_id, subject_id, score }) => {
		const payload = { org_id, branch_id, cycle_id, group_id, subject_id, score };
		if (teacher_id) payload.teacher_id = teacher_id;
		return payload;
	});

if (APPLY) {
	for (const chunk of chunkArray(toDbRows(classRows), 200)) {
		const { error } = await supabase.from("biq_class_results").upsert(chunk, {
			onConflict: "org_id,branch_id,cycle_id,group_id,subject_id",
		});
		if (error) throw error;
	}
	for (const chunk of chunkArray(toDbRows(teacherRows), 200)) {
		const { error } = await supabase
			.from("pkpd_teacher_biq_results")
			.upsert(chunk, {
				onConflict:
					"org_id,branch_id,cycle_id,teacher_id,group_id,subject_id",
			});
		if (error) throw error;
	}
}

const countBySource = (rows) =>
	rows.reduce((acc, row) => {
		for (const source of row.source.split("; ")) {
			acc[source] = (acc[source] ?? 0) + 1;
		}
		return acc;
	}, {});

const countByGroup = (rows) =>
	rows.reduce((acc, row) => {
		acc[row.group_name] = (acc[row.group_name] ?? 0) + 1;
		return acc;
	}, {});

const skipSummary = skipped.reduce((acc, row) => {
	acc[row.reason] = (acc[row.reason] ?? 0) + 1;
	return acc;
}, {});

const summary = {
	mode: APPLY ? "apply" : "dry-run",
	cycle: {
		id: qurtulusCycle.id,
		year: qurtulusCycle.year,
		status: qurtulusCycle.status,
	},
	files: Object.fromEntries(
		Object.entries(files).map(([key, value]) => [key, path.basename(value)]),
	),
	classResults: {
		rows: classRows.length,
		...classChangeSummary,
		bySource: countBySource(classRows),
		byGroup: countByGroup(classRows),
	},
	teacherResults: {
		rows: teacherRows.length,
		...teacherChangeSummary,
		bySource: countBySource(teacherRows),
		byGroup: countByGroup(teacherRows),
	},
	skipSummary,
	skippedPreview: skipped.filter((row) => row.reason !== "subject_ignored").slice(0, 40),
};

fs.writeFileSync(PREPARED_CLASS_PATH, JSON.stringify(classRows, null, 2));
fs.writeFileSync(PREPARED_TEACHER_PATH, JSON.stringify(teacherRows, null, 2));
fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
