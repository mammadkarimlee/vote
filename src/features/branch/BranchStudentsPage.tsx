import { useCallback, useEffect, useMemo, useState } from "react";
import { useFeedbackState } from "../../components/feedback/FeedbackProvider";
import { PaginationControls } from "../../components/PaginationControls";
import { useConfirmDialog } from "../../components/ConfirmDialog";
import { ORG_ID, supabase } from "../../lib/supabase";
import { mapGroupRow, mapStudentRow } from "../../lib/supabaseMappers";
import type { GroupDoc, StudentDoc } from "../../lib/types";
import { usePagination } from "../../lib/usePagination";
import { downloadWorkbook } from "../../lib/xlsx";
import { useAuth } from "../auth/AuthProvider";
import { BranchSelector } from "./BranchSelector";
import { parseSpreadsheet } from "./importUtils";
import { useBranchScope } from "./useBranchScope";
import { provisionLoginUser } from "./userProvisioning";

export const BranchStudentsPage = () => {
	const { user } = useAuth();
	const { confirm, dialog } = useConfirmDialog();
	const { branchId, setBranchId, branches, branchName, isSuperAdmin } =
		useBranchScope();
	const [students, setStudents] = useState<
		Array<{ id: string; data: StudentDoc }>
	>([]);
	const [groups, setGroups] = useState<Array<{ id: string; data: GroupDoc }>>(
		[],
	);
	const [name, setName] = useState("");
	const [groupId, setGroupId] = useState("");
	const [classLevel, setClassLevel] = useState("");
	const [selectedClass, setSelectedClass] = useState("all");
	const [status, setStatus] = useFeedbackState();

	const loadData = useCallback(async () => {
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
	}, [branchId]);

	useEffect(() => {
		void loadData();
	}, [loadData]);

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
		const groupById = Object.fromEntries(groups.map((group) => [group.id, group.data]));
		const groupIdByName = Object.fromEntries(
			groups.map((group) => [group.data.name.trim().toLowerCase(), group.id]),
		);
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

		const cleaned: Array<{
			name: string;
			groupId: string;
			classLevel: string;
		}> = [];

		rows.forEach((row) => {
			const resolvedGroupId =
				row.groupId?.trim() ||
				groupIdByName[(row.groupName || row.group || "").trim().toLowerCase()] ||
				"";
			const resolvedClassLevel =
				row.classLevel?.trim() || groupById[resolvedGroupId]?.classLevel || "";
			const resolvedName = row.name?.trim() || "";

			if (!resolvedName || !resolvedGroupId || !resolvedClassLevel) {
				missing += 1;
				return;
			}
			if (row.branchId && row.branchId !== branchId) {
				mismatch += 1;
				return;
			}
			const key = `${resolvedName.toLowerCase()}|${resolvedGroupId}`;
			if (seen.has(key) || existingKeys.has(key)) {
				duplicates += 1;
				return;
			}
			seen.add(key);
			cleaned.push({
				name: resolvedName,
				groupId: resolvedGroupId,
				classLevel: resolvedClassLevel,
			});
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
	const groupMap = useMemo(
		() => Object.fromEntries(groups.map((group) => [group.id, group.data])),
		[groups],
	);
	const getStudentClassLevel = useCallback(
		(student: { id: string; data: StudentDoc }) =>
			(
				student.data.classLevel ||
				groupMap[student.data.groupId]?.classLevel ||
				"-"
			).trim() || "-",
		[groupMap],
	);
	const classFilterOptions = useMemo(() => {
		const counts = new Map<string, number>();
		students.forEach((student) => {
			const classLabel = getStudentClassLevel(student);
			counts.set(classLabel, (counts.get(classLabel) ?? 0) + 1);
		});

		return Array.from(counts.entries())
			.map(([classLevel, count]) => ({ classLevel, count }))
			.sort((a, b) =>
				a.classLevel.localeCompare(b.classLevel, "az", {
					numeric: true,
					sensitivity: "base",
				}),
			);
	}, [getStudentClassLevel, students]);
	const filteredStudents = useMemo(
		() =>
			selectedClass === "all"
				? students
				: students.filter(
						(student) => getStudentClassLevel(student) === selectedClass,
					),
		[getStudentClassLevel, selectedClass, students],
	);
	const studentsPagination = usePagination(filteredStudents);

	useEffect(() => {
		setSelectedClass("all");
	}, [branchId]);

	useEffect(() => {
		studentsPagination.resetPage();
	}, [selectedClass, studentsPagination.resetPage]);

	useEffect(() => {
		if (
			selectedClass !== "all" &&
			!classFilterOptions.some((option) => option.classLevel === selectedClass)
		) {
			setSelectedClass("all");
		}
	}, [classFilterOptions, selectedClass]);

	const handleExportStudentCredentials = async () => {
		if (!branchId) {
			setStatus("Filial seçilməyib. Export üçün filial seçin.");
			return;
		}

		const entries = students
			.filter((student) => student.data.login)
			.map((student) => ({
				classLevel: (student.data.classLevel || "").trim() || "-",
				groupName: groupMap[student.data.groupId]?.name ?? student.data.groupId,
				studentName: student.data.name,
				login: student.data.login ?? "",
			}))
			.sort((a, b) => {
				const classCompare = a.classLevel.localeCompare(b.classLevel, "az", {
					numeric: true,
				});
				if (classCompare !== 0) return classCompare;
				const groupCompare = a.groupName.localeCompare(b.groupName, "az");
				if (groupCompare !== 0) return groupCompare;
				return a.studentName.localeCompare(b.studentName, "az");
			});

		if (entries.length === 0) {
			setStatus("Export üçün login-i olan şagird tapılmadı.");
			return;
		}

		const headers = ["Sinif", "Qrup", "Şagird", "Login", "Parol"];
		const byClass = new Map<string, string[][]>();
		entries.forEach((entry) => {
			const row = [
				entry.classLevel,
				entry.groupName,
				entry.studentName,
				entry.login,
				entry.login,
			];
			const existing = byClass.get(entry.classLevel) ?? [];
			existing.push(row);
			byClass.set(entry.classLevel, existing);
		});

		const sheets = [
			{
				name: "Hamısı",
				headers,
				rows: entries.map((entry) => [
					entry.classLevel,
					entry.groupName,
					entry.studentName,
					entry.login,
					entry.login,
				]),
			},
			...Array.from(byClass.entries())
				.sort(([a], [b]) => a.localeCompare(b, "az", { numeric: true }))
				.map(([classLevel, rows]) => ({
					name: `Sinif ${classLevel}`,
					headers,
					rows,
				})),
		];

		const branchLabel = (branchName || branchId)
			.replace(/[\\/:*?"<>|]/g, "-")
			.replace(/\s+/g, "-");
		await downloadWorkbook(`students-logins-${branchLabel}.xlsx`, sheets);
		setStatus(
			"Şagird login/parol export hazırdır. Parol sütunu default olaraq login dəyəridir.",
		);
	};

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
					{selectedClass !== "all" && (
						<div className="stat-pill">Göstərilən: {filteredStudents.length}</div>
					)}
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

			<div className="page-grid students-page-grid">
				<div className="students-side-panel">
					<div className="card class-filter-card">
						<div className="section-header">
							<div>
								<div className="section-kicker">Filter</div>
								<div className="section-title">Siniflər</div>
							</div>
						</div>
						<div className="class-filter-list">
							<button
								className={`class-filter-button ${
									selectedClass === "all" ? "active" : ""
								}`}
								type="button"
								onClick={() => setSelectedClass("all")}
							>
								<span>Hamısı</span>
								<span className="class-filter-button__count">
									{students.length}
								</span>
							</button>
							{classFilterOptions.map((option) => (
								<button
									className={`class-filter-button ${
										selectedClass === option.classLevel ? "active" : ""
									}`}
									key={option.classLevel}
									type="button"
									onClick={() => setSelectedClass(option.classLevel)}
								>
									<span>{option.classLevel}</span>
									<span className="class-filter-button__count">
										{option.count}
									</span>
								</button>
							))}
						</div>
					</div>

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
								Şablon sütunları: name, groupId/groupName, classLevel (istəyə bağlı), branchId (istəyə bağlı)
							</span>
						</div>
						<div className="hint">Şifrə default olaraq login ilə eynidir.</div>
						{status && <div className="notice">{status}</div>}
					</div>
				</div>

				<div className="card">
					<div className="section-header">
						<div>
							<div className="section-kicker">Siyahı</div>
							<div className="section-title">Şagirdlər</div>
							<div className="students-list-meta">
								{selectedClass === "all"
									? `${students.length} şagird`
									: `${selectedClass} sinfi üzrə ${filteredStudents.length} şagird`}
							</div>
						</div>
						<button
							className="btn ghost"
							type="button"
							onClick={() => void handleExportStudentCredentials()}
							disabled={!branchId || students.length === 0}
						>
							Login/parol export (sinif-sinif)
						</button>
					</div>
					<div className="data-table">
						<div className="data-row header">
							<div>Ad</div>
							<div>Qrup</div>
							<div>Sinif səviyyəsi</div>
							<div>Login</div>
							<div></div>
						</div>
						{studentsPagination.paginatedItems.map((student) => (
							<div className="data-row" key={student.id}>
								<div>{student.data.name}</div>
								<div>{groupMap[student.data.groupId]?.name ?? student.data.groupId}</div>
								<div>{getStudentClassLevel(student)}</div>
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
					{studentsPagination.totalItems === 0 && (
						<div className="empty">Bu sinif üzrə şagird tapılmadı.</div>
					)}
					{studentsPagination.totalItems > 0 && (
						<PaginationControls
							totalItems={studentsPagination.totalItems}
							page={studentsPagination.page}
							pageSize={studentsPagination.pageSize}
							onPageChange={studentsPagination.setPage}
							onPageSizeChange={studentsPagination.setPageSize}
						/>
					)}
				</div>
			</div>
			{dialog}
		</div>
	);
};

