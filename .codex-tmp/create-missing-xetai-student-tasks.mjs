import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const ORG_ID = process.env.VITE_ORG_ID || "default";
const BRANCH_CODE = "XET";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey =
	process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
	throw new Error("Supabase environment variables are missing");
}

const supabase = createClient(supabaseUrl, supabaseKey);

const BATCH_SIZE = 1000;

const fetchAll = async (table, queryFn = (query) => query) => {
	const rows = [];
	let from = 0;
	while (true) {
		let query = supabase
			.from(table)
			.select("*")
			.eq("org_id", ORG_ID)
			.range(from, from + BATCH_SIZE - 1);
		query = queryFn(query);
		const { data, error } = await query;
		if (error) throw new Error(`${table}: ${error.message}`);
		rows.push(...(data || []));
		if (!data || data.length < BATCH_SIZE) break;
		from += BATCH_SIZE;
	}
	return rows;
};

const buildTaskId = ({
	cycleId,
	raterUid,
	targetType,
	targetId,
	groupId,
	subjectId,
	scopeKey,
}) =>
	[
		cycleId,
		raterUid,
		targetType,
		targetId,
		groupId ?? "all",
		scopeKey ?? subjectId ?? "all",
	].join("_");

const normalizeClassLevel = (value) =>
	String(value ?? "").trim().replace(/[^0-9]/g, "");

const normalizeSubjectCode = (value) =>
	String(value ?? "")
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, "");

const normalizeSubjectName = (value) =>
	String(value ?? "")
		.toLocaleLowerCase("az")
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/ə/g, "e")
		.replace(/ı/g, "i")
		.replace(/ş/g, "s")
		.replace(/ç/g, "c")
		.replace(/ğ/g, "g")
		.replace(/ö/g, "o")
		.replace(/ü/g, "u")
		.replace(/[^a-z0-9]/g, "");

const noPhysicalEducationClassLevels = new Set(["5", "6", "7"]);
const physicalEducationCodes = new Set([
	"PE",
	"BEDENTERBIYE",
	"FIZIKITERBIYE",
	"PHYSICALEDUCATION",
]);

const isPhysicalEducationSubject = (subject) => {
	const subjectCode = normalizeSubjectCode(subject?.code ?? null);
	if (subjectCode && physicalEducationCodes.has(subjectCode)) return true;
	if (subjectCode) return false;

	const normalizedName = normalizeSubjectName(subject?.name ?? null);
	return (
		normalizedName.includes("fizikiterbiye") ||
		normalizedName.includes("bedenterbiye") ||
		normalizedName.includes("physicaleducation")
	);
};

const insertBatched = async (rows) => {
	for (let index = 0; index < rows.length; index += 400) {
		const chunk = rows.slice(index, index + 400);
		const { error } = await supabase.from("tasks").upsert(chunk, {
			onConflict: "id",
			ignoreDuplicates: true,
		});
		if (error) {
			throw new Error(`tasks insert: ${error.message}`);
		}
	}
};

const main = async () => {
	const branches = await fetchAll("branches", (query) =>
		query.eq("code", BRANCH_CODE).is("deleted_at", null),
	);
	const branch = branches[0];
	if (!branch) throw new Error("Xetai branch not found");

	const cycles = await fetchAll("survey_cycles", (query) =>
		query.eq("status", "OPEN").order("start_at", { ascending: false }),
	);
	const scopedCycles = cycles.filter((cycle) => {
		const branchIds = cycle.branch_ids;
		return !branchIds || branchIds.includes(branch.id);
	});
	const cycle = scopedCycles[0];
	if (!cycle) throw new Error("Open Xetai cycle not found");

	const [
		users,
		students,
		teachers,
		groups,
		subjects,
		assignments,
		existingTasks,
	] = await Promise.all([
		fetchAll("users", (query) =>
			query.eq("branch_id", branch.id).is("deleted_at", null),
		),
		fetchAll("students", (query) =>
			query.eq("branch_id", branch.id).is("deleted_at", null),
		),
		fetchAll("teachers", (query) => query.is("deleted_at", null)),
		fetchAll("groups", (query) =>
			query.eq("branch_id", branch.id).is("deleted_at", null),
		),
		fetchAll("subjects", (query) => query.is("deleted_at", null)),
		fetchAll("teaching_assignments", (query) =>
			query.eq("branch_id", branch.id).is("deleted_at", null),
		),
		fetchAll("tasks", (query) =>
			query.eq("cycle_id", cycle.id).eq("branch_id", branch.id),
		),
	]);

	const assignmentYears = Array.from(
		new Set(assignments.map((assignment) => Number(assignment.year))),
	)
		.filter(Number.isFinite)
		.sort((a, b) => a - b);
	const cycleYear = Number(cycle.year);
	const assignmentYear = assignmentYears.includes(cycleYear)
		? cycleYear
		: assignmentYears[assignmentYears.length - 1];
	if (!assignmentYear) throw new Error("Xetai teaching assignment year not found");

	const studentByUserId = new Map();
	for (const student of students) {
		studentByUserId.set(student.id, student);
		if (student.user_id) studentByUserId.set(student.user_id, student);
		if (student.uid) studentByUserId.set(student.uid, student);
	}

	const usersById = new Map(users.map((user) => [user.id, user]));
	const teacherById = new Map(teachers.map((teacher) => [teacher.id, teacher]));
	const groupById = new Map(groups.map((group) => [group.id, group]));
	const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
	const existingTaskIds = new Set(existingTasks.map((task) => task.id));
	const existingStudentTeacherKeys = new Set(
		existingTasks
			.filter(
				(task) =>
					task.rater_role === "student" &&
					task.target_type === "teacher" &&
					task.group_id,
			)
			.map((task) => `${task.rater_id}_${task.target_id}_${task.group_id}`),
	);

	const assignmentsForYear = assignments.filter(
		(assignment) => Number(assignment.year) === assignmentYear,
	);
	const assignmentsByGroup = new Map();
	for (const assignment of assignmentsForYear) {
		if (!assignmentsByGroup.has(assignment.group_id)) {
			assignmentsByGroup.set(assignment.group_id, []);
		}
		assignmentsByGroup.get(assignment.group_id).push(assignment);
	}

	const studentUsers = users.filter((user) => user.role === "student");
	const rowsToInsert = [];
	const groupAudit = new Map();
	const studentsWithoutAssignments = [];
	let skippedPhysicalEducationAssignments = 0;

	for (const user of studentUsers) {
		const student = studentByUserId.get(user.id);
		if (!student) continue;
		const studentAssignments = (assignmentsByGroup.get(student.group_id) || [])
			.filter((assignment) => {
				const group = groupById.get(assignment.group_id);
				const subject = subjectById.get(assignment.subject_id) || null;
				const groupClassLevel = normalizeClassLevel(group?.class_level ?? null);
				if (
					noPhysicalEducationClassLevels.has(groupClassLevel) &&
					isPhysicalEducationSubject(subject)
				) {
					skippedPhysicalEducationAssignments += 1;
					return false;
				}
				return true;
			});

		if (studentAssignments.length === 0) {
			studentsWithoutAssignments.push({
				userId: user.id,
				studentId: student.id,
				studentUserId: student.user_id ?? null,
				groupName: groupById.get(student.group_id)?.name ?? student.group_id,
			});
			continue;
		}

		const groupedTeacherAssignments = new Map();
		for (const assignment of studentAssignments) {
			const key = `${assignment.teacher_id}_${assignment.group_id}`;
			const subjectName =
				subjectById.get(assignment.subject_id)?.name ?? assignment.subject_id;
			const existing = groupedTeacherAssignments.get(key);
			if (!existing) {
				groupedTeacherAssignments.set(key, {
					teacherId: assignment.teacher_id,
					groupId: assignment.group_id,
					branchId: assignment.branch_id,
					subjectNames: subjectName ? [subjectName] : [],
				});
				continue;
			}
			if (subjectName && !existing.subjectNames.includes(subjectName)) {
				existing.subjectNames.push(subjectName);
			}
		}

		for (const entry of groupedTeacherAssignments.values()) {
			const taskId = buildTaskId({
				cycleId: cycle.id,
				raterUid: user.id,
				targetType: "teacher",
				targetId: entry.teacherId,
				groupId: entry.groupId,
			});
			const existingKey = `${user.id}_${entry.teacherId}_${entry.groupId}`;
			if (existingTaskIds.has(taskId) || existingStudentTeacherKeys.has(existingKey)) {
				continue;
			}

			const groupName = groupById.get(entry.groupId)?.name ?? null;
			const groupCount = groupAudit.get(groupName ?? entry.groupId) ?? 0;
			groupAudit.set(groupName ?? entry.groupId, groupCount + 1);

			rowsToInsert.push({
				id: taskId,
				org_id: ORG_ID,
				cycle_id: cycle.id,
				rater_id: user.id,
				rater_role: "student",
				target_type: "teacher",
				target_id: entry.teacherId,
				target_name: teacherById.get(entry.teacherId)?.name ?? null,
				branch_id: entry.branchId,
				group_id: entry.groupId,
				subject_id: null,
				group_name: groupName,
				subject_name:
					entry.subjectNames.length > 0
						? entry.subjectNames.join(", ")
						: "Fenn gosterilmeyib",
				status: "OPEN",
			});
		}
	}

	const noTaskStudentUsers = studentUsers.filter((user) => {
		const student = studentByUserId.get(user.id);
		if (!student) return false;
		const hasExisting = existingTasks.some(
			(task) =>
				task.rater_id === user.id &&
				task.rater_role === "student" &&
				task.target_type === "teacher",
		);
		const hasNew = rowsToInsert.some((task) => task.rater_id === user.id);
		return !hasExisting && !hasNew;
	});

	console.log(
		JSON.stringify(
			{
				mode: APPLY ? "apply" : "dry-run",
				branch: { id: branch.id, name: branch.name, code: branch.code },
				cycle: {
					id: cycle.id,
					year: cycle.year,
					status: cycle.status,
					start_at: cycle.start_at,
					end_at: cycle.end_at,
				},
				assignmentYear,
				students: students.length,
				studentUsers: studentUsers.length,
				existingStudentTasks: existingTasks.filter(
					(task) =>
						task.rater_role === "student" && task.target_type === "teacher",
				).length,
				assignmentsForYear: assignmentsForYear.length,
				tasksToCreate: rowsToInsert.length,
				tasksToCreateByGroup: Object.fromEntries(
					[...groupAudit.entries()].sort(([a], [b]) => a.localeCompare(b)),
				),
				studentsWithoutAssignments: studentsWithoutAssignments.slice(0, 20),
				noTaskStudentUsersAfterPlan: noTaskStudentUsers.length,
				skippedPhysicalEducationAssignments,
			},
			null,
			2,
		),
	);

	if (APPLY && rowsToInsert.length > 0) {
		await insertBatched(rowsToInsert);
		console.log(`Inserted ${rowsToInsert.length} missing Xetai student tasks`);
	}
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
