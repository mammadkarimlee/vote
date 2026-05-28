import { useCallback, useEffect, useMemo, useState } from "react";
import { useFeedbackState } from "../../components/feedback/FeedbackProvider";
import { PaginationControls } from "../../components/PaginationControls";
import { useConfirmDialog } from "../../components/ConfirmDialog";
import { DataTable, sortData, type DataTableColumn, type SortState } from "../../components/DataTable";
import { PageHeader, StatCard, StatusBadge } from "../../components/dashboard";
import { ORG_ID, supabase } from "../../lib/supabase";
import { mapDepartmentRow } from "../../lib/supabaseMappers";
import type { DepartmentDoc } from "../../lib/types";
import { usePagination } from "../../lib/usePagination";
import { createId } from "../../lib/utils";
import { useAuth } from "../auth/AuthProvider";
import { BranchSelector } from "./BranchSelector";
import { useBranchScope } from "./useBranchScope";

type DepartmentEntry = { id: string; data: DepartmentDoc };

export const BranchDepartmentsPage = () => {
	const { user } = useAuth();
	const { confirm, dialog } = useConfirmDialog();
	const { branchId, setBranchId, branches, isSuperAdmin } = useBranchScope();
	const [departments, setDepartments] = useState<DepartmentEntry[]>([]);
	const [name, setName] = useState("");
	const [status, setStatus] = useFeedbackState();
	const [loadError, setLoadError] = useFeedbackState();
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [savingEdit, setSavingEdit] = useState(false);
	const [departmentQuery, setDepartmentQuery] = useState("");
	const [departmentSort, setDepartmentSort] = useState<SortState>(null);

	const loadDepartments = useCallback(async () => {
		if (!branchId) {
			setDepartments([]);
			return;
		}
		const { data, error } = await supabase
			.from("departments")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("branch_id", branchId)
			.is("deleted_at", null);
		if (error) {
			setLoadError(error.message || "Yükləmə zamanı xəta oldu");
			return;
		}
		setLoadError(null);
		const items = (data ?? []).map((row) => ({
			id: row.id,
			data: mapDepartmentRow(row),
		}));
		setDepartments(items);
	}, [branchId]);

	useEffect(() => {
		void loadDepartments();
	}, [loadDepartments]);

	const handleCreate = async () => {
		if (!branchId) {
			setStatus("Filial seçilməyib. Davam etmək üçün filial seçin.");
			return;
		}
		if (!name.trim()) {
			setStatus("Kafedra adı tələb olunur");
			return;
		}

		const { error } = await supabase.from("departments").insert({
			id: createId(),
			org_id: ORG_ID,
			branch_id: branchId,
			name: name.trim(),
		});

		if (error) {
			setStatus(error.message || "Yaratma zamanı xəta oldu");
			return;
		}

		setName("");
		setStatus("Kafedra yaradıldı");
		await loadDepartments();
	};

	const handleDelete = async (departmentId: string) => {
		const ok = await confirm({
			title: "Kafedranı sil",
			message: "Kafedranı silmək istədiyinizə əminsiniz?",
			confirmText: "Sil",
			cancelText: "İmtina",
			tone: "danger",
		});
		if (!ok) return;
		await supabase
			.from("departments")
			.update({
				deleted_at: new Date().toISOString(),
				deleted_by: user?.id ?? null,
			})
			.eq("org_id", ORG_ID)
			.eq("id", departmentId);
		await loadDepartments();
	};

	const handleEditStart = (department: DepartmentEntry) => {
		setEditingId(department.id);
		setEditName(department.data.name);
		setStatus(null);
	};

	const handleEditCancel = () => {
		setEditingId(null);
		setEditName("");
	};

	const handleEditSave = async () => {
		if (!editingId) return;
		if (!editName.trim()) {
			setStatus("Kafedra adı tələb olunur");
			return;
		}
		setSavingEdit(true);
		const { error } = await supabase
			.from("departments")
			.update({ name: editName.trim() })
			.eq("org_id", ORG_ID)
			.eq("id", editingId);
		setSavingEdit(false);
		if (error) {
			setStatus(error.message || "Yeniləmə zamanı xəta oldu");
			return;
		}
		setStatus("Kafedra yeniləndi");
		setEditingId(null);
		await loadDepartments();
	};

	const summary = useMemo(() => departments.length, [departments]);
	const filteredDepartments = useMemo(() => {
		const query = departmentQuery.trim().toLocaleLowerCase("az");
		if (!query) return departments;
		return departments.filter((department) =>
			department.data.name.toLocaleLowerCase("az").includes(query),
		);
	}, [departmentQuery, departments]);
	const departmentColumns = useMemo<Array<DataTableColumn<DepartmentEntry>>>(
		() => [
			{
				key: "name",
				header: "Kafedra adı",
				sortValue: (department) => department.data.name,
				render: (department) =>
					editingId === department.id ? (
						<input
							className="input"
							value={editName}
							onChange={(event) => setEditName(event.target.value)}
						/>
					) : (
						<div className="font-semibold">{department.data.name}</div>
					),
			},
			{
				key: "status",
				header: "Status",
				sortValue: () => "Aktiv",
				render: () => <StatusBadge tone="success">Aktiv</StatusBadge>,
			},
			{
				key: "actions",
				header: "",
				render: (department) => (
					<div className="actions">
						{editingId === department.id ? (
							<>
								<button
									className="btn primary"
									type="button"
									onClick={handleEditSave}
									disabled={savingEdit}
								>
									Yadda saxla
								</button>
								<button
									className="btn ghost"
									type="button"
									onClick={handleEditCancel}
									disabled={savingEdit}
								>
									Ləğv et
								</button>
							</>
						) : (
							<>
								<button
									className="btn"
									type="button"
									onClick={() => handleEditStart(department)}
								>
									Redaktə
								</button>
								<button
									className="btn ghost"
									type="button"
									onClick={() => void handleDelete(department.id)}
								>
									Sil
								</button>
							</>
						)}
					</div>
				),
			},
		],
		[
			editName,
			editingId,
			handleDelete,
			handleEditCancel,
			handleEditSave,
			handleEditStart,
			savingEdit,
		],
	);
	const sortedDepartments = useMemo(
		() => sortData(filteredDepartments, departmentColumns, departmentSort),
		[departmentColumns, departmentSort, filteredDepartments],
	);
	const departmentsPagination = usePagination(sortedDepartments);

	return (
		<div className="panel branch-page">
			<PageHeader
				eyebrow="Filial strukturu"
				title="Kafedralar"
				description="Filial üzrə kafedra siyahısı və idarəetmə paneli."
				actions={
					<>
					{isSuperAdmin && (
						<BranchSelector
							branchId={branchId}
							branches={branches}
							onChange={setBranchId}
						/>
					)}
					<StatusBadge tone="neutral">Cəmi: {summary}</StatusBadge>
					</>
				}
			/>
			{isSuperAdmin && !branchId && (
				<div className="notice">
					Filial seçilməyib. Davam etmək üçün filial seçin.
				</div>
			)}

			<div className="page-grid">
				<div className="card">
					<h3>Yeni kafedra</h3>
					<div className="form-grid">
						<input
							className="input"
							placeholder="Kafedra adı"
							value={name}
							onChange={(event) => setName(event.target.value)}
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

				<div className="card">
					<div className="section-header">
						<div>
							<div className="section-kicker">Siyahı</div>
							<div className="section-title">Kafedralar</div>
						</div>
						<StatCard
							label="Aktiv kafedra"
							value={filteredDepartments.length}
							tone="info"
						/>
					</div>
					{loadError && <div className="notice">{loadError}</div>}
					<div className="filters mt-4">
						<label className="field">
							<span className="label">Axtarış</span>
							<input
								className="input"
								placeholder="Kafedra adı üzrə axtar..."
								value={departmentQuery}
								onChange={(event) => {
									setDepartmentQuery(event.target.value);
									departmentsPagination.setPage(1);
								}}
							/>
						</label>
						<label className="field">
							<span className="label">Əməliyyat</span>
							<button
								className="btn"
								type="button"
								onClick={() => {
									setDepartmentQuery("");
									setDepartmentSort(null);
									departmentsPagination.setPage(1);
								}}
							>
								Filterləri sıfırla
							</button>
						</label>
					</div>
					<div className="mt-4">
						<DataTable
							columns={departmentColumns}
							rows={departmentsPagination.paginatedItems}
							getRowKey={(department) => department.id}
							sort={departmentSort}
							onSortChange={(nextSort) => {
								setDepartmentSort(nextSort);
								departmentsPagination.setPage(1);
							}}
							emptyTitle="Bu filterlərə uyğun kafedra tapılmadı."
							emptyDescription="Filterləri dəyişərək yenidən yoxlayın."
						/>
					</div>
					{departmentsPagination.totalItems > 0 && (
						<PaginationControls
							totalItems={departmentsPagination.totalItems}
							page={departmentsPagination.page}
							pageSize={departmentsPagination.pageSize}
							onPageChange={departmentsPagination.setPage}
							onPageSizeChange={departmentsPagination.setPageSize}
						/>
					)}
				</div>
			</div>
			{dialog}
		</div>
	);
};

