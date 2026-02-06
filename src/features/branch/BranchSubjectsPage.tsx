import { useEffect, useMemo, useState } from "react";
import { useConfirmDialog } from "../../components/ConfirmDialog";
import { ORG_ID, supabase } from "../../lib/supabase";
import { mapSubjectRow } from "../../lib/supabaseMappers";
import type { SubjectDoc } from "../../lib/types";
import { createId } from "../../lib/utils";
import { useAuth } from "../auth/AuthProvider";
import { parseSpreadsheet } from "./importUtils";

export const BranchSubjectsPage = () => {
	const { user } = useAuth();
	const { confirm, dialog } = useConfirmDialog();
	const [subjects, setSubjects] = useState<
		Array<{ id: string; data: SubjectDoc }>
	>([]);
	const [name, setName] = useState("");
	const [code, setCode] = useState("");
	const [status, setStatus] = useState<string | null>(null);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [editCode, setEditCode] = useState("");
	const [savingEdit, setSavingEdit] = useState(false);

	const loadSubjects = async () => {
		const { data, error } = await supabase
			.from("subjects")
			.select("*")
			.eq("org_id", ORG_ID)
			.is("deleted_at", null);
		if (error) return;
		const items = (data ?? []).map((row) => ({
			id: row.id,
			data: mapSubjectRow(row),
		}));
		setSubjects(items);
	};

	useEffect(() => {
		void loadSubjects();
	}, []);

	const handleCreate = async () => {
		if (!name.trim()) {
			setStatus("Fənn adı tələb olunur");
			return;
		}

		const { error } = await supabase.from("subjects").insert({
			id: createId(),
			org_id: ORG_ID,
			name: name.trim(),
			code: code.trim() || null,
		});

		if (error) {
			setStatus("Yaratma zamanı xəta oldu");
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

	const handleEditStart = (subject: { id: string; data: SubjectDoc }) => {
		setEditingId(subject.id);
		setEditName(subject.data.name);
		setEditCode(subject.data.code ?? "");
		setStatus(null);
	};

	const handleEditCancel = () => {
		setEditingId(null);
		setEditName("");
		setEditCode("");
	};

	const handleEditSave = async () => {
		if (!editingId) return;
		if (!editName.trim()) {
			setStatus("Fənn adı tələb olunur");
			return;
		}
		setSavingEdit(true);
		const { error } = await supabase
			.from("subjects")
			.update({ name: editName.trim(), code: editCode.trim() || null })
			.eq("org_id", ORG_ID)
			.eq("id", editingId);
		setSavingEdit(false);
		if (error) {
			setStatus("Yeniləmə zamanı xəta oldu");
			return;
		}
		setStatus("Fənn yeniləndi");
		setEditingId(null);
		await loadSubjects();
	};

	const handleImport = async (file: File) => {
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
				name: row.name,
				code: row.code || null,
			})),
		);

		if (error) {
			setStatus("Bulk import zamanı xəta oldu");
			return;
		}

		setStatus(
			`Bulk import tamamlandı. Missing: ${missing}, Duplicate: ${duplicates}`,
		);
		await loadSubjects();
	};

	const summary = useMemo(() => subjects.length, [subjects]);

	return (
		<div className="panel">
			<div className="panel-header">
				<div>
					<h2>Fənnlər</h2>
					<p>Fənn listi və kodları.</p>
				</div>
				<div className="stat-pill">Cəmi: {summary}</div>
			</div>

			<div className="card">
				<h3>Yeni fənn</h3>
				<div className="form-grid">
					<input
						className="input"
						placeholder="Fənn adı"
						value={name}
						onChange={(event) => setName(event.target.value)}
					/>
					<input
						className="input"
						placeholder="Kod (optional)"
						value={code}
						onChange={(event) => setCode(event.target.value)}
					/>
					<button className="btn primary" type="button" onClick={handleCreate}>
						Yarat
					</button>
				</div>
				<div className="form-row">
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
					<div>Fənn</div>
					<div>Kod</div>
					<div></div>
				</div>
				{subjects.map((subject) => (
					<div className="data-row" key={subject.id}>
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
			</div>
			{dialog}
		</div>
	);
};
