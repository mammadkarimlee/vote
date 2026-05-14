import path from "node:path";
import dotenv from "dotenv";
import xlsx from "xlsx";
import { createClient } from "@supabase/supabase-js";

const ROOT_DIR = path.resolve("C:/Work/vote");
dotenv.config({ path: path.join(ROOT_DIR, ".env.local") });
dotenv.config({ path: path.join(ROOT_DIR, ".env"), override: false });

const ORG_ID = process.env.VITE_ORG_ID || "default";
const YEAR = 2026;
const INPUT_FILE =
	"C:/Users/mamma/Downloads/PKPD_sagird_uzre_butun_muellimler_1_sheet.xlsx";
const BRANCH_CODE = "XET";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
	throw new Error("Missing Supabase service credentials.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false },
});

const compactSpaces = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const normalizeKey = (value) =>
	compactSpaces(value)
		.normalize("NFKD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/ə/g, "e")
		.replace(/ı/g, "i")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();

const firstTwoKey = (value) => normalizeKey(value).split(" ").slice(0, 2).join(" ");

const normalizeClassLevel = (value, groupName) => {
	const raw = compactSpaces(value);
	if (/^x$/i.test(raw)) return "10";
	return raw || compactSpaces(groupName).match(/\d+/)?.[0] || "";
};

const normalizeGroupName = (sheetGroup, classLevel, block) => {
	const group = compactSpaces(sheetGroup);
	const cls = normalizeClassLevel(classLevel, group);
	const blk = compactSpaces(block).toUpperCase();
	if (!blk) return group;
	if (/^8-9\s*R/i.test(group)) {
		const side = /B\s*qrup/i.test(group) ? "B" : "A";
		return `XET ${group.replace(/\s+/g, " ").trim()} ${cls}-${blk} blok`;
	}
	return `XET ${group} ${blk} blok`;
};

const canonicalSubject = (raw, groupName) => {
	const key = normalizeKey(raw);
	const isRussianGroup = /(^|\s|-)R(\s|$|\()/i.test(groupName);
	if (key === "azerbaycan dili" || key === "azerb dili") {
		return isRussianGroup ? "Azərbaycan dili" : "Azərbaycan dili və ədəbiyyat";
	}
	if (key === "edebiyyat") {
		return isRussianGroup ? "Rus dili və ədəbiyyat" : "Azərbaycan dili və ədəbiyyat";
	}
	if (key === "rus dili") return "Rus dili və ədəbiyyat";
	if (key === "ingilis dili" || key === "grammar") return "İngilis dili";
	if (key === "informatika") return "İnformatika";
	if (key === "riyaziyyat") return "Riyaziyyat";
	if (key === "fizika") return "Fizika";
	if (key === "kimya") return "Kimya";
	if (key === "biologiya") return "Biologiya";
	if (key === "cografiya") return "Coğrafiya";
	if (key === "tarix") return "Tarix";
	return compactSpaces(raw);
};

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

const readSource = () => {
	const workbook = xlsx.readFile(INPUT_FILE);
	const sheet = workbook.Sheets[workbook.SheetNames[0]];
	const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" }).slice(1);
	const sourceRows = rows.map((row, index) => {
		const sheetGroup = compactSpaces(row[0]);
		const classLevel = normalizeClassLevel(row[1], sheetGroup);
		const block = compactSpaces(row[2]).toUpperCase();
		const groupName = normalizeGroupName(sheetGroup, classLevel, block);
		const studentName = compactSpaces(row[3]);
		const teacherName = compactSpaces(row[4]);
		const rawSubject = compactSpaces(row[5]);
		return {
			row: index + 2,
			sheetGroup,
			classLevel,
			block,
			groupName,
			studentName,
			teacherName,
			rawSubject,
			subjectName: canonicalSubject(rawSubject, sheetGroup),
		};
	});
	const studentsByKey = new Map();
	const assignmentsByKey = new Map();
	const membershipsByKey = new Map();
	for (const row of sourceRows) {
		studentsByKey.set(normalizeKey(row.studentName), {
			name: row.studentName,
			classLevel: row.classLevel,
			groupName: row.groupName,
		});
		membershipsByKey.set(`${normalizeKey(row.studentName)}|${normalizeKey(row.groupName)}`, {
			studentName: row.studentName,
			groupName: row.groupName,
			classLevel: row.classLevel,
			block: row.block,
		});
		assignmentsByKey.set(
			`${normalizeKey(row.groupName)}|${firstTwoKey(row.teacherName)}|${normalizeKey(row.subjectName)}`,
			{
				groupName: row.groupName,
				teacherName: row.teacherName,
				subjectName: row.subjectName,
			},
		);
	}
	return {
		rows: sourceRows,
		students: [...studentsByKey.values()],
		memberships: [...membershipsByKey.values()],
		assignments: [...assignmentsByKey.values()],
		groupNames: [...new Set(sourceRows.map((row) => row.groupName))].sort((a, b) =>
			a.localeCompare(b, "az", { numeric: true }),
		),
	};
};

const findBranch = async () => {
	const branches = await fetchAll("branches", "*", (query) =>
		query.eq("org_id", ORG_ID).or(`code.eq.${BRANCH_CODE},name.ilike.%X%tai%`),
	);
	const branch = branches.find((row) => row.code === BRANCH_CODE) ?? branches[0];
	if (!branch) throw new Error("Xətai branch not found.");
	return branch;
};

const resolveTeacher = (teacherName, teachers) => {
	const exact = teachers.filter((teacher) => normalizeKey(teacher.name) === normalizeKey(teacherName));
	if (exact.length === 1) return { teacher: exact[0], status: "exact" };
	const firstTwo = teachers.filter((teacher) => firstTwoKey(teacher.name) === firstTwoKey(teacherName));
	if (firstTwo.length === 1) return { teacher: firstTwo[0], status: "first_two" };
	return { teacher: null, status: "unresolved", matches: firstTwo.map((teacher) => teacher.name) };
};

const main = async () => {
	const source = readSource();
	const branch = await findBranch();
	const [
		groups,
		students,
		teachers,
		subjects,
		assignments,
		memberships,
		tasks,
		submissions,
	] = await Promise.all([
		fetchAll("groups", "*", (query) =>
			query.eq("org_id", ORG_ID).eq("branch_id", branch.id).is("deleted_at", null),
		),
		fetchAll("students", "*", (query) =>
			query.eq("org_id", ORG_ID).eq("branch_id", branch.id).is("deleted_at", null),
		),
		fetchAll("teachers", "*", (query) =>
			query.eq("org_id", ORG_ID).eq("branch_id", branch.id).is("deleted_at", null),
		),
		fetchAll("subjects", "*", (query) => query.eq("org_id", ORG_ID).is("deleted_at", null)),
		fetchAll("teaching_assignments", "*", (query) =>
			query
				.eq("org_id", ORG_ID)
				.eq("branch_id", branch.id)
				.eq("year", YEAR)
				.is("deleted_at", null),
		),
		fetchAll("student_group_memberships", "*", (query) =>
			query.eq("org_id", ORG_ID).eq("branch_id", branch.id).eq("year", YEAR),
		),
		fetchAll("tasks", "*", (query) => query.eq("org_id", ORG_ID).eq("branch_id", branch.id)),
		fetchAll("submissions", "*", (query) => query.eq("org_id", ORG_ID).eq("branch_id", branch.id)),
	]);

	const groupsByName = new Map(groups.map((group) => [normalizeKey(group.name), group]));
	const studentsByName = new Map(students.map((student) => [normalizeKey(student.name), student]));
	const subjectsByName = new Map(subjects.map((subject) => [normalizeKey(subject.name), subject]));
	const groupsById = new Map(groups.map((group) => [group.id, group]));
	const teachersById = new Map(teachers.map((teacher) => [teacher.id, teacher]));
	const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));

	const missingGroups = source.groupNames.filter((name) => !groupsByName.has(normalizeKey(name)));
	const missingStudents = source.students.filter((student) => !studentsByName.has(normalizeKey(student.name)));
	const extraStudents = students
		.filter((student) => !source.students.some((src) => normalizeKey(src.name) === normalizeKey(student.name)))
		.map((student) => ({
			name: student.name,
			group: groupsById.get(student.group_id)?.name ?? student.group_id,
			hasSubmissions: submissions.some((submission) => submission.user_id === student.user_id),
		}));

	const unresolvedTeachers = [];
	const firstTwoTeachers = [];
	const missingSubjects = [];
	const assignmentResolutionIssues = [];
	const plannedAssignments = [];
	for (const assignment of source.assignments) {
		const group = groupsByName.get(normalizeKey(assignment.groupName));
		const subject = subjectsByName.get(normalizeKey(assignment.subjectName));
		const teacherResult = resolveTeacher(assignment.teacherName, teachers);
		if (teacherResult.status === "first_two") {
			firstTwoTeachers.push({ source: assignment.teacherName, db: teacherResult.teacher.name });
		}
		if (!teacherResult.teacher) {
			unresolvedTeachers.push({ source: assignment.teacherName, matches: teacherResult.matches });
		}
		if (!subject && !missingSubjects.includes(assignment.subjectName)) {
			missingSubjects.push(assignment.subjectName);
		}
		if (!group || !subject || !teacherResult.teacher) {
			assignmentResolutionIssues.push({
				...assignment,
				missing: [
					!group ? "group" : null,
					!subject ? "subject" : null,
					!teacherResult.teacher ? "teacher" : null,
				].filter(Boolean),
			});
			continue;
		}
		plannedAssignments.push({
			groupId: group.id,
			teacherId: teacherResult.teacher.id,
			subjectId: subject.id,
			groupName: group.name,
			teacherName: teacherResult.teacher.name,
			subjectName: subject.name,
		});
	}

	const plannedAssignmentKeys = new Set(
		plannedAssignments.map((row) => `${row.groupId}|${row.teacherId}|${row.subjectId}`),
	);
	const dbAssignmentKeys = new Set(
		assignments.map((row) => `${row.group_id}|${row.teacher_id}|${row.subject_id}`),
	);
	const missingAssignments = plannedAssignments.filter(
		(row) => !dbAssignmentKeys.has(`${row.groupId}|${row.teacherId}|${row.subjectId}`),
	);
	const obsoleteAssignments = assignments
		.filter((row) => !plannedAssignmentKeys.has(`${row.group_id}|${row.teacher_id}|${row.subject_id}`))
		.map((row) => ({
			groupName: groupsById.get(row.group_id)?.name ?? row.group_id,
			teacherName: teachersById.get(row.teacher_id)?.name ?? row.teacher_id,
			subjectName: subjectsById.get(row.subject_id)?.name ?? row.subject_id,
			hasTasks: tasks.some((task) => task.assignment_id === row.id),
			hasSubmissions: submissions.some((submission) => submission.assignment_id === row.id),
		}));

	const membershipByKey = new Set(
		memberships.map((membership) => {
			const group = groupsById.get(membership.group_id);
			return `${membership.student_id}|${normalizeKey(group?.name ?? membership.group_id)}`;
		}),
	);
	const missingMemberships = source.memberships
		.map((membership) => {
			const student = studentsByName.get(normalizeKey(membership.studentName));
			const group = groupsByName.get(normalizeKey(membership.groupName));
			if (!student || !group) return null;
			const key = `${student.id}|${normalizeKey(group.name)}`;
			if (membershipByKey.has(key)) return null;
			return {
				studentName: student.name,
				groupName: group.name,
				classLevel: membership.classLevel,
				block: membership.block,
			};
		})
		.filter(Boolean);

	const groupCounts = source.groupNames.map((name) => ({
		groupName: name,
		sourceStudents: new Set(
			source.memberships
				.filter((membership) => membership.groupName === name)
				.map((membership) => membership.studentName),
		).size,
		dbGroupExists: groupsByName.has(normalizeKey(name)),
	}));

	console.log(
		JSON.stringify(
			{
				branch: { id: branch.id, name: branch.name, code: branch.code },
				source: {
					rows: source.rows.length,
					students: source.students.length,
					groups: source.groupNames.length,
					memberships: source.memberships.length,
					assignments: source.assignments.length,
					groupCounts,
				},
				db: {
					groups: groups.length,
					students: students.length,
					teachers: teachers.length,
					subjects: subjects.length,
					assignments: assignments.length,
					memberships: memberships.length,
					tasks: tasks.length,
					submissions: submissions.length,
				},
				issues: {
					missingGroups,
					missingStudentsCount: missingStudents.length,
					missingStudents: missingStudents.slice(0, 80),
					extraStudentsCount: extraStudents.length,
					extraStudents: extraStudents.slice(0, 80),
					unresolvedTeachers: [...new Map(unresolvedTeachers.map((item) => [item.source, item])).values()],
					firstTwoTeachers: [
						...new Map(firstTwoTeachers.map((item) => [`${item.source}|${item.db}`, item])).values(),
					],
					missingSubjects,
					assignmentResolutionIssues: assignmentResolutionIssues.slice(0, 120),
					missingAssignmentsCount: missingAssignments.length,
					missingAssignments: missingAssignments.slice(0, 120),
					obsoleteAssignmentsCount: obsoleteAssignments.length,
					obsoleteAssignments: obsoleteAssignments.slice(0, 120),
					missingMembershipsCount: missingMemberships.length,
					missingMemberships: missingMemberships.slice(0, 120),
				},
			},
			null,
			2,
		),
	);
};

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
