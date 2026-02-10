import { useCallback, useEffect, useMemo, useState } from "react";
import { useConfirmDialog } from "../../components/ConfirmDialog";
import { ORG_ID, supabase } from "../../lib/supabase";
import { mapDepartmentRow, mapSubjectRow } from "../../lib/supabaseMappers";
import type { DepartmentDoc, SubjectDoc } from "../../lib/types";
import { createId } from "../../lib/utils";
import { useAuth } from "../auth/AuthProvider";
import { BranchSelector } from "./BranchSelector";
import { parseSpreadsheet } from "./importUtils";
import { useBranchScope } from "./useBranchScope";

type DepartmentEntry = { id: string; data: DepartmentDoc };
type SubjectEntry = { id: string; data: SubjectDoc };

export const BranchSubjectsPage = () => {
	const { user } = useAuth();
	const { confirm, dialog } = useConfirmDialog();
	const { branchId, setBranchId, branches, isSuperAdmin } = useBranchScope();

	const [subjects, setSubjects] = useState<SubjectEntry[]>([]);
	const [departments, setDepartments] = useState<DepartmentEntry[]>([]);
	const [departmentId, setDepartmentId] = useState("");
	const [importDepartmentId, setImportDepartmentId] = useState("");

	const [name, setName] = useState("");
	const [code, setCode] = useState("");
	const [status, setStatus] = useState<string | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);

	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [editCode, setEditCode] = useState("");
	const [editDepartmentId, setEditDepartmentId] = useState("");
	const [savingEdit, setSavingEdit] = useState(false);

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
			setDepartments([]);
			setLoadError(error.message || "Kafedralar yüklənmədi");
			return;
		}

		setLoadError(null);
		setDepartments(
			(data ?? []).map((row) => ({
				id: row.id,
				data: mapDepartmentRow(row),
			})),
		);
	}, [branchId]);

	const loadSubjects = useCallback(async () => {
		if (!branchId) {
			setSubjects([]);
			return;
		}

		const departmentIds = departments.map((item) => item.id).filter(Boolean);
		const rows: Array<Record<string, unknown>> = [];

		if (departmentIds.length > 0) {
			const { data, error } = await supabase
				.from("subjects")
				.select("*")
				.eq("org_id", ORG_ID)
				.in("department_id", departmentIds)
				.is("deleted_at", null);

			if (error) {
				setLoadError(error.message || "Yükləmə zamanı xəta oldu");
				return;
			}

			(data ?? []).forEach((row) => rows.push(row as Record<string, unknown>));
		}

		if (isSuperAdmin) {
			const { data, error } = await supabase
				.from("subjects")
				.select("*")
				.eq("org_id", ORG_ID)
				.is("department_id", null)
				.is("deleted_at", null);

			if (error) {
				setLoadError(error.message || "Yükləmə zamanı xəta oldu");
				return;
			}

			(data ?? []).forEach((row) => rows.push(row as Record<string, unknown>));
		}

		if (departmentIds.length === 0 && !isSuperAdmin) {
			setSubjects([]);
			return;
		}

		const unique = new Map<string, SubjectEntry>();
		rows.forEach((row) => {
			const id = typeof row.id === "string" ? row.id : "";
			if (!id) return;
			unique.set(id, { id, data: mapSubjectRow(row) });
		});

		setLoadError(null);
		setSubjects(Array.from(unique.values()));
	}, [branchId, departments, isSuperAdmin]);

	useEffect(() => {
		void loadDepartments();
	}, [loadDepartments]);

	useEffect(() => {
		void loadSubjects();
	}, [loadSubjects]);

	useEffect(() => {
		if (departments.length === 0) return;

		const normalizedDefault = "Ümumi".toLowerCase();
		const defaultDepartment =
			departments.find(
				(item) => item.data.name.trim().toLowerCase() === normalizedDefault,
			) ?? departments[0];

		if (!departmentId) setDepartmentId(defaultDepartment.id);
		if (!importDepartmentId) setImportDepartmentId(defaultDepartment.id);
	}, [departments, departmentId, importDepartmentId]);

	const handleCreate = async () => {
		if (!branchId) {
			setStatus("Filial seçilməyib. Davam etmək üçün filial seçin.");
			return;
		}
		if (!departmentId) {
			setStatus("Kafedra seçilməlidir");
			return;
		}
		if (!name.trim()) {
			setStatus("Fənn adı tələb olunur");
			return;
		}

		const { error } = await supabase.from("subjects").insert({
			id: createId(),
			org_id: ORG_ID,
			department_id: departmentId,
			name: name.trim(),
			code: code.trim() || null,
		});

		if (error) {
			setStatus(error.message || "Yaratma zamanı xəta oldu");
			return;
		}

		setName("");
		setCode("");
		setStatus("Fənn yaradıldı");
		await loadSubjects();
	};

	const handleDelete = async (subjectId: string) => {
		const ok = await confirm({
			title: "Fənni sil",
			message: "Fənni silmək istədiyinizə əminsiniz?",
			confirmText: "Sil",
			cancelText: "İmtina",
			tone: "danger",
		});
		if (!ok) return;

		await supabase
			.from("subjects")
			.update({
				deleted_at: new Date().toISOString(),
				deleted_by: user?.id ?? null,
			})
			.eq("org_id", ORG_ID)
			.eq("id", subjectId);

		await loadSubjects();
	};

	const handleEditStart = (subject: SubjectEntry) => {
		setEditingId(subject.id);
		setEditName(subject.data.name);
		setEditCode(subject.data.code ?? "");
		setEditDepartmentId(subject.data.departmentId ?? departmentId ?? "");
		setStatus(null);
	};

	const handleEditCancel = () => {
		setEditingId(null);
		setEditName("");
		setEditCode("");
		setEditDepartmentId("");
	};

	const handleEditSave = async () => {
		if (!editingId) return;
		if (!editDepartmentId) {
			setStatus("Kafedra seçilməlidir");
			return;
		}
		if (!editName.trim()) {
			setStatus("Fənn adı tələb olunur");
			return;
		}

		setSavingEdit(true);
		const { error } = await supabase
			.from("subjects")
			.update({
				name: editName.trim(),
				code: editCode.trim() || null,
				department_id: editDepartmentId,
			})
			.eq("org_id", ORG_ID)
			.eq("id", editingId);
		setSavingEdit(false);

		if (error) {
			setStatus(error.message || "Yeniləmə zamanı xəta oldu");
			return;
		}

		setStatus("Fənn yeniləndi");
		setEditingId(null);
		await loadSubjects();
	};

	const handleImport = async (file: File) => {
		if (!branchId) {
			setStatus("Filial seçilməyib. Davam etmək üçün filial seçin.");
			return;
		}

		const resolvedDepartmentId = importDepartmentId || departmentId;
		if (!resolvedDepartmentId) {
			setStatus("Bulk import üçün kafedra seçilməlidir");
			return;
		}

		const rows = await parseSpreadsheet(file);
		const existing = new Set(
			subjects.map((subject) => subject.data.name.toLowerCase()),
		);
		const seen = new Set<string>();

		let missing = 0;
		let duplicates = 0;

		const cleaned = rows.filter((row) => {
			if (!row.name) {
				missing += 1;
				return false;
			}
			const key = row.name.toLowerCase();
			if (seen.has(key) || existing.has(key)) {
				duplicates += 1;
				return false;
			}
			seen.add(key);
			return true;
		});

		if (cleaned.length === 0) {
			setStatus(`Fayl boşdur. Missing: ${missing}, Duplicate: ${duplicates}`);
			return;
		}

		const { error } = await supabase.from("subjects").insert(
			cleaned.map((row) => ({
				id: createId(),
				org_id: ORG_ID,
				department_id: resolvedDepartmentId,
				name: row.name,
				code: row.code || null,
			})),
		);

		if (error) {
			setStatus(error.message || "Bulk import zamanı xəta oldu");
			return;
		}

		setStatus(
			`Bulk import tamamlandı. Missing: ${missing}, Duplicate: ${duplicates}`,
		);
		await loadSubjects();
	};

	const summary = useMemo(() => subjects.length, [subjects]);
	const departmentMap = useMemo(
		() => Object.fromEntries(departments.map((d) => [d.id, d.data])),
		[departments],
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
					<h2>Fənnlər</h2>
					<p>Fənn listi, kodları və kafedra bölgüsü.</p>
				</div>
				<div className="stat-pill">Cəmi: {summary}</div>
			</div>

			{loadError && <div className="notice danger">{loadError}</div>}

			<div className="card">
				<h3>Yeni fənn</h3>
				<div className="form-grid">
					<select
						className="input"
						value={departmentId}
						onChange={(event) => setDepartmentId(event.target.value)}
					>
						<option value="">Kafedra seçin</option>
						{departments.map((department) => (
							<option key={department.id} value={department.id}>
								{department.data.name}
							</option>
						))}
					</select>
					<input
						className="input"
						placeholder="Fənn adı"
						value={name}
						onChange={(event) => setName(event.target.value)}
					/>
					<input
						className="input"
						placeholder="Kod (istəyə bağlı)"
						value={code}
						onChange={(event) => setCode(event.target.value)}
					/>
					<button className="btn primary" type="button" onClick={handleCreate}>
						Yarat
					</button>
				</div>

				<div className="form-row">
					<select
						className="input"
						value={importDepartmentId}
						onChange={(event) => setImportDepartmentId(event.target.value)}
					>
						<option value="">Kafedra seçin</option>
						{departments.map((department) => (
							<option key={department.id} value={department.id}>
								{department.data.name}
							</option>
						))}
					</select>
					<input
						className="input"
						type="file"
						accept=".csv,.xlsx"
						onChange={(event) => {
							const file = event.target.files?.[0];
							if (file) void handleImport(file);
						}}
					/>
					<span className="hint">Şablon sütunları: name, code</span>
				</div>

				{status && <div className="notice">{status}</div>}
			</div>

			<div className="data-table">
				<div className="data-row header">
					<div>Kafedra</div>
					<div>Fənn</div>
					<div>Kod</div>
					<div></div>
				</div>

				{subjects.map((subject) => (
					<div className="data-row" key={subject.id}>
						<div>
							{editingId === subject.id ? (
								<select
									className="input"
									value={editDepartmentId}
									onChange={(event) => setEditDepartmentId(event.target.value)}
								>
									<option value="">Kafedra seçin</option>
									{departments.map((department) => (
										<option key={department.id} value={department.id}>
											{department.data.name}
										</option>
									))}
								</select>
							) : (
								(departmentMap[subject.data.departmentId ?? ""]?.name ?? "-")
							)}
						</div>

						<div>
							{editingId === subject.id ? (
								<input
									className="input"
									value={editName}
									onChange={(event) => setEditName(event.target.value)}
								/>
							) : (
								subject.data.name
							)}
						</div>

						<div>
							{editingId === subject.id ? (
								<input
									className="input"
									value={editCode}
									onChange={(event) => setEditCode(event.target.value)}
								/>
							) : (
								(subject.data.code ?? "-")
							)}
						</div>

						<div className="actions">
							{editingId === subject.id ? (
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
										onClick={() => handleEditStart(subject)}
									>
										Redaktə
									</button>
									<button
										className="btn ghost"
										type="button"
										onClick={() => void handleDelete(subject.id)}
									>
										Sil
									</button>
								</>
							)}
						</div>
					</div>
				))}

				{branchId && departments.length === 0 && (
					<div className="data-row">
						<div className="muted">
							Kafedra yoxdur. Əvvəlcə “Kafedralar” bölməsində kafedra yaradın.
						</div>
					</div>
				)}
			</div>

			{dialog}
		</div>
	);
};
