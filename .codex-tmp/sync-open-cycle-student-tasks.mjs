import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const ORG_ID = process.env.VITE_ORG_ID || "default";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey =
	process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
	throw new Error("Supabase environment variables are missing");
}

const supabase = createClient(supabaseUrl, supabaseKey);

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
	const code = normalizeSubjectCode(subject?.code ?? null);
	if (code && physicalEducationCodes.has(code)) return true;
	if (code) return false;
	const name = normalizeSubjectName(subject?.name ?? null);
	return (
		name.includes("fizikiterbiye") ||
		name.includes("bedenterbiye") ||
		name.includes("physicaleducation")
	);
};

const insertBatched = async (rows) => {
	for (let index = 0; index < rows.length; index += 400) {
		const chunk = rows.slice(index, index + 400);
		const { error } = await supabase.from("tasks").upsert(chunk, {
			onConflict: "id",
			ignoreDuplicates: true,
		});
		if (error) throw new Error(`tasks insert: ${error.message}`);
	}
};

const main = async () => {
	const [
		branches,
		openCycles,
		users,
		students,
		teachers,
		groups,
		subjects,
		assignments,
		memberships,
		existingTasks,
	] = await Promise.all([
		fetchAll("branches", (query) => query.is("deleted_at", null)),
		fetchAll("survey_cycles", (query) =>
			query.eq("status", "OPEN").order("start_at", { ascending: false }),
		),
		fetchAll("users", (query) => query.is("deleted_at", null)),
		fetchAll("students", (query) => query.is("deleted_at", null)),
		fetchAll("teachers", (query) => query.is("deleted_at", null)),
		fetchAll("groups", (query) => query.is("deleted_at", null)),
		fetchAll("subjects", (query) => query.is("deleted_at", null)),
		fetchAll("teaching_assignments", (query) => query.is("deleted_at", null)),
		fetchAll("student_group_memberships", (query) =>
			query.is("deleted_at", null),
		),
		fetchAll("tasks"),
	]);

	const branchById = new Map(branches.map((branch) => [branch.id, branch]));
	const teacherById = new Map(teachers.map((teacher) => [teacher.id, teacher]));
	const groupById = new Map(groups.map((group) => [group.id, group]));
	const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
	const rowsToInsert = [];
	const auditRows = [];

	for (const cycle of openCycles) {
		const branchIds =
			cycle.branch_ids && cycle.branch_ids.length > 0
				? cycle.branch_ids
				: branches.map((branch) => branch.id);
		const branchIdSet = new Set(branchIds);
		const scopedAssignments = assignments.filter((assignment) =>
			branchIdSet.has(assignment.branch_id),
		);
		const assignmentYears = Array.from(
			new Set(scopedAssignments.map((assignment) => Number(assignment.year))),
		)
			.filter(Number.isFinite)
			.sort((a, b) => a - b);
		const cycleYear = Number(cycle.year);
		const assignmentYear = assignmentYears.includes(cycleYear)
			? cycleYear
			: assignmentYears[assignmentYears.length - 1];
		if (!assignmentYear) {
			auditRows.push({
				cycle: cycle.id,
				year: cycle.year,
				status: "no-assignment-year",
			});
			continue;
		}

		const cycleExistingTasks = existingTasks.filter(
			(task) => task.cycle_id === cycle.id,
		);
		const existingTaskIds = new Set(cycleExistingTasks.map((task) => task.id));
		const scheduledTaskIds = new Set(existingTaskIds);
		const existingStudentTeacherKeys = new Set(
			cycleExistingTasks
				.filter(
					(task) =>
						task.rater_role === "student" &&
						task.target_type === "teacher" &&
						task.group_id,
				)
				.map((task) => `${task.rater_id}_${task.target_id}_${task.group_id}`),
		);

		const assignmentsForYear = scopedAssignments.filter(
			(assignment) => Number(assignment.year) === assignmentYear,
		);
		const assignmentsByGroup = new Map();
		for (const assignment of assignmentsForYear) {
			if (!assignmentsByGroup.has(assignment.group_id)) {
				assignmentsByGroup.set(assignment.group_id, []);
			}
			assignmentsByGroup.get(assignment.group_id).push(assignment);
		}

		const membershipsForYear = memberships.filter(
			(membership) =>
				branchIdSet.has(membership.branch_id) &&
				Number(membership.year) === assignmentYear,
		);
		const membershipsByStudentKey = new Map();
		const addMembershipGroup = (key, groupId) => {
			if (!key) return;
			const groupIds = membershipsByStudentKey.get(key) ?? new Set();
			groupIds.add(groupId);
			membershipsByStudentKey.set(key, groupIds);
		};
		for (const membership of membershipsForYear) {
			addMembershipGroup(membership.student_id, membership.group_id);
			addMembershipGroup(membership.user_id, membership.group_id);
		}

		for (const branchId of branchIds) {
			const branch = branchById.get(branchId);
			if (!branch) continue;
			const branchUsers = users.filter(
				(user) => user.branch_id === branchId && user.role === "student",
			);
			const branchStudents = students.filter(
				(student) => student.branch_id === branchId,
			);
			const studentByUserId = new Map();
			for (const student of branchStudents) {
				studentByUserId.set(student.id, student);
				if (student.user_id) studentByUserId.set(student.user_id, student);
			}

			let createdForBranch = 0;
			const noAssignments = [];

			for (const user of branchUsers) {
				const student = studentByUserId.get(user.id);
				if (!student) continue;
				const studentGroupIds = new Set([student.group_id]);
				for (const key of [student.id, student.user_id, user.id]) {
					const membershipGroups = membershipsByStudentKey.get(key);
					membershipGroups?.forEach((groupId) => studentGroupIds.add(groupId));
				}

				const studentAssignments = [...studentGroupIds]
					.flatMap((groupId) => assignmentsByGroup.get(groupId) || [])
					.filter((assignment) => {
						const group = groupById.get(assignment.group_id);
						const subject = subjectById.get(assignment.subject_id) || null;
						const level = normalizeClassLevel(
							group?.class_level ?? student.class_level,
						);
						return !(
							noPhysicalEducationClassLevels.has(level) &&
							isPhysicalEducationSubject(subject)
						);
					});

				if (studentAssignments.length === 0) {
					noAssignments.push({
						student: student.name,
						group: groupById.get(student.group_id)?.name ?? student.group_id,
					});
					continue;
				}

				const grouped = new Map();
				for (const assignment of studentAssignments) {
					const key = `${assignment.teacher_id}_${assignment.group_id}`;
					const subjectName =
						subjectById.get(assignment.subject_id)?.name ?? assignment.subject_id;
					const existing = grouped.get(key);
					if (!existing) {
						grouped.set(key, {
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

				for (const entry of grouped.values()) {
					const taskId = buildTaskId({
						cycleId: cycle.id,
						raterUid: user.id,
						targetType: "teacher",
						targetId: entry.teacherId,
						groupId: entry.groupId,
					});
					const existingKey = `${user.id}_${entry.teacherId}_${entry.groupId}`;
					if (
						scheduledTaskIds.has(taskId) ||
						existingStudentTeacherKeys.has(existingKey)
					) {
						continue;
					}

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
						group_name: groupById.get(entry.groupId)?.name ?? null,
						subject_name:
							entry.subjectNames.length > 0
								? entry.subjectNames.join(", ")
								: "Fenn gosterilmeyib",
						status: "OPEN",
					});
					scheduledTaskIds.add(taskId);
					createdForBranch += 1;
				}
			}

			auditRows.push({
				cycle: cycle.id,
				year: cycle.year,
				branch: branch.name,
				code: branch.code,
				assignmentYear,
				students: branchStudents.length,
				existingStudentTasks: cycleExistingTasks.filter(
					(task) =>
						task.branch_id === branchId &&
						task.rater_role === "student" &&
						task.target_type === "teacher",
				).length,
				tasksToCreate: createdForBranch,
				studentsWithoutAssignments: noAssignments.length,
				studentsWithoutAssignmentsSample: noAssignments.slice(0, 10),
			});
		}
	}

	console.log(
		JSON.stringify(
			{
				mode: APPLY ? "apply" : "dry-run",
				totalTasksToCreate: rowsToInsert.length,
				audit: auditRows,
			},
			null,
			2,
		),
	);

	if (APPLY && rowsToInsert.length > 0) {
		const dir = path.join(
			".codex-tmp",
			"open-cycle-student-task-sync",
			new Date().toISOString().replace(/[:.]/g, "-"),
		);
		await fs.mkdir(dir, { recursive: true });
		await fs.writeFile(
			path.join(dir, "tasks-to-insert.json"),
			JSON.stringify(rowsToInsert, null, 2),
		);
		await insertBatched(rowsToInsert);
		console.log(`Inserted ${rowsToInsert.length} missing student tasks`);
	}
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
