import { useEffect, useMemo, useState } from "react";
import { useConfirmDialog } from "../../components/ConfirmDialog";
import { ORG_ID, supabase } from "../../lib/supabase";
import {
	mapManagementAssignmentRow,
	mapUserRow,
} from "../../lib/supabaseMappers";
import type { ManagementAssignmentDoc, UserDoc } from "../../lib/types";
import { useAuth } from "../auth/AuthProvider";
import { BranchSelector } from "./BranchSelector";
import { useBranchScope } from "./useBranchScope";

export const BranchManagementAssignmentsPage = () => {
	const { user } = useAuth();
	const { confirm, dialog } = useConfirmDialog();
	const { branchId, setBranchId, branches, branchName, isSuperAdmin } =
		useBranchScope();
	const [managers, setManagers] = useState<
		Array<{ id: string; data: UserDoc }>
	>([]);
	const [assignments, setAssignments] = useState<
		Array<{ id: string; data: ManagementAssignmentDoc }>
	>([]);
	const [managerUid, setManagerUid] = useState("");
	const [year, setYear] = useState(String(new Date().getFullYear()));
	const [status, setStatus] = useState<string | null>(null);
	const [localBranchName, setLocalBranchName] = useState("");

	const loadData = async () => {
		if (!branchId) {
			setManagers([]);
			setAssignments([]);
			return;
		}

		const [usersRes, assignmentsRes, branchRes] = await Promise.all([
			supabase
				.from("users")
				.select("*")
				.eq("org_id", ORG_ID)
				.eq("branch_id", branchId)
				.eq("role", "manager")
				.is("deleted_at", null),
			supabase
				.from("management_assignments")
				.select("*")
				.eq("org_id", ORG_ID)
				.eq("branch_id", branchId)
				.is("deleted_at", null),
			supabase
				.from("branches")
				.select("name")
				.eq("org_id", ORG_ID)
				.eq("id", branchId)
				.maybeSingle(),
		]);

		const managerUsers = (usersRes.data ?? []).map((row) => ({
			id: row.id,
			data: mapUserRow(row),
		}));
		const assignmentDocs = (assignmentsRes.data ?? []).map((row) => ({
			id: row.id,
			data: mapManagementAssignmentRow(row),
		}));

		setManagers(managerUsers);
		setAssignments(
			assignmentDocs.filter(
				(assignment) => assignment.data.branchId === branchId,
			),
		);
		setLocalBranchName(branchRes.data?.name ?? "");
	};

	useEffect(() => {
		void loadData();
	}, [branchId]);

	const handleCreate = async () => {
		if (!managerUid || !year || !branchId) {
			setStatus("Rəhbərlik və il seçin");
			return;
		}

		const { error } = await supabase.from("management_assignments").insert({
			org_id: ORG_ID,
			manager_id: managerUid,
			branch_id: branchId,
			year: Number(year),
		});

		if (error) {
			setStatus("Yaratma zamanı xəta oldu");
			return;
		}

		setManagerUid("");
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
	const displayBranchName = localBranchName || branchName || "Filial tapılmadı";

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
					<h2>Rəhbərlik təyinatları</h2>
					<p>Müəllimlərin rəhbərliyi qiymətləndirmə mapping-i.</p>
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
						<option value="">Rəhbərlik seçin</option>
						{managers.map((manager) => (
							<option key={manager.id} value={manager.id}>
								{manager.data.displayName ?? manager.data.login ?? manager.id}
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
					<div>Rəhbərlik</div>
					<div>Filial</div>
					<div>İl</div>
					<div></div>
				</div>
				{assignments.map((assignment) => (
					<div className="data-row" key={assignment.id}>
						<div>
							{managers.find(
								(manager) => manager.id === assignment.data.managerUid,
							)?.data.displayName ?? assignment.data.managerUid}
						</div>
						<div>{displayBranchName}</div>
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
				))}
			</div>
			{dialog}
		</div>
	);
};
