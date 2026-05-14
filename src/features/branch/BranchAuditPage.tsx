import { useEffect, useMemo, useState } from "react";
import { PaginationControls } from "../../components/PaginationControls";
import { useFeedbackState } from "../../components/feedback/FeedbackProvider";
import { ORG_ID, supabase } from "../../lib/supabase";
import {
	mapDepartmentRow,
	mapGroupRow,
	mapManagementAssignmentRow,
	mapQuestionSetRow,
	mapStudentAssignmentOverrideRow,
	mapStudentGroupMembershipRow,
	mapStudentRow,
	mapSubmissionRow,
	mapSubjectRow,
	mapSurveyCycleRow,
	mapTaskRow,
	mapTeacherRow,
	mapTeachingAssignmentRow,
	mapUserRow,
} from "../../lib/supabaseMappers";
import type {
	DepartmentDoc,
	GroupDoc,
	ManagementAssignmentDoc,
	QuestionSetDoc,
	StudentAssignmentOverrideDoc,
	StudentGroupMembershipDoc,
	StudentDoc,
	SubmissionDoc,
	SubjectDoc,
	SurveyCycleDoc,
	TaskDoc,
	TeacherDoc,
	TeachingAssignmentDoc,
	UserDoc,
} from "../../lib/types";
import {
	managementBranchScopeKey,
	managementDepartmentScopeKey,
} from "../../lib/managementScope";
import {
	buildStudentMembershipMap,
	resolveStudentAssignments,
} from "../../lib/studentAssignmentOverrides";
import { usePagination } from "../../lib/usePagination";
import { formatShortDate, toJsDate } from "../../lib/utils";
import { BranchSelector } from "./BranchSelector";
import { useBranchScope } from "./useBranchScope";

type DocEntry<T> = { id: string; data: T };
type FlowKey = QuestionSetDoc["targetFlow"];
type BaseData = {
	cycles: Array<DocEntry<SurveyCycleDoc>>;
	users: Array<DocEntry<UserDoc>>;
	students: Array<DocEntry<StudentDoc>>;
	teachers: Array<DocEntry<TeacherDoc>>;
	groups: Array<DocEntry<GroupDoc>>;
	subjects: Array<DocEntry<SubjectDoc>>;
	departments: Array<DocEntry<DepartmentDoc>>;
	assignments: Array<DocEntry<TeachingAssignmentDoc>>;
	studentGroupMemberships: Array<DocEntry<StudentGroupMembershipDoc>>;
	studentAssignmentOverrides: Array<DocEntry<StudentAssignmentOverrideDoc>>;
	managementAssignments: Array<DocEntry<ManagementAssignmentDoc>>;
};
type CycleData = {
	questionSets: Array<DocEntry<QuestionSetDoc>>;
	tasks: Array<DocEntry<TaskDoc>>;
	submissions: Array<DocEntry<SubmissionDoc>>;
};

const SUPABASE_BATCH_SIZE = 1000;
const FLOW_ORDER: FlowKey[] = [
	"student_teacher",
	"management_teacher",
	"teacher_self",
	"teacher_management",
];
const FLOW_LABELS: Record<FlowKey, string> = {
	student_teacher: "Şagird -> Müəllim",
	management_teacher: "Rəhbərlik -> Müəllim",
	teacher_self: "Müəllim -> Özü",
	teacher_management: "Müəllim -> Rəhbərlik",
};

const emptyBase = (): BaseData => ({
	cycles: [],
	users: [],
	students: [],
	teachers: [],
	groups: [],
	subjects: [],
	departments: [],
	assignments: [],
	studentGroupMemberships: [],
	studentAssignmentOverrides: [],
	managementAssignments: [],
});

const emptyCycleData = (): CycleData => ({
	questionSets: [],
	tasks: [],
	submissions: [],
});

const buildTaskId = (task: {
	cycleId: string;
	raterUid: string;
	targetType: string;
	targetId: string;
	groupId?: string | null;
	subjectId?: string | null;
	scopeKey?: string | null;
}) =>
	[
		task.cycleId,
		task.raterUid,
		task.targetType,
		task.targetId,
		task.groupId ?? "all",
		task.scopeKey ?? task.subjectId ?? "all",
	].join("_");

const fetchAllBatched = async <T,>(
	fetchPage: (
		from: number,
		to: number,
	) => Promise<{ data: T[] | null; error: { message?: string } | null }>,
) => {
	const rows: T[] = [];
	let from = 0;

	while (true) {
		const to = from + SUPABASE_BATCH_SIZE - 1;
		const { data, error } = await fetchPage(from, to);
		if (error) throw new Error(error.message ?? "Məlumat yüklənmədi");
		const page = data ?? [];
		rows.push(...page);
		if (page.length < SUPABASE_BATCH_SIZE) break;
		from += SUPABASE_BATCH_SIZE;
	}

	return rows;
};

const flowFromTask = (task: TaskDoc): FlowKey => {
	if (task.raterRole === "student" && task.targetType === "teacher") {
		return "student_teacher";
	}
	if (task.raterRole === "teacher" && task.targetType === "teacher") {
		return "teacher_self";
	}
	if (task.raterRole === "teacher" && task.targetType === "manager") {
		return "teacher_management";
	}
	return "management_teacher";
};

const resolveCycleState = (
	cycle?: SurveyCycleDoc | null,
	questionSet?: QuestionSetDoc | null,
) => {
	if (!cycle) return { open: false, label: "Dövr tapılmadı" };
	if (cycle.status !== "OPEN") {
		return { open: false, label: `Dövr ${cycle.status.toLowerCase()}` };
	}
	if (!questionSet) return { open: false, label: "Sual seti yoxdur" };
	if (!questionSet.isOpen) return { open: false, label: "Sorğu bağlıdır" };
	if ((questionSet.questionIds ?? []).length === 0) {
		return { open: false, label: "Sual yoxdur" };
	}

	const now = new Date();
	const start = toJsDate(cycle.startAt);
	const end = toJsDate(cycle.endAt);
	if (start && now < start) return { open: false, label: "Hələ başlamayıb" };
	if (end && now > end) return { open: false, label: "Müddət bitib" };
	return { open: true, label: "Hazırdır" };
};

const normalizeClassLevel = (value?: string | null) =>
	String(value ?? "").trim().replace(/[^0-9]/g, "");

const normalizeSubjectCode = (value?: string | null) =>
	String(value ?? "")
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, "");

const normalizeSubjectName = (value?: string | null) =>
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

const isPhysicalEducationSubject = (
	subject?: { code?: string | null; name?: string | null } | null,
) => {
	const subjectCode = normalizeSubjectCode(subject?.code ?? null);
	if (
		subjectCode &&
		new Set(["PE", "BEDENTERBIYE", "FIZIKITERBIYE", "PHYSICALEDUCATION"]).has(
			subjectCode,
		)
	) {
		return true;
	}
	if (subjectCode) return false;

	const normalizedName = normalizeSubjectName(subject?.name ?? null);
	return (
		normalizedName.includes("fizikiterbiye") ||
		normalizedName.includes("bedenterbiye") ||
		normalizedName.includes("physicaleducation")
	);
};

const previewNames = (names: string[]) => {
	if (names.length === 0) return "-";
	const preview = names.slice(0, 3).join(", ");
	return names.length > 3 ? `${preview} +${names.length - 3}` : preview;
};

export const BranchAuditPage = () => {
	const { branchId, setBranchId, branches, branchName, isSuperAdmin } =
		useBranchScope();
	const [status, setStatus] = useFeedbackState();
	const [selectedCycleId, setSelectedCycleId] = useState("");
	const [baseData, setBaseData] = useState<BaseData>(emptyBase);
	const [cycleData, setCycleData] = useState<CycleData>(emptyCycleData);
	const [loadingBase, setLoadingBase] = useState(true);
	const [loadingCycleData, setLoadingCycleData] = useState(false);

	useEffect(() => {
		if (isSuperAdmin && !branchId && branches.length > 0) {
			setBranchId(branches[0].id);
		}
	}, [branchId, branches, isSuperAdmin, setBranchId]);

	useEffect(() => {
		let active = true;

		const loadBaseData = async () => {
			setLoadingBase(true);
			setStatus(null);
			try {
				const [
					cycleRows,
					userRows,
					studentRows,
					teacherRows,
					groupRows,
					subjectRows,
					departmentRows,
					assignmentRows,
					membershipRows,
					overrideRows,
					managementRows,
				] = await Promise.all([
					fetchAllBatched<any>(async (from, to) =>
						supabase
							.from("survey_cycles")
							.select("*")
							.eq("org_id", ORG_ID)
							.order("year", { ascending: false })
							.range(from, to),
					),
					fetchAllBatched<any>(async (from, to) =>
						supabase
							.from("users")
							.select("*")
							.eq("org_id", ORG_ID)
							.is("deleted_at", null)
							.order("id")
							.range(from, to),
					),
					fetchAllBatched<any>(async (from, to) =>
						supabase
							.from("students")
							.select("*")
							.eq("org_id", ORG_ID)
							.is("deleted_at", null)
							.order("id")
							.range(from, to),
					),
					fetchAllBatched<any>(async (from, to) =>
						supabase
							.from("teachers")
							.select("*")
							.eq("org_id", ORG_ID)
							.is("deleted_at", null)
							.order("id")
							.range(from, to),
					),
					fetchAllBatched<any>(async (from, to) =>
						supabase
							.from("groups")
							.select("*")
							.eq("org_id", ORG_ID)
							.is("deleted_at", null)
							.order("id")
							.range(from, to),
					),
					fetchAllBatched<any>(async (from, to) =>
						supabase
							.from("subjects")
							.select("*")
							.eq("org_id", ORG_ID)
							.is("deleted_at", null)
							.order("id")
							.range(from, to),
					),
					fetchAllBatched<any>(async (from, to) =>
						supabase
							.from("departments")
							.select("*")
							.eq("org_id", ORG_ID)
							.is("deleted_at", null)
							.order("id")
							.range(from, to),
					),
					fetchAllBatched<any>(async (from, to) =>
						supabase
							.from("teaching_assignments")
							.select("*")
							.eq("org_id", ORG_ID)
							.is("deleted_at", null)
							.order("id")
							.range(from, to),
					),
					fetchAllBatched<any>(async (from, to) =>
						supabase
							.from("student_group_memberships")
							.select("*")
							.eq("org_id", ORG_ID)
							.is("deleted_at", null)
							.order("id")
							.range(from, to),
					).catch((error) => {
						const message = error instanceof Error ? error.message : "";
						if (message.includes("student_group_memberships")) return [];
						throw error;
					}),
					fetchAllBatched<any>(async (from, to) =>
						supabase
							.from("student_assignment_overrides")
							.select("*")
							.eq("org_id", ORG_ID)
							.is("deleted_at", null)
							.order("id")
							.range(from, to),
					).catch((error) => {
						const message = error instanceof Error ? error.message : "";
						if (message.includes("student_assignment_overrides")) return [];
						throw error;
					}),
					fetchAllBatched<any>(async (from, to) =>
						supabase
							.from("management_assignments")
							.select("*")
							.eq("org_id", ORG_ID)
							.is("deleted_at", null)
							.order("id")
							.range(from, to),
					),
				]);

				if (!active) return;

				setBaseData({
					cycles: cycleRows.map((row) => ({ id: row.id, data: mapSurveyCycleRow(row) })),
					users: userRows.map((row) => ({ id: row.id, data: mapUserRow(row) })),
					students: studentRows.map((row) => ({
						id: row.id,
						data: mapStudentRow(row),
					})),
					teachers: teacherRows.map((row) => ({
						id: row.id,
						data: mapTeacherRow(row),
					})),
					groups: groupRows.map((row) => ({ id: row.id, data: mapGroupRow(row) })),
					subjects: subjectRows.map((row) => ({
						id: row.id,
						data: mapSubjectRow(row),
					})),
					departments: departmentRows.map((row) => ({
						id: row.id,
						data: mapDepartmentRow(row),
					})),
					assignments: assignmentRows.map((row) => ({
						id: row.id,
						data: mapTeachingAssignmentRow(row),
					})),
					studentGroupMemberships: membershipRows.map((row) => ({
						id: row.id,
						data: mapStudentGroupMembershipRow(row),
					})),
					studentAssignmentOverrides: overrideRows.map((row) => ({
						id: row.id,
						data: mapStudentAssignmentOverrideRow(row),
					})),
					managementAssignments: managementRows.map((row) => ({
						id: row.id,
						data: mapManagementAssignmentRow(row),
					})),
				});
			} catch (error) {
				if (!active) return;
				const message =
					error instanceof Error ? error.message : "Məlumat yüklənmədi";
				setStatus(`Audit məlumatları yüklənmədi: ${message}`);
			} finally {
				if (active) setLoadingBase(false);
			}
		};

		void loadBaseData();
		return () => {
			active = false;
		};
	}, [setStatus]);

	const visibleCycles = useMemo(() => {
		if (!branchId) return [];
		return [...baseData.cycles]
			.filter((cycle) => {
				const branchIds = cycle.data.branchIds ?? [];
				return branchIds.length === 0 || branchIds.includes(branchId);
			})
			.sort((a, b) => b.data.year - a.data.year);
	}, [baseData.cycles, branchId]);

	useEffect(() => {
		if (!branchId || visibleCycles.length === 0) {
			setSelectedCycleId("");
			setCycleData(emptyCycleData());
			return;
		}
		if (!selectedCycleId || !visibleCycles.some((cycle) => cycle.id === selectedCycleId)) {
			setSelectedCycleId(visibleCycles[0].id);
		}
	}, [branchId, selectedCycleId, visibleCycles]);

	useEffect(() => {
		let active = true;

		const loadCycleData = async () => {
			if (!branchId || !selectedCycleId) {
				setCycleData(emptyCycleData());
				return;
			}

			setLoadingCycleData(true);
			try {
				const [questionSetRows, taskRows, submissionRows] = await Promise.all([
					supabase
						.from("question_sets")
						.select("*")
						.eq("org_id", ORG_ID)
						.eq("cycle_id", selectedCycleId),
					fetchAllBatched<any>(async (from, to) =>
						supabase
							.from("tasks")
							.select("*")
							.eq("org_id", ORG_ID)
							.eq("cycle_id", selectedCycleId)
							.eq("branch_id", branchId)
							.order("id")
							.range(from, to),
					),
					fetchAllBatched<any>(async (from, to) =>
						supabase
							.from("submissions")
							.select("*")
							.eq("org_id", ORG_ID)
							.eq("cycle_id", selectedCycleId)
							.eq("branch_id", branchId)
							.order("task_id")
							.range(from, to),
					),
				]);

				if (!active) return;

				setCycleData({
					questionSets: (questionSetRows.data ?? []).map((row) => ({
						id: row.id,
						data: mapQuestionSetRow(row),
					})),
					tasks: taskRows.map((row) => ({ id: row.id, data: mapTaskRow(row) })),
					submissions: submissionRows.map((row) => ({
						id: row.task_id ?? row.id,
						data: mapSubmissionRow(row),
					})),
				});
			} catch (error) {
				if (!active) return;
				const message =
					error instanceof Error ? error.message : "Sorğu məlumatı yüklənmədi";
				setStatus(`Audit sorğu məlumatları yüklənmədi: ${message}`);
			} finally {
				if (active) setLoadingCycleData(false);
			}
		};

		void loadCycleData();
		return () => {
			active = false;
		};
	}, [branchId, selectedCycleId, setStatus]);

	const selectedCycle = useMemo(
		() => visibleCycles.find((cycle) => cycle.id === selectedCycleId) ?? null,
		[selectedCycleId, visibleCycles],
	);

	const audit = useMemo(() => {
		if (!branchId || !selectedCycle) return null;

		const usersScoped = baseData.users.filter(
			(user) => user.data.branchId === branchId,
		);
		const studentsScoped = baseData.students.filter(
			(student) => student.data.branchId === branchId,
		);
		const teachersScoped = baseData.teachers.filter((teacher) => {
			if (teacher.data.branchId === branchId) return true;
			return (teacher.data.branchIds ?? []).includes(branchId);
		});
		const groupsScoped = baseData.groups.filter(
			(group) => group.data.branchId === branchId,
		);
		const assignmentsScoped = baseData.assignments.filter(
			(assignment) => assignment.data.branchId === branchId,
		);
		const membershipsScoped = baseData.studentGroupMemberships.filter(
			(membership) => membership.data.branchId === branchId,
		);
		const overridesScoped = baseData.studentAssignmentOverrides.filter(
			(override) => override.data.branchId === branchId,
		);
		const managementScoped = baseData.managementAssignments.filter(
			(assignment) => assignment.data.branchId === branchId,
		);

		const cycleYear = selectedCycle.data.year;
		const assignmentYears = Array.from(
			new Set(assignmentsScoped.map((assignment) => assignment.data.year)),
		).sort((a, b) => a - b);
		const assignmentYear =
			assignmentYears.length === 0
				? null
				: assignmentYears.includes(cycleYear)
					? cycleYear
					: assignmentYears[assignmentYears.length - 1];
		const assignmentsForYear =
			assignmentYear === null
				? []
				: assignmentsScoped.filter((assignment) => assignment.data.year === assignmentYear);
		const membershipsForYear =
			assignmentYear === null
				? []
				: membershipsScoped.filter((membership) => membership.data.year === assignmentYear);
		const overridesForYear =
			assignmentYear === null
				? []
				: overridesScoped.filter((override) => override.data.year === assignmentYear);
		const managementForYear =
			assignmentYear === null
				? []
				: managementScoped.filter((assignment) => assignment.data.year === assignmentYear);
		const groupMap = Object.fromEntries(
			groupsScoped.map((group) => [group.id, group.data]),
		) as Record<string, GroupDoc>;
		const subjectMap = Object.fromEntries(
			baseData.subjects.map((subject) => [subject.id, subject.data]),
		) as Record<string, SubjectDoc>;
		const departmentMap = Object.fromEntries(
			baseData.departments.map((department) => [department.id, department.data]),
		) as Record<string, DepartmentDoc>;
		const normalizeDepartmentName = (departmentId?: string | null) =>
			departmentId
				? (departmentMap[departmentId]?.name ?? "")
						.trim()
						.toLocaleLowerCase("az")
				: "";
		const departmentMatches = (
			leftDepartmentId?: string | null,
			rightDepartmentId?: string | null,
		) => {
			if (!leftDepartmentId || !rightDepartmentId) return false;
			if (leftDepartmentId === rightDepartmentId) return true;
			const leftName = normalizeDepartmentName(leftDepartmentId);
			const rightName = normalizeDepartmentName(rightDepartmentId);
			return Boolean(leftName && rightName && leftName === rightName);
		};
		const teacherIdsByDepartmentFromAssignments = (
			departmentId: string,
			assignmentBranchId: string,
		) =>
			new Set(
				assignmentsForYear
					.filter(
						(assignment) =>
							assignment.data.branchId === assignmentBranchId &&
							departmentMatches(
								subjectMap[assignment.data.subjectId]?.departmentId,
								departmentId,
							),
					)
					.map((assignment) => assignment.data.teacherId),
			);
		const teacherMap = Object.fromEntries(
			teachersScoped.map((teacher) => [teacher.id, teacher.data]),
		) as Record<string, TeacherDoc>;
		const allTeacherMap = Object.fromEntries(
			baseData.teachers.map((teacher) => [teacher.id, teacher.data]),
		) as Record<string, TeacherDoc>;
		const userMap = Object.fromEntries(
			baseData.users.map((user) => [user.id, user.data]),
		) as Record<string, UserDoc>;
		const studentByUserId = studentsScoped.reduce<Record<string, DocEntry<StudentDoc>>>(
			(acc, student) => {
				acc[student.id] = student;
				if (student.data.uid) acc[student.data.uid] = student;
				return acc;
			},
			{},
		);
		const membershipsByStudentKey = buildStudentMembershipMap(membershipsForYear);
		const teacherIdByUserId = baseData.teachers.reduce<Record<string, string>>(
			(acc, teacher) => {
				acc[teacher.id] = teacher.id;
				if (teacher.data.uid) acc[teacher.data.uid] = teacher.id;
				return acc;
			},
			{},
		);
		const questionSetMap = Object.fromEntries(
			cycleData.questionSets.map((questionSet) => [
				questionSet.data.targetFlow,
				questionSet.data,
			]),
		) as Partial<Record<FlowKey, QuestionSetDoc>>;

		const expectedByFlow: Record<FlowKey, Set<string>> = {
			student_teacher: new Set<string>(),
			management_teacher: new Set<string>(),
			teacher_self: new Set<string>(),
			teacher_management: new Set<string>(),
		};
		const actualByFlow: Record<
			FlowKey,
			{ ids: Set<string>; open: number; done: number; total: number }
		> = {
			student_teacher: { ids: new Set(), open: 0, done: 0, total: 0 },
			management_teacher: { ids: new Set(), open: 0, done: 0, total: 0 },
			teacher_self: { ids: new Set(), open: 0, done: 0, total: 0 },
			teacher_management: { ids: new Set(), open: 0, done: 0, total: 0 },
		};
		const studentExpected = new Map<
			string,
			{ teacherIds: Set<string>; teacherNames: Set<string>; taskIds: Set<string> }
		>();
		const teacherExpected = new Map<
			string,
			{ studentIds: Set<string>; taskIds: Set<string> }
		>();
		const studentActual = new Map<
			string,
			{ open: number; done: number; visibleTeacherIds: Set<string> }
		>();
		const teacherActual = new Map<
			string,
			{ student: number; management: number; self: number }
		>();
		const submissionCountByTeacher = new Map<string, number>();
		const warnings: string[] = [];
		const studentFlowState = resolveCycleState(
			selectedCycle.data,
			questionSetMap.student_teacher,
		);

		cycleData.tasks.forEach((task) => {
			const flow = flowFromTask(task.data);
			const bucket = actualByFlow[flow];
			bucket.ids.add(task.id);
			bucket.total += 1;
			if (task.data.status === "DONE") bucket.done += 1;
			else bucket.open += 1;

			if (flow === "student_teacher") {
				const entry = studentActual.get(task.data.raterUid) ?? {
					open: 0,
					done: 0,
					visibleTeacherIds: new Set<string>(),
				};
				if (task.data.status === "DONE") entry.done += 1;
				else {
					entry.open += 1;
					if (studentFlowState.open) {
						entry.visibleTeacherIds.add(task.data.targetId);
					}
				}
				studentActual.set(task.data.raterUid, entry);
			}

			if (task.data.targetType === "teacher") {
				const entry = teacherActual.get(task.data.targetId) ?? {
					student: 0,
					management: 0,
					self: 0,
				};
				if (flow === "student_teacher") entry.student += 1;
				if (flow === "management_teacher") entry.management += 1;
				if (flow === "teacher_self") entry.self += 1;
				teacherActual.set(task.data.targetId, entry);
			}
		});

		cycleData.submissions.forEach((submission) => {
			submissionCountByTeacher.set(
				submission.data.targetId,
				(submissionCountByTeacher.get(submission.data.targetId) ?? 0) + 1,
			);
		});

		let skippedPe = 0;
		if (assignmentYear === null) {
			warnings.push("Dərs təyinatı tapılmadığı üçün sinif əsaslı audit boş görünə bilər.");
		} else {
			if (assignmentYear !== cycleYear) {
				warnings.push(
					`Sorğu ${cycleYear} üçündür, amma audit ${assignmentYear} ilin təyinatı ilə hesablanır.`,
				);
			}

			usersScoped
				.filter((user) => user.data.role === "student")
				.forEach((user) => {
					const student = studentByUserId[user.id];
					if (!student) return;

					const grouped = new Map<string, { teacherId: string; teacherName: string }>();
					const studentAssignments = resolveStudentAssignments({
						student,
						userId: user.id,
						assignmentsForYear,
						membershipsForYear,
						overridesForYear,
						membershipsByStudentKey,
						assignmentFilter: (assignment) => {
							const groupLevel = normalizeClassLevel(
								groupMap[assignment.data.groupId]?.classLevel ??
									student.data.classLevel,
							);
							const subject = subjectMap[assignment.data.subjectId] ?? null;
							if (
								new Set(["5", "6", "7"]).has(groupLevel) &&
								isPhysicalEducationSubject(subject)
							) {
								skippedPe += 1;
								return false;
							}
							return true;
						},
					});
					studentAssignments.forEach((assignment) => {
						const key = `${assignment.data.teacherId}_${assignment.data.groupId}`;
						if (!grouped.has(key)) {
							grouped.set(key, {
								teacherId: assignment.data.teacherId,
								teacherName:
									teacherMap[assignment.data.teacherId]?.name ?? assignment.data.teacherId,
							});
						}
					});

					grouped.forEach((entry, key) => {
						const groupId = key.split("_").slice(1).join("_");
						const taskId = buildTaskId({
							cycleId: selectedCycle.id,
							raterUid: user.id,
							targetType: "teacher",
							targetId: entry.teacherId,
							groupId,
						});
						expectedByFlow.student_teacher.add(taskId);
						const studentEntry = studentExpected.get(user.id) ?? {
							teacherIds: new Set<string>(),
							teacherNames: new Set<string>(),
							taskIds: new Set<string>(),
						};
						studentEntry.teacherIds.add(entry.teacherId);
						studentEntry.teacherNames.add(entry.teacherName);
						studentEntry.taskIds.add(taskId);
						studentExpected.set(user.id, studentEntry);

						const teacherEntry = teacherExpected.get(entry.teacherId) ?? {
							studentIds: new Set<string>(),
							taskIds: new Set<string>(),
						};
						teacherEntry.studentIds.add(user.id);
						teacherEntry.taskIds.add(taskId);
						teacherExpected.set(entry.teacherId, teacherEntry);
					});
				});

			usersScoped
				.filter((user) => user.data.role === "teacher")
				.forEach((user) => {
					const teacherId = teacherIdByUserId[user.id];
					if (!teacherId) return;
					const teacher = allTeacherMap[teacherId];
					const computedBranchId = teacher?.branchId ?? user.data.branchId ?? null;
					if (computedBranchId !== branchId) return;
					expectedByFlow.teacher_self.add(
						buildTaskId({
							cycleId: selectedCycle.id,
							raterUid: user.id,
							targetType: "teacher",
							targetId: teacherId,
						}),
					);
				});

			if (managementForYear.length === 0) {
				warnings.push(
					"Rəhbərlik təyinatı tapılmadı, fallback qayda ilə manager user-lər bütün müəllimlərə bağlanır.",
				);
				usersScoped
					.filter((user) => user.data.role === "manager")
					.forEach((user) => {
						teachersScoped.forEach((teacher) => {
							expectedByFlow.management_teacher.add(
								buildTaskId({
									cycleId: selectedCycle.id,
									raterUid: user.id,
									targetType: "teacher",
									targetId: teacher.id,
									scopeKey: managementBranchScopeKey(branchId),
								}),
							);
						});
					});
			} else {
				managementForYear.forEach((assignment) => {
					const manager = userMap[assignment.data.managerUid];
					if (!manager) return;
					const assignmentDepartmentTeacherIds = assignment.data.departmentId
						? teacherIdsByDepartmentFromAssignments(
								assignment.data.departmentId,
								assignment.data.branchId,
							)
						: null;
					teachersScoped
						.filter((teacher) => {
							const inBranch =
								teacher.data.branchId === assignment.data.branchId ||
								(teacher.data.branchIds ?? []).includes(assignment.data.branchId);
							if (!inBranch) return false;
							if (!assignment.data.departmentId) return true;
							return (
								departmentMatches(
									teacher.data.departmentId,
									assignment.data.departmentId,
								) ||
								assignmentDepartmentTeacherIds?.has(teacher.id) === true
							);
						})
						.forEach((teacher) => {
							if (teacherIdByUserId[assignment.data.managerUid] === teacher.id) return;
							const scopeKey = assignment.data.departmentId
								? managementDepartmentScopeKey(assignment.data.departmentId)
								: managementBranchScopeKey(assignment.data.branchId);
							expectedByFlow.management_teacher.add(
								buildTaskId({
									cycleId: selectedCycle.id,
									raterUid: assignment.data.managerUid,
									targetType: "teacher",
									targetId: teacher.id,
									scopeKey,
								}),
							);
						});
				});
			}
		}

		if (skippedPe > 0) {
			warnings.push(
				`${skippedPe} fiziki tərbiyə uyğunluğu 5-7-ci sinif qaydasına görə auditdən çıxarıldı.`,
			);
		}

		const assignmentStats = new Map<
			string,
			{ assignments: number; groups: Set<string>; subjects: Set<string> }
		>();
		assignmentsForYear.forEach((assignment) => {
			const entry = assignmentStats.get(assignment.data.teacherId) ?? {
				assignments: 0,
				groups: new Set<string>(),
				subjects: new Set<string>(),
			};
			entry.assignments += 1;
			entry.groups.add(assignment.data.groupId);
			entry.subjects.add(assignment.data.subjectId);
			assignmentStats.set(assignment.data.teacherId, entry);
		});

		const flowRows = FLOW_ORDER.map((flow) => {
			const cycleState = resolveCycleState(selectedCycle.data, questionSetMap[flow]);
			const expectedIds = expectedByFlow[flow];
			const actual = actualByFlow[flow];
			let missing = 0;
			expectedIds.forEach((id) => {
				if (!actual.ids.has(id)) missing += 1;
			});
			let extra = 0;
			actual.ids.forEach((id) => {
				if (!expectedIds.has(id)) extra += 1;
			});
			if ((expectedIds.size > 0 || actual.total > 0) && cycleState.label !== "Hazırdır") {
				warnings.push(`${FLOW_LABELS[flow]}: ${cycleState.label}.`);
			}
			if (missing > 0 || extra > 0) {
				warnings.push(`${FLOW_LABELS[flow]}: ${missing} çatmayan, ${extra} əlavə task var.`);
			}
			return {
				flow,
				label: FLOW_LABELS[flow],
				questionCount: questionSetMap[flow]?.questionIds?.length ?? 0,
				questionStatus: !questionSetMap[flow]
					? "Yoxdur"
					: questionSetMap[flow]?.isOpen
						? "Açıqdır"
						: "Bağlıdır",
				stateLabel: cycleState.label,
				expected: expectedIds.size,
				actual: actual.total,
				open: actual.open,
				done: actual.done,
				missing,
				extra,
			};
		});

		const studentRows = studentsScoped
			.map((student) => {
				const userId = student.data.uid ?? student.id;
				const expected = studentExpected.get(userId);
				const actual = studentActual.get(userId);
				return {
					id: student.id,
					name: student.data.name,
					groupName: groupMap[student.data.groupId]?.name ?? student.data.groupId,
					classLevel:
						groupMap[student.data.groupId]?.classLevel ?? student.data.classLevel,
					expectedTeachers: expected?.teacherIds.size ?? 0,
					expectedTasks: expected?.taskIds.size ?? 0,
					visibleCards: actual?.visibleTeacherIds.size ?? 0,
					open: actual?.open ?? 0,
					done: actual?.done ?? 0,
					teacherPreview: previewNames(
						Array.from(expected?.teacherNames ?? []).sort((a, b) =>
							a.localeCompare(b, "az"),
						),
					),
				};
			})
			.sort((a, b) => a.name.localeCompare(b.name, "az"));

		const teacherRows = teachersScoped
			.map((teacher) => {
				const plan = assignmentStats.get(teacher.id);
				const expected = teacherExpected.get(teacher.id);
				const actual = teacherActual.get(teacher.id);
				return {
					id: teacher.id,
					name: teacher.data.name,
					assignments: plan?.assignments ?? 0,
					groupCount: plan?.groups.size ?? 0,
					subjectCount: plan?.subjects.size ?? 0,
					studentCoverage: expected?.studentIds.size ?? 0,
					expectedStudentTasks: expected?.taskIds.size ?? 0,
					studentTasks: actual?.student ?? 0,
					managementTasks: actual?.management ?? 0,
					selfTasks: actual?.self ?? 0,
					submissions: submissionCountByTeacher.get(teacher.id) ?? 0,
				};
			})
			.sort((a, b) => a.name.localeCompare(b.name, "az"));

		const expectedTaskCount = flowRows.reduce((sum, row) => sum + row.expected, 0);
		return {
			summary: {
				branchName,
				cycleYear,
				cycleStatus: selectedCycle.data.status,
				cycleWindow: `${formatShortDate(toJsDate(selectedCycle.data.startAt))} - ${formatShortDate(toJsDate(selectedCycle.data.endAt))}`,
				assignmentYear,
				students: studentsScoped.length,
				teachers: teachersScoped.length,
				groups: groupsScoped.length,
				assignments: assignmentsForYear.length,
				actualTasks: cycleData.tasks.length,
				expectedTasks: expectedTaskCount,
				doneTasks: cycleData.tasks.filter((task) => task.data.status === "DONE").length,
				submissions: cycleData.submissions.length,
			},
			warnings: Array.from(new Set(warnings)),
			flowRows,
			studentRows,
			teacherRows,
		};
	}, [baseData, branchId, branchName, cycleData, selectedCycle]);

	const studentPagination = usePagination(audit?.studentRows ?? []);
	const teacherPagination = usePagination(audit?.teacherRows ?? []);

	useEffect(() => {
		studentPagination.resetPage();
		teacherPagination.resetPage();
	}, [branchId, selectedCycleId]);

	if (!branchId || loadingBase) {
		return (
			<div className="panel">
				<div className="panel-header">
					<div>
						<h2>Sistem audit / debug</h2>
						<p>Read-only görünüş. Mövcud məntiqi bir yerdən yoxlamaq üçündür.</p>
					</div>
				</div>
				{isSuperAdmin && (
					<BranchSelector
						branchId={branchId}
						branches={branches}
						onChange={setBranchId}
					/>
				)}
				<div className="empty">
					{loadingBase ? "Baza məlumatları yüklənir..." : "Audit üçün filial seçin."}
				</div>
			</div>
		);
	}

	return (
		<div className="panel">
			<div className="panel-header">
				<div>
					<h2>Sistem audit / debug</h2>
					<p>Bu səhifə yalnız oxuyur, DB-yə heç nə yazmır.</p>
				</div>
				<div className="stat-pill">Yazma yoxdur</div>
			</div>
			{isSuperAdmin && (
				<BranchSelector
					branchId={branchId}
					branches={branches}
					onChange={setBranchId}
				/>
			)}
			<div className="card">
				<div className="form-row">
					<label className="field">
						<span>Sorğu dövrü</span>
						<select
							className="input"
							value={selectedCycleId}
							onChange={(event) => setSelectedCycleId(event.target.value)}
							disabled={visibleCycles.length === 0}
						>
							<option value="">Sorğu dövrü seçin</option>
							{visibleCycles.map((cycle) => (
								<option key={cycle.id} value={cycle.id}>
									{cycle.data.year} ({cycle.data.status})
								</option>
							))}
						</select>
					</label>
					<div className="stat-pill">Filial: {audit?.summary.branchName || branchName}</div>
					<div className="stat-pill">Pəncərə: {audit?.summary.cycleWindow ?? "-"}</div>
					<div className="stat-pill">Təyinat ili: {audit?.summary.assignmentYear ?? "-"}</div>
				</div>
				<div className="hint">
					Bu səhifə task yaranma məntiqini, görünən müəllim kartlarını və flow uyğunluğunu göstərir.
				</div>
				{status && <div className="notice">{status}</div>}
			</div>

			{!audit || loadingCycleData ? (
				<div className="empty">Seçilmiş dövr üzrə məlumatlar yüklənir...</div>
			) : (
				<div className="stack">
					<div className="stats">
						<div className="stat-card">
							<div className="stat-label">Sorğu</div>
							<div className="stat-value">{audit.summary.cycleYear}</div>
							<div className="stat-meta">
								{audit.summary.cycleStatus} • {audit.summary.cycleWindow}
							</div>
						</div>
						<div className="stat-card">
							<div className="stat-label">Şagird / qrup</div>
							<div className="stat-value">
								{audit.summary.students} / {audit.summary.groups}
							</div>
							<div className="stat-meta">filial scope-u</div>
						</div>
						<div className="stat-card">
							<div className="stat-label">Müəllim / təyinat</div>
							<div className="stat-value">
								{audit.summary.teachers} / {audit.summary.assignments}
							</div>
							<div className="stat-meta">audit təyinatı</div>
						</div>
						<div className="stat-card">
							<div className="stat-label">Task</div>
							<div className="stat-value">
								{audit.summary.actualTasks} / {audit.summary.expectedTasks}
							</div>
							<div className="stat-meta">faktiki / gözlənilən</div>
						</div>
						<div className="stat-card">
							<div className="stat-label">Submission</div>
							<div className="stat-value">{audit.summary.submissions}</div>
							<div className="stat-meta">DONE: {audit.summary.doneTasks}</div>
						</div>
					</div>

					<div className="card">
						<div className="section-header">
							<div>
								<div className="section-kicker">Risklər</div>
								<div className="section-title">Audit qeydləri</div>
							</div>
							<div className="stat-pill">Cəmi: {audit.warnings.length}</div>
						</div>
						{audit.warnings.length === 0 ? (
							<div className="empty">Hazırda kritik uyğunsuzluq görünmür.</div>
						) : (
							<div className="stack">
								{audit.warnings.map((warning) => (
									<div className="notice" key={warning}>
										{warning}
									</div>
								))}
							</div>
						)}
					</div>

					<div className="card">
						<div className="section-header">
							<div>
								<div className="section-kicker">Flow audit</div>
								<div className="section-title">Task və sual seti uyğunluğu</div>
							</div>
						</div>
						<div className="data-table">
							<div className="data-row header">
								<div>Axın</div>
								<div>Sual seti</div>
								<div>Gözlənilən</div>
								<div>Faktiki</div>
								<div>OPEN / DONE</div>
								<div>Drift</div>
							</div>
							{audit.flowRows.map((row) => (
								<div className="data-row" key={row.flow}>
									<div>
										<div>{row.label}</div>
										<div className="meta">{row.stateLabel}</div>
									</div>
									<div>
										<div>{row.questionStatus}</div>
										<div className="meta">{row.questionCount} sual</div>
									</div>
									<div>{row.expected}</div>
									<div>{row.actual}</div>
									<div>{row.open} / {row.done}</div>
									<div>-{row.missing} / +{row.extra}</div>
								</div>
							))}
						</div>
					</div>

					<div className="card">
						<div className="section-header">
							<div>
								<div className="section-kicker">Şagird görünürlüğü</div>
								<div className="section-title">Şagird-müəllim kart audit-i</div>
							</div>
							<div className="stat-pill">Cəmi: {studentPagination.totalItems}</div>
						</div>
						<div className="data-table">
							<div className="data-row header">
								<div>Şagird</div>
								<div>Sinif</div>
								<div>Gözlənən müəllim</div>
								<div>Görünən kart</div>
								<div>OPEN / DONE</div>
								<div>Nümunə müəllimlər</div>
							</div>
							{studentPagination.paginatedItems.map((row) => (
								<div className="data-row" key={row.id}>
									<div>{row.name}</div>
									<div>
										<div>{row.groupName}</div>
										<div className="meta">{row.classLevel}</div>
									</div>
									<div>
										{row.expectedTeachers}
										<div className="meta">{row.expectedTasks} task</div>
									</div>
									<div>{row.visibleCards}</div>
									<div>{row.open} / {row.done}</div>
									<div>{row.teacherPreview}</div>
								</div>
							))}
							{studentPagination.totalItems === 0 && (
								<div className="empty">Şagird məlumatı yoxdur.</div>
							)}
						</div>
						{studentPagination.totalItems > 0 && (
							<PaginationControls
								totalItems={studentPagination.totalItems}
								page={studentPagination.page}
								pageSize={studentPagination.pageSize}
								onPageChange={studentPagination.setPage}
								onPageSizeChange={(nextSize) => {
									studentPagination.setPageSize(nextSize);
									studentPagination.setPage(1);
								}}
							/>
						)}
					</div>

					<div className="card">
						<div className="section-header">
							<div>
								<div className="section-kicker">Müəllim coverage</div>
								<div className="section-title">Müəllim üzrə audit</div>
							</div>
							<div className="stat-pill">Cəmi: {teacherPagination.totalItems}</div>
						</div>
						<div className="data-table">
							<div className="data-row header">
								<div>Müəllim</div>
								<div>Təyinat</div>
								<div>Şagird əhatəsi</div>
								<div>Tasklar</div>
								<div>Submission</div>
							</div>
							{teacherPagination.paginatedItems.map((row) => (
								<div className="data-row" key={row.id}>
									<div>{row.name}</div>
									<div>
										<div>{row.assignments} təyinat</div>
										<div className="meta">
											{row.groupCount} sinif • {row.subjectCount} fənn
										</div>
									</div>
									<div>
										<div>{row.studentCoverage} şagird</div>
										<div className="meta">
											{row.expectedStudentTasks} gözlənən student task
										</div>
									</div>
									<div>
										<div>
											Ş: {row.studentTasks} • R: {row.managementTasks} • Ö: {row.selfTasks}
										</div>
										<div className="meta">student / rəhbərlik / özü</div>
									</div>
									<div>{row.submissions}</div>
								</div>
							))}
							{teacherPagination.totalItems === 0 && (
								<div className="empty">Müəllim məlumatı yoxdur.</div>
							)}
						</div>
						{teacherPagination.totalItems > 0 && (
							<PaginationControls
								totalItems={teacherPagination.totalItems}
								page={teacherPagination.page}
								pageSize={teacherPagination.pageSize}
								onPageChange={teacherPagination.setPage}
								onPageSizeChange={(nextSize) => {
									teacherPagination.setPageSize(nextSize);
									teacherPagination.setPage(1);
								}}
							/>
						)}
					</div>
				</div>
			)}
		</div>
	);
};

