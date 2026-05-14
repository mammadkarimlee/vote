export const MANAGEMENT_SCOPE_DEPARTMENT_LABEL = "Kafedranızın müəllimi olaraq";
export const MANAGEMENT_SCOPE_BRANCH_LABEL = "Filial rəhbərliyi olaraq";

export const managementDepartmentScopeKey = (departmentId: string) =>
	`management-department-${departmentId}`;

export const managementBranchScopeKey = (branchId: string) =>
	`management-branch-${branchId}`;

export const isManagementScopeLabel = (value?: string | null) =>
	value === MANAGEMENT_SCOPE_DEPARTMENT_LABEL ||
	value === MANAGEMENT_SCOPE_BRANCH_LABEL;
