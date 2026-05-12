import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import xlsx from "xlsx";
import { createClient } from "@supabase/supabase-js";

const ROOT_DIR = path.resolve("C:/Work/vote");
dotenv.config({ path: path.join(ROOT_DIR, ".env.local") });
dotenv.config({ path: path.join(ROOT_DIR, ".env"), override: false });

const ORG_ID = process.env.VITE_ORG_ID || "default";
const BRANCH_CODE = "XET";
const YEAR = 2026;
const INPUT_FILE = "C:/Users/mamma/Downloads/PKPD siyahı  Xətai.xlsx";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
	throw new Error("Missing Supabase service credentials.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false },
});

const SHEET_TO_GROUP = new Map([
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

const compactSpaces = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const transliterate = (value) =>
	String(value ?? "")
		.replaceAll("Ə", "E")
		.replaceAll("ə", "e")
		.replaceAll("İ", "I")
		.replaceAll("ı", "i")
		.replaceAll("Ş", "S")
		.replaceAll("ş", "s")
		.replaceAll("Ç", "C")
		.replaceAll("ç", "c")
		.replaceAll("Ğ", "G")
		.replaceAll("ğ", "g")
		.replaceAll("Ö", "O")
		.replaceAll("ö", "o")
		.replaceAll("Ü", "U")
		.replaceAll("ü", "u");

const normalizeKey = (value) =>
	transliterate(compactSpaces(value))
		.normalize("NFKD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();

const firstTwoKey = (value) => normalizeKey(value).split(" ").slice(0, 2).join(" ");

const fetchAll = async (table, select = "*", build = (query) => query) => {
	const rows = [];
	for (let from = 0; ; from += 1000) {
		const { data, error } = await build(supabase.from(table).select(select)).range(
			from,
			from + 999,
		);
		if (error) throw new Error(`${table}: ${error.message}`);
		rows.push(...(data ?? []));
		if (!data || data.length < 1000) break;
	}
	return rows;
};

const indexManyBy = (rows, getKey) => {
	const map = new Map();
	for (const row of rows) {
		const key = getKey(row);
		const bucket = map.get(key) ?? [];
		bucket.push(row);
		map.set(key, bucket);
	}
	return map;
};

const canonicalSubject = (raw, groupName) => {
	const key = normalizeKey(raw);
	const isRussianGroup = /R/i.test(groupName);
	if (key === "azerbaycan dili" || key === "azerb dili") {
		return "Azərbaycan dili və ədəbiyyat";
	}
	if (key === "edebiyyat") {
		return isRussianGroup ? "Rus dili və ədəbiyyat" : "Azərbaycan dili və ədəbiyyat";
	}
	if (key === "rus dili") return "Rus dili və ədəbiyyat";
	if (key === "ingilis dili") return "İngilis dili";
	if (key === "informatika") return "İnformatika";
	if (key === "riyaziyyat") return "Riyaziyyat";
	if (key === "fizika") return "Fizika";
	if (key === "kimya") return "Kimya";
	if (key === "biologiya") return "Biologiya";
	if (key === "cografiya") return "Coğrafiya";
	if (key === "tarix") return "Tarix";
	return compactSpaces(raw);
};

const classLevelFromGroup = (groupName) => compactSpaces(groupName).match(/^\d+/)?.[0] ?? "";

const readSource = () => {
	if (!fs.existsSync(INPUT_FILE)) {
		throw new Error(`Workbook not found: ${INPUT_FILE}`);
	}
	const workbook = xlsx.readFile(INPUT_FILE);
	const students = [];
	const assignmentRows = [];
	const sheetSummaries = [];
	const unmappedSheets = [];
	const seenStudents = new Map();
	const duplicateStudents = [];

	for (const sheetName of workbook.SheetNames) {
		const groupName = SHEET_TO_GROUP.get(sheetName);
		if (!groupName) unmappedSheets.push(sheetName);
		const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
			header: 1,
			defval: null,
			blankrows: false,
		});
		const headerRow = rows.findIndex((row) =>
			row.some((cell) => normalizeKey(cell) === "ad soyad ata"),
		);
		if (headerRow < 0) {
			sheetSummaries.push({ sheetName, groupName, rows: rows.length, error: "header not found" });
			continue;
		}

		const header = rows[headerRow].map(normalizeKey);
		const nameCol = header.findIndex((cell) => cell === "ad soyad ata");
		const teacherCol = header.findIndex((cell) => cell === "muellim");
		const subjectCol = header.findIndex((cell) => cell === "ixtisas");

		let studentCount = 0;
		let assignmentRawCount = 0;
		for (const row of rows.slice(headerRow + 1)) {
			const studentName = compactSpaces(row[nameCol]);
			const teacherName = compactSpaces(row[teacherCol]);
			const rawSubject = compactSpaces(row[subjectCol]);
			if (studentName) {
				studentCount += 1;
				const key = normalizeKey(studentName);
				if (seenStudents.has(key)) {
					duplicateStudents.push({
						name: studentName,
						firstGroup: seenStudents.get(key),
						secondGroup: groupName,
					});
				} else {
					seenStudents.set(key, groupName);
					students.push({
						name: studentName,
						groupName,
						classLevel: classLevelFromGroup(groupName),
						sheetName,
					});
				}
			}
			if (teacherName && rawSubject && groupName) {
				assignmentRawCount += 1;
				assignmentRows.push({
					sheetName,
					groupName,
					teacherName,
					rawSubject,
					subjectName: canonicalSubject(rawSubject, groupName),
				});
			}
		}
		sheetSummaries.push({
			sheetName,
			groupName,
			studentCount,
			assignmentRawCount,
		});
	}

	const uniqueAssignmentsByKey = new Map();
	for (const row of assignmentRows) {
		const key = `${row.groupName}|${firstTwoKey(row.teacherName)}|${normalizeKey(row.subjectName)}`;
		if (!uniqueAssignmentsByKey.has(key)) uniqueAssignmentsByKey.set(key, row);
	}

	return {
		students,
		assignmentRows,
		uniqueAssignments: [...uniqueAssignmentsByKey.values()],
		sheetSummaries,
		unmappedSheets,
		duplicateStudents,
	};
};

const findBranch = async () => {
	const branches = await fetchAll("branches", "*", (q) =>
		q.eq("org_id", ORG_ID).or(`code.eq.${BRANCH_CODE},name.ilike.%X%tai%`),
	);
	const branch = branches.find((row) => row.code === BRANCH_CODE) ?? branches[0];
	if (!branch) throw new Error("Xətai branch not found.");
	return branch;
};

const loadDb = async (branch) => {
	const [groups, students, teachers, subjects, assignments, tasks, submissions, users, cycles] =
		await Promise.all([
			fetchAll("groups", "*", (q) =>
				q.eq("org_id", ORG_ID).eq("branch_id", branch.id).is("deleted_at", null),
			),
			fetchAll("students", "*", (q) =>
				q.eq("org_id", ORG_ID).eq("branch_id", branch.id).is("deleted_at", null),
			),
			fetchAll("teachers", "*", (q) =>
				q.eq("org_id", ORG_ID).eq("branch_id", branch.id).is("deleted_at", null),
			),
			fetchAll("subjects", "*", (q) => q.eq("org_id", ORG_ID).is("deleted_at", null)),
			fetchAll("teaching_assignments", "*", (q) =>
				q
					.eq("org_id", ORG_ID)
					.eq("branch_id", branch.id)
					.eq("year", YEAR)
					.is("deleted_at", null),
			),
			fetchAll("tasks", "*", (q) => q.eq("org_id", ORG_ID).eq("branch_id", branch.id)),
			fetchAll("submissions", "*", (q) => q.eq("org_id", ORG_ID).eq("branch_id", branch.id)),
			fetchAll("users", "*", (q) => q.eq("org_id", ORG_ID).eq("branch_id", branch.id)),
			fetchAll("survey_cycles", "*", (q) => q.eq("org_id", ORG_ID)),
		]);
	return { groups, students, teachers, subjects, assignments, tasks, submissions, users, cycles };
};

const resolveTeacher = (teacherName, teachers) => {
	const byExact = indexManyBy(teachers, (teacher) => normalizeKey(teacher.name));
	const byFirstTwo = indexManyBy(teachers, (teacher) => firstTwoKey(teacher.name));
	const exact = byExact.get(normalizeKey(teacherName)) ?? [];
	if (exact.length === 1) return { status: "exact", teacher: exact[0] };
	const firstTwo = byFirstTwo.get(firstTwoKey(teacherName)) ?? [];
	if (firstTwo.length === 1) return { status: "first_two", teacher: firstTwo[0] };
	return { status: "unresolved", matches: firstTwo, teacher: null };
};

const buildComparison = ({ source, db }) => {
	const groupsByName = new Map(db.groups.map((group) => [normalizeKey(group.name), group]));
	const subjectsByName = new Map(db.subjects.map((subject) => [normalizeKey(subject.name), subject]));
	const studentsByName = new Map(db.students.map((student) => [normalizeKey(student.name), student]));
	const sourceStudentsByName = new Set(source.students.map((student) => normalizeKey(student.name)));
	const groupsById = new Map(db.groups.map((group) => [group.id, group]));
	const teachersById = new Map(db.teachers.map((teacher) => [teacher.id, teacher]));
	const subjectsById = new Map(db.subjects.map((subject) => [subject.id, subject]));
	const dbAssignmentsByKey = new Set(
		db.assignments.map((assignment) => {
			const subjectName = subjectsById.get(assignment.subject_id)?.name ?? assignment.subject_id;
			return [assignment.teacher_id, assignment.group_id, normalizeKey(subjectName)].join("|");
		}),
	);

	const groupIssues = [...new Set(source.sheetSummaries.map((item) => item.groupName).filter(Boolean))]
		.filter((groupName) => !groupsByName.has(normalizeKey(groupName)))
		.sort((a, b) => a.localeCompare(b, "az"));

	const teacherResolutions = new Map();
	for (const row of source.uniqueAssignments) {
		if (!teacherResolutions.has(row.teacherName)) {
			teacherResolutions.set(row.teacherName, resolveTeacher(row.teacherName, db.teachers));
		}
	}
	const unresolvedTeachers = [...teacherResolutions.entries()]
		.filter(([, result]) => !result.teacher)
		.map(([teacherName, result]) => ({
			teacherName,
			matches: result.matches?.map((teacher) => teacher.name) ?? [],
		}))
		.sort((a, b) => a.teacherName.localeCompare(b.teacherName, "az"));

	const nonExactTeachers = [...teacherResolutions.entries()]
		.filter(([, result]) => result.status === "first_two")
		.map(([sourceName, result]) => ({
			sourceName,
			dbName: result.teacher.name,
		}))
		.sort((a, b) => a.sourceName.localeCompare(b.sourceName, "az"));

	const subjectIssues = [...new Set(source.uniqueAssignments.map((row) => row.subjectName))]
		.filter((subjectName) => !subjectsByName.has(normalizeKey(subjectName)))
		.sort((a, b) => a.localeCompare(b, "az"));

	const missingStudents = source.students
		.filter((student) => !studentsByName.has(normalizeKey(student.name)))
		.map((student) => ({ name: student.name, groupName: student.groupName }))
		.sort((a, b) => a.name.localeCompare(b.name, "az"));

	const extraStudentsInDb = db.students
		.filter((student) => !sourceStudentsByName.has(normalizeKey(student.name)))
		.map((student) => ({
			name: student.name,
			groupName: groupsById.get(student.group_id)?.name ?? student.group_id,
			hasUser: Boolean(student.user_id),
			login: student.login ?? null,
		}))
		.sort((a, b) => a.name.localeCompare(b.name, "az"));

	const groupMismatchStudents = source.students
		.map((student) => {
			const dbStudent = studentsByName.get(normalizeKey(student.name));
			if (!dbStudent) return null;
			const sourceGroup = groupsByName.get(normalizeKey(student.groupName));
			if (!sourceGroup || dbStudent.group_id === sourceGroup.id) return null;
			const dbGroup = db.groups.find((group) => group.id === dbStudent.group_id);
			return {
				name: student.name,
				excelGroup: student.groupName,
				dbGroup: dbGroup?.name ?? dbStudent.group_id,
			};
		})
		.filter(Boolean)
		.sort((a, b) => a.name.localeCompare(b.name, "az"));

	const plannedAssignments = [];
	const assignmentResolutionIssues = [];
	const plannedKeys = new Set();
	for (const row of source.uniqueAssignments) {
		const group = groupsByName.get(normalizeKey(row.groupName));
		const subject = subjectsByName.get(normalizeKey(row.subjectName));
		const teacher = teacherResolutions.get(row.teacherName)?.teacher;
		if (!group || !subject || !teacher) {
			assignmentResolutionIssues.push({
				groupName: row.groupName,
				teacherName: row.teacherName,
				subjectName: row.subjectName,
				missing: [
					!group ? "group" : null,
					!teacher ? "teacher" : null,
					!subject ? "subject" : null,
				].filter(Boolean),
			});
			continue;
		}
		const key = [teacher.id, group.id, normalizeKey(row.subjectName)].join("|");
		if (!plannedKeys.has(key)) {
			plannedKeys.add(key);
			plannedAssignments.push({ key, groupName: row.groupName, teacherName: teacher.name, subjectName: row.subjectName });
		}
	}

	const missingAssignmentsInDb = plannedAssignments
		.filter((assignment) => !dbAssignmentsByKey.has(assignment.key))
		.map(({ key: _key, ...assignment }) => assignment)
		.sort(
			(a, b) =>
				a.groupName.localeCompare(b.groupName, "az") ||
				a.subjectName.localeCompare(b.subjectName, "az") ||
				a.teacherName.localeCompare(b.teacherName, "az"),
		);

	const plannedKeySet = new Set(plannedAssignments.map((assignment) => assignment.key));
	const obsoleteAssignmentsInDb = db.assignments
		.map((assignment) => {
			const subjectName = subjectsById.get(assignment.subject_id)?.name ?? assignment.subject_id;
			const key = [assignment.teacher_id, assignment.group_id, normalizeKey(subjectName)].join("|");
			if (plannedKeySet.has(key)) return null;
			return {
				groupName: groupsById.get(assignment.group_id)?.name ?? assignment.group_id,
				teacherName: teachersById.get(assignment.teacher_id)?.name ?? assignment.teacher_id,
				subjectName,
			};
		})
		.filter(Boolean)
		.sort(
			(a, b) =>
				a.groupName.localeCompare(b.groupName, "az") ||
				a.subjectName.localeCompare(b.subjectName, "az") ||
				a.teacherName.localeCompare(b.teacherName, "az"),
		);

	const sourceGroupCounts = new Map();
	for (const student of source.students) {
		sourceGroupCounts.set(student.groupName, (sourceGroupCounts.get(student.groupName) ?? 0) + 1);
	}
	const dbGroupCounts = new Map();
	for (const student of db.students) {
		const groupName = groupsById.get(student.group_id)?.name ?? student.group_id;
		dbGroupCounts.set(groupName, (dbGroupCounts.get(groupName) ?? 0) + 1);
	}
	const groupStudentCounts = [...new Set([...sourceGroupCounts.keys(), ...dbGroupCounts.keys()])]
		.sort((a, b) => a.localeCompare(b, "az"))
		.map((groupName) => ({
			groupName,
			excel: sourceGroupCounts.get(groupName) ?? 0,
			db: dbGroupCounts.get(groupName) ?? 0,
			diff: (dbGroupCounts.get(groupName) ?? 0) - (sourceGroupCounts.get(groupName) ?? 0),
		}));

	return {
		groupIssues,
		unresolvedTeachers,
		nonExactTeachers,
		subjectIssues,
		missingStudents,
		extraStudentsInDb,
		groupMismatchStudents,
		groupStudentCounts,
		plannedAssignments,
		assignmentResolutionIssues,
		missingAssignmentsInDb,
		obsoleteAssignmentsInDb,
	};
};

const main = async () => {
	const source = readSource();
	const branch = await findBranch();
	const db = await loadDb(branch);
	const comparison = buildComparison({ source, db });
	const summary = {
		sourceFile: INPUT_FILE,
		branch: { id: branch.id, name: branch.name, code: branch.code },
		source: {
			sheets: source.sheetSummaries.length,
			students: source.students.length,
			rawAssignmentRows: source.assignmentRows.length,
			uniqueAssignments: source.uniqueAssignments.length,
			uniqueTeachers: new Set(source.uniqueAssignments.map((row) => row.teacherName)).size,
			uniqueSubjects: new Set(source.uniqueAssignments.map((row) => row.subjectName)).size,
			unmappedSheets: source.unmappedSheets,
			duplicateStudents: source.duplicateStudents,
			sheetSummaries: source.sheetSummaries,
		},
		db: {
			groups: db.groups.length,
			students: db.students.length,
			teachers: db.teachers.length,
			subjects: db.subjects.length,
			assignments2026: db.assignments.length,
			tasks: db.tasks.length,
			submissions: db.submissions.length,
			users: db.users.length,
			cycles: db.cycles.map((cycle) => ({
				id: cycle.id,
				name: cycle.name,
				year: cycle.year,
				status: cycle.status,
				branchId: cycle.branch_id ?? null,
			})),
			taskStatusCounts: Object.fromEntries(
				Object.entries(
					db.tasks.reduce((acc, task) => {
						const key = `${task.cycle_id ?? "no-cycle"}|${task.status ?? "no-status"}`;
						acc[key] = (acc[key] ?? 0) + 1;
						return acc;
					}, {}),
				).sort(([a], [b]) => a.localeCompare(b)),
			),
			missingStudentLogins: db.students.filter((student) => !student.user_id || !student.login)
				.length,
			missingTeacherUsers: db.teachers.filter((teacher) => !teacher.user_id).length,
		},
		comparison: {
			missingGroups: comparison.groupIssues,
			unresolvedTeachers: comparison.unresolvedTeachers,
			teacherNameNeedsExactReview: comparison.nonExactTeachers,
			missingSubjects: comparison.subjectIssues,
			missingStudentsCount: comparison.missingStudents.length,
			missingStudentsSample: comparison.missingStudents.slice(0, 30),
			extraStudentsInDbCount: comparison.extraStudentsInDb.length,
			extraStudentsInDb: comparison.extraStudentsInDb,
			groupMismatchStudentsCount: comparison.groupMismatchStudents.length,
			groupMismatchStudentsSample: comparison.groupMismatchStudents.slice(0, 40),
			groupStudentCounts: comparison.groupStudentCounts,
			assignmentResolutionIssues: comparison.assignmentResolutionIssues,
			plannedAssignments: comparison.plannedAssignments.length,
			missingAssignmentsInDbCount: comparison.missingAssignmentsInDb.length,
			missingAssignmentsInDb: comparison.missingAssignmentsInDb,
			obsoleteAssignmentsInDbCount: comparison.obsoleteAssignmentsInDb.length,
			obsoleteAssignmentsInDb: comparison.obsoleteAssignmentsInDb,
		},
	};
	console.log(JSON.stringify(summary, null, 2));
};

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
