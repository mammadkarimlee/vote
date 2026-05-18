import { useCallback, useEffect, useMemo, useState } from "react";
import { useFeedbackState } from "../../components/feedback/FeedbackProvider";
import { PaginationControls } from "../../components/PaginationControls";
import { useConfirmDialog } from "../../components/ConfirmDialog";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "../../components/ui/dialog";
import { toErrorMessage } from "../../lib/errorMessage";
import { ORG_ID, supabase } from "../../lib/supabase";
import {
	mapGroupRow,
	mapStudentAssignmentOverrideRow,
	mapStudentGroupMembershipRow,
	mapStudentRow,
	mapSubjectRow,
	mapSurveyCycleRow,
	mapTeacherRow,
	mapTeachingAssignmentRow,
	mapUserRow,
} from "../../lib/supabaseMappers";
import {
	buildStudentMembershipMap,
	resolveStudentAssignments,
	resolveStudentGroupIds,
} from "../../lib/studentAssignmentOverrides";
import type {
	GroupDoc,
	StudentAssignmentOverrideDoc,
	StudentDoc,
	StudentGroupMembershipDoc,
	SubjectDoc,
	SurveyCycleDoc,
	TaskDoc,
	TeacherDoc,
	TeachingAssignmentDoc,
	UserDoc,
} from "../../lib/types";
import { usePagination } from "../../lib/usePagination";
import { downloadWorkbook } from "../../lib/xlsx";
import { useAuth } from "../auth/AuthProvider";
import { BranchSelector } from "./BranchSelector";
import { parseSpreadsheet } from "./importUtils";
import { useBranchScope } from "./useBranchScope";
import { provisionLoginUser } from "./userProvisioning";

type DocEntry<T> = { id: string; data: T };

type StudentLesson = {
	assignmentId: string;
	teacherId: string;
	teacherName: string;
	groupId: string;
	groupName: string;
	subjectId: string;
	subjectName: string;
	year: number;
	source: "base" | "included";
};

type LessonOverrideLog = {
	id: string;
	assignmentId: string;
	lessonLabel: string;
	action: "added" | "removed" | "restored";
	status: "active" | "history";
	at: unknown;
	actorId?: string | null;
};

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

const formatAuditTime = (value: unknown) => {
	if (!value) return "-";
	const date = new Date(String(value));
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("az-AZ", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
};

const lessonLogActionLabel: Record<LessonOverrideLog["action"], string> = {
	added: "Əlavə edildi",
	removed: "Çıxarıldı",
	restored: "Geri əlavə edildi",
};

const isOverrideAuditColumnMissing = (
	error: { message?: string } | null | undefined,
) => {
	const message = error?.message ?? "";
	return (
		message.includes("student_assignment_overrides") &&
		message.includes("schema cache") &&
		(message.includes("created_by") || message.includes("deleted_by"))
	);
};

export const BranchStudentsPage = () => {
	const { user } = useAuth();
	const { confirm, dialog } = useConfirmDialog();
	const { branchId, setBranchId, branches, branchName, isSuperAdmin } =
		useBranchScope();
	const [students, setStudents] = useState<
		Array<{ id: string; data: StudentDoc }>
	>([]);
	const [groups, setGroups] = useState<Array<{ id: string; data: GroupDoc }>>(
		[],
	);
	const [teachers, setTeachers] = useState<Array<DocEntry<TeacherDoc>>>([]);
	const [subjects, setSubjects] = useState<Array<DocEntry<SubjectDoc>>>([]);
	const [users, setUsers] = useState<Array<DocEntry<UserDoc>>>([]);
	const [assignments, setAssignments] = useState<
		Array<DocEntry<TeachingAssignmentDoc>>
	>([]);
	const [studentGroupMemberships, setStudentGroupMemberships] = useState<
		Array<DocEntry<StudentGroupMembershipDoc>>
	>([]);
	const [assignmentOverrides, setAssignmentOverrides] = useState<
		Array<DocEntry<StudentAssignmentOverrideDoc>>
	>([]);
	const [name, setName] = useState("");
	const [groupId, setGroupId] = useState("");
	const [classLevel, setClassLevel] = useState("");
	const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [editGroupId, setEditGroupId] = useState("");
	const [editClassLevel, setEditClassLevel] = useState("");
	const [savingStudentEdit, setSavingStudentEdit] = useState(false);
	const [selectedClass, setSelectedClass] = useState("all");
	const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
		null,
	);
	const [lessonYear, setLessonYear] = useState(
		String(new Date().getFullYear()),
	);
	const [extraAssignmentId, setExtraAssignmentId] = useState("");
	const [lessonSaving, setLessonSaving] = useState(false);
	const [status, setStatus] = useFeedbackState();

	const loadData = useCallback(async () => {
		if (!branchId) {
			setStudents([]);
			setGroups([]);
			setTeachers([]);
			setSubjects([]);
			setUsers([]);
			setAssignments([]);
			setStudentGroupMemberships([]);
			setAssignmentOverrides([]);
			return;
		}

		let studentQuery = supabase
			.from("students")
			.select("*")
			.eq("org_id", ORG_ID)
			.is("deleted_at", null);
		let groupQuery = supabase
			.from("groups")
			.select("*")
			.eq("org_id", ORG_ID)
			.is("deleted_at", null);
		let teacherQuery = supabase
			.from("teachers")
			.select("*")
			.eq("org_id", ORG_ID)
			.is("deleted_at", null);
		const subjectQuery = supabase
			.from("subjects")
			.select("*")
			.eq("org_id", ORG_ID)
			.is("deleted_at", null);
		const userQuery = supabase
			.from("users")
			.select("*")
			.eq("org_id", ORG_ID);
		let assignmentQuery = supabase
			.from("teaching_assignments")
			.select("*")
			.eq("org_id", ORG_ID)
			.is("deleted_at", null);
		let membershipQuery = supabase
			.from("student_group_memberships")
			.select("*")
			.eq("org_id", ORG_ID)
			.is("deleted_at", null);
		let overrideQuery = supabase
			.from("student_assignment_overrides")
			.select("*")
			.eq("org_id", ORG_ID);
		studentQuery = studentQuery.eq("branch_id", branchId);
		groupQuery = groupQuery.eq("branch_id", branchId);
		teacherQuery = teacherQuery.or(
			`branch_id.eq.${branchId},branch_ids.cs.{${branchId}}`,
		);
		assignmentQuery = assignmentQuery.eq("branch_id", branchId);
		membershipQuery = membershipQuery.eq("branch_id", branchId);
		overrideQuery = overrideQuery.eq("branch_id", branchId);

		const [
			studentRes,
			groupRes,
			teacherRes,
			subjectRes,
			userRes,
			assignmentRes,
			membershipRes,
			overrideRes,
		] = await Promise.all([
			studentQuery,
			groupQuery,
			teacherQuery,
			subjectQuery,
			userQuery,
			assignmentQuery,
			membershipQuery,
			overrideQuery,
		]);

		if (membershipRes.error) {
			const message = membershipRes.error.message ?? "";
			if (!message.includes("student_group_memberships")) {
				throw new Error(message);
			}
		}
		if (overrideRes.error) {
			const message = overrideRes.error.message ?? "";
			if (!message.includes("student_assignment_overrides")) {
				throw new Error(message);
			}
		}

		const groupDocs = (groupRes.data ?? []).map((row) => ({
			id: row.id,
			data: mapGroupRow(row),
		}));
		const teacherDocs = (teacherRes.data ?? []).map((row) => ({
			id: row.id,
			data: mapTeacherRow(row),
		}));
		const subjectDocs = (subjectRes.data ?? []).map((row) => ({
			id: row.id,
			data: mapSubjectRow(row),
		}));
		const userDocs = (userRes.data ?? []).map((row) => ({
			id: row.id,
			data: mapUserRow(row),
		}));
		const assignmentDocs = (assignmentRes.data ?? []).map((row) => ({
			id: row.id,
			data: mapTeachingAssignmentRow(row),
		}));
		const membershipDocs = (membershipRes.error ? [] : (membershipRes.data ?? [])).map((row) => ({
			id: row.id,
			data: mapStudentGroupMembershipRow(row),
		}));
		const overrideDocs = (overrideRes.error ? [] : (overrideRes.data ?? [])).map((row) => ({
			id: row.id,
			data: mapStudentAssignmentOverrideRow(row),
		}));
		setGroups(groupDocs.filter((group) => group.data.branchId === branchId));
		setTeachers(
			teacherDocs.filter((teacher) => {
				if (teacher.data.branchId === branchId) return true;
				return (teacher.data.branchIds ?? []).includes(branchId);
			}),
		);
		setSubjects(subjectDocs);
		setUsers(userDocs);
		setAssignments(
			assignmentDocs.filter(
				(assignment) => assignment.data.branchId === branchId,
			),
		);
		setStudentGroupMemberships(
			membershipDocs.filter(
				(membership) => membership.data.branchId === branchId,
			),
		);
		setAssignmentOverrides(
			overrideDocs.filter((override) => override.data.branchId === branchId),
		);

		const studentDocs = (studentRes.data ?? []).map((row) => ({
			id: row.id,
			data: mapStudentRow(row),
		}));
		setStudents(
			studentDocs.filter((student) => student.data.branchId === branchId),
		);
	}, [branchId]);

	useEffect(() => {
		void loadData();
	}, [loadData]);

	const handleCreate = async () => {
		if (!branchId) {
			setStatus("Filial seçilməyib. Davam etmək üçün filial seçin.");
			return;
		}
		if (!name.trim() || !groupId || !classLevel) {
			setStatus("Ad, qrup və sinif səviyyəsi tələb olunur");
			return;
		}
		try {
			const result = await provisionLoginUser({
				name: name.trim(),
				branchId,
				role: "student",
				collection: "students",
				docData: { groupId, classLevel },
			});
			setName("");
			setGroupId("");
			setClassLevel("");
			setStatus(`Login: ${result.login} • Şifrə: ${result.password}`);
			await loadData();
		} catch (error) {
			setStatus(
				error instanceof Error ? error.message : "Yaratma zamanı xəta oldu",
			);
		}
	};

	const handleEditCancel = useCallback(() => {
		setEditingStudentId(null);
		setEditName("");
		setEditGroupId("");
		setEditClassLevel("");
	}, []);

	const handleDelete = async (studentId: string) => {
		const ok = await confirm({
			title: "Şagirdi sil",
			message: "Şagirdi silmək istədiyinizə əminsiniz?",
			confirmText: "Sil",
			cancelText: "İmtina",
			tone: "danger",
		});
		if (!ok) return;
		try {
			const { error } = await supabase
				.from("students")
				.update({
					deleted_at: new Date().toISOString(),
					deleted_by: user?.id ?? null,
				})
				.eq("org_id", ORG_ID)
				.eq("id", studentId);
			if (error) throw error;
			if (editingStudentId === studentId) {
				handleEditCancel();
			}
			if (selectedStudentId === studentId) {
				setSelectedStudentId(null);
			}
			setStatus("Şagird silindi.");
			await loadData();
		} catch (error) {
			setStatus(toErrorMessage(error, "Şagird silinmədi"));
		}
	};

	const handleEditStart = (student: DocEntry<StudentDoc>) => {
		setEditingStudentId(student.id);
		setEditName(student.data.name);
		setEditGroupId(student.data.groupId);
		setEditClassLevel(getStudentClassLevel(student));
	};

	const handleEditSave = async () => {
		if (!branchId || !editingStudentId) return;
		const student = students.find((item) => item.id === editingStudentId);
		if (!student) {
			setStatus("Şagird tapılmadı.");
			return;
		}
		if (!editName.trim() || !editGroupId || !editClassLevel.trim()) {
			setStatus("Ad, qrup və sinif səviyyəsi tələb olunur");
			return;
		}

		const nextGroup = groups.find((group) => group.id === editGroupId);
		if (!nextGroup) {
			setStatus("Qrup tapılmadı.");
			return;
		}

		setSavingStudentEdit(true);
		try {
			const groupChanged = student.data.groupId !== editGroupId;
			let openCycleYears: number[] = [];
			if (groupChanged) {
				await ensureNoSubmittedOpenTasks(student);
				openCycleYears = Array.from(
					new Set((await loadOpenCycles()).map((cycle) => cycle.data.year)),
				);
			}

			const nextName = editName.trim();
			const nextClassLevel = editClassLevel.trim();
			const { error } = await supabase
				.from("students")
				.update({
					name: nextName,
					group_id: editGroupId,
					class_level: nextClassLevel,
				})
				.eq("org_id", ORG_ID)
				.eq("id", editingStudentId);
			if (error) throw error;

			const updatedStudent: DocEntry<StudentDoc> = {
				id: student.id,
				data: {
					...student.data,
					name: nextName,
					groupId: editGroupId,
					classLevel: nextClassLevel,
				},
			};
			for (const year of openCycleYears) {
				await rebuildOpenStudentTasks(updatedStudent, year);
			}

			handleEditCancel();
			setStatus("Şagird yeniləndi.");
			await loadData();
		} catch (error) {
			setStatus(toErrorMessage(error, "Şagird yenilənmədi"));
		} finally {
			setSavingStudentEdit(false);
		}
	};

	const handleImport = async (file: File) => {
		if (!branchId) {
			setStatus("Filial seçilməyib. Import üçün filial seçin.");
			return;
		}
		const rows = await parseSpreadsheet(file);
		const groupById = Object.fromEntries(groups.map((group) => [group.id, group.data]));
		const groupIdByName = Object.fromEntries(
			groups.map((group) => [group.data.name.trim().toLowerCase(), group.id]),
		);
		const existingKeys = new Set(
			students.map(
				(student) =>
					`${student.data.name.toLowerCase()}|${student.data.groupId}`,
			),
		);
		const seen = new Set<string>();

		let missing = 0;
		let duplicates = 0;
		let mismatch = 0;
		let created = 0;
		let failed = 0;

		const cleaned: Array<{
			name: string;
			groupId: string;
			classLevel: string;
		}> = [];

		rows.forEach((row) => {
			const resolvedGroupId =
				row.groupId?.trim() ||
				groupIdByName[(row.groupName || row.group || "").trim().toLowerCase()] ||
				"";
			const resolvedClassLevel =
				row.classLevel?.trim() || groupById[resolvedGroupId]?.classLevel || "";
			const resolvedName = row.name?.trim() || "";

			if (!resolvedName || !resolvedGroupId || !resolvedClassLevel) {
				missing += 1;
				return;
			}
			if (row.branchId && row.branchId !== branchId) {
				mismatch += 1;
				return;
			}
			const key = `${resolvedName.toLowerCase()}|${resolvedGroupId}`;
			if (seen.has(key) || existingKeys.has(key)) {
				duplicates += 1;
				return;
			}
			seen.add(key);
			cleaned.push({
				name: resolvedName,
				groupId: resolvedGroupId,
				classLevel: resolvedClassLevel,
			});
		});

		if (cleaned.length === 0) {
			setStatus(
				`Fayl boşdur. Missing: ${missing}, Duplicate: ${duplicates}, Branch mismatch: ${mismatch}`,
			);
			return;
		}

		for (const row of cleaned) {
			try {
				await provisionLoginUser({
					name: row.name,
					branchId,
					role: "student",
					collection: "students",
					docData: { groupId: row.groupId, classLevel: row.classLevel },
				});
				created += 1;
			} catch (error) {
				failed += 1;
				setStatus(
					error instanceof Error ? error.message : "Yaratma zamanı xəta oldu",
				);
			}
		}

		setStatus(
			`Bulk import tamamlandı. Created: ${created}, Failed: ${failed}, Missing: ${missing}, Duplicate: ${duplicates}, Branch mismatch: ${mismatch}`,
		);
		await loadData();
	};

	const summary = useMemo(() => students.length, [students]);
	const hasGroups = groups.length > 0;
	const groupMap = useMemo(
		() => Object.fromEntries(groups.map((group) => [group.id, group.data])),
		[groups],
	);
	const teacherMap = useMemo(
		() => Object.fromEntries(teachers.map((teacher) => [teacher.id, teacher.data])),
		[teachers],
	);
	const subjectMap = useMemo(
		() => Object.fromEntries(subjects.map((subject) => [subject.id, subject.data])),
		[subjects],
	);
	const userMap = useMemo(
		() => Object.fromEntries(users.map((item) => [item.id, item.data])),
		[users],
	);
	const assignmentMap = useMemo(
		() =>
			Object.fromEntries(assignments.map((assignment) => [assignment.id, assignment])),
		[assignments],
	);
	const getLessonLabel = useCallback(
		(assignmentId: string) => {
			const assignment = assignmentMap[assignmentId];
			if (!assignment) return assignmentId;
			const groupName =
				groupMap[assignment.data.groupId]?.name ?? assignment.data.groupId;
			const subjectName =
				subjectMap[assignment.data.subjectId]?.name ?? assignment.data.subjectId;
			const teacherName =
				teacherMap[assignment.data.teacherId]?.name ?? assignment.data.teacherId;
			return `${subjectName} - ${teacherName} (${groupName})`;
		},
		[assignmentMap, groupMap, subjectMap, teacherMap],
	);
	const getActorName = useCallback(
		(actorId?: string | null) => {
			if (!actorId) return "Sistem";
			const actor = userMap[actorId];
			return actor?.displayName || actor?.login || actor?.email || actorId;
		},
		[userMap],
	);
	const assignmentYears = useMemo(() => {
		const years = new Set(assignments.map((assignment) => assignment.data.year));
		years.add(Number(lessonYear) || new Date().getFullYear());
		return Array.from(years).sort((a, b) => b - a);
	}, [assignments, lessonYear]);
	const getStudentClassLevel = useCallback(
		(student: { id: string; data: StudentDoc }) =>
			(
				student.data.classLevel ||
				groupMap[student.data.groupId]?.classLevel ||
				"-"
			).trim() || "-",
		[groupMap],
	);
	const classFilterOptions = useMemo(() => {
		const counts = new Map<string, number>();
		students.forEach((student) => {
			const classLabel = getStudentClassLevel(student);
			counts.set(classLabel, (counts.get(classLabel) ?? 0) + 1);
		});

		return Array.from(counts.entries())
			.map(([classLevel, count]) => ({ classLevel, count }))
			.sort((a, b) =>
				a.classLevel.localeCompare(b.classLevel, "az", {
					numeric: true,
					sensitivity: "base",
				}),
			);
	}, [getStudentClassLevel, students]);
	const filteredStudents = useMemo(
		() =>
			selectedClass === "all"
				? students
				: students.filter(
						(student) => getStudentClassLevel(student) === selectedClass,
					),
		[getStudentClassLevel, selectedClass, students],
	);
	const studentsPagination = usePagination(filteredStudents);
	const resetStudentsPage = studentsPagination.resetPage;
	const selectedStudent = useMemo(
		() =>
			selectedStudentId
				? students.find((student) => student.id === selectedStudentId) ?? null
				: null,
		[selectedStudentId, students],
	);
	const lessonYearNumber = Number(lessonYear) || new Date().getFullYear();

	const getStudentOverrides = useCallback(
		(student: DocEntry<StudentDoc>, year: number) =>
			assignmentOverrides.filter((override) => {
				if (override.data.deletedAt) return false;
				if (override.data.year !== year) return false;
				const studentKeys = new Set(
					[student.id, student.data.uid].filter(Boolean) as string[],
				);
				return (
					studentKeys.has(override.data.studentId) ||
					(Boolean(override.data.userId) &&
						studentKeys.has(override.data.userId ?? ""))
				);
			}),
		[assignmentOverrides],
	);

	const getStudentLessons = useCallback(
		(student: DocEntry<StudentDoc>, year: number): StudentLesson[] => {
			const assignmentsForYear = assignments.filter(
				(assignment) => assignment.data.year === year,
			);
			const membershipsForYear = studentGroupMemberships.filter(
				(membership) => membership.data.year === year,
			);
			const overridesForYear = assignmentOverrides.filter(
				(override) => override.data.year === year && !override.data.deletedAt,
			);
			const membershipsByStudentKey = buildStudentMembershipMap(membershipsForYear);
			const studentGroupIds = resolveStudentGroupIds(
				student,
				student.data.uid ?? student.id,
				membershipsByStudentKey,
			);
			const effectiveAssignments = resolveStudentAssignments({
				student,
				userId: student.data.uid ?? student.id,
				assignmentsForYear,
				membershipsForYear,
				overridesForYear,
				membershipsByStudentKey,
			});

			return effectiveAssignments
				.map((assignment) => ({
					assignmentId: assignment.id,
					teacherId: assignment.data.teacherId,
					teacherName:
						teacherMap[assignment.data.teacherId]?.name ??
						assignment.data.teacherId,
					groupId: assignment.data.groupId,
					groupName:
						groupMap[assignment.data.groupId]?.name ?? assignment.data.groupId,
					subjectId: assignment.data.subjectId,
					subjectName:
						subjectMap[assignment.data.subjectId]?.name ??
						assignment.data.subjectId,
					year: assignment.data.year,
					source: studentGroupIds.has(assignment.data.groupId)
						? ("base" as const)
						: ("included" as const),
				}))
				.sort((a, b) => {
					const groupCompare = a.groupName.localeCompare(b.groupName, "az", {
						numeric: true,
					});
					if (groupCompare !== 0) return groupCompare;
					const subjectCompare = a.subjectName.localeCompare(b.subjectName, "az");
					if (subjectCompare !== 0) return subjectCompare;
					return a.teacherName.localeCompare(b.teacherName, "az");
				});
		},
		[
			assignments,
			assignmentOverrides,
			groupMap,
			studentGroupMemberships,
			subjectMap,
			teacherMap,
		],
	);

	const selectedStudentLessons = useMemo(
		() =>
			selectedStudent
				? getStudentLessons(selectedStudent, lessonYearNumber)
				: [],
		[getStudentLessons, lessonYearNumber, selectedStudent],
	);
	const selectedStudentOverrideLogs = useMemo(() => {
		if (!selectedStudent) return [];
		const studentKeys = new Set(
			[selectedStudent.id, selectedStudent.data.uid].filter(Boolean) as string[],
		);
		const logs: LessonOverrideLog[] = [];

		assignmentOverrides.forEach((override) => {
			if (override.data.year !== lessonYearNumber) return;
			const matchesStudent =
				studentKeys.has(override.data.studentId) ||
				(Boolean(override.data.userId) &&
					studentKeys.has(override.data.userId ?? ""));
			if (!matchesStudent) return;

			const lessonLabel = getLessonLabel(override.data.assignmentId);
			const status = override.data.deletedAt ? "history" : "active";
			logs.push({
				id: `${override.id}:created`,
				assignmentId: override.data.assignmentId,
				lessonLabel,
				action: override.data.action === "exclude" ? "removed" : "added",
				status,
				at: override.data.createdAt,
				actorId: override.data.createdBy,
			});

			if (override.data.deletedAt) {
				logs.push({
					id: `${override.id}:deleted`,
					assignmentId: override.data.assignmentId,
					lessonLabel,
					action: override.data.action === "exclude" ? "restored" : "removed",
					status: "history",
					at: override.data.deletedAt,
					actorId: override.data.deletedBy,
				});
			}
		});

		return logs.sort((a, b) => {
			const left = new Date(String(a.at ?? 0)).getTime();
			const right = new Date(String(b.at ?? 0)).getTime();
			return right - left;
		});
	}, [
		assignmentOverrides,
		getLessonLabel,
		lessonYearNumber,
		selectedStudent,
	]);
	const removedStudentLessons = useMemo(
		() =>
			selectedStudentOverrideLogs.filter(
				(log) => log.action === "removed" && log.status === "active",
			),
		[selectedStudentOverrideLogs],
	);
	const availableExtraAssignments = useMemo(() => {
		if (!selectedStudent) return [];
		const existingAssignmentIds = new Set(
			selectedStudentLessons.map((lesson) => lesson.assignmentId),
		);
		return assignments
			.filter(
				(assignment) =>
					assignment.data.year === lessonYearNumber &&
					!existingAssignmentIds.has(assignment.id),
			)
			.sort((a, b) => {
				const left = `${groupMap[a.data.groupId]?.name ?? ""} ${
					subjectMap[a.data.subjectId]?.name ?? ""
				} ${teacherMap[a.data.teacherId]?.name ?? ""}`;
				const right = `${groupMap[b.data.groupId]?.name ?? ""} ${
					subjectMap[b.data.subjectId]?.name ?? ""
				} ${teacherMap[b.data.teacherId]?.name ?? ""}`;
				return left.localeCompare(right, "az", { numeric: true });
			});
	}, [
		assignments,
		groupMap,
		lessonYearNumber,
		selectedStudent,
		selectedStudentLessons,
		subjectMap,
		teacherMap,
	]);

	useEffect(() => {
		setSelectedClass("all");
		handleEditCancel();
	}, [branchId, handleEditCancel]);

	useEffect(() => {
		resetStudentsPage();
	}, [selectedClass, resetStudentsPage]);

	useEffect(() => {
		if (
			selectedClass !== "all" &&
			!classFilterOptions.some((option) => option.classLevel === selectedClass)
		) {
			setSelectedClass("all");
		}
	}, [classFilterOptions, selectedClass]);

	useEffect(() => {
		setExtraAssignmentId("");
	}, [lessonYear, selectedStudentId]);

	const loadOpenCycles = async () => {
		if (!branchId) return [];
		const { data, error } = await supabase
			.from("survey_cycles")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("status", "OPEN");
		if (error) throw new Error(error.message);
		return (data ?? [])
			.map((row) => ({ id: row.id, data: mapSurveyCycleRow(row) }))
			.filter((cycle: DocEntry<SurveyCycleDoc>) => {
				const branchIds = cycle.data.branchIds ?? [];
				return branchIds.length === 0 || branchIds.includes(branchId);
			});
	};

	const ensureNoSubmittedOpenTasks = async (student: DocEntry<StudentDoc>) => {
		if (!branchId) return;
		const raterUid = student.data.uid ?? student.id;
		const openCycles = await loadOpenCycles();
		if (openCycles.length === 0) return;
		const cycleIds = openCycles.map((cycle) => cycle.id);
		const { data: taskRows, error: taskError } = await supabase
			.from("tasks")
			.select("id")
			.eq("org_id", ORG_ID)
			.eq("branch_id", branchId)
			.eq("rater_id", raterUid)
			.eq("rater_role", "student")
			.eq("target_type", "teacher")
			.in("cycle_id", cycleIds);
		if (taskError) throw new Error(taskError.message);
		const taskIds = (taskRows ?? []).map((task) => task.id as string);
		if (taskIds.length === 0) return;
		const { data: submissionRows, error: submissionError } = await supabase
			.from("submissions")
			.select("task_id")
			.eq("org_id", ORG_ID)
			.in("task_id", taskIds);
		if (submissionError) throw new Error(submissionError.message);
		if ((submissionRows ?? []).length > 0) {
			throw new Error(
				"Bu şagirdin açıq dövrdə artıq cavabı var. Data itməsin deyə əvvəlcə cavabları ayrıca yoxlamaq lazımdır.",
			);
		}
	};

	const rebuildOpenStudentTasks = async (
		student: DocEntry<StudentDoc>,
		year: number,
	) => {
		if (!branchId) return;
		const openCycles = await loadOpenCycles();
		if (openCycles.length === 0) return;
		const raterUid = student.data.uid ?? student.id;
		const assignmentsForYear = assignments.filter(
			(assignment) => assignment.data.year === year,
		);
		const membershipsForYear = studentGroupMemberships.filter(
			(membership) => membership.data.year === year,
		);
		const { data: overrideRows, error: overrideError } = await supabase
			.from("student_assignment_overrides")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("branch_id", branchId)
			.is("deleted_at", null);
		if (overrideError) throw new Error(overrideError.message);
		const freshOverrides = (overrideRows ?? []).map((row) => ({
			id: row.id,
			data: mapStudentAssignmentOverrideRow(row),
		}));
		const overridesForYear = freshOverrides.filter(
			(override) => override.data.year === year,
		);
		const effectiveAssignments = resolveStudentAssignments({
			student,
			userId: raterUid,
			assignmentsForYear,
			membershipsForYear,
			overridesForYear,
		});
		const grouped = new Map<
			string,
			{
				teacherId: string;
				groupId: string;
				branchId: string;
				subjectNames: string[];
			}
		>();

		effectiveAssignments.forEach((assignment) => {
			const key = `${assignment.data.teacherId}_${assignment.data.groupId}`;
			const subjectName =
				subjectMap[assignment.data.subjectId]?.name ?? assignment.data.subjectId;
			const existing = grouped.get(key);
			if (!existing) {
				grouped.set(key, {
					teacherId: assignment.data.teacherId,
					groupId: assignment.data.groupId,
					branchId: assignment.data.branchId,
					subjectNames: subjectName ? [subjectName] : [],
				});
				return;
			}
			if (subjectName && !existing.subjectNames.includes(subjectName)) {
				existing.subjectNames.push(subjectName);
			}
		});

		const cycleIds = openCycles.map((cycle) => cycle.id);
		const { data: taskRows, error: taskError } = await supabase
			.from("tasks")
			.select("id")
			.eq("org_id", ORG_ID)
			.eq("branch_id", branchId)
			.eq("rater_id", raterUid)
			.eq("rater_role", "student")
			.eq("target_type", "teacher")
			.in("cycle_id", cycleIds);
		if (taskError) throw new Error(taskError.message);
		const existingTaskIds = (taskRows ?? []).map((task) => task.id as string);
		if (existingTaskIds.length > 0) {
			const { error: deleteError } = await supabase
				.from("tasks")
				.delete()
				.eq("org_id", ORG_ID)
				.in("id", existingTaskIds);
			if (deleteError) throw new Error(deleteError.message);
		}

		const rows: Array<TaskDoc & { id: string; org_id: string }> = [];
		openCycles.forEach((cycle) => {
			grouped.forEach((entry) => {
				const subjectName =
					entry.subjectNames.length > 0
						? entry.subjectNames.join(", ")
						: "Fənn göstərilməyib";
				const task: TaskDoc = {
					cycleId: cycle.id,
					raterUid,
					raterRole: "student",
					targetType: "teacher",
					targetId: entry.teacherId,
					targetName: teacherMap[entry.teacherId]?.name ?? null,
					branchId: entry.branchId,
					groupId: entry.groupId,
					groupName: groupMap[entry.groupId]?.name ?? null,
					subjectId: null,
					subjectName,
					status: "OPEN",
				};
				rows.push({
					id: buildTaskId({
						cycleId: cycle.id,
						raterUid,
						targetType: "teacher",
						targetId: entry.teacherId,
						groupId: entry.groupId,
					}),
					org_id: ORG_ID,
					...task,
				});
			});
		});

		if (rows.length === 0) return;
		const { error: upsertError } = await supabase.from("tasks").upsert(
			rows.map((row) => ({
				id: row.id,
				org_id: ORG_ID,
				cycle_id: row.cycleId,
				rater_id: row.raterUid,
				rater_role: row.raterRole,
				target_type: row.targetType,
				target_id: row.targetId,
				target_name: row.targetName ?? null,
				branch_id: row.branchId,
				group_id: row.groupId ?? null,
				subject_id: row.subjectId ?? null,
				group_name: row.groupName ?? null,
				subject_name: row.subjectName ?? null,
				status: row.status,
				submitted_at: row.submittedAt ?? null,
			})),
			{ onConflict: "id" },
		);
		if (upsertError) throw new Error(upsertError.message);
	};

	const insertOverride = async (
		student: DocEntry<StudentDoc>,
		assignmentId: string,
		action: StudentAssignmentOverrideDoc["action"],
		year: number,
	) => {
		if (!branchId) throw new Error("Filial seçilməyib");
		const overridePayload = {
			org_id: ORG_ID,
			branch_id: branchId,
			student_id: student.id,
			user_id: student.data.uid ?? null,
			assignment_id: assignmentId,
			year,
			action,
		};
		const { error } = await supabase.from("student_assignment_overrides").insert({
			...overridePayload,
			created_by: user?.id ?? null,
		});
		if (isOverrideAuditColumnMissing(error)) {
			const { error: retryError } = await supabase
				.from("student_assignment_overrides")
				.insert(overridePayload);
			if (retryError) throw new Error(retryError.message);
			return;
		}
		if (error) throw new Error(error.message);
	};

	const removeOverride = async (overrideId: string) => {
		const deletedAt = new Date().toISOString();
		const { error } = await supabase
			.from("student_assignment_overrides")
			.update({
				deleted_at: deletedAt,
				deleted_by: user?.id ?? null,
			})
			.eq("org_id", ORG_ID)
			.eq("id", overrideId);
		if (isOverrideAuditColumnMissing(error)) {
			const { error: retryError } = await supabase
				.from("student_assignment_overrides")
				.update({ deleted_at: deletedAt })
				.eq("org_id", ORG_ID)
				.eq("id", overrideId);
			if (retryError) throw new Error(retryError.message);
			return;
		}
		if (error) throw new Error(error.message);
	};

	const handleRemoveLesson = async (lesson: StudentLesson) => {
		if (!selectedStudent) return;
		const ok = await confirm({
			title: "Dərsi çıxar",
			message:
				"Bu dəyişiklik yalnız seçilmiş şagirdə tətbiq olunacaq. Davam edək?",
			confirmText: "Davam et",
			cancelText: "İmtina",
			tone: "danger",
		});
		if (!ok) return;
		setLessonSaving(true);
		try {
			const lessonLabel = getLessonLabel(lesson.assignmentId);
			await ensureNoSubmittedOpenTasks(selectedStudent);
			const overrides = getStudentOverrides(selectedStudent, lesson.year);
			const includeOverride = overrides.find(
				(override) =>
					override.data.assignmentId === lesson.assignmentId &&
					override.data.action === "include",
			);
			if (lesson.source === "included" && includeOverride) {
				await removeOverride(includeOverride.id);
			} else {
				await insertOverride(
					selectedStudent,
					lesson.assignmentId,
					"exclude",
					lesson.year,
				);
			}
			await loadData();
			await rebuildOpenStudentTasks(selectedStudent, lesson.year);
			setStatus(`Şagirdin dərs cədvəlindən ${lessonLabel} çıxarıldı.`);
		} catch (error) {
			setStatus(error instanceof Error ? error.message : "Dəyişiklik saxlanmadı");
		} finally {
			setLessonSaving(false);
		}
	};

	const handleAddLesson = async () => {
		if (!selectedStudent || !extraAssignmentId) return;
		const assignment = assignmentMap[extraAssignmentId];
		if (!assignment) {
			setStatus("Dərs təyinatı tapılmadı.");
			return;
		}
		setLessonSaving(true);
		try {
			const lessonLabel = getLessonLabel(extraAssignmentId);
			await ensureNoSubmittedOpenTasks(selectedStudent);
			const overrides = getStudentOverrides(selectedStudent, lessonYearNumber);
			const excludeOverride = overrides.find(
				(override) =>
					override.data.assignmentId === extraAssignmentId &&
					override.data.action === "exclude",
			);
			const includeOverride = overrides.find(
				(override) =>
					override.data.assignmentId === extraAssignmentId &&
					override.data.action === "include",
			);
			if (excludeOverride) {
				await removeOverride(excludeOverride.id);
			}
			const membershipsByStudentKey = buildStudentMembershipMap(
				studentGroupMemberships.filter(
					(membership) => membership.data.year === lessonYearNumber,
				),
			);
			const baseGroupIds = resolveStudentGroupIds(
				selectedStudent,
				selectedStudent.data.uid ?? selectedStudent.id,
				membershipsByStudentKey,
			);
			if (!baseGroupIds.has(assignment.data.groupId) && !includeOverride) {
				await insertOverride(
					selectedStudent,
					extraAssignmentId,
					"include",
					lessonYearNumber,
				);
			}
			await loadData();
			await rebuildOpenStudentTasks(selectedStudent, lessonYearNumber);
			setExtraAssignmentId("");
			setStatus(
				excludeOverride
					? `${lessonLabel} şagirdin dərs cədvəlinə geri əlavə edildi.`
					: `${lessonLabel} şagirdin dərs cədvəlinə əlavə edildi.`,
			);
		} catch (error) {
			setStatus(error instanceof Error ? error.message : "Dəyişiklik saxlanmadı");
		} finally {
			setLessonSaving(false);
		}
	};

	const handleExportStudentCredentials = async () => {
		if (!branchId) {
			setStatus("Filial seçilməyib. Export üçün filial seçin.");
			return;
		}

		const entries = students
			.filter((student) => student.data.login)
			.map((student) => ({
				classLevel: (student.data.classLevel || "").trim() || "-",
				groupName: groupMap[student.data.groupId]?.name ?? student.data.groupId,
				studentName: student.data.name,
				login: student.data.login ?? "",
			}))
			.sort((a, b) => {
				const classCompare = a.classLevel.localeCompare(b.classLevel, "az", {
					numeric: true,
				});
				if (classCompare !== 0) return classCompare;
				const groupCompare = a.groupName.localeCompare(b.groupName, "az");
				if (groupCompare !== 0) return groupCompare;
				return a.studentName.localeCompare(b.studentName, "az");
			});

		if (entries.length === 0) {
			setStatus("Export üçün login-i olan şagird tapılmadı.");
			return;
		}

		const headers = ["Sinif", "Qrup", "Şagird", "Login", "Parol"];
		const byClass = new Map<string, string[][]>();
		entries.forEach((entry) => {
			const row = [
				entry.classLevel,
				entry.groupName,
				entry.studentName,
				entry.login,
				entry.login,
			];
			const existing = byClass.get(entry.classLevel) ?? [];
			existing.push(row);
			byClass.set(entry.classLevel, existing);
		});

		const sheets = [
			{
				name: "Hamısı",
				headers,
				rows: entries.map((entry) => [
					entry.classLevel,
					entry.groupName,
					entry.studentName,
					entry.login,
					entry.login,
				]),
			},
			...Array.from(byClass.entries())
				.sort(([a], [b]) => a.localeCompare(b, "az", { numeric: true }))
				.map(([classLevel, rows]) => ({
					name: `Sinif ${classLevel}`,
					headers,
					rows,
				})),
		];

		const branchLabel = (branchName || branchId)
			.replace(/[\\/:*?"<>|]/g, "-")
			.replace(/\s+/g, "-");
		await downloadWorkbook(`students-logins-${branchLabel}.xlsx`, sheets);
		setStatus(
			"Şagird login/parol export hazırdır. Parol sütunu default olaraq login dəyəridir.",
		);
	};

	return (
		<div className="panel branch-page">
			<div className="page-hero">
				<div className="page-hero__content">
					<div className="eyebrow">Filial bazası</div>
					<h1>Şagirdlər</h1>
					<p>Şagird siyahısı, qrup və sinif səviyyəsi məlumatı.</p>
				</div>
				<div className="page-hero__aside">
					{isSuperAdmin && (
						<BranchSelector
							branchId={branchId}
							branches={branches}
							onChange={setBranchId}
						/>
					)}
					<div className="stat-pill">Cəmi: {summary}</div>
					{selectedClass !== "all" && (
						<div className="stat-pill">Göstərilən: {filteredStudents.length}</div>
					)}
				</div>
			</div>
			{isSuperAdmin && !branchId && (
				<div className="notice">
					Filial seçilməyib. Davam etmək üçün filial seçin.
				</div>
			)}

			{!hasGroups && (
				<div className="notice">
					Əvvəlcə qrup yaradın. Qrup olmadan şagird əlavə etmək mümkün deyil.
				</div>
			)}

			<div className="page-grid students-page-grid">
				<div className="students-side-panel">
					<div className="card class-filter-card">
						<div className="section-header">
							<div>
								<div className="section-kicker">Filter</div>
								<div className="section-title">Siniflər</div>
							</div>
						</div>
						<div className="class-filter-list">
							<button
								className={`class-filter-button ${
									selectedClass === "all" ? "active" : ""
								}`}
								type="button"
								onClick={() => setSelectedClass("all")}
							>
								<span>Hamısı</span>
								<span className="class-filter-button__count">
									{students.length}
								</span>
							</button>
							{classFilterOptions.map((option) => (
								<button
									className={`class-filter-button ${
										selectedClass === option.classLevel ? "active" : ""
									}`}
									key={option.classLevel}
									type="button"
									onClick={() => setSelectedClass(option.classLevel)}
								>
									<span>{option.classLevel}</span>
									<span className="class-filter-button__count">
										{option.count}
									</span>
								</button>
							))}
						</div>
					</div>

					<div className="card">
						<h3>Yeni şagird</h3>
						<div className="form-grid">
							<input
								className="input"
								placeholder="Ad Soyad"
								value={name}
								onChange={(event) => setName(event.target.value)}
							/>
							<select
								className="input"
								value={groupId}
								onChange={(event) => setGroupId(event.target.value)}
							>
								<option value="">Qrup seçin</option>
								{groups.map((group) => (
									<option key={group.id} value={group.id}>
										{group.data.name}
									</option>
								))}
							</select>
							<input
								className="input"
								placeholder="Sinif səviyyəsi (məs: 9)"
								value={classLevel}
								onChange={(event) => setClassLevel(event.target.value)}
							/>
							<button
								className="btn primary"
								type="button"
								onClick={handleCreate}
								disabled={!hasGroups || !branchId}
							>
								Yarat
							</button>
						</div>
						<div className="form-row">
							<input
								className="input"
								type="file"
								accept=".csv,.xlsx"
								disabled={!hasGroups || !branchId}
								onChange={(event) => {
									const file = event.target.files?.[0];
									if (file) void handleImport(file);
								}}
							/>
							<span className="hint">
								Şablon sütunları: name, groupId/groupName, classLevel (istəyə bağlı), branchId (istəyə bağlı)
							</span>
						</div>
						<div className="hint">Şifrə default olaraq login ilə eynidir.</div>
						{status && <div className="notice">{status}</div>}
					</div>

				</div>

				<div className="card">
					<div className="section-header">
						<div>
							<div className="section-kicker">Siyahı</div>
							<div className="section-title">Şagirdlər</div>
							<div className="students-list-meta">
								{selectedClass === "all"
									? `${students.length} şagird`
									: `${selectedClass} sinfi üzrə ${filteredStudents.length} şagird`}
							</div>
						</div>
						<button
							className="btn ghost"
							type="button"
							onClick={() => void handleExportStudentCredentials()}
							disabled={!branchId || students.length === 0}
						>
							Login/parol export (sinif-sinif)
						</button>
					</div>
					<div className="data-table">
						<div className="data-row header">
							<div>Ad</div>
							<div>Qrup</div>
							<div>Sinif səviyyəsi</div>
							<div>Login</div>
							<div></div>
						</div>
						{studentsPagination.paginatedItems.map((student) => (
							<div className="data-row" key={student.id}>
								<div>{student.data.name}</div>
								<div>{groupMap[student.data.groupId]?.name ?? student.data.groupId}</div>
								<div>{getStudentClassLevel(student)}</div>
								<div>{student.data.login ?? "-"}</div>
								<div className="student-row-actions">
									<button
										className="btn ghost"
										type="button"
										onClick={() => handleEditStart(student)}
									>
										Redaktə
									</button>
									<button
										className="btn ghost"
										type="button"
										onClick={() => setSelectedStudentId(student.id)}
									>
										Dərslər
									</button>
									<button
										className="btn ghost"
										type="button"
										onClick={() => void handleDelete(student.id)}
									>
										Sil
									</button>
								</div>
							</div>
						))}
					</div>
					{studentsPagination.totalItems === 0 && (
						<div className="empty">Bu sinif üzrə şagird tapılmadı.</div>
					)}
					{studentsPagination.totalItems > 0 && (
						<PaginationControls
							totalItems={studentsPagination.totalItems}
							page={studentsPagination.page}
							pageSize={studentsPagination.pageSize}
							onPageChange={studentsPagination.setPage}
							onPageSizeChange={studentsPagination.setPageSize}
						/>
					)}
				</div>
			</div>
			<Dialog
				open={Boolean(selectedStudent)}
				onOpenChange={(open) => {
					if (!open) {
						setSelectedStudentId(null);
						setExtraAssignmentId("");
					}
				}}
			>
				<DialogContent className="student-lessons-dialog">
					<DialogHeader className="student-lessons-header">
						<DialogTitle>Şagirdin dərsləri</DialogTitle>
						<button
							className="btn ghost"
							type="button"
							onClick={() => {
								setSelectedStudentId(null);
								setExtraAssignmentId("");
							}}
						>
							Bağla
						</button>
					</DialogHeader>
					{selectedStudent && (
						<div className="student-lessons-panel">
							<div className="student-lessons-toolbar">
								<div>
									<div className="section-title">{selectedStudent.data.name}</div>
									<div className="hint">
										{groupMap[selectedStudent.data.groupId]?.name ??
											selectedStudent.data.groupId}{" "}
										• {selectedStudent.data.login ?? "login yoxdur"}
									</div>
								</div>
								<select
									className="input"
									value={lessonYear}
									onChange={(event) => setLessonYear(event.target.value)}
								>
									{assignmentYears.map((year) => (
										<option key={year} value={year}>
											{year}
										</option>
									))}
								</select>
							</div>

							<div className="student-lessons-current">
								<div className="section-header">
									<div>
										<div className="section-kicker">Hazırkı dərslər</div>
										<div className="hint">
											Bu şagirdin hazırda cədvəldə görünən dərsləri
										</div>
									</div>
									<span className="tag">{selectedStudentLessons.length} dərs</span>
								</div>

								<div className="student-lessons-add">
									<select
										className="input"
										value={extraAssignmentId}
										onChange={(event) => setExtraAssignmentId(event.target.value)}
										disabled={availableExtraAssignments.length === 0}
									>
										<option value="">Əlavə dərs seçin</option>
										{availableExtraAssignments.map((assignment) => (
											<option key={assignment.id} value={assignment.id}>
												{groupMap[assignment.data.groupId]?.name ??
													assignment.data.groupId}{" "}
												- {subjectMap[assignment.data.subjectId]?.name ??
													assignment.data.subjectId}{" "}
												- {teacherMap[assignment.data.teacherId]?.name ??
													assignment.data.teacherId}
											</option>
										))}
									</select>
									<button
										className="btn primary"
										type="button"
										onClick={() => void handleAddLesson()}
										disabled={!extraAssignmentId || lessonSaving}
									>
										Əlavə et
									</button>
								</div>

								<div className="data-table student-lessons-table">
									<div className="data-row header">
										<div>Qrup</div>
										<div>Fənn</div>
										<div>Müəllim</div>
										<div>Mənbə</div>
										<div></div>
									</div>
									{selectedStudentLessons.map((lesson) => (
										<div className="data-row" key={lesson.assignmentId}>
											<div>{lesson.groupName}</div>
											<div>{lesson.subjectName}</div>
											<div>{lesson.teacherName}</div>
											<div>
												{lesson.source === "base"
													? "Blok/sinif təyinatı"
													: "Fərdi əlavə"}
											</div>
											<div>
												<button
													className="btn ghost"
													type="button"
													onClick={() => void handleRemoveLesson(lesson)}
													disabled={lessonSaving}
												>
													Çıxar
												</button>
											</div>
										</div>
									))}
								</div>
								{selectedStudentLessons.length === 0 && (
									<div className="empty">Bu il üçün dərs tapılmadı.</div>
								)}
							</div>
							<div className="student-lessons-notes">
								<div className="section-header">
									<div>
										<div className="section-kicker">Keçmiş qeydlər</div>
										<div className="hint">
											Əvvəl olub, sonra çıxarılan və hesab üzrə dəyişən dərslər
										</div>
									</div>
								</div>
								<div className="student-lessons-notes-grid">
									<div className="student-lessons-note-block">
										<div className="student-lessons-note-heading">
											Hazırda çıxarılanlar
										</div>
										{removedStudentLessons.length > 0 ? (
											<div className="student-lessons-note-list">
												{removedStudentLessons.map((log) => (
													<div className="student-lessons-note" key={log.id}>
														<div className="student-lessons-note__title">
															{log.lessonLabel}
														</div>
														<div className="student-lessons-note__meta">
															{formatAuditTime(log.at)} • {getActorName(log.actorId)}
														</div>
													</div>
												))}
											</div>
										) : (
											<div className="student-lessons-note-empty">
												Çıxarılan dərs yoxdur.
											</div>
										)}
									</div>
									<div className="student-lessons-note-block">
										<div className="student-lessons-note-heading">
											Dəyişiklik tarixçəsi
										</div>
										{selectedStudentOverrideLogs.length > 0 ? (
											<div className="student-lessons-note-list">
												{selectedStudentOverrideLogs.map((log) => (
													<div className="student-lessons-note" key={log.id}>
														<div className="student-lessons-note__title">
															{lessonLogActionLabel[log.action]}: {log.lessonLabel}
														</div>
														<div className="student-lessons-note__meta">
															{formatAuditTime(log.at)} • {getActorName(log.actorId)} •{" "}
															{log.status === "active" ? "Qüvvədə" : "Keçmiş"}
														</div>
													</div>
												))}
											</div>
										) : (
											<div className="student-lessons-note-empty">
												Dəyişiklik tarixçəsi yoxdur.
											</div>
										)}
									</div>
								</div>
							</div>
							<div className="hint">
								Dəyişiklik yalnız bu şagirdə aiddir. Cavabı olan açıq tasklar
								silinmir, bu halda sistem dəyişiklik etməyə icazə vermir.
							</div>
						</div>
					)}
				</DialogContent>
			</Dialog>
			<Dialog
				open={Boolean(editingStudentId)}
				onOpenChange={(open) => {
					if (!open) {
						handleEditCancel();
					}
				}}
			>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Şagirdi redaktə et</DialogTitle>
					</DialogHeader>
					<div className="stack">
						<input
							className="input"
							placeholder="Ad Soyad"
							value={editName}
							onChange={(event) => setEditName(event.target.value)}
						/>
						<select
							className="input"
							value={editGroupId}
							onChange={(event) => {
								const nextGroupId = event.target.value;
								setEditGroupId(nextGroupId);
								const nextGroup = groupMap[nextGroupId];
								if (nextGroup?.classLevel) {
									setEditClassLevel(nextGroup.classLevel);
								}
							}}
						>
							<option value="">Qrup seçin</option>
							{groups.map((group) => (
								<option key={group.id} value={group.id}>
									{group.data.name}
								</option>
							))}
						</select>
						<input
							className="input"
							placeholder="Sinif səviyyəsi (məs: 9)"
							value={editClassLevel}
							onChange={(event) => setEditClassLevel(event.target.value)}
						/>
						<div className="actions modal-actions">
							<button
								className="btn ghost"
								type="button"
								onClick={handleEditCancel}
								disabled={savingStudentEdit}
							>
								Ləğv et
							</button>
							<button
								className="btn primary"
								type="button"
								onClick={() => void handleEditSave()}
								disabled={savingStudentEdit}
							>
								Yadda saxla
							</button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
			{dialog}
		</div>
	);
};

