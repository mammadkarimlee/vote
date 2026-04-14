import { useCallback, useEffect, useMemo, useState } from "react";
import { useFeedbackState } from "../../components/feedback/FeedbackProvider";
import { PaginationControls } from "../../components/PaginationControls";
import { useConfirmDialog } from "../../components/ConfirmDialog";
import { ORG_ID, supabase } from "../../lib/supabase";
import {
	mapBranchRow,
	mapDepartmentRow,
	mapManagementAssignmentRow,
	mapUserRow,
} from "../../lib/supabaseMappers";
import type {
	BranchDoc,
	DepartmentDoc,
	ManagementAssignmentDoc,
	UserDoc,
} from "../../lib/types";
import { usePagination } from "../../lib/usePagination";
import { downloadWorkbook } from "../../lib/xlsx";
import { useAuth } from "../auth/AuthProvider";

type UserEntry = { id: string; data: UserDoc };
type DepartmentEntry = { id: string; data: DepartmentDoc };
type AssignmentEntry = { id: string; data: ManagementAssignmentDoc };
type BranchEntry = { id: string; data: BranchDoc };
type AggregatedDepartmentHead = {
	key: string;
	departmentName: string;
	managerUid: string;
	year: number;
	assignmentIds: string[];
	branchIds: string[];
};
type GlobalDepartmentOption = {
	name: string;
	departmentIds: string[];
	branchIds: string[];
};

const HIDDEN_DEPARTMENT_NAMES = new Set(["umumi", "ümumi"]);

const formatRoleLabel = (role?: UserDoc["role"]) =>
	role === "teacher" ? "Müəllim" : "Rəhbərlik";

const isVisibleDepartmentName = (name?: string | null) => {
	const normalized = name?.trim().toLocaleLowerCase("az");
	if (!normalized) return false;
	return !HIDDEN_DEPARTMENT_NAMES.has(normalized);
};

export const BranchManagementAssignmentsPage = () => {
	const { user, userDoc } = useAuth();
	const { confirm, dialog } = useConfirmDialog();
	const isSuperAdmin = userDoc?.role === "superadmin";
	const scopedBranchIds = useMemo(
		() => (isSuperAdmin ? null : userDoc?.branchId ? [userDoc.branchId] : []),
		[isSuperAdmin, userDoc?.branchId],
	);
	const [managerCandidates, setManagerCandidates] = useState<UserEntry[]>([]);
	const [assignments, setAssignments] = useState<AssignmentEntry[]>([]);
	const [departments, setDepartments] = useState<DepartmentEntry[]>([]);
	const [branches, setBranches] = useState<BranchEntry[]>([]);
	const [managerUid, setManagerUid] = useState("");
	const [departmentName, setDepartmentName] = useState("");
	const [year, setYear] = useState(String(new Date().getFullYear()));
	const [status, setStatus] = useFeedbackState();

	const loadData = useCallback(async () => {
		if (Array.isArray(scopedBranchIds) && scopedBranchIds.length === 0) {
			setManagerCandidates([]);
			setAssignments([]);
			setDepartments([]);
			setBranches([]);
			return;
		}

		const usersQuery = supabase
			.from("users")
			.select("*")
			.eq("org_id", ORG_ID)
			.in("role", ["manager", "teacher"])
			.is("deleted_at", null);
		const assignmentsQuery = supabase
			.from("management_assignments")
			.select("*")
			.eq("org_id", ORG_ID)
			.not("department_id", "is", null)
			.is("deleted_at", null);
		const departmentsQuery = supabase
			.from("departments")
			.select("*")
			.eq("org_id", ORG_ID)
			.is("deleted_at", null);
		const branchesQuery = supabase
			.from("branches")
			.select("*")
			.eq("org_id", ORG_ID)
			.is("deleted_at", null);

		if (Array.isArray(scopedBranchIds) && scopedBranchIds.length > 0) {
			assignmentsQuery.in("branch_id", scopedBranchIds);
			departmentsQuery.in("branch_id", scopedBranchIds);
			branchesQuery.in("id", scopedBranchIds);
		}

		const [usersRes, assignmentsRes, departmentsRes, branchesRes] =
			await Promise.all([
				usersQuery,
				assignmentsQuery,
				departmentsQuery,
				branchesQuery,
			]);

		setManagerCandidates(
			(usersRes.data ?? [])
				.map((row) => ({ id: row.id, data: mapUserRow(row) }))
				.sort((a, b) =>
					(a.data.displayName ?? a.data.login ?? a.id).localeCompare(
						b.data.displayName ?? b.data.login ?? b.id,
						"az",
					),
				),
		);

		setAssignments(
			(assignmentsRes.data ?? [])
				.map((row) => ({
					id: row.id,
					data: mapManagementAssignmentRow(row),
				}))
				.sort((a, b) => b.data.year - a.data.year),
		);

		setDepartments(
			(departmentsRes.data ?? [])
				.map((row) => ({
					id: row.id,
					data: mapDepartmentRow(row),
				}))
				.sort((a, b) => a.data.name.localeCompare(b.data.name, "az")),
		);

		setBranches(
			(branchesRes.data ?? [])
				.map((row) => ({
					id: row.id,
					data: mapBranchRow(row),
				}))
				.sort((a, b) => a.data.name.localeCompare(b.data.name, "az")),
		);
	}, [scopedBranchIds]);

	useEffect(() => {
		void loadData();
	}, [loadData]);

	const managerMap = useMemo(
		() =>
			Object.fromEntries(
				managerCandidates.map((manager) => [manager.id, manager.data]),
			),
		[managerCandidates],
	);

	const departmentMap = useMemo(
		() =>
			Object.fromEntries(
				departments.map((department) => [department.id, department.data]),
			),
		[departments],
	);

	const branchMap = useMemo(
		() => Object.fromEntries(branches.map((branch) => [branch.id, branch.data])),
		[branches],
	);

	const globalDepartments = useMemo(() => {
		const grouped = new Map<
			string,
			{ name: string; departmentIds: string[]; branchIds: Set<string> }
		>();

		departments.forEach((department) => {
			if (!isVisibleDepartmentName(department.data.name)) return;
			const existing = grouped.get(department.data.name) ?? {
				name: department.data.name,
				departmentIds: [],
				branchIds: new Set<string>(),
			};
			existing.departmentIds.push(department.id);
			existing.branchIds.add(department.data.branchId);
			grouped.set(department.data.name, existing);
		});

		return Array.from(grouped.values())
			.map<GlobalDepartmentOption>((item) => ({
				name: item.name,
				departmentIds: item.departmentIds,
				branchIds: Array.from(item.branchIds),
			}))
			.sort((a, b) => a.name.localeCompare(b.name, "az"));
	}, [departments]);

	const departmentHeads = useMemo(() => {
		const grouped = new Map<
			string,
			{
				key: string;
				departmentName: string;
				managerUid: string;
				year: number;
				assignmentIds: string[];
				branchIds: Set<string>;
			}
		>();

		assignments.forEach((assignment) => {
			const departmentId = assignment.data.departmentId;
			if (!departmentId) return;
			const department = departmentMap[departmentId];
			if (!department || !isVisibleDepartmentName(department.name)) return;

			const key = [
				department.name,
				assignment.data.managerUid,
				assignment.data.year,
			].join("::");
			const existing = grouped.get(key) ?? {
				key,
				departmentName: department.name,
				managerUid: assignment.data.managerUid,
				year: assignment.data.year,
				assignmentIds: [],
				branchIds: new Set<string>(),
			};

			existing.assignmentIds.push(assignment.id);
			existing.branchIds.add(assignment.data.branchId);
			grouped.set(key, existing);
		});

		return Array.from(grouped.values())
			.map<AggregatedDepartmentHead>((item) => ({
				key: item.key,
				departmentName: item.departmentName,
				managerUid: item.managerUid,
				year: item.year,
				assignmentIds: item.assignmentIds,
				branchIds: Array.from(item.branchIds),
			}))
			.sort((a, b) => {
				const departmentCompare = a.departmentName.localeCompare(
					b.departmentName,
					"az",
				);
				if (departmentCompare !== 0) return departmentCompare;
				const managerCompare = (
					managerMap[a.managerUid]?.displayName ??
					managerMap[a.managerUid]?.login ??
					a.managerUid
				).localeCompare(
					managerMap[b.managerUid]?.displayName ??
						managerMap[b.managerUid]?.login ??
						b.managerUid,
					"az",
				);
				if (managerCompare !== 0) return managerCompare;
				return b.year - a.year;
			});
	}, [assignments, departmentMap, managerMap]);

	const credentialReadyCount = useMemo(
		() => departmentHeads.filter((row) => Boolean(managerMap[row.managerUid]?.login)).length,
		[departmentHeads, managerMap],
	);

	const scopeLabel = useMemo(() => {
		if (isSuperAdmin) return "Bütün filiallar";
		if (!scopedBranchIds || scopedBranchIds.length === 0) return "Filial təyin edilməyib";
		return branchMap[scopedBranchIds[0]]?.name ?? "Filial";
	}, [branchMap, isSuperAdmin, scopedBranchIds]);
	const departmentHeadsPagination = usePagination(departmentHeads);

	const handleCreate = async () => {
		if (!managerUid || !departmentName || !year) {
			setStatus("Müdir, kafedra və il seçin.");
			return;
		}

		const yearNumber = Number(year);
		if (!Number.isInteger(yearNumber) || yearNumber < 2000) {
			setStatus("İl düzgün daxil edilməyib.");
			return;
		}

		const matchingDepartments = departments.filter(
			(department) => department.data.name === departmentName,
		);
		if (matchingDepartments.length === 0) {
			setStatus("Seçilmiş kafedra üçün aktiv filial tapılmadı.");
			return;
		}

		const existingBranchIds = new Set(
			departmentHeads
				.filter(
					(row) =>
						row.departmentName === departmentName &&
						row.managerUid === managerUid &&
						row.year === yearNumber,
				)
				.flatMap((row) => row.branchIds),
		);

		const rows = matchingDepartments
			.filter((department) => !existingBranchIds.has(department.data.branchId))
			.map((department) => ({
				org_id: ORG_ID,
				manager_id: managerUid,
				branch_id: department.data.branchId,
				department_id: department.id,
				year: yearNumber,
			}));

		if (rows.length === 0) {
			setStatus("Bu kafedra müdiri artıq seçilmiş il üçün əlavə olunub.");
			return;
		}

		const { error } = await supabase.from("management_assignments").insert(rows);
		if (error) {
			setStatus(error.message || "Kafedra müdiri əlavə olunmadı.");
			return;
		}

		setManagerUid("");
		setDepartmentName("");
		setStatus(`Kafedra müdiri ${rows.length} filial üzrə əlavə olundu.`);
		await loadData();
	};

	const handleDelete = async (row: AggregatedDepartmentHead) => {
		const ok = await confirm({
			title: "Kafedra müdirini sil",
			message:
				"Bu kafedra müdiri təyinatı seçilmiş scope daxilində bütün filiallardan silinəcək. Davam edək?",
			confirmText: "Sil",
			cancelText: "İmtina",
			tone: "danger",
		});
		if (!ok) return;

		const { error } = await supabase
			.from("management_assignments")
			.update({
				deleted_at: new Date().toISOString(),
				deleted_by: user?.id ?? null,
			})
			.eq("org_id", ORG_ID)
			.in("id", row.assignmentIds);

		if (error) {
			setStatus(error.message || "Silmə zamanı xəta oldu.");
			return;
		}

		setStatus("Kafedra müdiri təyinatı silindi.");
		await loadData();
	};

	const handleExport = async () => {
		const rows = departmentHeads
			.map((row) => {
				const manager = managerMap[row.managerUid];
				const login = manager?.login ?? "";
				const primaryBranch =
					(manager?.branchId && branchMap[manager.branchId]?.name) || "-";
				const coveredBranches = row.branchIds
					.map((branchId) => branchMap[branchId]?.name ?? branchId)
					.sort((a, b) => a.localeCompare(b, "az"))
					.join(", ");

				return {
					departmentName: row.departmentName,
					managerName: manager?.displayName ?? manager?.login ?? row.managerUid,
					login,
					password: login,
					primaryBranch,
					coveredBranches,
					year: row.year,
				};
			})
			.sort((a, b) => {
				const departmentCompare = a.departmentName.localeCompare(
					b.departmentName,
					"az",
				);
				if (departmentCompare !== 0) return departmentCompare;
				return a.managerName.localeCompare(b.managerName, "az");
			});

		if (rows.length === 0) {
			setStatus("Export üçün kafedra müdiri tapılmadı.");
			return;
		}

		await downloadWorkbook("kafedra-mudirleri-logins.xlsx", [
			{
				name: "Kafedra müdirləri",
				headers: [
					"Kafedra",
					"Müdir",
					"Login",
					"Parol",
					"Əsas filial",
					"Əhatə etdiyi filiallar",
					"İl",
				],
				rows: rows.map((row) => [
					row.departmentName,
					row.managerName,
					row.login,
					row.password,
					row.primaryBranch,
					row.coveredBranches,
					row.year,
				]),
			},
		]);

		setStatus(
			"Export hazırdır. Parol sütunu sistemin ilkin qaydasına uyğun olaraq login dəyəri ilə dolduruldu.",
		);
	};

	return (
		<div className="panel branch-page">
			<div className="page-hero">
				<div className="page-hero__content">
					<div className="eyebrow">Rəhbərlik strukturu</div>
					<h1>Kafedra müdirləri</h1>
					<p>
						Kafedra müdirləri qlobal siyahı kimi göstərilir. Buradan onların
						loginlərini görə və export edə bilərsiniz.
					</p>
				</div>
				<div className="page-hero__aside">
					<div className="stat-pill">Scope: {scopeLabel}</div>
					<div className="stat-pill">Cəmi: {departmentHeads.length}</div>
					<div className="stat-pill">Login hazır: {credentialReadyCount}</div>
					<button className="btn primary" type="button" onClick={() => void handleExport()}>
						Loginləri export et
					</button>
				</div>
			</div>

			{status && <div className="notice">{status}</div>}

			<div className="page-grid">
				<div className="stack">
					<div className="card">
						<h3>Yeni kafedra müdiri</h3>
						<p className="hint">
							Bu əlavə etmə qlobal işləyir. Seçilmiş kafedra həmin kafedranın
							olan bütün filiallarında eyni müdirə bağlanacaq.
						</p>
						<div className="form-grid">
							<select
								className="input"
								value={managerUid}
								onChange={(event) => setManagerUid(event.target.value)}
							>
								<option value="">Müdir seçin</option>
								{managerCandidates.map((manager) => {
									const managerBranchName =
										(manager.data.branchId &&
											branchMap[manager.data.branchId]?.name) ||
										"Filialsız";
									return (
										<option key={manager.id} value={manager.id}>
											{manager.data.displayName ?? manager.data.login ?? manager.id} (
											{formatRoleLabel(manager.data.role)}, {managerBranchName})
										</option>
									);
								})}
							</select>

							<select
								className="input"
								value={departmentName}
								onChange={(event) => setDepartmentName(event.target.value)}
							>
								<option value="">Kafedra seçin</option>
								{globalDepartments.map((department) => (
									<option key={department.name} value={department.name}>
										{department.name}
									</option>
								))}
							</select>

							<input
								className="input"
								placeholder="İl"
								value={year}
								onChange={(event) => setYear(event.target.value)}
							/>

							<button className="btn primary" type="button" onClick={handleCreate}>
								Əlavə et
							</button>
						</div>
						<div className="hint">
							Parol export zamanı login ilə eyni göstərilir. Sistem mövcud real
							parolu oxumadığı üçün istifadəçi sonradan parol dəyişibsə, həmin
							dəyişiklik exportda görünməyəcək.
						</div>
					</div>
				</div>

				<div className="stack">
					<div className="card">
						<div className="section-header">
							<div>
								<div className="section-kicker">Ayrı bölmə</div>
								<div className="section-title">Aktiv kafedra müdirləri</div>
							</div>
							<div className="tag">Cəmi: {departmentHeads.length}</div>
						</div>
						<div className="data-table">
							<div className="data-row header">
								<div>Kafedra</div>
								<div>Müdir</div>
								<div>Login</div>
								<div>Parol</div>
								<div>Əhatə etdiyi filiallar</div>
								<div>İl</div>
								<div></div>
							</div>
							{departmentHeadsPagination.paginatedItems.map((row) => {
								const manager = managerMap[row.managerUid];
								const managerDisplayName =
									manager?.displayName ?? manager?.login ?? row.managerUid;
								const coveredBranches = row.branchIds
									.map((branchId) => branchMap[branchId]?.name ?? branchId)
									.sort((a, b) => a.localeCompare(b, "az"))
									.join(", ");
								const login = manager?.login ?? "-";

								return (
									<div className="data-row" key={row.key}>
										<div>{row.departmentName}</div>
										<div className="stack">
											<div className="list-title">{managerDisplayName}</div>
											<div className="hint">{formatRoleLabel(manager?.role)}</div>
										</div>
										<div>{login}</div>
										<div>{manager?.login ?? "-"}</div>
										<div>{coveredBranches || "-"}</div>
										<div>{row.year}</div>
										<div>
											<button
												className="btn ghost"
												type="button"
												onClick={() => void handleDelete(row)}
											>
												Sil
											</button>
										</div>
									</div>
								);
							})}
							{departmentHeads.length === 0 && (
								<div className="empty">
									Bu scope üzrə aktiv kafedra müdiri görünmür.
								</div>
							)}
						</div>
						{departmentHeadsPagination.totalItems > 0 && (
							<PaginationControls
								totalItems={departmentHeadsPagination.totalItems}
								page={departmentHeadsPagination.page}
								pageSize={departmentHeadsPagination.pageSize}
								onPageChange={departmentHeadsPagination.setPage}
								onPageSizeChange={departmentHeadsPagination.setPageSize}
							/>
						)}
					</div>
				</div>
			</div>
			{dialog}
		</div>
	);
};
