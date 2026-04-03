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

const normalizeForMatch = (value: string) =>
	value
		.toLocaleLowerCase("az")
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\u0259/g, "e")
		.replace(/\u0131/g, "i")
		.replace(/\u015f/g, "s")
		.replace(/\u00e7/g, "c")
		.replace(/\u011f/g, "g")
		.replace(/\u00f6/g, "o")
		.replace(/\u00fc/g, "u")
		.replace(/[^a-z0-9]/g, "");

const CANONICAL_SUBJECT_NAMES: Record<string, string> = {
	azerbaycandili: "Azərbaycan dili",
	azerbt: "Azərb/T",
	azrbaycandili: "Azərbaycan dili",
	azrbt: "Azərb/T",
	cografiya: "Coğrafiya",
	corafiya: "Coğrafiya",
	deyerler: "Dəyərlər",
	dyrlr: "Dəyərlər",
	dbiyyat: "Ədəbiyyat",
	edebiyyat: "Ədəbiyyat",
	informatika: "İnformatika",
	nformatika: "İnformatika",
	mentiq: "Məntiq",
	mntiq: "Məntiq",
	mumit: "Ümumi/T",
	resm: "Rəsm",
	rsm: "Rəsm",
	rusdili: "Rus dili",
	sahmat: "Şahmat",
	ahmat: "Şahmat",
	sinifsaati: "Sinif saatı",
	sinifsaat: "Sinif saatı",
	tbit: "Təbiət",
	tebiet: "Təbiət",
	umumit: "Ümumi/T",
};

const canonicalizeSubjectName = (value: string) => {
	const trimmed = value.trim();
	if (!trimmed) return "";
	const normalized = normalizeForMatch(trimmed);
	return CANONICAL_SUBJECT_NAMES[normalized] ?? trimmed;
};

const getRowValue = (row: Record<string, string>, aliases: string[]) => {
	const normalizedRow = new Map<string, string>();
	Object.entries(row).forEach(([key, rawValue]) => {
		const normalizedKey = normalizeForMatch(key);
		if (!normalizedRow.has(normalizedKey)) {
			normalizedRow.set(normalizedKey, String(rawValue ?? "").trim());
		}
	});

	for (const alias of aliases) {
		const value = normalizedRow.get(normalizeForMatch(alias));
		if (value) return value;
	}

	return "";
};

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
		if (!departmentId) return;
		if (!departments.some((department) => department.id === departmentId)) {
			setDepartmentId("");
		}
	}, [departments, departmentId]);

	useEffect(() => {
		if (!importDepartmentId) return;
		if (!departments.some((department) => department.id === importDepartmentId)) {
			setImportDepartmentId("");
		}
	}, [departments, importDepartmentId]);

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

		const normalizedName = canonicalizeSubjectName(name);
		const { error } = await supabase.from("subjects").insert({
			id: createId(),
			org_id: ORG_ID,
			department_id: departmentId,
			name: normalizedName,
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
		const normalizedName = canonicalizeSubjectName(editName);
		const { error } = await supabase
			.from("subjects")
			.update({
				name: normalizedName,
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

		const fallbackDepartmentId = importDepartmentId || departmentId;
		const rows = await parseSpreadsheet(file);
		const departmentIds = new Set(departments.map((department) => department.id));
		const departmentByName = new Map<string, string>();
		departments.forEach((department) => {
			departmentByName.set(normalizeForMatch(department.data.name), department.id);
		});

		const existing = new Set(
			subjects.map((subject) => {
				const normalizedName = normalizeForMatch(subject.data.name);
				return `${subject.data.departmentId ?? ""}:${normalizedName}`;
			}),
		);
		const seen = new Set<string>();

		let missing = 0;
		let duplicates = 0;
		let missingDepartment = 0;
		let unknownDepartment = 0;

		const cleaned = rows
			.map((row) => {
				const rowName = canonicalizeSubjectName(getRowValue(row, ["name"]));
				const rowCode = getRowValue(row, ["code"]);
				const rowDepartmentId = getRowValue(row, [
					"department_id",
					"departmentId",
					"kafedra_id",
					"kafedraid",
				]);
				const rowDepartmentName = getRowValue(row, [
					"department_name",
					"departmentName",
					"department",
					"kafedra",
				]);

				if (!rowName) {
					missing += 1;
					return null;
				}

				let resolvedDepartmentId = "";
				if (rowDepartmentId && departmentIds.has(rowDepartmentId)) {
					resolvedDepartmentId = rowDepartmentId;
				}

				if (!resolvedDepartmentId && rowDepartmentName) {
					const byName = departmentByName.get(normalizeForMatch(rowDepartmentName));
					if (byName) {
						resolvedDepartmentId = byName;
					}
				}

				const hasExplicitDepartment = Boolean(
					rowDepartmentId || rowDepartmentName,
				);
				if (!resolvedDepartmentId && hasExplicitDepartment) {
					unknownDepartment += 1;
					return null;
				}

				if (!resolvedDepartmentId) {
					resolvedDepartmentId = fallbackDepartmentId;
				}
				if (!resolvedDepartmentId) {
					missingDepartment += 1;
					return null;
				}

				const normalizedName = normalizeForMatch(rowName);
				const key = `${resolvedDepartmentId}:${normalizedName}`;
				if (seen.has(key) || existing.has(key)) {
					duplicates += 1;
					return null;
				}
				seen.add(key);

				return {
					id: createId(),
					org_id: ORG_ID,
					department_id: resolvedDepartmentId,
					name: rowName,
					code: rowCode || null,
				};
			})
			.filter((row): row is NonNullable<typeof row> => Boolean(row));

		if (cleaned.length === 0) {
			setStatus(
				`Fayl boşdur. Missing: ${missing}, MissingDepartment: ${missingDepartment}, UnknownDepartment: ${unknownDepartment}, Duplicate: ${duplicates}`,
			);
			return;
		}

		const { error } = await supabase.from("subjects").insert(cleaned);

		if (error) {
			setStatus(error.message || "Bulk import zamanı xəta oldu");
			return;
		}

		setStatus(
			`Bulk import tamamlandı. Missing: ${missing}, MissingDepartment: ${missingDepartment}, UnknownDepartment: ${unknownDepartment}, Duplicate: ${duplicates}`,
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
					<span className="hint">
						Şablon sütunları: name, code, departmentName/departmentId
					</span>
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
								canonicalizeSubjectName(subject.data.name)
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
