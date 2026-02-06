import { useEffect, useMemo, useState } from "react";
import { useConfirmDialog } from "../../components/ConfirmDialog";
import { ORG_ID, supabase } from "../../lib/supabase";
import { mapGroupRow } from "../../lib/supabaseMappers";
import type { GroupDoc } from "../../lib/types";
import { createId } from "../../lib/utils";
import { useAuth } from "../auth/AuthProvider";
import { BranchSelector } from "./BranchSelector";
import { parseSpreadsheet } from "./importUtils";
import { useBranchScope } from "./useBranchScope";

export const BranchGroupsPage = () => {
	const { user } = useAuth();
	const { confirm, dialog } = useConfirmDialog();
	const { branchId, setBranchId, branches, branchName, isSuperAdmin } =
		useBranchScope();
	const [groups, setGroups] = useState<Array<{ id: string; data: GroupDoc }>>(
		[],
	);
	const [name, setName] = useState("");
	const [classLevel, setClassLevel] = useState("");
	const [status, setStatus] = useState<string | null>(null);
	const [localBranchName, setLocalBranchName] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [editClassLevel, setEditClassLevel] = useState("");
	const [savingEdit, setSavingEdit] = useState(false);

	const loadGroups = async () => {
		if (!branchId) {
			setGroups([]);
			return;
		}
		let query = supabase
			.from("groups")
			.select("*")
			.eq("org_id", ORG_ID)
			.is("deleted_at", null);
		query = query.eq("branch_id", branchId);

		const { data, error } = await query;
		if (error) return;
		const items = (data ?? []).map((row) => ({
			id: row.id,
			data: mapGroupRow(row),
		}));
		setGroups(items.filter((group) => group.data.branchId === branchId));
	};

	const loadBranchName = async () => {
		if (!branchId) return;
		const { data } = await supabase
			.from("branches")
			.select("name")
			.eq("org_id", ORG_ID)
			.eq("id", branchId)
			.maybeSingle();
		setLocalBranchName(data?.name ?? "");
	};

	useEffect(() => {
		void loadGroups();
		void loadBranchName();
	}, [branchId]);

	const handleCreate = async () => {
		if (!name.trim() || !classLevel || !branchId) {
			setStatus("Qrup adı və sinif səviyyəsi tələb olunur");
			return;
		}

		const { error } = await supabase.from("groups").insert({
			id: createId(),
			org_id: ORG_ID,
			name: name.trim(),
			class_level: classLevel,
			branch_id: branchId,
		});

		if (error) {
			setStatus("Yaratma zamanı xəta oldu");
			return;
		}

		setName("");
		setClassLevel("");
		setStatus("Qrup yaradıldı");
		await loadGroups();
	};

	const handleDelete = async (groupId: string) => {
		const ok = await confirm({
			title: "Qrupu sil",
			message: "Qrupu silmək istədiyinizə əminsiniz?",
			confirmText: "Sil",
			cancelText: "İmtina",
			tone: "danger",
		});
		if (!ok) return;
		await supabase
			.from("groups")
			.update({
				deleted_at: new Date().toISOString(),
				deleted_by: user?.id ?? null,
			})
			.eq("org_id", ORG_ID)
			.eq("id", groupId);
		await loadGroups();
	};

	const handleEditStart = (group: { id: string; data: GroupDoc }) => {
		setEditingId(group.id);
		setEditName(group.data.name);
		setEditClassLevel(group.data.classLevel);
		setStatus(null);
	};

	const handleEditCancel = () => {
		setEditingId(null);
		setEditName("");
		setEditClassLevel("");
	};

	const handleEditSave = async () => {
		if (!editingId) return;
		if (!editName.trim() || !editClassLevel) {
			setStatus("Ad və sinif səviyyəsi tələb olunur");
			return;
		}
		setSavingEdit(true);
		const { error } = await supabase
			.from("groups")
			.update({ name: editName.trim(), class_level: editClassLevel })
			.eq("org_id", ORG_ID)
			.eq("id", editingId);
		setSavingEdit(false);
		if (error) {
			setStatus("Yeniləmə zamanı xəta oldu");
			return;
		}
		setStatus("Qrup yeniləndi");
		setEditingId(null);
		await loadGroups();
	};

	const handleImport = async (file: File) => {
		if (!branchId) return;
		const rows = await parseSpreadsheet(file);
		const existingNames = new Set(
			groups.map((group) => group.data.name.toLowerCase()),
		);
		const seen = new Set<string>();

		let missing = 0;
		let duplicates = 0;
		let mismatch = 0;

		const cleaned = rows.filter((row) => {
			if (!row.name || !row.classLevel) {
				missing += 1;
				return false;
			}
			if (row.branchId && row.branchId !== branchId) {
				mismatch += 1;
				return false;
			}
			const key = row.name.toLowerCase();
			if (seen.has(key) || existingNames.has(key)) {
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

		const { error } = await supabase.from("groups").insert(
			cleaned.map((row) => ({
				id: createId(),
				org_id: ORG_ID,
				name: row.name,
				class_level: row.classLevel,
				branch_id: branchId,
			})),
		);

		if (error) {
			setStatus("Bulk import zamanı xəta oldu");
			return;
		}

		setStatus(
			`Bulk import tamamlandı. Missing: ${missing}, Duplicate: ${duplicates}, Branch mismatch: ${mismatch}`,
		);
		await loadGroups();
	};

	const summary = useMemo(() => groups.length, [groups]);
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
					<h2>Qruplar</h2>
					<p>Filial üzrə qrupların siyahısı.</p>
				</div>
				<div className="stat-pill">Cəmi: {summary}</div>
			</div>

			<div className="card">
				<h3>Yeni qrup</h3>
				<div className="form-grid">
					<input
						className="input"
						placeholder="Qrup adı"
						value={name}
						onChange={(event) => setName(event.target.value)}
					/>
					<input
						className="input"
						placeholder="Sinif səviyyəsi"
						value={classLevel}
						onChange={(event) => setClassLevel(event.target.value)}
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
				<div className="form-row">
					<input
						className="input"
						type="file"
						accept=".csv,.xlsx"
						disabled={!branchId}
						onChange={(event) => {
							const file = event.target.files?.[0];
							if (file) void handleImport(file);
						}}
					/>
					<span className="hint">
						Şablon sütunları: name, classLevel, branchId (optional)
					</span>
				</div>
				{status && <div className="notice">{status}</div>}
			</div>

			<div className="data-table">
				<div className="data-row header">
					<div>Qrup</div>
					<div>Sinif səviyyəsi</div>
					<div>Filial</div>
					<div></div>
				</div>
				{groups.map((group) => (
					<div className="data-row" key={group.id}>
						<div>
							{editingId === group.id ? (
								<input
									className="input"
									value={editName}
									onChange={(event) => setEditName(event.target.value)}
								/>
							) : (
								group.data.name
							)}
						</div>
						<div>
							{editingId === group.id ? (
								<input
									className="input"
									value={editClassLevel}
									onChange={(event) => setEditClassLevel(event.target.value)}
								/>
							) : (
								group.data.classLevel
							)}
						</div>
						<div>{displayBranchName}</div>
						<div className="actions">
							{editingId === group.id ? (
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
										onClick={() => handleEditStart(group)}
									>
										Redaktə
									</button>
									<button
										className="btn ghost"
										type="button"
										onClick={() => void handleDelete(group.id)}
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
