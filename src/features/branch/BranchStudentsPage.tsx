import { useEffect, useMemo, useState } from "react";
import { useConfirmDialog } from "../../components/ConfirmDialog";
import { ORG_ID, supabase } from "../../lib/supabase";
import { mapGroupRow, mapStudentRow } from "../../lib/supabaseMappers";
import type { GroupDoc, StudentDoc } from "../../lib/types";
import { useAuth } from "../auth/AuthProvider";
import { BranchSelector } from "./BranchSelector";
import { parseSpreadsheet } from "./importUtils";
import { useBranchScope } from "./useBranchScope";
import { provisionLoginUser } from "./userProvisioning";

export const BranchStudentsPage = () => {
	const { user } = useAuth();
	const { confirm, dialog } = useConfirmDialog();
	const { branchId, setBranchId, branches, isSuperAdmin } = useBranchScope();
	const [students, setStudents] = useState<
		Array<{ id: string; data: StudentDoc }>
	>([]);
	const [groups, setGroups] = useState<Array<{ id: string; data: GroupDoc }>>(
		[],
	);
	const [name, setName] = useState("");
	const [groupId, setGroupId] = useState("");
	const [classLevel, setClassLevel] = useState("");
	const [status, setStatus] = useState<string | null>(null);

	const loadData = async () => {
		if (!branchId) {
			setStudents([]);
			setGroups([]);
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
		studentQuery = studentQuery.eq("branch_id", branchId);
		groupQuery = groupQuery.eq("branch_id", branchId);

		const [studentRes, groupRes] = await Promise.all([
			studentQuery,
			groupQuery,
		]);

		const groupDocs = (groupRes.data ?? []).map((row) => ({
			id: row.id,
			data: mapGroupRow(row),
		}));
		setGroups(groupDocs.filter((group) => group.data.branchId === branchId));

		const studentDocs = (studentRes.data ?? []).map((row) => ({
			id: row.id,
			data: mapStudentRow(row),
		}));
		setStudents(
			studentDocs.filter((student) => student.data.branchId === branchId),
		);
	};

	useEffect(() => {
		void loadData();
	}, [branchId]);

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

	const handleDelete = async (studentId: string) => {
		const ok = await confirm({
			title: "Şagirdi sil",
			message: "Şagirdi silmək istədiyinizə əminsiniz?",
			confirmText: "Sil",
			cancelText: "İmtina",
			tone: "danger",
		});
		if (!ok) return;
		await supabase
			.from("students")
			.update({
				deleted_at: new Date().toISOString(),
				deleted_by: user?.id ?? null,
			})
			.eq("org_id", ORG_ID)
			.eq("id", studentId);
		await loadData();
	};

	const handleImport = async (file: File) => {
		if (!branchId) {
			setStatus("Filial seçilməyib. Import üçün filial seçin.");
			return;
		}
		const rows = await parseSpreadsheet(file);
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

		const cleaned = rows.filter((row) => {
			if (!row.name || !row.groupId || !row.classLevel) {
				missing += 1;
				return false;
			}
			if (row.branchId && row.branchId !== branchId) {
				mismatch += 1;
				return false;
			}
			const key = `${row.name.toLowerCase()}|${row.groupId}`;
			if (seen.has(key) || existingKeys.has(key)) {
				duplicates += 1;
				return false;
			}
			seen.add(key);
			return true;
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

			<div className="page-grid">
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
							Şablon sütunları: name, groupId, classLevel, branchId (optional)
						</span>
					</div>
					<div className="hint">Şifrə default olaraq login ilə eynidir.</div>
					{status && <div className="notice">{status}</div>}
				</div>

				<div className="card">
					<div className="section-header">
						<div>
							<div className="section-kicker">Siyahı</div>
							<div className="section-title">Şagirdlər</div>
						</div>
					</div>
					<div className="data-table">
						<div className="data-row header">
							<div>Ad</div>
							<div>Qrup</div>
							<div>Sinif səviyyəsi</div>
							<div>Login</div>
							<div></div>
						</div>
						{students.map((student) => (
							<div className="data-row" key={student.id}>
								<div>{student.data.name}</div>
								<div>
									{groups.find((group) => group.id === student.data.groupId)
										?.data.name ?? student.data.groupId}
								</div>
								<div>{student.data.classLevel}</div>
								<div>{student.data.login ?? "-"}</div>
								<div>
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
				</div>
			</div>
			{dialog}
		</div>
	);
};
