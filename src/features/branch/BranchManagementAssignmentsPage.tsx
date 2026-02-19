import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useAuth } from "../auth/AuthProvider";
import { BranchSelector } from "./BranchSelector";
import { useBranchScope } from "./useBranchScope";

export const BranchManagementAssignmentsPage = () => {
	const { user } = useAuth();
	const { confirm, dialog } = useConfirmDialog();
	const { branchId, setBranchId, branches, branchName, isSuperAdmin } =
		useBranchScope();
	const [managerCandidates, setManagerCandidates] = useState<
		Array<{ id: string; data: UserDoc }>
	>([]);
	const [assignments, setAssignments] = useState<
		Array<{ id: string; data: ManagementAssignmentDoc }>
	>([]);
	const [departments, setDepartments] = useState<
		Array<{ id: string; data: DepartmentDoc }>
	>([]);
	const [allBranches, setAllBranches] = useState<
		Array<{ id: string; data: BranchDoc }>
	>([]);
	const [managerUid, setManagerUid] = useState("");
	const [departmentId, setDepartmentId] = useState("");
	const [year, setYear] = useState(String(new Date().getFullYear()));
	const [status, setStatus] = useState<string | null>(null);

	const loadData = useCallback(async () => {
		if (!branchId) {
			setManagerCandidates([]);
			setAssignments([]);
			setDepartments([]);
			return;
		}

		const [usersRes, assignmentsRes, departmentsRes, branchesRes] =
			await Promise.all([
				supabase
					.from("users")
					.select("*")
					.eq("org_id", ORG_ID)
					.in("role", ["manager", "teacher"])
					.is("deleted_at", null),
				supabase
					.from("management_assignments")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("branch_id", branchId)
					.is("deleted_at", null),
				supabase
					.from("departments")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("branch_id", branchId)
					.is("deleted_at", null),
				supabase
					.from("branches")
					.select("*")
					.eq("org_id", ORG_ID)
					.is("deleted_at", null),
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
		setAllBranches(
			(branchesRes.data ?? []).map((row) => ({
				id: row.id,
				data: mapBranchRow(row),
			})),
		);
	}, [branchId]);

	useEffect(() => {
		void loadData();
	}, [loadData]);

	const handleCreate = async () => {
		if (!managerUid || !year || !branchId) {
			setStatus("Rəhbər, filial və il seçin");
			return;
		}

		const yearNumber = Number(year);
		if (!Number.isInteger(yearNumber) || yearNumber < 2000) {
			setStatus("İl düzgün daxil edilməyib");
			return;
		}

		const { error } = await supabase.from("management_assignments").insert({
			org_id: ORG_ID,
			manager_id: managerUid,
			branch_id: branchId,
			department_id: departmentId || null,
			year: yearNumber,
		});

		if (error) {
			setStatus(error.message || "Yaratma zamanı xəta oldu");
			return;
		}

		setManagerUid("");
		setDepartmentId("");
		setStatus("Təyinat yaradıldı");
		await loadData();
	};

	const handleDelete = async (assignmentId: string) => {
		const ok = await confirm({
			title: "Təyinatı sil",
			message: "Təyinatı silmək istədiyinizə əminsiniz?",
			confirmText: "Sil",
			cancelText: "İmtina",
			tone: "danger",
		});
		if (!ok) return;
		await supabase
			.from("management_assignments")
			.update({
				deleted_at: new Date().toISOString(),
				deleted_by: user?.id ?? null,
			})
			.eq("org_id", ORG_ID)
			.eq("id", assignmentId);
		await loadData();
	};

	const summary = useMemo(() => assignments.length, [assignments]);
	const displayTargetBranch = useMemo(() => {
		if (!branchId) return branchName || "Filial tapılmadı";
		return (
			allBranches.find((branch) => branch.id === branchId)?.data.name ??
			branchName ??
			"Filial tapılmadı"
		);
	}, [allBranches, branchId, branchName]);
	const managerMap = useMemo(
		() => Object.fromEntries(managerCandidates.map((manager) => [manager.id, manager.data])),
		[managerCandidates],
	);
	const departmentMap = useMemo(
		() => Object.fromEntries(departments.map((department) => [department.id, department.data])),
		[departments],
	);
	const branchMap = useMemo(
		() => Object.fromEntries(allBranches.map((branch) => [branch.id, branch.data])),
		[allBranches],
	);

	return (
		<div className="panel">
			{isSuperAdmin && (
				<BranchSelector
					branchId={branchId}
					branches={branches}
					onChange={setBranchId}
				/>
			)}

			<div className="panel-header">
				<div>
					<h2>Kafedra rəhbəri təyinatları</h2>
					<p>Kim hansı filialda hansı kafedranın müəllimlərini qiymətləndirir.</p>
				</div>
				<div className="stat-pill">Cəmi: {summary}</div>
			</div>

			<div className="card">
				<h3>Yeni təyinat</h3>
				<div className="form-grid">
					<select
						className="input"
						value={managerUid}
						onChange={(event) => setManagerUid(event.target.value)}
					>
						<option value="">Rəhbər seçin</option>
						{managerCandidates.map((manager) => {
							const managerBranchName =
								(manager.data.branchId &&
									branchMap[manager.data.branchId]?.name) ||
								"Filialsız";
							const managerRole =
								manager.data.role === "teacher" ? "Müəllim" : "Rəhbərlik";
							return (
								<option key={manager.id} value={manager.id}>
									{manager.data.displayName ?? manager.data.login ?? manager.id} (
									{managerRole}, {managerBranchName})
								</option>
							);
						})}
					</select>
					<select
						className="input"
						value={departmentId}
						onChange={(event) => setDepartmentId(event.target.value)}
						disabled={!branchId}
					>
						<option value="">Bütün kafedralar</option>
						{departments.map((department) => (
							<option key={department.id} value={department.id}>
								{department.data.name}
							</option>
						))}
					</select>
					<input
						className="input"
						placeholder="İl"
						value={year}
						onChange={(event) => setYear(event.target.value)}
					/>
					<button
						className="btn primary"
						type="button"
						onClick={handleCreate}
						disabled={!branchId}
					>
						Yarat
					</button>
				</div>
				{status && <div className="notice">{status}</div>}
			</div>

			<div className="data-table">
				<div className="data-row header">
					<div>Rəhbər</div>
					<div>Rol</div>
					<div>İşlədiyi filial</div>
					<div>Qiymətləndirdiyi filial</div>
					<div>Kafedra</div>
					<div>İl</div>
					<div></div>
				</div>
				{assignments.map((assignment) => {
					const manager = managerMap[assignment.data.managerUid];
					const managerDisplayName =
						manager?.displayName ?? manager?.login ?? assignment.data.managerUid;
					const managerRole = manager?.role === "teacher" ? "Müəllim" : "Rəhbərlik";
					const managerBranchName =
						(manager?.branchId && branchMap[manager.branchId]?.name) || "-";
					const departmentName = assignment.data.departmentId
						? (departmentMap[assignment.data.departmentId]?.name ??
							assignment.data.departmentId)
						: "Bütün kafedralar";

					return (
						<div className="data-row" key={assignment.id}>
							<div>{managerDisplayName}</div>
							<div>{managerRole}</div>
							<div>{managerBranchName}</div>
							<div>{displayTargetBranch}</div>
							<div>{departmentName}</div>
							<div>{assignment.data.year}</div>
							<div>
								<button
									className="btn ghost"
									type="button"
									onClick={() => void handleDelete(assignment.id)}
								>
									Sil
								</button>
							</div>
						</div>
					);
				})}
			</div>
			{dialog}
		</div>
	);
};

