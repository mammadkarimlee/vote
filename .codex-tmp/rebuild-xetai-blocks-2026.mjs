import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import xlsx from "xlsx";
import { createClient } from "@supabase/supabase-js";

const ROOT_DIR = path.resolve("C:/Work/vote");
dotenv.config({ path: path.join(ROOT_DIR, ".env.local") });
dotenv.config({ path: path.join(ROOT_DIR, ".env"), override: false });

const APPLY = process.argv.includes("--apply");
const ORG_ID = process.env.VITE_ORG_ID || "default";
const YEAR = 2026;
const BRANCH_CODE = "XET";
const INPUT_FILE =
	"C:/Users/mamma/Downloads/PKPD_sagird_uzre_butun_muellimler_1_sheet.xlsx";

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

const slug = (value) =>
	normalizeKey(value)
		.replace(/\s+/g, "-")
		.replace(/^-+|-+$/g, "");

const normalizeClassLevel = (value, groupName) => {
	const raw = compactSpaces(value);
	if (/^x$/i.test(raw)) return "10";
	return raw || compactSpaces(groupName).match(/\d+/)?.[0] || "";
};

const normalizeSheetGroup = (value) =>
	compactSpaces(value)
		.replace(/\s*\(\s*/g, "(")
		.replace(/\s*\)\s*/g, ")")
		.replace(/\s*-\s*/g, "-")
		.replace(/\s+/g, " ");

const blockGroupName = (sheetGroupRaw, classLevelRaw, blockRaw) => {
	const sheetGroup = normalizeSheetGroup(sheetGroupRaw);
	const classLevel = normalizeClassLevel(classLevelRaw, sheetGroup);
	const block = compactSpaces(blockRaw).toUpperCase();
	if (/^8-9\s*R/i.test(sheetGroup)) {
		return `${sheetGroup}-${classLevel}-${block}`;
	}
	return `${sheetGroup}-${block}`;
};

const subjectName = (raw) => {
	const key = normalizeKey(raw);
	const map = new Map([
		["azerbaycan dili", "Azərbaycan dili"],
		["azerb dili", "Azərbaycan dili"],
		["edebiyyat", "Ədəbiyyat"],
		["rus dili", "Rus dili"],
		["ingilis dili", "İngilis dili"],
		["grammar", "İngilis dili"],
		["informatika", "İnformatika"],
		["riyaziyyat", "Riyaziyyat"],
		["fizika", "Fizika"],
		["kimya", "Kimya"],
		["biologiya", "Biologiya"],
		["cografiya", "Coğrafiya"],
		["tarix", "Tarix"],
	]);
	return map.get(key) ?? compactSpaces(raw);
};

const teacherAliases = new Map([
	["agabaliyeva nurcahan elxan", "Ağabalayeva Nurcahan Elxan"],
]);

const fetchAll = async (table, select = "*", build = (query) => query) => {
	const rows = [];
	for (let from = 0; ; from += 1000) {
		const { data, error } = await build(
			supabase.from(table).select(select).eq("org_id", ORG_ID),
		).range(from, from + 999);
		if (error) throw new Error(`${table}: ${error.message}`);
		rows.push(...(data ?? []));
		if (!data || data.length < 1000) break;
	}
	return rows;
};

const updateBatched = async (table, ids, patch) => {
	for (let index = 0; index < ids.length; index += 100) {
		const chunk = ids.slice(index, index + 100);
		const { error } = await supabase.from(table).update(patch).in("id", chunk);
		if (error) throw new Error(`${table} update: ${error.message}`);
	}
};

const deleteTasksBatched = async (ids) => {
	for (let index = 0; index < ids.length; index += 100) {
		const chunk = ids.slice(index, index + 100);
		const { error } = await supabase.from("tasks").delete().in("id", chunk);
		if (error) throw new Error(`tasks delete: ${error.message}`);
	}
};

const upsertBatched = async (table, rows, options = {}) => {
	for (let index = 0; index < rows.length; index += 300) {
		const chunk = rows.slice(index, index + 300);
		const { error } = await supabase.from(table).upsert(chunk, options);
		if (error) throw new Error(`${table} upsert: ${error.message}`);
	}
};

const insertBatched = async (table, rows) => {
	for (let index = 0; index < rows.length; index += 300) {
		const chunk = rows.slice(index, index + 300);
		const { error } = await supabase.from(table).insert(chunk);
		if (error) throw new Error(`${table} insert: ${error.message}`);
	}
};

const readSource = () => {
	const workbook = xlsx.readFile(INPUT_FILE);
	const rows = xlsx.utils
		.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
			header: 1,
			defval: "",
		})
		.slice(1);

	const sourceRows = rows.map((row, index) => {
		const sheetGroup = compactSpaces(row[0]);
		const classLevel = normalizeClassLevel(row[1], sheetGroup);
		const block = compactSpaces(row[2]).toUpperCase();
		return {
			rowNumber: index + 2,
			sheetGroup,
			classLevel,
			block,
			groupName: blockGroupName(sheetGroup, classLevel, block),
			studentName: compactSpaces(row[3]),
			teacherName: compactSpaces(row[4]),
			subjectName: subjectName(row[5]),
		};
	});

	const missingRequired = sourceRows.filter(
		(row) =>
			!row.groupName ||
			!row.classLevel ||
			!row.block ||
			!row.studentName ||
			!row.teacherName ||
			!row.subjectName,
	);
	if (missingRequired.length > 0) {
		throw new Error(
			`Source has ${missingRequired.length} incomplete rows. First row: ${JSON.stringify(
				missingRequired[0],
			)}`,
		);
	}

	const groupsByName = new Map();
	const studentsByName = new Map();
	const membershipsByKey = new Map();
	const assignmentsByKey = new Map();

	for (const row of sourceRows) {
		groupsByName.set(row.groupName, {
			name: row.groupName,
			classLevel: row.classLevel,
			sheetGroup: row.sheetGroup,
			block: row.block,
		});
		studentsByName.set(normalizeKey(row.studentName), {
			name: row.studentName,
			classLevel: row.classLevel,
			groupName: row.groupName,
		});
		membershipsByKey.set(
			`${normalizeKey(row.studentName)}|${normalizeKey(row.groupName)}`,
			{
				studentName: row.studentName,
				groupName: row.groupName,
			},
		);
		assignmentsByKey.set(
			`${normalizeKey(row.groupName)}|${firstTwoKey(row.teacherName)}|${normalizeKey(
				row.subjectName,
			)}`,
			{
				groupName: row.groupName,
				teacherName: row.teacherName,
				subjectName: row.subjectName,
			},
		);
	}

	return {
		rows: sourceRows,
		groups: [...groupsByName.values()],
		students: [...studentsByName.values()],
		memberships: [...membershipsByKey.values()],
		assignments: [...assignmentsByKey.values()],
	};
};

const buildTaskId = ({ cycleId, raterUid, targetType, targetId, groupId }) =>
	[cycleId, raterUid, targetType, targetId, groupId ?? "all", "all"].join("_");

const resolveTeacher = (teacherName, teachers) => {
	const alias = teacherAliases.get(normalizeKey(teacherName));
	const wanted = alias ?? teacherName;
	const exact = teachers.filter((teacher) => normalizeKey(teacher.name) === normalizeKey(wanted));
	if (exact.length === 1) return exact[0];
	const firstTwo = teachers.filter((teacher) => firstTwoKey(teacher.name) === firstTwoKey(wanted));
	if (firstTwo.length === 1) return firstTwo[0];
	return null;
};

const main = async () => {
	const source = readSource();
	const branches = await fetchAll("branches", "*", (query) =>
		query.or(`code.eq.${BRANCH_CODE},name.ilike.%X%tai%`).is("deleted_at", null),
	);
	const branch = branches.find((row) => row.code === BRANCH_CODE) ?? branches[0];
	if (!branch) throw new Error("Xətai branch not found.");

	const [
		groups,
		students,
		teachers,
		subjects,
		assignments,
		memberships,
		openCycles,
		tasks,
		submissions,
	] = await Promise.all([
		fetchAll("groups", "*", (query) => query.eq("branch_id", branch.id)),
		fetchAll("students", "*", (query) =>
			query.eq("branch_id", branch.id).is("deleted_at", null),
		),
		fetchAll("teachers", "*", (query) =>
			query.eq("branch_id", branch.id).is("deleted_at", null),
		),
		fetchAll("subjects", "*", (query) => query.is("deleted_at", null)),
		fetchAll("teaching_assignments", "*", (query) =>
			query.eq("branch_id", branch.id).eq("year", YEAR),
		),
		fetchAll("student_group_memberships", "*", (query) =>
			query.eq("branch_id", branch.id).eq("year", YEAR),
		),
		fetchAll("survey_cycles", "*", (query) => query.eq("status", "OPEN")),
		fetchAll("tasks", "*", (query) => query.eq("branch_id", branch.id)),
		fetchAll("submissions", "*", (query) => query.eq("branch_id", branch.id)),
	]);

	const xetaiOpenCycles = openCycles.filter(
		(cycle) =>
			!cycle.branch_ids ||
			cycle.branch_ids.length === 0 ||
			cycle.branch_ids.includes(branch.id),
	);
	const openCycleIds = new Set(xetaiOpenCycles.map((cycle) => cycle.id));
	const studentTaskIds = tasks
		.filter(
			(task) =>
				openCycleIds.has(task.cycle_id) &&
				task.rater_role === "student" &&
				task.target_type === "teacher",
		)
		.map((task) => task.id);
	const submittedStudentTaskIds = new Set(
		submissions
			.filter((submission) => studentTaskIds.includes(submission.task_id))
			.map((submission) => submission.task_id),
	);
	if (submittedStudentTaskIds.size > 0) {
		throw new Error(
			`Abort: ${submittedStudentTaskIds.size} Xətai student task submissions exist.`,
		);
	}

	const groupsByName = new Map(groups.map((group) => [normalizeKey(group.name), group]));
	const studentsByName = new Map(students.map((student) => [normalizeKey(student.name), student]));
	const subjectsByName = new Map(subjects.map((subject) => [normalizeKey(subject.name), subject]));
	const teachersById = new Map(teachers.map((teacher) => [teacher.id, teacher]));

	const groupsToUpsert = source.groups.map((group) => {
		const existing = groupsByName.get(normalizeKey(group.name));
		return {
			id: existing?.id ?? `xetai-2026-${slug(group.name)}`,
			org_id: ORG_ID,
			branch_id: branch.id,
			class_level: group.classLevel,
			name: group.name,
			deleted_at: null,
			archived_at: null,
		};
	});
	const plannedGroupsByName = new Map(groupsToUpsert.map((group) => [normalizeKey(group.name), group]));

	const missingStudents = source.students.filter(
		(student) => !studentsByName.has(normalizeKey(student.name)),
	);

	const unresolvedTeachers = [];
	const plannedAssignments = [];
	for (const assignment of source.assignments) {
		const teacher = resolveTeacher(assignment.teacherName, teachers);
		const subject = subjectsByName.get(normalizeKey(assignment.subjectName));
		const group = plannedGroupsByName.get(normalizeKey(assignment.groupName));
		if (!teacher || !subject || !group) {
			unresolvedTeachers.push({
				...assignment,
				missing: [
					!teacher ? "teacher" : null,
					!subject ? "subject" : null,
					!group ? "group" : null,
				].filter(Boolean),
			});
			continue;
		}
		plannedAssignments.push({
			id: randomUUID(),
			org_id: ORG_ID,
			teacher_id: teacher.id,
			group_id: group.id,
			subject_id: subject.id,
			branch_id: branch.id,
			year: YEAR,
			deleted_at: null,
			archived_at: null,
			teacherName: teacher.name,
			groupName: group.name,
			subjectName: subject.name,
		});
	}

	if (missingStudents.length > 0 || unresolvedTeachers.length > 0) {
		console.log(
			JSON.stringify(
				{
					mode: APPLY ? "apply" : "dry-run",
					abort: true,
					missingStudents,
					unresolvedAssignments: unresolvedTeachers,
				},
				null,
				2,
			),
		);
		process.exitCode = 1;
		return;
	}

	const existingAssignmentByKey = new Map(
		assignments.map((assignment) => [
			`${assignment.teacher_id}|${assignment.group_id}|${assignment.subject_id}`,
			assignment,
		]),
	);
	const assignmentRows = plannedAssignments.map((assignment) => {
		const existing = existingAssignmentByKey.get(
			`${assignment.teacher_id}|${assignment.group_id}|${assignment.subject_id}`,
		);
		return {
			id: existing?.id ?? assignment.id,
			org_id: assignment.org_id,
			teacher_id: assignment.teacher_id,
			group_id: assignment.group_id,
			subject_id: assignment.subject_id,
			branch_id: assignment.branch_id,
			year: assignment.year,
			deleted_at: null,
			archived_at: null,
		};
	});
	const plannedAssignmentIds = new Set(assignmentRows.map((assignment) => assignment.id));
	const assignmentsToArchive = assignments
		.filter((assignment) => !plannedAssignmentIds.has(assignment.id) && !assignment.deleted_at)
		.map((assignment) => assignment.id);

	const existingMembershipByKey = new Map(
		memberships.map((membership) => [
			`${membership.student_id}|${membership.group_id}|${membership.membership_type}`,
			membership,
		]),
	);
	const membershipRows = source.memberships.map((membership) => {
		const student = studentsByName.get(normalizeKey(membership.studentName));
		const group = plannedGroupsByName.get(normalizeKey(membership.groupName));
		const key = `${student.id}|${group.id}|block`;
		const existing = existingMembershipByKey.get(key);
		return {
			id: existing?.id ?? randomUUID(),
			org_id: ORG_ID,
			branch_id: branch.id,
			student_id: student.id,
			user_id: student.user_id ?? null,
			group_id: group.id,
			year: YEAR,
			membership_type: "block",
			deleted_at: null,
		};
	});
	const plannedMembershipIds = new Set(membershipRows.map((membership) => membership.id));
	const membershipsToArchive = memberships
		.filter((membership) => !plannedMembershipIds.has(membership.id) && !membership.deleted_at)
		.map((membership) => membership.id);

	const groupsById = new Map(groupsToUpsert.map((group) => [group.id, group]));
	const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));
	const assignmentsByGroup = new Map();
	for (const assignment of assignmentRows) {
		if (!assignmentsByGroup.has(assignment.group_id)) {
			assignmentsByGroup.set(assignment.group_id, []);
		}
		assignmentsByGroup.get(assignment.group_id).push(assignment);
	}
	const membershipsByStudentId = new Map();
	for (const membership of membershipRows) {
		const groupIds = membershipsByStudentId.get(membership.student_id) ?? new Set();
		groupIds.add(membership.group_id);
		membershipsByStudentId.set(membership.student_id, groupIds);
	}

	const studentTasksToCreate = [];
	for (const cycle of xetaiOpenCycles) {
		const usersByStudentId = new Map(students.map((student) => [student.id, student.user_id]));
		for (const student of students) {
			const userId = usersByStudentId.get(student.id);
			if (!userId) continue;
			const groupIds = membershipsByStudentId.get(student.id) ?? new Set();
			const grouped = new Map();
			for (const groupId of groupIds) {
				for (const assignment of assignmentsByGroup.get(groupId) ?? []) {
					const key = `${assignment.teacher_id}|${assignment.group_id}`;
					const subject = subjectsById.get(assignment.subject_id);
					const existing = grouped.get(key);
					if (!existing) {
						grouped.set(key, {
							teacherId: assignment.teacher_id,
							groupId: assignment.group_id,
							subjectNames: subject?.name ? [subject.name] : [],
						});
						continue;
					}
					if (subject?.name && !existing.subjectNames.includes(subject.name)) {
						existing.subjectNames.push(subject.name);
					}
				}
			}
			for (const entry of grouped.values()) {
				studentTasksToCreate.push({
					id: buildTaskId({
						cycleId: cycle.id,
						raterUid: userId,
						targetType: "teacher",
						targetId: entry.teacherId,
						groupId: entry.groupId,
					}),
					org_id: ORG_ID,
					cycle_id: cycle.id,
					rater_id: userId,
					rater_role: "student",
					target_type: "teacher",
					target_id: entry.teacherId,
					target_name: teachersById.get(entry.teacherId)?.name ?? null,
					branch_id: branch.id,
					group_id: entry.groupId,
					subject_id: null,
					group_name: groupsById.get(entry.groupId)?.name ?? null,
					subject_name:
						entry.subjectNames.length > 0
							? entry.subjectNames.join(", ")
							: "Fənn göstərilməyib",
					status: "OPEN",
				});
			}
		}
	}

	const backupDir = path.join(
		ROOT_DIR,
		".codex-tmp",
		"xetai-block-rebuild",
		new Date().toISOString().replace(/[:.]/g, "-"),
	);
	const summary = {
		mode: APPLY ? "apply" : "dry-run",
		backupDir,
		branch: { id: branch.id, name: branch.name, code: branch.code },
		source: {
			rows: source.rows.length,
			students: source.students.length,
			groups: source.groups.length,
			memberships: source.memberships.length,
			assignments: source.assignments.length,
		},
		plan: {
			groupsToUpsert: groupsToUpsert.length,
			assignmentsToUpsert: assignmentRows.length,
			assignmentsToArchive: assignmentsToArchive.length,
			membershipsToUpsert: membershipRows.length,
			membershipsToArchive: membershipsToArchive.length,
			studentTasksToDelete: studentTaskIds.length,
			studentTasksToCreate: studentTasksToCreate.length,
			openCycles: xetaiOpenCycles.map((cycle) => ({
				id: cycle.id,
				year: cycle.year,
				branchIds: cycle.branch_ids,
			})),
			extraStudentsIgnored: students
				.filter(
					(student) =>
						!source.students.some(
							(sourceStudent) =>
								normalizeKey(sourceStudent.name) === normalizeKey(student.name),
						),
				)
				.map((student) => student.name),
		},
	};
	console.log(JSON.stringify(summary, null, 2));

	if (!APPLY) return;

	await fs.mkdir(backupDir, { recursive: true });
	await fs.writeFile(
		path.join(backupDir, "backup.json"),
		JSON.stringify(
			{ groups, students, teachers, subjects, assignments, memberships, tasks, submissions },
			null,
			2,
		),
	);
	await fs.writeFile(
		path.join(backupDir, "plan.json"),
		JSON.stringify(
			{ summary, groupsToUpsert, assignmentRows, membershipRows, studentTasksToCreate },
			null,
			2,
		),
	);

	await upsertBatched("groups", groupsToUpsert, { onConflict: "id" });
	if (assignmentsToArchive.length > 0) {
		await updateBatched("teaching_assignments", assignmentsToArchive, {
			deleted_at: new Date().toISOString(),
		});
	}
	await upsertBatched("teaching_assignments", assignmentRows, { onConflict: "id" });
	if (membershipsToArchive.length > 0) {
		await updateBatched("student_group_memberships", membershipsToArchive, {
			deleted_at: new Date().toISOString(),
		});
	}
	await upsertBatched("student_group_memberships", membershipRows, { onConflict: "id" });
	if (studentTaskIds.length > 0) {
		await deleteTasksBatched(studentTaskIds);
	}
	if (studentTasksToCreate.length > 0) {
		await insertBatched("tasks", studentTasksToCreate);
	}
	console.log("Applied Xətai block rebuild successfully.");
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
