import { useEffect, useMemo, useState } from "react";
import { useFeedbackState } from "../../components/feedback/FeedbackProvider";
import { useConfirmDialog } from "../../components/ConfirmDialog";
import { PaginationControls } from "../../components/PaginationControls";
import { ORG_ID, supabase } from "../../lib/supabase";
import { mapBranchRow } from "../../lib/supabaseMappers";
import type { BranchDoc } from "../../lib/types";
import { createId } from "../../lib/utils";
import { useAuth } from "../auth/AuthProvider";

type BranchEntry = { id: string; data: BranchDoc };
type CountRow = { branch_id: string | null };
type UserCountRow = CountRow & { role: string | null };

const BRANCH_ADMIN_ROLES = new Set(["branch_admin", "moderator", "hr"]);

const countByBranch = <T extends CountRow>(
	rows: T[] | null,
	filter?: (row: T) => boolean,
) => {
	const counts = new Map<string, number>();

	for (const row of rows ?? []) {
		if (!row.branch_id) continue;
		if (filter && !filter(row)) continue;
		counts.set(row.branch_id, (counts.get(row.branch_id) ?? 0) + 1);
	}

	return counts;
};

const resolveCount = (stored: number | null | undefined, fallback: number | undefined) =>
	stored ?? fallback ?? null;

export const AdminBranchesPage = () => {
	const { user } = useAuth();
	const { confirm, dialog } = useConfirmDialog();
	const [branches, setBranches] = useState<BranchEntry[]>([]);
	const [name, setName] = useState("");
	const [address, setAddress] = useState("");
	const [studentCount, setStudentCount] = useState("");
	const [teacherCount, setTeacherCount] = useState("");
	const [adminCount, setAdminCount] = useState("");
	const [status, setStatus] = useFeedbackState();
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [editAddress, setEditAddress] = useState("");
	const [editStudentCount, setEditStudentCount] = useState("");
	const [editTeacherCount, setEditTeacherCount] = useState("");
	const [editAdminCount, setEditAdminCount] = useState("");
	const [savingEdit, setSavingEdit] = useState(false);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(15);

	const loadBranches = async () => {
		const [branchesResult, studentsResult, teachersResult, usersResult] =
			await Promise.all([
				supabase
					.from("branches")
					.select("*")
					.eq("org_id", ORG_ID)
					.is("deleted_at", null),
				supabase
					.from("students")
					.select("branch_id")
					.eq("org_id", ORG_ID)
					.is("deleted_at", null),
				supabase
					.from("teachers")
					.select("branch_id")
					.eq("org_id", ORG_ID)
					.is("deleted_at", null),
				supabase
					.from("users")
					.select("branch_id, role")
					.eq("org_id", ORG_ID)
					.is("deleted_at", null),
			]);
		if (branchesResult.error) return;

		const studentCounts = studentsResult.error
			? new Map<string, number>()
			: countByBranch(studentsResult.data as CountRow[] | null);
		const teacherCounts = teachersResult.error
			? new Map<string, number>()
			: countByBranch(teachersResult.data as CountRow[] | null);
		const adminCounts = usersResult.error
			? new Map<string, number>()
			: countByBranch(usersResult.data as UserCountRow[] | null, (row) =>
					BRANCH_ADMIN_ROLES.has(row.role ?? ""),
				);

		const items = (branchesResult.data ?? []).map((row) => {
			const data = mapBranchRow(row);
			return {
				id: row.id,
				data: {
					...data,
					studentCount: resolveCount(data.studentCount, studentCounts.get(row.id)),
					teacherCount: resolveCount(data.teacherCount, teacherCounts.get(row.id)),
					adminCount: resolveCount(data.adminCount, adminCounts.get(row.id)),
				},
			};
		});
		setBranches(items);
	};

	useEffect(() => {
		void loadBranches();
	}, []);

	useEffect(() => {
		const totalPages = Math.max(1, Math.ceil(branches.length / pageSize));
		if (page > totalPages) setPage(totalPages);
	}, [branches.length, page, pageSize]);

	const handleCreate = async () => {
		if (!name.trim()) {
			setStatus("Filial adı tələb olunur");
			return;
		}

		const { error } = await supabase.from("branches").insert({
			id: createId(),
			org_id: ORG_ID,
			name: name.trim(),
			address: address.trim() || null,
			student_count: studentCount ? Number(studentCount) : null,
			teacher_count: teacherCount ? Number(teacherCount) : null,
			admin_count: adminCount ? Number(adminCount) : null,
		});

		if (error) {
			setStatus("Yaratma zamanı xəta oldu");
			return;
		}

		setName("");
		setAddress("");
		setStudentCount("");
		setTeacherCount("");
		setAdminCount("");
		setStatus("Filial yaradıldı");
		await loadBranches();
	};

	const handleDelete = async (branchId: string) => {
		const ok = await confirm({
			title: "Filialı sil",
			message: "Filialı silmək istədiyinizə əminsiniz?",
			confirmText: "Sil",
			cancelText: "İmtina",
			tone: "danger",
		});
		if (!ok) return;
		await supabase
			.from("branches")
			.update({
				deleted_at: new Date().toISOString(),
				deleted_by: user?.id ?? null,
			})
			.eq("org_id", ORG_ID)
			.eq("id", branchId);
		await loadBranches();
	};

	const handleEditStart = (branch: BranchEntry) => {
		setEditingId(branch.id);
		setEditName(branch.data.name);
		setEditAddress(branch.data.address ?? "");
		setEditStudentCount(branch.data.studentCount?.toString() ?? "");
		setEditTeacherCount(branch.data.teacherCount?.toString() ?? "");
		setEditAdminCount(branch.data.adminCount?.toString() ?? "");
		setStatus(null);
	};

	const handleEditCancel = () => {
		setEditingId(null);
		setEditName("");
		setEditAddress("");
		setEditStudentCount("");
		setEditTeacherCount("");
		setEditAdminCount("");
	};

	const handleEditSave = async () => {
		if (!editingId) return;
		if (!editName.trim()) {
			setStatus("Filial adı tələb olunur");
			return;
		}
		setSavingEdit(true);
		const { error } = await supabase
			.from("branches")
			.update({
				name: editName.trim(),
				address: editAddress.trim() || null,
				student_count: editStudentCount ? Number(editStudentCount) : null,
				teacher_count: editTeacherCount ? Number(editTeacherCount) : null,
				admin_count: editAdminCount ? Number(editAdminCount) : null,
			})
			.eq("org_id", ORG_ID)
			.eq("id", editingId);
		setSavingEdit(false);
		if (error) {
			setStatus("Yeniləmə zamanı xəta oldu");
			return;
		}
		setStatus("Filial yeniləndi");
		setEditingId(null);
		await loadBranches();
	};

	const summary = useMemo(() => branches.length, [branches]);
	const paginatedBranches = useMemo(() => {
		const start = (page - 1) * pageSize;
		return branches.slice(start, start + pageSize);
	}, [branches, page, pageSize]);

	return (
		<div className="panel">
			<div className="panel-header">
				<div>
					<h2>Filiallar</h2>
					<p>Filial adı, ünvan və say göstəriciləri.</p>
				</div>
				<div className="stat-pill">Cəmi: {summary}</div>
			</div>

			<div className="card">
				<h3>Yeni filial</h3>
				<div className="form-grid">
					<input
						className="input"
						placeholder="Filial adı"
						value={name}
						onChange={(event) => setName(event.target.value)}
					/>
					<input
						className="input"
						placeholder="Ünvan (istəyə bağlı)"
						value={address}
						onChange={(event) => setAddress(event.target.value)}
					/>
					<input
						className="input"
						placeholder="Şagird sayı"
						value={studentCount}
						onChange={(event) => setStudentCount(event.target.value)}
					/>
					<input
						className="input"
						placeholder="Müəllim sayı"
						value={teacherCount}
						onChange={(event) => setTeacherCount(event.target.value)}
					/>
					<input
						className="input"
						placeholder="Admin sayı"
						value={adminCount}
						onChange={(event) => setAdminCount(event.target.value)}
					/>
					<button className="btn primary" type="button" onClick={handleCreate}>
						Yarat
					</button>
				</div>
				{status && <div className="notice">{status}</div>}
			</div>

			<div className="data-table">
				<div className="data-row header">
					<div>Ad</div>
					<div>Ünvan</div>
					<div>Şagird sayı</div>
					<div>Müəllim sayı</div>
					<div>Admin sayı</div>
					<div></div>
				</div>
				{paginatedBranches.map((branch) => (
					<div className="data-row" key={branch.id}>
						<div>
							{editingId === branch.id ? (
								<input
									className="input"
									value={editName}
									onChange={(event) => setEditName(event.target.value)}
								/>
							) : (
								branch.data.name
							)}
						</div>
						<div>
							{editingId === branch.id ? (
								<input
									className="input"
									value={editAddress}
									onChange={(event) => setEditAddress(event.target.value)}
								/>
							) : (
								(branch.data.address ?? "-")
							)}
						</div>
						<div>
							{editingId === branch.id ? (
								<input
									className="input"
									value={editStudentCount}
									onChange={(event) => setEditStudentCount(event.target.value)}
								/>
							) : (
								(branch.data.studentCount ?? "-")
							)}
						</div>
						<div>
							{editingId === branch.id ? (
								<input
									className="input"
									value={editTeacherCount}
									onChange={(event) => setEditTeacherCount(event.target.value)}
								/>
							) : (
								(branch.data.teacherCount ?? "-")
							)}
						</div>
						<div>
							{editingId === branch.id ? (
								<input
									className="input"
									value={editAdminCount}
									onChange={(event) => setEditAdminCount(event.target.value)}
								/>
							) : (
								(branch.data.adminCount ?? "-")
							)}
						</div>
						<div className="actions">
							{editingId === branch.id ? (
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
										onClick={() => handleEditStart(branch)}
									>
										Redaktə
									</button>
									<button
										className="btn ghost"
										type="button"
										onClick={() => void handleDelete(branch.id)}
									>
										Sil
									</button>
								</>
							)}
						</div>
					</div>
				))}
			</div>
			{branches.length > 0 && (
				<PaginationControls
					totalItems={branches.length}
					page={page}
					pageSize={pageSize}
					onPageChange={setPage}
					onPageSizeChange={(nextSize) => {
						setPageSize(nextSize);
						setPage(1);
					}}
				/>
			)}
			{dialog}
		</div>
	);
};
