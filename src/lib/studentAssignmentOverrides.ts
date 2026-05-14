import type {
	StudentAssignmentOverrideDoc,
	StudentDoc,
	StudentGroupMembershipDoc,
	TeachingAssignmentDoc,
} from "./types";

export type DocEntry<T> = { id: string; data: T };

export const buildStudentMembershipMap = (
	memberships: Array<DocEntry<StudentGroupMembershipDoc>>,
) => {
	const membershipsByStudentKey = new Map<string, Set<string>>();
	const addMembershipGroup = (key: string | null | undefined, groupId: string) => {
		if (!key) return;
		const groupIds = membershipsByStudentKey.get(key) ?? new Set<string>();
		groupIds.add(groupId);
		membershipsByStudentKey.set(key, groupIds);
	};

	memberships.forEach((membership) => {
		addMembershipGroup(membership.data.studentId, membership.data.groupId);
		addMembershipGroup(membership.data.userId, membership.data.groupId);
	});

	return membershipsByStudentKey;
};

export const resolveStudentGroupIds = (
	student: DocEntry<StudentDoc>,
	userId: string | null | undefined,
	membershipsByStudentKey: Map<string, Set<string>>,
) => {
	const groupIds = new Set<string>();
	if (student.data.groupId) groupIds.add(student.data.groupId);
	[student.id, student.data.uid, userId].forEach((key) => {
		const membershipGroups = key ? membershipsByStudentKey.get(key) : null;
		membershipGroups?.forEach((groupId) => groupIds.add(groupId));
	});
	return groupIds;
};

const matchesStudent = (
	override: StudentAssignmentOverrideDoc,
	student: DocEntry<StudentDoc>,
	userId: string | null | undefined,
) =>
	override.studentId === student.id ||
	override.studentId === student.data.uid ||
	override.studentId === userId ||
	override.userId === student.id ||
	override.userId === student.data.uid ||
	override.userId === userId;

export const resolveStudentAssignments = ({
	student,
	userId,
	assignmentsForYear,
	membershipsForYear,
	overridesForYear,
	assignmentFilter,
	membershipsByStudentKey,
}: {
	student: DocEntry<StudentDoc>;
	userId?: string | null;
	assignmentsForYear: Array<DocEntry<TeachingAssignmentDoc>>;
	membershipsForYear: Array<DocEntry<StudentGroupMembershipDoc>>;
	overridesForYear: Array<DocEntry<StudentAssignmentOverrideDoc>>;
	assignmentFilter?: (assignment: DocEntry<TeachingAssignmentDoc>) => boolean;
	membershipsByStudentKey?: Map<string, Set<string>>;
}) => {
	const membershipMap =
		membershipsByStudentKey ?? buildStudentMembershipMap(membershipsForYear);
	const studentGroupIds = resolveStudentGroupIds(
		student,
		userId,
		membershipMap,
	);
	const overrides = overridesForYear.filter((override) =>
		matchesStudent(override.data, student, userId),
	);
	const excludedAssignmentIds = new Set(
		overrides
			.filter((override) => override.data.action === "exclude")
			.map((override) => override.data.assignmentId),
	);
	const includedAssignmentIds = new Set(
		overrides
			.filter((override) => override.data.action === "include")
			.map((override) => override.data.assignmentId),
	);
	const assignmentById = new Map(
		assignmentsForYear.map((assignment) => [assignment.id, assignment]),
	);
	const effectiveAssignments = new Map<string, DocEntry<TeachingAssignmentDoc>>();
	const canUseAssignment = (assignment: DocEntry<TeachingAssignmentDoc>) =>
		assignmentFilter ? assignmentFilter(assignment) : true;

	assignmentsForYear.forEach((assignment) => {
		if (!studentGroupIds.has(assignment.data.groupId)) return;
		if (excludedAssignmentIds.has(assignment.id)) return;
		if (!canUseAssignment(assignment)) return;
		effectiveAssignments.set(assignment.id, assignment);
	});

	includedAssignmentIds.forEach((assignmentId) => {
		if (excludedAssignmentIds.has(assignmentId)) return;
		const assignment = assignmentById.get(assignmentId);
		if (!assignment || !canUseAssignment(assignment)) return;
		effectiveAssignments.set(assignment.id, assignment);
	});

	return Array.from(effectiveAssignments.values());
};
