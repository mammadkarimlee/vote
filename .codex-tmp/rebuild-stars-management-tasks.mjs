import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const ORG_ID = process.env.VITE_ORG_ID || "default";
const BRANCH_CODE = "STR";
const CYCLE_YEAR = 2026;
const BATCH_SIZE = 500;

const MANAGEMENT_SCOPE_DEPARTMENT_LABEL = "Kafedranızın müəllimi olaraq";
const MANAGEMENT_SCOPE_BRANCH_LABEL = "Filial rəhbərliyi olaraq";
const QUESTION_SET_OPEN_TOKEN = "__question_set_open__";
const QUESTION_SET_CLOSED_TOKEN = "__question_set_closed__";
const MANAGEMENT_QUESTION_ID = "management-teacher-score-v1";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey =
	process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
	throw new Error("Supabase environment variables are missing");
}

const supabase = createClient(supabaseUrl, supabaseKey);

const fetchAll = async (table, select = "*", queryFn = (query) => query) => {
	const rows = [];
	let from = 0;

	while (true) {
		let query = supabase.from(table).select(select).range(from, from + 999);
		query = queryFn(query);
		const { data, error } = await query;
		if (error) {
			throw new Error(`${table}: ${error.message}`);
		}

		rows.push(...(data || []));
		if (!data || data.length < 1000) {
			break;
		}
		from += 1000;
	}

	return rows;
};

const fetchAllWithRetry = async (
	table,
	select = "*",
	queryFn = (query) => query,
) => {
	let lastError = null;
	for (let attempt = 1; attempt <= 4; attempt += 1) {
		try {
			return await fetchAll(table, select, queryFn);
		} catch (error) {
			lastError = error;
			if (attempt < 4) {
				await new Promise((resolve) => setTimeout(resolve, attempt * 500));
			}
		}
	}
	throw lastError;
};

const chunkArray = (items, size) => {
	const chunks = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
};

const stripQuestionSetStateTokens = (questionIds = []) =>
	questionIds.filter(
		(id) =>
			id !== QUESTION_SET_OPEN_TOKEN && id !== QUESTION_SET_CLOSED_TOKEN,
	);

const encodeQuestionSetStateTokens = (questionIds, isOpen) => [
	...stripQuestionSetStateTokens(questionIds),
	isOpen ? QUESTION_SET_OPEN_TOKEN : QUESTION_SET_CLOSED_TOKEN,
];

const buildTaskId = ({
	cycleId,
	raterUid,
	targetType,
	targetId,
	groupId = null,
	scopeKey = null,
	subjectId = null,
}) =>
	[
		cycleId,
		raterUid,
		targetType,
		targetId,
		groupId ?? "all",
		scopeKey ?? subjectId ?? "all",
	].join("_");

const managementDepartmentScopeKey = (departmentId) =>
	`management-department-${departmentId}`;

const managementBranchScopeKey = (branchId) =>
	`management-branch-${branchId}`;

const upsertRows = async (table, rows, options = {}) => {
	for (const chunk of chunkArray(rows, BATCH_SIZE)) {
		if (chunk.length === 0) continue;
		const { error } = await supabase.from(table).upsert(chunk, options);
		if (error) {
			throw new Error(`${table} upsert failed: ${error.message}`);
		}
	}
};

const deleteRowsById = async (table, ids) => {
	for (const chunk of chunkArray(ids, 100)) {
		if (chunk.length === 0) continue;
		const { error } = await supabase.from(table).delete().in("id", chunk);
		if (error) {
			throw new Error(`${table} delete failed: ${error.message}`);
		}
	}
};

const updateQuestionSetState = async ({ cycleId, targetFlow, isOpen }) => {
	const existing = await fetchAll("question_sets", "*", (query) =>
		query
			.eq("org_id", ORG_ID)
			.eq("cycle_id", cycleId)
			.eq("target_flow", targetFlow),
	);

	const questionIds =
		targetFlow === "management_teacher"
			? [MANAGEMENT_QUESTION_ID]
			: stripQuestionSetStateTokens(existing[0]?.question_ids ?? []);

	const payload = {
		org_id: ORG_ID,
		cycle_id: cycleId,
		target_flow: targetFlow,
		question_ids: encodeQuestionSetStateTokens(questionIds, isOpen),
		updated_at: new Date().toISOString(),
	};

	const { error } = await supabase.from("question_sets").upsert(payload, {
		onConflict: "org_id,cycle_id,target_flow",
	});
	if (error) {
		throw new Error(`question_sets ${targetFlow}: ${error.message}`);
	}
};

const main = async () => {
	const branches = await fetchAll("branches", "*", (query) =>
		query.eq("org_id", ORG_ID).eq("code", BRANCH_CODE).is("deleted_at", null),
	);
	const branch = branches[0];
	if (!branch) {
		throw new Error(`Branch not found: ${BRANCH_CODE}`);
	}

	const cycles = await fetchAll("survey_cycles", "*", (query) =>
		query.eq("org_id", ORG_ID).eq("year", CYCLE_YEAR),
	);
	const cycle = cycles.find((item) =>
		(item.branch_ids || []).includes(branch.id),
	);
	if (!cycle) {
		throw new Error(`Cycle not found for ${branch.name}, year ${CYCLE_YEAR}`);
	}

	const [
		allTasks,
		allSubmissions,
		questionSets,
		managementAssignments,
		users,
		teachers,
		departments,
	] = await Promise.all([
		fetchAll("tasks", "*", (query) =>
			query
				.eq("org_id", ORG_ID)
				.eq("cycle_id", cycle.id)
				.eq("branch_id", branch.id),
		),
		fetchAll("submissions", "*", (query) =>
			query
				.eq("org_id", ORG_ID)
				.eq("cycle_id", cycle.id)
				.eq("branch_id", branch.id),
		),
		fetchAll("question_sets", "*", (query) =>
			query.eq("org_id", ORG_ID).eq("cycle_id", cycle.id),
		),
		fetchAll("management_assignments", "*", (query) =>
			query
				.eq("org_id", ORG_ID)
				.eq("branch_id", branch.id)
				.eq("year", CYCLE_YEAR)
				.is("deleted_at", null),
		),
		fetchAll("users", "*", (query) =>
			query.eq("org_id", ORG_ID).is("deleted_at", null),
		),
		fetchAll("teachers", "*", (query) =>
			query.eq("org_id", ORG_ID).is("deleted_at", null),
		),
		fetchAll("departments", "*", (query) =>
			query.eq("org_id", ORG_ID).is("deleted_at", null),
		),
	]);

	const allAnswers = [];
	for (const chunk of chunkArray(allSubmissions.map((row) => row.task_id), 25)) {
		if (chunk.length === 0) continue;
		allAnswers.push(
			...(await fetchAllWithRetry("answers", "*", (query) =>
				query.eq("org_id", ORG_ID).in("submission_id", chunk),
			)),
		);
	}

	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const backupDir = path.join(
		".codex-tmp",
		"stars-management-rebuild",
		timestamp,
	);
	const backup = {
		createdAt: new Date().toISOString(),
		branch,
		cycle,
		questionSets,
		tasks: allTasks,
		submissions: allSubmissions,
		answers: allAnswers,
		managementAssignments,
	};
	await fs.mkdir(backupDir, { recursive: true });
	await fs.writeFile(
		path.join(backupDir, "stars-cycle-backup.json"),
		JSON.stringify(backup, null, 2),
		"utf8",
	);

	const submissionsByTaskId = new Set(allSubmissions.map((row) => row.task_id));
	const tasksByRole = allTasks.reduce((acc, task) => {
		acc[task.rater_role] = (acc[task.rater_role] || 0) + 1;
		return acc;
	}, {});
	const submissionsByRole = allSubmissions.reduce((acc, submission) => {
		const task = allTasks.find((item) => item.id === submission.task_id);
		const role = task?.rater_role || "unknown";
		acc[role] = (acc[role] || 0) + 1;
		return acc;
	}, {});

	const usersById = new Map(users.map((user) => [user.id, user]));
	const teacherByUserId = new Map();
	for (const teacher of teachers) {
		if (teacher.user_id) {
			teacherByUserId.set(teacher.user_id, teacher.id);
		}
		teacherByUserId.set(teacher.id, teacher.id);
	}

	const targetTeachersForAssignment = (assignment) =>
		teachers.filter((teacher) => {
			const branchIds = teacher.branch_ids || [];
			const isInBranch =
				teacher.branch_id === assignment.branch_id ||
				branchIds.includes(assignment.branch_id);
			if (!isInBranch) return false;
			if (assignment.department_id) {
				return teacher.department_id === assignment.department_id;
			}
			return true;
		});

	const nextManagerTasks = [];
	let skippedAssignments = 0;
	let skippedSelf = 0;

	for (const assignment of managementAssignments) {
		const rater = usersById.get(assignment.manager_id);
		if (!rater || (rater.role !== "manager" && rater.role !== "teacher")) {
			skippedAssignments += 1;
			continue;
		}

		const raterTeacherId = teacherByUserId.get(assignment.manager_id);
		for (const teacher of targetTeachersForAssignment(assignment)) {
			if (raterTeacherId && raterTeacherId === teacher.id) {
				skippedSelf += 1;
				continue;
			}

			const scopeKey = assignment.department_id
				? managementDepartmentScopeKey(assignment.department_id)
				: managementBranchScopeKey(assignment.branch_id);
			const groupName = assignment.department_id
				? MANAGEMENT_SCOPE_DEPARTMENT_LABEL
				: MANAGEMENT_SCOPE_BRANCH_LABEL;
			const taskId = buildTaskId({
				cycleId: cycle.id,
				raterUid: assignment.manager_id,
				targetType: "teacher",
				targetId: teacher.id,
				scopeKey,
			});

			nextManagerTasks.push({
				id: taskId,
				org_id: ORG_ID,
				cycle_id: cycle.id,
				rater_id: assignment.manager_id,
				rater_role: "manager",
				target_type: "teacher",
				target_id: teacher.id,
				target_name: teacher.name || null,
				branch_id: assignment.branch_id,
				group_id: null,
				subject_id: null,
				group_name: groupName,
				subject_name: null,
				status: "OPEN",
				submitted_at: null,
			});
		}
	}

	const deletableManagerTasks = allTasks.filter(
		(task) =>
			task.rater_role === "manager" &&
			task.target_type === "teacher" &&
			!submissionsByTaskId.has(task.id),
	);
	const protectedManagerTasks = allTasks.filter(
		(task) =>
			task.rater_role === "manager" &&
			task.target_type === "teacher" &&
			submissionsByTaskId.has(task.id),
	);

	const summary = {
		mode: APPLY ? "apply" : "dry-run",
		backupPath: path.join(backupDir, "stars-cycle-backup.json"),
		branch: branch.name,
		cycleId: cycle.id,
		cycleStatusBefore: cycle.status,
		tasksBefore: allTasks.length,
		tasksByRole,
		submissionsBefore: allSubmissions.length,
		submissionsByRole,
		answersBefore: allAnswers.length,
		managementAssignments: managementAssignments.length,
		managerTasksToDelete: deletableManagerTasks.length,
		managerTasksProtected: protectedManagerTasks.length,
		managerTasksToCreate: nextManagerTasks.length,
		skippedAssignments,
		skippedSelf,
	};

	console.log(JSON.stringify(summary, null, 2));

	if (!APPLY) {
		return;
	}

	if (protectedManagerTasks.length > 0) {
		throw new Error(
			`Refusing to rebuild: ${protectedManagerTasks.length} manager tasks already have submissions`,
		);
	}

	await upsertRows(
		"questions",
		[
			{
				id: MANAGEMENT_QUESTION_ID,
				org_id: ORG_ID,
				text: "Rəhbərliyinizdə olan müəllimi 1-10 aralığında qiymətləndirin.",
				type: "scale",
				required: true,
				scale_min: 1,
				scale_max: 10,
				category: "rəhbərlik",
			},
		],
		{ onConflict: "id" },
	);

	await updateQuestionSetState({
		cycleId: cycle.id,
		targetFlow: "student_teacher",
		isOpen: false,
	});
	await updateQuestionSetState({
		cycleId: cycle.id,
		targetFlow: "teacher_self",
		isOpen: false,
	});
	await updateQuestionSetState({
		cycleId: cycle.id,
		targetFlow: "management_teacher",
		isOpen: true,
	});

	await deleteRowsById(
		"tasks",
		deletableManagerTasks.map((task) => task.id),
	);
	await upsertRows("tasks", nextManagerTasks, { onConflict: "id" });

	const { error: cycleError } = await supabase
		.from("survey_cycles")
		.update({ status: "OPEN" })
		.eq("org_id", ORG_ID)
		.eq("id", cycle.id);
	if (cycleError) {
		throw new Error(`survey_cycles update failed: ${cycleError.message}`);
	}

	const [afterTasks, afterSubmissions] = await Promise.all([
		fetchAll("tasks", "*", (query) =>
			query
				.eq("org_id", ORG_ID)
				.eq("cycle_id", cycle.id)
				.eq("branch_id", branch.id),
		),
		fetchAll("submissions", "*", (query) =>
			query
				.eq("org_id", ORG_ID)
				.eq("cycle_id", cycle.id)
				.eq("branch_id", branch.id),
		),
	]);
	const afterAnswers = [];
	for (const chunk of chunkArray(afterSubmissions.map((row) => row.task_id), 25)) {
		if (chunk.length === 0) continue;
		afterAnswers.push(
			...(await fetchAllWithRetry("answers", "*", (query) =>
				query.eq("org_id", ORG_ID).in("submission_id", chunk),
			)),
		);
	}

	const afterTaskById = new Map(afterTasks.map((task) => [task.id, task]));
	const afterSubmissionsByRole = afterSubmissions.reduce((acc, submission) => {
		const task = afterTaskById.get(submission.task_id);
		const role = task?.rater_role || "unknown";
		acc[role] = (acc[role] || 0) + 1;
		return acc;
	}, {});
	const afterTasksByRole = afterTasks.reduce((acc, task) => {
		acc[task.rater_role] = (acc[task.rater_role] || 0) + 1;
		return acc;
	}, {});

	console.log(
		JSON.stringify(
			{
				applied: true,
				tasksAfter: afterTasks.length,
				afterTasksByRole,
				submissionsAfter: afterSubmissions.length,
				afterSubmissionsByRole,
				answersAfter: afterAnswers.length,
			},
			null,
			2,
		),
	);
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
