import { useCallback, useEffect, useMemo, useState } from "react";
import { useFeedbackState } from "../../components/feedback/FeedbackProvider";
import { PaginationControls } from "../../components/PaginationControls";
import { useConfirmDialog } from "../../components/ConfirmDialog";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "../../components/ui/dialog";
import { ORG_ID, supabase } from "../../lib/supabase";
import {
	mapGroupRow,
	mapStudentRow,
	mapSubjectRow,
	mapTeacherRow,
	mapTeachingAssignmentRow,
} from "../../lib/supabaseMappers";
import type {
	GroupDoc,
	StudentDoc,
	SubjectDoc,
	TeacherDoc,
} from "../../lib/types";
import { usePagination } from "../../lib/usePagination";
import { createId } from "../../lib/utils";
import { useAuth } from "../auth/AuthProvider";
import { BranchSelector } from "./BranchSelector";
import { parseSpreadsheet } from "./importUtils";
import { useBranchScope } from "./useBranchScope";

type GroupTeacherDetail = {
	teacherId: string;
	teacherName: string;
	assignmentCount: number;
	subjectNames: string[];
	years: number[];
};

type GroupDetail = {
	groupId: string;
	groupName: string;
	classLevel: string;
	branchName: string;
	studentCount: number;
	teacherCount: number;
	subjectCount: number;
	subjectNames: string[];
	teachers: GroupTeacherDetail[];
	students: Array<{ id: string; data: StudentDoc }>;
};

const sortByName = (left: string, right: string) => left.localeCompare(right, "az");

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
	const [status, setStatus] = useFeedbackState();
	const [localBranchName, setLocalBranchName] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [editClassLevel, setEditClassLevel] = useState("");
	const [savingEdit, setSavingEdit] = useState(false);
	const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
	const [selectedGroupDetail, setSelectedGroupDetail] =
		useState<GroupDetail | null>(null);
	const [groupDetailLoading, setGroupDetailLoading] = useState(false);
	const [groupDetailError, setGroupDetailError] = useState<string | null>(null);

	const displayBranchName = localBranchName || branchName || "Filial tapılmadı";

	const loadGroups = useCallback(async () => {
		if (!branchId) {
			setGroups([]);
			return;
		}

		const { data, error } = await supabase
			.from("groups")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("branch_id", branchId)
			.is("deleted_at", null);

		if (error) {
			setStatus("Qrupları yükləmək mümkün olmadı");
			return;
		}

		const items = (data ?? [])
			.map((row) => ({
				id: row.id,
				data: mapGroupRow(row),
			}))
			.filter((group) => group.data.branchId === branchId)
			.sort((left, right) => {
				const levelCompare = sortByName(
					left.data.classLevel ?? "",
					right.data.classLevel ?? "",
				);
				if (levelCompare !== 0) return levelCompare;
				return sortByName(left.data.name, right.data.name);
			});

		setGroups(items);
	}, [branchId, setStatus]);

	const loadBranchName = useCallback(async () => {
		if (!branchId) {
			setLocalBranchName("");
			return;
		}

		const { data, error } = await supabase
			.from("branches")
			.select("name")
			.eq("org_id", ORG_ID)
			.eq("id", branchId)
			.maybeSingle();

		if (error) {
			setLocalBranchName("");
			return;
		}

		setLocalBranchName(data?.name ?? "");
	}, [branchId]);

	useEffect(() => {
		void loadGroups();
		void loadBranchName();
	}, [loadBranchName, loadGroups]);

	useEffect(() => {
		setSelectedGroupId(null);
		setSelectedGroupDetail(null);
		setGroupDetailError(null);
		setGroupDetailLoading(false);
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

		if (selectedGroupId === groupId) {
			setSelectedGroupId(null);
			setSelectedGroupDetail(null);
			setGroupDetailError(null);
		}

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

	const buildGroupDetail = useCallback(
		async (group: { id: string; data: GroupDoc }) => {
			if (!branchId) {
				throw new Error("Filial seçilməyib");
			}

			const [studentsResult, assignmentsResult] = await Promise.all([
				supabase
					.from("students")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("branch_id", branchId)
					.eq("group_id", group.id)
					.is("deleted_at", null),
				supabase
					.from("teaching_assignments")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("branch_id", branchId)
					.eq("group_id", group.id)
					.order("year", { ascending: false }),
			]);

			if (studentsResult.error) {
				throw new Error(studentsResult.error.message);
			}
			if (assignmentsResult.error) {
				throw new Error(assignmentsResult.error.message);
			}

			const students = (studentsResult.data ?? [])
				.map((row) => ({
					id: row.id,
					data: mapStudentRow(row),
				}))
				.sort((left, right) => sortByName(left.data.name, right.data.name));

			const assignments = (assignmentsResult.data ?? []).map((row) => ({
				id: row.id,
				data: mapTeachingAssignmentRow(row),
			}));

			const teacherIds = Array.from(
				new Set(assignments.map((assignment) => assignment.data.teacherId)),
			);
			const subjectIds = Array.from(
				new Set(assignments.map((assignment) => assignment.data.subjectId)),
			);

			const teachersById = new Map<string, { id: string; data: TeacherDoc }>();
			if (teacherIds.length > 0) {
				const { data, error } = await supabase
					.from("teachers")
					.select("*")
					.eq("org_id", ORG_ID)
					.is("deleted_at", null)
					.in("id", teacherIds);

				if (error) {
					throw new Error(error.message);
				}

				for (const row of data ?? []) {
					teachersById.set(row.id, {
						id: row.id,
						data: mapTeacherRow(row),
					});
				}
			}

			const subjectsById = new Map<string, { id: string; data: SubjectDoc }>();
			if (subjectIds.length > 0) {
				const { data, error } = await supabase
					.from("subjects")
					.select("*")
					.eq("org_id", ORG_ID)
					.is("deleted_at", null)
					.in("id", subjectIds);

				if (error) {
					throw new Error(error.message);
				}

				for (const row of data ?? []) {
					subjectsById.set(row.id, {
						id: row.id,
						data: mapSubjectRow(row),
					});
				}
			}

			const teacherDetailMap = new Map<
				string,
				{
					teacherId: string;
					teacherName: string;
					assignmentCount: number;
					subjectNames: Set<string>;
					years: Set<number>;
				}
			>();
			const subjectNameSet = new Set<string>();

			for (const assignment of assignments) {
				const teacherName =
					teachersById.get(assignment.data.teacherId)?.data.name ??
					assignment.data.teacherId;
				const subjectName =
					subjectsById.get(assignment.data.subjectId)?.data.name ??
					assignment.data.subjectId;

				subjectNameSet.add(subjectName);

				const current =
					teacherDetailMap.get(assignment.data.teacherId) ?? {
						teacherId: assignment.data.teacherId,
						teacherName,
						assignmentCount: 0,
						subjectNames: new Set<string>(),
						years: new Set<number>(),
					};

				current.assignmentCount += 1;
				current.subjectNames.add(subjectName);
				current.years.add(assignment.data.year);
				teacherDetailMap.set(assignment.data.teacherId, current);
			}

			const teachers = Array.from(teacherDetailMap.values())
				.map((detail) => ({
					teacherId: detail.teacherId,
					teacherName: detail.teacherName,
					assignmentCount: detail.assignmentCount,
					subjectNames: Array.from(detail.subjectNames).sort(sortByName),
					years: Array.from(detail.years).sort((left, right) => right - left),
				}))
				.sort((left, right) => sortByName(left.teacherName, right.teacherName));

			const subjectNames = Array.from(subjectNameSet).sort(sortByName);

			return {
				groupId: group.id,
				groupName: group.data.name,
				classLevel: group.data.classLevel,
				branchName: displayBranchName,
				studentCount: students.length,
				teacherCount: teachers.length,
				subjectCount: subjectNames.length,
				subjectNames,
				teachers,
				students,
			} satisfies GroupDetail;
		},
		[branchId, displayBranchName],
	);

	const selectedGroup = useMemo(
		() => groups.find((group) => group.id === selectedGroupId) ?? null,
		[groups, selectedGroupId],
	);

	useEffect(() => {
		let isActive = true;

		if (!selectedGroup) {
			setSelectedGroupDetail(null);
			setGroupDetailError(null);
			setGroupDetailLoading(false);
			return;
		}

		setGroupDetailLoading(true);
		setGroupDetailError(null);
		setSelectedGroupDetail(null);

		void buildGroupDetail(selectedGroup)
			.then((detail) => {
				if (!isActive) return;
				setSelectedGroupDetail(detail);
			})
			.catch((error) => {
				if (!isActive) return;
				console.error(error);
				setGroupDetailError("Qrup detallarını yükləmək mümkün olmadı");
				setStatus("Qrup detallarını yükləmək mümkün olmadı");
			})
			.finally(() => {
				if (!isActive) return;
				setGroupDetailLoading(false);
			});

		return () => {
			isActive = false;
		};
	}, [buildGroupDetail, selectedGroup, setStatus]);

	const summary = useMemo(() => groups.length, [groups]);
	const groupsPagination = usePagination(groups);
	const studentPagination = usePagination(selectedGroupDetail?.students ?? []);

	useEffect(() => {
		studentPagination.resetPage();
	}, [selectedGroupId, studentPagination.resetPage]);

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
						Şablon sütunları: name, classLevel, branchId (istəyə bağlı)
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
				{groupsPagination.paginatedItems.map((group) => (
					<div className="data-row" key={group.id}>
						<div>
							{editingId === group.id ? (
								<input
									className="input"
									value={editName}
									onChange={(event) => setEditName(event.target.value)}
								/>
							) : (
								<div className="stack">
									<button
										className="btn ghost"
										type="button"
										onClick={() => setSelectedGroupId(group.id)}
									>
										{group.data.name}
									</button>
									<div className="meta">
										Bu qrup üzrə müəllim və şagird detallarına bax
									</div>
								</div>
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
										className="btn ghost"
										type="button"
										onClick={() => setSelectedGroupId(group.id)}
									>
										Bax
									</button>
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
				{groupsPagination.totalItems === 0 && (
					<div className="empty">Göstərmək üçün qrup yoxdur.</div>
				)}
			</div>
			{groupsPagination.totalItems > 0 && (
				<PaginationControls
					totalItems={groupsPagination.totalItems}
					page={groupsPagination.page}
					pageSize={groupsPagination.pageSize}
					onPageChange={groupsPagination.setPage}
					onPageSizeChange={groupsPagination.setPageSize}
				/>
			)}

			<Dialog
				open={Boolean(selectedGroupId)}
				onOpenChange={(open) => {
					if (!open) {
						setSelectedGroupId(null);
						setSelectedGroupDetail(null);
						setGroupDetailError(null);
					}
				}}
			>
				<DialogContent className="left-auto right-0 top-0 h-screen max-h-screen w-full max-w-5xl translate-x-0 translate-y-0 overflow-y-auto rounded-none border-l p-0">
					<div className="panel gap-0">
						<div className="panel-header sticky top-0 z-10 border-b border-border bg-card px-6 py-5">
							<DialogHeader className="text-left">
								<DialogTitle>
									{selectedGroup?.data.name ?? selectedGroupDetail?.groupName ?? "Qrup"}
								</DialogTitle>
								<div className="meta">
									{groupDetailLoading
										? "Qrup detalları yüklənir..."
										: `${selectedGroup?.data.classLevel ?? selectedGroupDetail?.classLevel ?? "-"} sinif • ${selectedGroupDetail?.studentCount ?? 0} şagird • ${selectedGroupDetail?.teacherCount ?? 0} müəllim • ${selectedGroupDetail?.subjectCount ?? 0} fənn`}
								</div>
							</DialogHeader>
							<div className="actions">
								<button
									className="btn"
									type="button"
									onClick={() => {
										setSelectedGroupId(null);
										setSelectedGroupDetail(null);
										setGroupDetailError(null);
									}}
								>
									Bağla
								</button>
							</div>
						</div>

						<div className="panel-content px-6 py-6">
							{groupDetailLoading && <div className="empty">Yüklənir...</div>}

							{!groupDetailLoading && groupDetailError && (
								<div className="notice">{groupDetailError}</div>
							)}

							{!groupDetailLoading && !groupDetailError && selectedGroupDetail && (
								<div className="stack">
									<div className="form-row">
										<div className="stat-pill">
											Sinif: {selectedGroupDetail.classLevel}
										</div>
										<div className="stat-pill">
											Filial: {selectedGroupDetail.branchName}
										</div>
										<div className="stat-pill">
											Şagird: {selectedGroupDetail.studentCount}
										</div>
										<div className="stat-pill">
											Müəllim: {selectedGroupDetail.teacherCount}
										</div>
										<div className="stat-pill">
											Fənn: {selectedGroupDetail.subjectCount}
										</div>
									</div>

									<div className="card">
										<div className="section-header">
											<div>
												<div className="section-kicker">Yekun</div>
												<div className="section-title">Müəllimlər və fənlər</div>
												<div className="meta">
													Bu qrupda dərs deyən müəllimlər və keçdikləri fənlər.
												</div>
											</div>
										</div>
										{selectedGroupDetail.subjectNames.length > 0 && (
											<div className="form-row">
												{selectedGroupDetail.subjectNames.map((subjectName) => (
													<div className="stat-pill" key={subjectName}>
														{subjectName}
													</div>
												))}
											</div>
										)}
										<div className="data-table">
											<div className="data-row header">
												<div>Müəllim</div>
												<div>Fənnlər</div>
												<div>İllər</div>
												<div>Təyinat</div>
											</div>
											{selectedGroupDetail.teachers.map((teacher) => (
												<div className="data-row" key={teacher.teacherId}>
													<div>{teacher.teacherName}</div>
													<div>{teacher.subjectNames.join(", ")}</div>
													<div>{teacher.years.join(", ")}</div>
													<div>{teacher.assignmentCount}</div>
												</div>
											))}
											{selectedGroupDetail.teachers.length === 0 && (
												<div className="empty">
													Bu qrup üçün dərs təyinatı tapılmadı.
												</div>
											)}
										</div>
									</div>

									<div className="card">
										<div className="section-header">
											<div>
												<div className="section-kicker">Siyahı</div>
												<div className="section-title">Şagirdlər</div>
												<div className="meta">
													Qrupa bağlı şagirdlərin siyahısı.
												</div>
											</div>
											<div className="stat-pill">
												Cəmi: {selectedGroupDetail.studentCount}
											</div>
										</div>
										<div className="data-table">
											<div className="data-row header">
												<div>Şagird</div>
												<div>Login</div>
												<div>Sinif səviyyəsi</div>
											</div>
											{studentPagination.paginatedItems.map((student) => (
												<div className="data-row" key={student.id}>
													<div>{student.data.name}</div>
													<div>{student.data.login ?? "-"}</div>
													<div>{student.data.classLevel}</div>
												</div>
											))}
											{selectedGroupDetail.students.length === 0 && (
												<div className="empty">
													Bu qrup üçün şagird tapılmadı.
												</div>
											)}
										</div>
										{selectedGroupDetail.students.length > 0 && (
											<PaginationControls
												totalItems={studentPagination.totalItems}
												page={studentPagination.page}
												pageSize={studentPagination.pageSize}
												onPageChange={studentPagination.setPage}
												onPageSizeChange={studentPagination.setPageSize}
											/>
										)}
									</div>
								</div>
							)}
						</div>
					</div>
				</DialogContent>
			</Dialog>
			{dialog}
		</div>
	);
};
