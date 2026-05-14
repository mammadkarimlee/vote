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
const BRANCH_CODE = "QUR";
const INPUT_FILE =
	"C:/Users/mamma/Downloads/Bloklar_9_11_sagird_uzre_butun_muellimler_1_sheet.xlsx";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
	throw new Error("Missing Supabase service credentials.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false },
});

const baseGroupByClass = new Map([
	["9", "9A3"],
	["10", "10A3"],
	["11", "11A3"],
]);

const teacherAliases = new Map([
	["f ferzeliyev", "Fətəli Fərzəliyev"],
	["ilahə eliyeva", "İlahə Əzizli"],
	["ilahe eliyeva", "İlahə Əzizli"],
]);

const studentAliases = new Map([
	["serdar haci", "Hacı Sərdar"],
	["esgerov ekber", "Əsgərli Əkbərəli"],
	["allahverdiyev omer", "Allahverdiyev ?m?r"],
	["esgerov cefersadiq", "Cəfəri Sadiq"],
	["qasimov cesur", "Qasımlı Cəsur"],
	["cahangirli nilay", "Cahangir Nilay"],
	["eliyeva nubar", "Əliyeva Nübarxanım"],
	["ismayilov eli", "İsmayılov Əli"],
]);

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

const loginCharMap = {
	Ə: "E",
	ə: "e",
	İ: "I",
	ı: "i",
	Ş: "S",
	ş: "s",
	Ç: "C",
	ç: "c",
	Ğ: "G",
	ğ: "g",
	Ö: "O",
	ö: "o",
	Ü: "U",
	ü: "u",
};

const normalizeLoginPart = (value) =>
	String(value ?? "")
		.split("")
		.map((char) => loginCharMap[char] ?? char)
		.join("")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]/g, "");

const buildLoginFromName = (fullName) => {
	const parts = compactSpaces(fullName).split(/\s+/).filter(Boolean);
	const first = parts[0] ?? "";
	const last = parts.length > 1 ? parts[parts.length - 1] : "";
	return (
		normalizeLoginPart(first).slice(0, 3) +
			normalizeLoginPart(last).slice(0, 2) ||
		normalizeLoginPart(fullName).slice(0, 5) ||
		"user"
	);
};

const ensureUniqueLogin = async (base) => {
	let candidate = base;
	let counter = 1;
	while (counter < 1000) {
		const { data, error } = await supabase
			.from("usernames")
			.select("login")
			.eq("org_id", ORG_ID)
			.eq("login", candidate)
			.maybeSingle();
		if (error) throw new Error(`usernames lookup: ${error.message}`);
		if (!data) return candidate;
		candidate = `${base}${counter}`;
		counter += 1;
	}
	throw new Error(`Unique login not available for ${base}`);
};

const subjectName = (value) => {
	const key = normalizeKey(value);
	const map = new Map([
		["azerbaycan dili", "Azərbaycan dili"],
		["edebiyyat", "Ədəbiyyat"],
		["biologiya", "Biologiya"],
		["cografiya", "Coğrafiya"],
		["fizika", "Fizika"],
		["informatika", "İnformatika"],
		["kimya", "Kimya"],
		["riyaziyyat", "Riyaziyyat"],
		["tarix", "Tarix"],
	]);
	return map.get(key) ?? compactSpaces(value);
};

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
		.slice(7)
		.filter((row) => String(row[0] ?? "").trim());

	const sourceRows = rows.map((row, index) => {
		const classLevel = compactSpaces(row[2]);
		const block = compactSpaces(row[3]).toUpperCase();
		const baseGroup = baseGroupByClass.get(classLevel);
		const groupName = `${baseGroup}-${block}`;
		return {
			rowNumber: index + 8,
			sourceSheet: compactSpaces(row[1]),
			classLevel,
			block,
			groupName,
			studentName: compactSpaces(row[5]),
			subjectName: subjectName(row[6]),
			teacherName: compactSpaces(row[7]),
		};
	});

	const missingRequired = sourceRows.filter(
		(row) =>
			!row.classLevel ||
			!row.block ||
			!row.groupName ||
			!row.studentName ||
			!row.subjectName ||
			!row.teacherName,
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
			block: row.block,
		});
		studentsByName.set(normalizeKey(row.studentName), {
			name: row.studentName,
			classLevel: row.classLevel,
			groupName: row.groupName,
		});
		membershipsByKey.set(
			`${normalizeKey(row.studentName)}|${normalizeKey(row.groupName)}`,
			{ studentName: row.studentName, groupName: row.groupName },
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
		baseGroupNames: [...baseGroupByClass.values()],
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

const resolveStudent = (studentName, students, classLevel = null) => {
	const scopedStudents = classLevel
		? students.filter((student) => String(student.class_level) === String(classLevel))
		: students;
	const alias = studentAliases.get(normalizeKey(studentName));
	const wanted = alias ?? studentName;
	const exact = scopedStudents.filter((student) => normalizeKey(student.name) === normalizeKey(wanted));
	if (exact.length === 1) return exact[0];
	const firstTwo = scopedStudents.filter((student) => firstTwoKey(student.name) === firstTwoKey(wanted));
	if (firstTwo.length === 1) return firstTwo[0];
	const wantedKey = normalizeKey(wanted);
	if (wantedKey.includes("ismay") && wantedKey.includes("eli")) {
		const ismayilov = scopedStudents.filter((student) => normalizeKey(student.name).includes("ismay"));
		if (ismayilov.length === 1) return ismayilov[0];
	}
	return null;
};

const createStudentLogin = async ({ name, branch, group, classLevel }) => {
	const login = await ensureUniqueLogin(buildLoginFromName(name));
	const email = `${login}@${process.env.LOGIN_EMAIL_DOMAIN || process.env.VITE_LOGIN_EMAIL_DOMAIN || "vote.local"}`;
	const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
		email,
		password: login,
		email_confirm: true,
	});
	if (authError || !authUser.user) {
		throw new Error(`auth create ${name}: ${authError?.message ?? "no user"}`);
	}
	const uid = authUser.user.id;
	const usernameRow = {
		org_id: ORG_ID,
		login,
		user_id: uid,
		role: "student",
		branch_id: branch.id,
	};
	const userRow = {
		id: uid,
		org_id: ORG_ID,
		role: "student",
		branch_id: branch.id,
		display_name: name,
		login,
		email,
		auth_user_id: uid,
	};
	const studentRow = {
		id: uid,
		org_id: ORG_ID,
		name,
		branch_id: branch.id,
		group_id: group.id,
		class_level: classLevel,
		user_id: uid,
		login,
	};
	const { error: userError } = await supabase.from("users").insert(userRow);
	if (userError) throw new Error(`user create ${name}: ${userError.message}`);
	const { error: usernameError } = await supabase.from("usernames").insert(usernameRow);
	if (usernameError) throw new Error(`username create ${name}: ${usernameError.message}`);
	const { error: studentError } = await supabase.from("students").insert(studentRow);
	if (studentError) throw new Error(`student create ${name}: ${studentError.message}`);
	return studentRow;
};

const main = async () => {
	const source = readSource();
	const branches = await fetchAll("branches", "*", (query) =>
		query.eq("code", BRANCH_CODE).is("deleted_at", null),
	);
	const branch = branches[0];
	if (!branch) throw new Error("Qurtuluş branch not found.");

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

	const qurtulusOpenCycles = openCycles.filter(
		(cycle) =>
			!cycle.branch_ids ||
			cycle.branch_ids.length === 0 ||
			cycle.branch_ids.includes(branch.id),
	);
	const openCycleIds = new Set(qurtulusOpenCycles.map((cycle) => cycle.id));
	const groupsByName = new Map(groups.map((group) => [normalizeKey(group.name), group]));
	const subjectsByName = new Map(subjects.map((subject) => [normalizeKey(subject.name), subject]));
	const teachersById = new Map(teachers.map((teacher) => [teacher.id, teacher]));

	const sourceStudentIds = new Set();
	const missingStudents = [];
	for (const student of source.students) {
		const dbStudent = resolveStudent(student.name, students, student.classLevel);
		if (!dbStudent) {
			missingStudents.push(student);
			continue;
		}
		sourceStudentIds.add(dbStudent.id);
	}
	const studentsToCreate = missingStudents.map((student) => ({
		...student,
		baseGroupName: baseGroupByClass.get(student.classLevel),
	}));
	if (APPLY && studentsToCreate.length > 0) {
		for (const student of studentsToCreate) {
			const baseGroup = groupsByName.get(normalizeKey(student.baseGroupName));
			if (!baseGroup) {
				throw new Error(`Base group not found for ${student.name}: ${student.baseGroupName}`);
			}
			const created = await createStudentLogin({
				name: student.name,
				branch,
				group: baseGroup,
				classLevel: student.classLevel,
			});
			students.push(created);
			sourceStudentIds.add(created.id);
		}
	}
	const sourceStudentUserIds = new Set(
		students
			.filter((student) => sourceStudentIds.has(student.id) && student.user_id)
			.map((student) => student.user_id),
	);
	const studentTaskIds = tasks
		.filter(
			(task) =>
				openCycleIds.has(task.cycle_id) &&
				task.rater_role === "student" &&
				task.target_type === "teacher" &&
				sourceStudentUserIds.has(task.rater_id),
		)
		.map((task) => task.id);
	const submittedStudentTaskIds = new Set(
		submissions
			.filter((submission) => studentTaskIds.includes(submission.task_id))
			.map((submission) => submission.task_id),
	);
	if (submittedStudentTaskIds.size > 0) {
		throw new Error(
			`Abort: ${submittedStudentTaskIds.size} Qurtuluş block student task submissions exist.`,
		);
	}

	const groupsToUpsert = source.groups.map((group) => {
		const existing = groupsByName.get(normalizeKey(group.name));
		return {
			id: existing?.id ?? `qurtulus-2026-${slug(group.name)}`,
			org_id: ORG_ID,
			branch_id: branch.id,
			class_level: group.classLevel,
			name: group.name,
			deleted_at: null,
			archived_at: null,
		};
	});
	const plannedGroupsByName = new Map(groupsToUpsert.map((group) => [normalizeKey(group.name), group]));

	const unresolvedAssignments = [];
	const plannedAssignments = [];
	for (const assignment of source.assignments) {
		const teacher = resolveTeacher(assignment.teacherName, teachers);
		const subject = subjectsByName.get(normalizeKey(assignment.subjectName));
		const group = plannedGroupsByName.get(normalizeKey(assignment.groupName));
		if (!teacher || !subject || !group) {
			unresolvedAssignments.push({
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
		});
	}

	if (unresolvedAssignments.length > 0) {
		console.log(
			JSON.stringify(
				{
					mode: APPLY ? "apply" : "dry-run",
					abort: true,
					studentsToCreate,
					unresolvedAssignments,
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
	const touchedGroupIds = new Set([
		...source.baseGroupNames
			.map((name) => groupsByName.get(normalizeKey(name))?.id)
			.filter(Boolean),
		...groupsToUpsert.map((group) => group.id),
	]);
	const assignmentsToArchive = assignments
		.filter(
			(assignment) =>
				touchedGroupIds.has(assignment.group_id) &&
				!plannedAssignmentIds.has(assignment.id) &&
				!assignment.deleted_at,
		)
		.map((assignment) => assignment.id);

	const existingMembershipByKey = new Map(
		memberships.map((membership) => [
			`${membership.student_id}|${membership.group_id}|${membership.membership_type}`,
			membership,
		]),
	);
	const skippedMemberships = [];
	const membershipRows = source.memberships.map((membership) => {
		const sourceStudent = source.students.find(
			(student) => normalizeKey(student.name) === normalizeKey(membership.studentName),
		);
		const student = resolveStudent(membership.studentName, students, sourceStudent?.classLevel);
		const group = plannedGroupsByName.get(normalizeKey(membership.groupName));
		if (!student || !group) {
			skippedMemberships.push(membership);
			return null;
		}
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
	}).filter(Boolean);
	const plannedMembershipIds = new Set(membershipRows.map((membership) => membership.id));
	const membershipsToArchive = memberships
		.filter(
			(membership) =>
				touchedGroupIds.has(membership.group_id) &&
				!plannedMembershipIds.has(membership.id) &&
				!membership.deleted_at,
		)
		.map((membership) => membership.id);

	const groupsById = new Map(groupsToUpsert.map((group) => [group.id, group]));
	const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));
	const assignmentsByGroup = new Map();
	for (const assignment of assignmentRows) {
		if (!assignmentsByGroup.has(assignment.group_id)) assignmentsByGroup.set(assignment.group_id, []);
		assignmentsByGroup.get(assignment.group_id).push(assignment);
	}
	const membershipsByStudentId = new Map();
	for (const membership of membershipRows) {
		const groupIds = membershipsByStudentId.get(membership.student_id) ?? new Set();
		groupIds.add(membership.group_id);
		membershipsByStudentId.set(membership.student_id, groupIds);
	}

	const studentTasksToCreate = [];
	for (const cycle of qurtulusOpenCycles) {
		for (const student of students.filter((row) => sourceStudentIds.has(row.id))) {
			if (!student.user_id) continue;
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
						raterUid: student.user_id,
						targetType: "teacher",
						targetId: entry.teacherId,
						groupId: entry.groupId,
					}),
					org_id: ORG_ID,
					cycle_id: cycle.id,
					rater_id: student.user_id,
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
		"qurtulus-block-rebuild",
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
			skippedMemberships: skippedMemberships.length,
			membershipsToArchive: membershipsToArchive.length,
			studentTasksToDelete: studentTaskIds.length,
			studentTasksToCreate: studentTasksToCreate.length,
			studentsToCreate,
			openCycles: qurtulusOpenCycles.map((cycle) => ({
				id: cycle.id,
				year: cycle.year,
				branchIds: cycle.branch_ids,
			})),
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
	console.log("Applied Qurtuluş block rebuild successfully.");
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
