import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useConfirmDialog } from "../../components/ConfirmDialog";
import { ORG_ID, supabase } from "../../lib/supabase";
import {
	mapDepartmentRow,
	mapGroupRow,
	mapSubjectRow,
	mapTeacherRow,
	mapTeachingAssignmentRow,
} from "../../lib/supabaseMappers";
import type {
	DepartmentDoc,
	GroupDoc,
	SubjectDoc,
	TeacherCategory,
	TeacherDoc,
	TeachingAssignmentDoc,
} from "../../lib/types";
import { createId } from "../../lib/utils";
import { useAuth } from "../auth/AuthProvider";
import { BranchSelector } from "./BranchSelector";
import { parseSpreadsheet } from "./importUtils";
import { useBranchScope } from "./useBranchScope";
import { provisionLoginUser } from "./userProvisioning";

const buildFullName = (first: string, last: string) => {
	const full = `${first.trim()} ${last.trim()}`.trim();
	return full.replace(/\s+/g, " ");
};

const splitName = (value: string) => {
	const parts = value.trim().split(/\s+/).filter(Boolean);
	const first = parts[0] ?? "";
	const last = parts.length > 1 ? parts.slice(1).join(" ") : (parts[0] ?? "");
	return { first, last };
};

const uploadTeacherPhoto = async (teacherId: string, file: File) => {
	const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
	const path = `teachers/${teacherId}/${Date.now()}_${safeName}`;
	const { error } = await supabase.storage
		.from("teacher-photos")
		.upload(path, file, {
			upsert: true,
		});
	if (error) throw error;
	const { data } = supabase.storage.from("teacher-photos").getPublicUrl(path);
	return data.publicUrl;
};

type DocEntry<T> = { id: string; data: T };

const teacherCategories: Array<{ value: TeacherCategory; label: string }> = [
	{ value: "standard", label: "Əsas (BİQ + imtahan)" },
	{ value: "drama_gym", label: "Dram/Gimnastika" },
	{ value: "chess", label: "Şahmat" },
];

const parseTeacherCategory = (raw?: string | null): TeacherCategory => {
	const value = (raw ?? "").trim().toLowerCase();
	if (!value) return "standard";
	if (value.includes("dram") || value.includes("gim")) return "drama_gym";
	if (value.includes("şah") || value.includes("sah") || value.includes("chess"))
		return "chess";
	if (
		value.includes("standart") ||
		value.includes("əsas") ||
		value.includes("esas")
	)
		return "standard";
	return "standard";
};

const DEFAULT_DEPARTMENT_NAME = "Ümumi";

export const BranchTeachersPage = () => {
	const { user } = useAuth();
	const { confirm, dialog } = useConfirmDialog();
	const { branchId, setBranchId, branches, branchName, isSuperAdmin } =
		useBranchScope();
	const [teachers, setTeachers] = useState<Array<DocEntry<TeacherDoc>>>([]);
	const [departments, setDepartments] = useState<
		Array<DocEntry<DepartmentDoc>>
	>([]);
	const [subjects, setSubjects] = useState<Array<DocEntry<SubjectDoc>>>([]);
	const [groups, setGroups] = useState<Array<DocEntry<GroupDoc>>>([]);
	const [assignments, setAssignments] = useState<
		Array<DocEntry<TeachingAssignmentDoc>>
	>([]);

	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [departmentId, setDepartmentId] = useState("");
	const [category, setCategory] = useState<TeacherCategory>("standard");
	const [photoFile, setPhotoFile] = useState<File | null>(null);
	const [photoPreview, setPhotoPreview] = useState<string | null>(null);

	const [assignmentYear, setAssignmentYear] = useState(
		new Date().getFullYear().toString(),
	);
	const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
	const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

	const [filterDepartmentId, setFilterDepartmentId] = useState("");
	const [filterSubjectId, setFilterSubjectId] = useState("");
	const [filterGroupId, setFilterGroupId] = useState("");
	const [filterClassLevel, setFilterClassLevel] = useState("");

	const [editingId, setEditingId] = useState<string | null>(null);
	const [editFirstName, setEditFirstName] = useState("");
	const [editLastName, setEditLastName] = useState("");
	const [editDepartmentId, setEditDepartmentId] = useState("");
	const [editCategory, setEditCategory] = useState<TeacherCategory>("standard");
	const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
	const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);
	const [savingEdit, setSavingEdit] = useState(false);

	const [importDepartmentId, setImportDepartmentId] = useState("");
	const [status, setStatus] = useState<string | null>(null);

	const loadLookups = async () => {
		if (!branchId) {
			setTeachers([]);
			setDepartments([]);
			setGroups([]);
			setAssignments([]);
			return;
		}

		const [teacherRes, departmentRes, subjectRes, groupRes, assignmentRes] =
			await Promise.all([
				supabase
					.from("teachers")
					.select("*")
					.eq("org_id", ORG_ID)
					.is("deleted_at", null)
					.eq("branch_id", branchId),
				supabase
					.from("departments")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("branch_id", branchId)
					.is("deleted_at", null),
				supabase
					.from("subjects")
					.select("*")
					.eq("org_id", ORG_ID)
					.is("deleted_at", null),
				supabase
					.from("groups")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("branch_id", branchId)
					.is("deleted_at", null),
				supabase
					.from("teaching_assignments")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("branch_id", branchId)
					.is("deleted_at", null),
			]);

		setTeachers(
			(teacherRes.data ?? []).map((row) => ({
				id: row.id,
				data: mapTeacherRow(row),
			})),
		);
		setDepartments(
			(departmentRes.data ?? []).map((row) => ({
				id: row.id,
				data: mapDepartmentRow(row),
			})),
		);
		setSubjects(
			(subjectRes.data ?? []).map((row) => ({
				id: row.id,
				data: mapSubjectRow(row),
			})),
		);
		setGroups(
			(groupRes.data ?? []).map((row) => ({
				id: row.id,
				data: mapGroupRow(row),
			})),
		);
		setAssignments(
			(assignmentRes.data ?? []).map((row) => ({
				id: row.id,
				data: mapTeachingAssignmentRow(row),
			})),
		);
	};

	useEffect(() => {
		void loadLookups();
	}, [branchId]);

	useEffect(() => {
		if (!photoFile) {
			setPhotoPreview(null);
			return;
		}
		const preview = URL.createObjectURL(photoFile);
		setPhotoPreview(preview);
		return () => URL.revokeObjectURL(preview);
	}, [photoFile]);

	useEffect(() => {
		if (!editPhotoFile) {
			setEditPhotoPreview(null);
			return;
		}
		const preview = URL.createObjectURL(editPhotoFile);
		setEditPhotoPreview(preview);
		return () => URL.revokeObjectURL(preview);
	}, [editPhotoFile]);

	useEffect(() => {
		if (departments.length === 0) return;
		const normalizedDefault = DEFAULT_DEPARTMENT_NAME.toLowerCase();
		const defaultDepartment =
			departments.find(
				(department) =>
					department.data.name.trim().toLowerCase() === normalizedDefault,
			) ?? departments[0];
		if (!departmentId) {
			setDepartmentId(defaultDepartment.id);
		}
		if (!importDepartmentId) {
			setImportDepartmentId(defaultDepartment.id);
		}
	}, [departments, departmentId, importDepartmentId]);

	const groupMap = useMemo(
		() => Object.fromEntries(groups.map((g) => [g.id, g.data])),
		[groups],
	);
	const departmentMap = useMemo(
		() => Object.fromEntries(departments.map((d) => [d.id, d.data])),
		[departments],
	);

	const assignmentMap = useMemo(() => {
		const map: Record<string, TeachingAssignmentDoc[]> = {};
		assignments.forEach((assignment) => {
			map[assignment.data.teacherId] = map[assignment.data.teacherId] || [];
			map[assignment.data.teacherId].push(assignment.data);
		});
		return map;
	}, [assignments]);

	const filteredTeachers = useMemo(() => {
		return teachers.filter((teacher) => {
			if (
				filterDepartmentId &&
				teacher.data.departmentId !== filterDepartmentId
			)
				return false;
			const teacherAssignments = assignmentMap[teacher.id] ?? [];
			if (
				filterSubjectId &&
				!teacherAssignments.some((item) => item.subjectId === filterSubjectId)
			)
				return false;
			if (
				filterGroupId &&
				!teacherAssignments.some((item) => item.groupId === filterGroupId)
			)
				return false;
			if (filterClassLevel) {
				const matchesClass = teacherAssignments.some(
					(item) => groupMap[item.groupId]?.classLevel === filterClassLevel,
				);
				if (!matchesClass) return false;
			}
			return true;
		});
	}, [
		teachers,
		filterDepartmentId,
		filterSubjectId,
		filterGroupId,
		filterClassLevel,
		assignmentMap,
		groupMap,
	]);

	const summary = useMemo(() => filteredTeachers.length, [filteredTeachers]);
	const displayBranchName = branchName || "Filial";
	const selectedAssignmentCount =
		selectedGroupIds.length * selectedSubjectIds.length;

	const toggleSubject = (subjectId: string) => {
		setSelectedSubjectIds((prev) =>
			prev.includes(subjectId)
				? prev.filter((id) => id !== subjectId)
				: [...prev, subjectId],
		);
	};

	const toggleGroup = (groupId: string) => {
		setSelectedGroupIds((prev) =>
			prev.includes(groupId)
				? prev.filter((id) => id !== groupId)
				: [...prev, groupId],
		);
	};

	const selectAllSubjects = () => {
		setSelectedSubjectIds(subjects.map((subject) => subject.id));
	};

	const clearSubjects = () => {
		setSelectedSubjectIds([]);
	};

	const selectAllGroups = () => {
		setSelectedGroupIds(groups.map((group) => group.id));
	};

	const clearGroups = () => {
		setSelectedGroupIds([]);
	};

	const ensureDefaultDepartmentId = async () => {
		if (!branchId) {
			throw new Error("Filial seçilməyib");
		}

		const normalizedDefault = DEFAULT_DEPARTMENT_NAME.toLowerCase();
		const localMatch = departments.find(
			(department) =>
				department.data.name.trim().toLowerCase() === normalizedDefault,
		);
		if (localMatch) return localMatch.id;

		const { data: existing, error: loadError } = await supabase
			.from("departments")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("branch_id", branchId)
			.is("deleted_at", null)
			.ilike("name", DEFAULT_DEPARTMENT_NAME)
			.limit(1)
			.maybeSingle();

		if (loadError) {
			throw loadError;
		}

		if (existing?.id) {
			setDepartments((prev) => {
				if (prev.some((department) => department.id === existing.id))
					return prev;
				return [...prev, { id: existing.id, data: mapDepartmentRow(existing) }];
			});
			return existing.id;
		}

		const newId = createId();
		const { error: insertError } = await supabase.from("departments").insert({
			id: newId,
			org_id: ORG_ID,
			branch_id: branchId,
			name: DEFAULT_DEPARTMENT_NAME,
		});

		if (insertError) {
			if (insertError.code === "23505") {
				const { data: fallback, error: fallbackError } = await supabase
					.from("departments")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("branch_id", branchId)
					.is("deleted_at", null)
					.ilike("name", DEFAULT_DEPARTMENT_NAME)
					.limit(1)
					.maybeSingle();
				if (fallbackError) throw fallbackError;
				if (fallback?.id) return fallback.id;
			}
			throw insertError;
		}

		setDepartments((prev) => [
			...prev,
			{ id: newId, data: { name: DEFAULT_DEPARTMENT_NAME, branchId } },
		]);
		return newId;
	};

	const handleCreate = async () => {
		if (!branchId) {
			setStatus("Filial seçilməyib. Davam etmək üçün filial seçin.");
			return;
		}
		if (!firstName.trim() || !lastName.trim()) {
			setStatus("Ad və soyad tələb olunur");
			return;
		}
		if (selectedGroupIds.length === 0) {
			setStatus("Ən azı bir sinif (qrup) seçin");
			return;
		}
		if (selectedSubjectIds.length === 0) {
			setStatus("Ən azı bir fənn seçin");
			return;
		}
		const year = Number(assignmentYear);
		if (!assignmentYear || Number.isNaN(year)) {
			setStatus("Dərs ili düzgün seçilməyib");
			return;
		}

		const fullName = buildFullName(firstName, lastName);

		try {
			const resolvedDepartmentId =
				departmentId || (await ensureDefaultDepartmentId());
			if (!departmentId) {
				setDepartmentId(resolvedDepartmentId);
			}

			const result = await provisionLoginUser({
				name: fullName,
				branchId,
				role: "teacher",
				collection: "teachers",
				docData: {
					firstName: firstName.trim(),
					lastName: lastName.trim(),
					departmentId: resolvedDepartmentId,
					teacherCategory: category,
				},
			});

			let photoUrl: string | null = null;
			if (photoFile) {
				photoUrl = await uploadTeacherPhoto(result.uid, photoFile);
				const { error: photoError } = await supabase
					.from("teachers")
					.update({ photo_url: photoUrl })
					.eq("org_id", ORG_ID)
					.eq("id", result.uid);
				if (photoError) throw photoError;
			}

			const rows = selectedSubjectIds.flatMap((subjectId) =>
				selectedGroupIds.map((groupId) => ({
					id: createId(),
					org_id: ORG_ID,
					teacher_id: result.uid,
					group_id: groupId,
					subject_id: subjectId,
					branch_id: branchId,
					year,
				})),
			);

			const { error: assignmentError } = await supabase
				.from("teaching_assignments")
				.upsert(rows, {
					onConflict:
						"org_id,teacher_id,group_id,subject_id,branch_id,year",
				});
			if (assignmentError) throw assignmentError;

			setFirstName("");
			setLastName("");
			setCategory("standard");
			setPhotoFile(null);
			setPhotoPreview(null);
			setSelectedGroupIds([]);
			setSelectedSubjectIds([]);
			setStatus(`Login: ${result.login} • Şifrə: ${result.password}`);
			await loadLookups();
		} catch (error) {
			setStatus(
				error instanceof Error ? error.message : "Yaratma zamanı xəta oldu",
			);
		}
	};

	const handleDelete = async (teacherId: string) => {
		const ok = await confirm({
			title: "Müəllimi sil",
			message: "Müəllimi silmək istədiyinizə əminsiniz?",
			confirmText: "Sil",
			cancelText: "İmtina",
			tone: "danger",
		});
		if (!ok) return;
		await supabase
			.from("teachers")
			.update({
				deleted_at: new Date().toISOString(),
				deleted_by: user?.id ?? null,
			})
			.eq("org_id", ORG_ID)
			.eq("id", teacherId);
		await loadLookups();
	};

	const handleEditStart = (teacher: DocEntry<TeacherDoc>) => {
		setEditingId(teacher.id);
		setEditFirstName(teacher.data.firstName ?? "");
		setEditLastName(teacher.data.lastName ?? "");
		setEditDepartmentId(teacher.data.departmentId ?? "");
		setEditCategory(teacher.data.category ?? "standard");
		setEditPhotoFile(null);
		setEditPhotoPreview(teacher.data.photoUrl ?? null);
		setStatus(null);
	};

	const handleEditCancel = () => {
		setEditingId(null);
		setEditFirstName("");
		setEditLastName("");
		setEditDepartmentId("");
		setEditCategory("standard");
		setEditPhotoFile(null);
		setEditPhotoPreview(null);
	};

	const handleEditSave = async () => {
		if (!editingId) return;
		if (!editFirstName.trim() || !editLastName.trim()) {
			setStatus("Ad və soyad tələb olunur");
			return;
		}
		if (!editDepartmentId) {
			setStatus("Kafedra seçilməlidir");
			return;
		}

		setSavingEdit(true);
		try {
			const fullName = buildFullName(editFirstName, editLastName);
			let photoUrl = editPhotoPreview;
			if (editPhotoFile) {
				photoUrl = await uploadTeacherPhoto(editingId, editPhotoFile);
			}

			const { error } = await supabase
				.from("teachers")
				.update({
					name: fullName,
					first_name: editFirstName.trim(),
					last_name: editLastName.trim(),
					department_id: editDepartmentId,
					teacher_category: editCategory,
					photo_url: photoUrl ?? null,
				})
				.eq("org_id", ORG_ID)
				.eq("id", editingId);

			if (error) {
				throw error;
			}

			setStatus("Müəllim yeniləndi");
			setEditingId(null);
			setEditFirstName("");
			setEditLastName("");
			setEditDepartmentId("");
			setEditCategory("standard");
			setEditPhotoFile(null);
			setEditPhotoPreview(null);
			await loadLookups();
		} catch (error) {
			setStatus(
				error instanceof Error ? error.message : "Yeniləmə zamanı xəta oldu",
			);
		} finally {
			setSavingEdit(false);
		}
	};

	const handleImport = async (file: File) => {
		if (!branchId) {
			setStatus("Filial seçilməyib. Import üçün filial seçin.");
			return;
		}

		let resolvedDepartmentId = importDepartmentId;
		try {
			if (!resolvedDepartmentId) {
				resolvedDepartmentId = await ensureDefaultDepartmentId();
				setImportDepartmentId(resolvedDepartmentId);
			}
		} catch (error) {
			setStatus(
				error instanceof Error ? error.message : "Kafedra seçilməsi alınmadı",
			);
			return;
		}

		const rows = await parseSpreadsheet(file);
		const existingNames = new Set(
			teachers.map((teacher) => teacher.data.name.toLowerCase()),
		);
		const seen = new Set<string>();

		let missing = 0;
		let duplicates = 0;
		let mismatch = 0;
		let created = 0;
		let failed = 0;
		let lastErrorMessage: string | null = null;

		const cleaned = rows.filter((row) => {
			if (!row.name) {
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

		for (const row of cleaned) {
			try {
				const parsed = splitName(row.name);
				const categoryValue = parseTeacherCategory(
					row.category || row.kateqoriya || row.teacher_category,
				);
				await provisionLoginUser({
					name: buildFullName(parsed.first, parsed.last),
					branchId,
					role: "teacher",
					collection: "teachers",
					docData: {
						firstName: parsed.first,
						lastName: parsed.last,
						departmentId: resolvedDepartmentId,
						teacherCategory: categoryValue,
					},
				});
				created += 1;
			} catch (error) {
				failed += 1;
				lastErrorMessage =
					error instanceof Error ? error.message : "Yaratma zamanı xəta oldu";
			}
		}

		const errorSuffix = lastErrorMessage
			? ` Son xəta: ${lastErrorMessage}`
			: "";
		setStatus(
			`Bulk import tamamlandı. Created: ${created}, Failed: ${failed}, Missing: ${missing}, Duplicate: ${duplicates}, Branch mismatch: ${mismatch}.${errorSuffix}`,
		);
		await loadLookups();
	};

	return (
		<div className="panel branch-page">
			<div className="page-hero">
				<div className="page-hero__content">
					<div className="eyebrow">Filial heyəti</div>
					<h1>Müəllimlər</h1>
					<p>
						Filiala aid müəllim siyahısı, kafedra bölgüsü və dərs təyinatları.
					</p>
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
			{status && <div className="notice">{status}</div>}

			<div className="page-grid">
				<div className="stack">
					<div className="card">
						<h3>Yeni müəllim</h3>
						<div className="form-grid">
							<input
								className="input"
								placeholder="Ad"
								value={firstName}
								onChange={(event) => setFirstName(event.target.value)}
							/>
							<input
								className="input"
								placeholder="Soyad"
								value={lastName}
								onChange={(event) => setLastName(event.target.value)}
							/>
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
							<select
								className="input"
								value={category}
								onChange={(event) =>
									setCategory(event.target.value as TeacherCategory)
								}
							>
								{teacherCategories.map((item) => (
									<option key={item.value} value={item.value}>
										{item.label}
									</option>
								))}
							</select>
							<input
								className="input"
								type="file"
								accept="image/*"
								onChange={(event) =>
									setPhotoFile(event.target.files?.[0] ?? null)
								}
							/>
						</div>
						{photoPreview && (
							<div className="form-row">
								<img
									src={photoPreview}
									alt="Müəllim şəkli"
									style={{ width: 72, height: 72, borderRadius: 16 }}
								/>
							</div>
						)}
						<div className="divider" />
						<h4>Dərs təyinatı</h4>
						<p className="hint">
							Müəllimin dərs dediyi sinifləri və fənləri seçin. Seçilən hər
							sinif + fənn üçün təyinat yaradılacaq.
						</p>
						<div className="form-row">
							<div className="field">
								<span>Dərs ili</span>
								<input
									className="input"
									type="number"
									placeholder="İl"
									value={assignmentYear}
									onChange={(event) => setAssignmentYear(event.target.value)}
								/>
							</div>
							<div className="tag">
								Təyinat: {selectedAssignmentCount || 0}
							</div>
						</div>
						<div className="stack">
							<div className="section-header">
								<div className="section-kicker">Fənnlər</div>
								<div className="actions">
									<button
										className="btn ghost"
										type="button"
										onClick={selectAllSubjects}
									>
										Hamısını seç
									</button>
									<button
										className="btn ghost"
										type="button"
										onClick={clearSubjects}
									>
										Təmizlə
									</button>
								</div>
							</div>
							<div className="check-grid">
								{subjects.map((subject) => {
									const active = selectedSubjectIds.includes(subject.id);
									return (
										<label
											key={subject.id}
											className={`check-item${active ? " active" : ""}`}
										>
											<input
												type="checkbox"
												checked={active}
												onChange={() => toggleSubject(subject.id)}
											/>
											<span>{subject.data.name}</span>
										</label>
									);
								})}
							</div>
							<div className="section-header">
								<div className="section-kicker">Siniflər (qruplar)</div>
								<div className="actions">
									<button
										className="btn ghost"
										type="button"
										onClick={selectAllGroups}
									>
										Hamısını seç
									</button>
									<button
										className="btn ghost"
										type="button"
										onClick={clearGroups}
									>
										Təmizlə
									</button>
								</div>
							</div>
							<div className="check-grid">
								{groups.map((group) => {
									const active = selectedGroupIds.includes(group.id);
									return (
										<label
											key={group.id}
											className={`check-item${active ? " active" : ""}`}
										>
											<input
												type="checkbox"
												checked={active}
												onChange={() => toggleGroup(group.id)}
											/>
											<span>
												{group.data.name} ({group.data.classLevel})
											</span>
										</label>
									);
								})}
							</div>
						</div>
						<div className="form-row">
							<button
								className="btn primary"
								type="button"
								onClick={handleCreate}
								disabled={!branchId}
							>
								Yarat
							</button>
							<span className="hint">
								Şifrə default olaraq login ilə eynidir.
							</span>
						</div>
					</div>

					{editingId && (
						<div className="card">
							<h3>Müəllimi redaktə et</h3>
							<div className="form-grid">
								<input
									className="input"
									placeholder="Ad"
									value={editFirstName}
									onChange={(event) => setEditFirstName(event.target.value)}
								/>
								<input
									className="input"
									placeholder="Soyad"
									value={editLastName}
									onChange={(event) => setEditLastName(event.target.value)}
								/>
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
								<select
									className="input"
									value={editCategory}
									onChange={(event) =>
										setEditCategory(event.target.value as TeacherCategory)
									}
								>
									{teacherCategories.map((item) => (
										<option key={item.value} value={item.value}>
											{item.label}
										</option>
									))}
								</select>
								<input
									className="input"
									type="file"
									accept="image/*"
									onChange={(event) =>
										setEditPhotoFile(event.target.files?.[0] ?? null)
									}
								/>
							</div>
							{editPhotoPreview && (
								<div className="form-row">
									<img
										src={editPhotoPreview}
										alt="Müəllim şəkli"
										style={{ width: 72, height: 72, borderRadius: 16 }}
									/>
								</div>
							)}
							<div className="form-row">
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
							</div>
						</div>
					)}

					<div className="card">
						<h3>Bulk import</h3>
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
								Şablon sütunları: name, category (optional), branchId (optional)
							</span>
						</div>
					</div>
				</div>

				<div className="card">
					<div className="section-header">
						<div>
							<div className="section-kicker">Siyahı</div>
							<div className="section-title">Müəllimlər</div>
							<p>Filial: {displayBranchName}</p>
						</div>
					</div>
					<div className="filters">
						<select
							className="input"
							value={filterDepartmentId}
							onChange={(event) => setFilterDepartmentId(event.target.value)}
						>
							<option value="">Kafedra</option>
							{departments.map((department) => (
								<option key={department.id} value={department.id}>
									{department.data.name}
								</option>
							))}
						</select>
						<select
							className="input"
							value={filterSubjectId}
							onChange={(event) => setFilterSubjectId(event.target.value)}
						>
							<option value="">Fənn</option>
							{subjects.map((subject) => (
								<option key={subject.id} value={subject.id}>
									{subject.data.name}
								</option>
							))}
						</select>
						<select
							className="input"
							value={filterGroupId}
							onChange={(event) => setFilterGroupId(event.target.value)}
						>
							<option value="">Qrup</option>
							{groups.map((group) => (
								<option key={group.id} value={group.id}>
									{group.data.name}
								</option>
							))}
						</select>
						<select
							className="input"
							value={filterClassLevel}
							onChange={(event) => setFilterClassLevel(event.target.value)}
						>
							<option value="">Sinif səviyyəsi</option>
							{[...new Set(groups.map((group) => group.data.classLevel))].map(
								(level) => (
									<option key={level} value={level}>
										{level}
									</option>
								),
							)}
						</select>
					</div>

					<div className="data-table">
						<div className="data-row header">
							<div>Müəllim</div>
							<div>Kafedra</div>
							<div>Kateqoriya</div>
							<div>Login</div>
							<div>Dərslər</div>
							<div></div>
						</div>
						{filteredTeachers.map((teacher) => {
							const teacherAssignments = assignmentMap[teacher.id] ?? [];
							return (
								<div className="data-row" key={teacher.id}>
									<div className="stack">
										<div className="list-title">{teacher.data.name}</div>
										{teacher.data.photoUrl && (
											<img
												src={teacher.data.photoUrl}
												alt="Şəkil"
												style={{ width: 48, height: 48, borderRadius: 12 }}
											/>
										)}
									</div>
									<div>
										{departmentMap[teacher.data.departmentId ?? ""]?.name ??
											"-"}
									</div>
									<div>
										{teacherCategories.find(
											(item) =>
												item.value === (teacher.data.category ?? "standard"),
										)?.label ?? "-"}
									</div>
									<div>{teacher.data.login ?? "-"}</div>
									<div>{teacherAssignments.length} təyinat</div>
									<div className="actions">
										<button
											className="btn"
											type="button"
											onClick={() => handleEditStart(teacher)}
										>
											Redaktə
										</button>
										<Link
											className="btn ghost"
											to={`/branch/assignments?teacherId=${teacher.id}`}
										>
											Təyinat yarat
										</Link>
										<button
											className="btn ghost"
											type="button"
											onClick={() => void handleDelete(teacher.id)}
										>
											Sil
										</button>
									</div>
								</div>
							);
						})}
						{filteredTeachers.length === 0 && (
							<div className="empty">Məlumat yoxdur.</div>
						)}
					</div>
				</div>
			</div>
			{dialog}
		</div>
	);
};
