import { useCallback, useEffect, useMemo, useState } from "react";
import { useFeedbackState } from "../../components/feedback/FeedbackProvider";
import { Link, useSearchParams } from "react-router-dom";
import { useConfirmDialog } from "../../components/ConfirmDialog";
import { PaginationControls } from "../../components/PaginationControls";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "../../components/ui/dialog";
import { ORG_ID, supabase } from "../../lib/supabase";
import {
	mapGroupRow,
	mapSubjectRow,
	mapTeacherRow,
	mapTeachingAssignmentRow,
} from "../../lib/supabaseMappers";
import type {
	GroupDoc,
	SubjectDoc,
	TeacherDoc,
	TeachingAssignmentDoc,
} from "../../lib/types";
import { useAuth } from "../auth/AuthProvider";
import { BranchSelector } from "./BranchSelector";
import { parseSpreadsheet } from "./importUtils";
import { useBranchScope } from "./useBranchScope";

type TeacherAssignmentDetail = {
	assignmentId: string;
	groupName: string;
	subjectName: string;
	year: number;
};

type TeacherAssignmentSummary = {
	teacherId: string;
	teacherName: string;
	assignmentCount: number;
	classCount: number;
	subjectCount: number;
	years: number[];
	details: TeacherAssignmentDetail[];
};

export const BranchAssignmentsPage = () => {
	const { user } = useAuth();
	const { confirm, dialog } = useConfirmDialog();
	const { branchId, setBranchId, branches, isSuperAdmin } = useBranchScope();
	const [searchParams] = useSearchParams();
	const [teachers, setTeachers] = useState<
		Array<{ id: string; data: TeacherDoc }>
	>([]);
	const [groups, setGroups] = useState<Array<{ id: string; data: GroupDoc }>>(
		[],
	);
	const [subjects, setSubjects] = useState<
		Array<{ id: string; data: SubjectDoc }>
	>([]);
	const [assignments, setAssignments] = useState<
		Array<{ id: string; data: TeachingAssignmentDoc }>
	>([]);
	const [teacherId, setTeacherId] = useState("");
	const [groupId, setGroupId] = useState("");
	const [subjectId, setSubjectId] = useState("");
	const [year, setYear] = useState(String(new Date().getFullYear()));
	const [status, setStatus] = useFeedbackState();
	const [searchQuery, setSearchQuery] = useState("");
	const [teacherPage, setTeacherPage] = useState(1);
	const [teacherPageSize, setTeacherPageSize] = useState(15);
	const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(
		null,
	);

	const preselectedTeacherId = searchParams.get("teacherId") ?? "";

	const loadData = useCallback(async () => {
		if (!branchId) {
			setTeachers([]);
			setGroups([]);
			setSubjects([]);
			setAssignments([]);
			return;
		}

		let teachersQuery = supabase
			.from("teachers")
			.select("*")
			.eq("org_id", ORG_ID)
			.is("deleted_at", null);
		let groupsQuery = supabase
			.from("groups")
			.select("*")
			.eq("org_id", ORG_ID)
			.is("deleted_at", null);
		let assignmentsQuery = supabase
			.from("teaching_assignments")
			.select("*")
			.eq("org_id", ORG_ID)
			.is("deleted_at", null);
		const subjectsQuery = supabase
			.from("subjects")
			.select("*")
			.eq("org_id", ORG_ID)
			.is("deleted_at", null);

		teachersQuery = teachersQuery.or(
			`branch_id.eq.${branchId},branch_ids.cs.{${branchId}}`,
		);
		groupsQuery = groupsQuery.eq("branch_id", branchId);
		assignmentsQuery = assignmentsQuery.eq("branch_id", branchId);

		const [teachersRes, groupsRes, subjectsRes, assignmentsRes] =
			await Promise.all([
				teachersQuery,
				groupsQuery,
				subjectsQuery,
				assignmentsQuery,
			]);

		const teacherDocs = (teachersRes.data ?? []).map((row) => ({
			id: row.id,
			data: mapTeacherRow(row),
		}));
		const groupDocs = (groupsRes.data ?? []).map((row) => ({
			id: row.id,
			data: mapGroupRow(row),
		}));
		const subjectDocs = (subjectsRes.data ?? []).map((row) => ({
			id: row.id,
			data: mapSubjectRow(row),
		}));
		const assignmentDocs = (assignmentsRes.data ?? []).map((row) => ({
			id: row.id,
			data: mapTeachingAssignmentRow(row),
		}));

		setTeachers(
			teacherDocs.filter((teacher) => {
				if (teacher.data.branchId === branchId) return true;
				return (teacher.data.branchIds ?? []).includes(branchId);
			}),
		);
		setGroups(groupDocs.filter((group) => group.data.branchId === branchId));
		setSubjects(subjectDocs);
		setAssignments(
			assignmentDocs.filter(
				(assignment) => assignment.data.branchId === branchId,
			),
		);
	}, [branchId]);

	useEffect(() => {
		void loadData();
	}, [loadData]);

	useEffect(() => {
		if (!teacherId && preselectedTeacherId) {
			setTeacherId(preselectedTeacherId);
		}
	}, [preselectedTeacherId, teacherId]);

	const handleCreate = async () => {
		if (!branchId) {
			setStatus("Filial seçilməyib. Davam etmək üçün filial seçin.");
			return;
		}
		if (!teacherId || !groupId || !subjectId || !year) {
			setStatus("Bütün sahələri doldurun");
			return;
		}

		const { error } = await supabase.from("teaching_assignments").insert({
			org_id: ORG_ID,
			teacher_id: teacherId,
			group_id: groupId,
			subject_id: subjectId,
			branch_id: branchId,
			year: Number(year),
		});

		if (error) {
			setStatus(error.message || "Yaratma zamanı xəta oldu");
			return;
		}

		setTeacherId("");
		setGroupId("");
		setSubjectId("");
		setStatus("Təyinat yaradıldı");
		await loadData();
	};

	const handleDelete = async (assignmentId: string) => {
		const ok = await confirm({
			title: "Təyinatı sil",
			message: "Təyinatı silmək istədiyinizə əminsiniz?",
			confirmText: "Sil",
			cancelText: "İmtina",
			tone: "danger",
		});
		if (!ok) return;
		await supabase
			.from("teaching_assignments")
			.update({
				deleted_at: new Date().toISOString(),
				deleted_by: user?.id ?? null,
			})
			.eq("org_id", ORG_ID)
			.eq("id", assignmentId);
		await loadData();
	};

	const handleImport = async (file: File) => {
		if (!branchId) {
			setStatus("Filial seçilməyib. Import üçün filial seçin.");
			return;
		}
		const rows = await parseSpreadsheet(file);
		const teacherIdByName = Object.fromEntries(
			teachers.map((teacher) => [teacher.data.name.trim().toLowerCase(), teacher.id]),
		);
		const groupIdByName = Object.fromEntries(
			groups.map((group) => [group.data.name.trim().toLowerCase(), group.id]),
		);
		const subjectIdByName = Object.fromEntries(
			subjects.map((subject) => [subject.data.name.trim().toLowerCase(), subject.id]),
		);
		const existingKeys = new Set(
			assignments.map(
				(assignment) =>
					`${assignment.data.teacherId}|${assignment.data.groupId}|${assignment.data.subjectId}|${assignment.data.year}`,
			),
		);
		const seen = new Set<string>();

		let missing = 0;
		let duplicates = 0;
		let mismatch = 0;

		const cleaned: Array<{
			teacherId: string;
			groupId: string;
			subjectId: string;
			year: number;
		}> = [];

		rows.forEach((row) => {
			const resolvedTeacherId =
				row.teacherId?.trim() ||
				teacherIdByName[(row.teacherName || row.teacher || "").trim().toLowerCase()] ||
				"";
			const resolvedGroupId =
				row.groupId?.trim() ||
				groupIdByName[(row.groupName || row.group || "").trim().toLowerCase()] ||
				"";
			const resolvedSubjectId =
				row.subjectId?.trim() ||
				subjectIdByName[(row.subjectName || row.subject || "").trim().toLowerCase()] ||
				"";
			const yearNumber = Number(row.year);

			if (
				!resolvedTeacherId ||
				!resolvedGroupId ||
				!resolvedSubjectId ||
				!Number.isInteger(yearNumber)
			) {
				missing += 1;
				return;
			}
			if (row.branchId && row.branchId !== branchId) {
				mismatch += 1;
				return;
			}
			const key = `${resolvedTeacherId}|${resolvedGroupId}|${resolvedSubjectId}|${yearNumber}`;
			if (seen.has(key) || existingKeys.has(key)) {
				duplicates += 1;
				return;
			}
			seen.add(key);
			cleaned.push({
				teacherId: resolvedTeacherId,
				groupId: resolvedGroupId,
				subjectId: resolvedSubjectId,
				year: yearNumber,
			});
		});

		if (cleaned.length === 0) {
			setStatus(
				`Fayl boşdur. Missing: ${missing}, Duplicate: ${duplicates}, Branch mismatch: ${mismatch}`,
			);
			return;
		}

		const { error } = await supabase.from("teaching_assignments").insert(
			cleaned.map((row) => ({
				org_id: ORG_ID,
				teacher_id: row.teacherId,
				group_id: row.groupId,
				subject_id: row.subjectId,
				branch_id: branchId,
				year: row.year,
			})),
		);

		if (error) {
			setStatus(error.message || "Bulk import zamanı xəta oldu");
			return;
		}

		setStatus(
			`Bulk import tamamlandı. Missing: ${missing}, Duplicate: ${duplicates}, Branch mismatch: ${mismatch}`,
		);
		await loadData();
	};

	const assignmentSummary = useMemo(() => assignments.length, [assignments]);
	const missingSetup = useMemo(() => {
		const missing: string[] = [];
		if (subjects.length === 0) missing.push("fənn");
		if (teachers.length === 0) missing.push("müəllim");
		if (groups.length === 0) missing.push("qrup");
		return missing;
	}, [subjects.length, teachers.length, groups.length]);
	const teacherNameById = useMemo(() => {
		const map: Record<string, string> = {};
		teachers.forEach((teacher) => {
			map[teacher.id] = teacher.data.name;
		});
		return map;
	}, [teachers]);
	const groupNameById = useMemo(() => {
		const map: Record<string, string> = {};
		groups.forEach((group) => {
			map[group.id] = group.data.name;
		});
		return map;
	}, [groups]);
	const subjectNameById = useMemo(() => {
		const map: Record<string, string> = {};
		subjects.forEach((subject) => {
			map[subject.id] = subject.data.name;
		});
		return map;
	}, [subjects]);
	const teacherAssignmentRows = useMemo<TeacherAssignmentSummary[]>(() => {
		const rows = new Map<
			string,
			{
				teacherId: string;
				teacherName: string;
				classIds: Set<string>;
				subjectIds: Set<string>;
				years: Set<number>;
				details: TeacherAssignmentDetail[];
			}
		>();

		assignments.forEach((assignment) => {
			const teacherKey = assignment.data.teacherId;
			const entry = rows.get(teacherKey) ?? {
				teacherId: teacherKey,
				teacherName: teacherNameById[teacherKey] ?? teacherKey,
				classIds: new Set<string>(),
				subjectIds: new Set<string>(),
				years: new Set<number>(),
				details: [],
			};

			entry.classIds.add(assignment.data.groupId);
			entry.subjectIds.add(assignment.data.subjectId);
			entry.years.add(assignment.data.year);
			entry.details.push({
				assignmentId: assignment.id,
				groupName:
					groupNameById[assignment.data.groupId] ?? assignment.data.groupId,
				subjectName:
					subjectNameById[assignment.data.subjectId] ?? assignment.data.subjectId,
				year: assignment.data.year,
			});

			rows.set(teacherKey, entry);
		});

		return Array.from(rows.values())
			.map((row) => ({
				teacherId: row.teacherId,
				teacherName: row.teacherName,
				assignmentCount: row.details.length,
				classCount: row.classIds.size,
				subjectCount: row.subjectIds.size,
				years: Array.from(row.years).sort((left, right) => right - left),
				details: row.details.sort((left, right) => {
					if (right.year !== left.year) return right.year - left.year;
					const groupCompare = left.groupName.localeCompare(right.groupName, "az");
					if (groupCompare !== 0) return groupCompare;
					return left.subjectName.localeCompare(right.subjectName, "az");
				}),
			}))
			.sort((left, right) =>
				left.teacherName.localeCompare(right.teacherName, "az"),
			);
	}, [assignments, groupNameById, subjectNameById, teacherNameById]);
	const filteredTeacherAssignmentRows = useMemo(() => {
		const query = searchQuery.trim().toLowerCase();
		if (!query) return teacherAssignmentRows;
		return teacherAssignmentRows.filter((row) =>
			[
				row.teacherName,
				...row.years.map(String),
				...row.details.flatMap((detail) => [detail.groupName, detail.subjectName]),
			]
				.join(" ")
				.toLowerCase()
				.includes(query),
		);
	}, [searchQuery, teacherAssignmentRows]);
	const teacherSummary = useMemo(
		() => teacherAssignmentRows.length,
		[teacherAssignmentRows],
	);
	const paginatedTeacherAssignmentRows = useMemo(() => {
		const start = (teacherPage - 1) * teacherPageSize;
		return filteredTeacherAssignmentRows.slice(start, start + teacherPageSize);
	}, [filteredTeacherAssignmentRows, teacherPage, teacherPageSize]);
	const selectedTeacherAssignments = useMemo(
		() =>
			teacherAssignmentRows.find(
				(row) => row.teacherId === selectedTeacherId,
			) ?? null,
		[teacherAssignmentRows, selectedTeacherId],
	);

	const canCreate = missingSetup.length === 0;

	useEffect(() => {
		if (selectedTeacherId && !selectedTeacherAssignments) {
			setSelectedTeacherId(null);
		}
	}, [selectedTeacherAssignments, selectedTeacherId]);

	useEffect(() => {
		setTeacherPage(1);
	}, [searchQuery, branchId]);

	return (
		<div className="panel branch-page">
			<div className="page-hero">
				<div className="page-hero__content">
					<div className="eyebrow">Təyinat idarəetməsi</div>
					<h1>
						Dərs təyinatları
						<span
							className="info-tip"
							data-tip="Müəllim–qrup–fənn–il əlaqəsi BİQ nəticələri və sorğu tapşırıqlarını düzgün hesablamaq üçün lazımdır."
						>
							i
						</span>
					</h1>
					<p>Müəllim, qrup, fənn və il üzrə əlaqə cədvəli.</p>
				</div>
				<div className="page-hero__aside">
					{isSuperAdmin && (
						<BranchSelector
							branchId={branchId}
							branches={branches}
							onChange={setBranchId}
						/>
					)}
					<div className="stat-pill">Müəllim: {teacherSummary}</div>
					<div className="stat-pill">Təyinat: {assignmentSummary}</div>
				</div>
			</div>
			{isSuperAdmin && !branchId && (
				<div className="notice">
					Filial seçilməyib. Davam etmək üçün filial seçin.
				</div>
			)}

			{missingSetup.length > 0 && (
				<div className="notice">
					Əvvəlcə {missingSetup.join(", ")} yaradın. Sonra müəllimi qrupa təyin
					edə bilərsiniz.{" "}
					<Link className="link" to="/branch/subjects">
						Fənnlər
					</Link>{" "}
					•{" "}
					<Link className="link" to="/branch/teachers">
						Müəllimlər
					</Link>{" "}
					•{" "}
					<Link className="link" to="/branch/groups">
						Qruplar
					</Link>
				</div>
			)}

			<div className="page-grid">
				<div className="card">
					<h3>Yeni təyinat</h3>
					<div className="form-grid">
						<select
							className="input"
							value={teacherId}
							onChange={(event) => setTeacherId(event.target.value)}
						>
							<option value="">Müəllim seçin</option>
							{teachers.map((teacher) => (
								<option key={teacher.id} value={teacher.id}>
									{teacher.data.name}
								</option>
							))}
						</select>
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
						<select
							className="input"
							value={subjectId}
							onChange={(event) => setSubjectId(event.target.value)}
						>
							<option value="">Fənn seçin</option>
							{subjects.map((subject) => (
								<option key={subject.id} value={subject.id}>
									{subject.data.name}
								</option>
							))}
						</select>
						<input
							className="input"
							placeholder="İl"
							value={year}
							onChange={(event) => setYear(event.target.value)}
						/>
						<button
							className="btn primary"
							type="button"
							onClick={handleCreate}
							disabled={!canCreate || !branchId}
						>
							Yarat
						</button>
					</div>
					<div className="form-row">
						<input
							className="input"
							type="file"
							accept=".csv,.xlsx"
							disabled={!canCreate || !branchId}
							onChange={(event) => {
								const file = event.target.files?.[0];
								if (file) void handleImport(file);
							}}
						/>
						<span className="hint">
							Şablon sütunları: teacherId/teacherName, groupId/groupName,
							subjectId/subjectName, year, branchId (istəyə bağlı)
						</span>
					</div>
					{status && <div className="notice">{status}</div>}
				</div>

				<div className="card">
					<div className="section-header">
						<div>
							<div className="section-kicker">Siyahı</div>
							<div className="section-title">Müəllim təyinatları</div>
							<div className="meta">
								Müəllim adına klik edin: sinif və fənn siyahısı drawer içində
								açılacaq.
							</div>
						</div>
					</div>
					<div className="form-row">
						<input
							className="input"
							placeholder="Müəllim, sinif və ya fənn axtar..."
							value={searchQuery}
							onChange={(event) => setSearchQuery(event.target.value)}
						/>
					</div>
					<div className="data-table">
						<div className="data-row header">
							<div>Müəllim</div>
							<div>Sinif sayı</div>
							<div>Fənn sayı</div>
							<div>İllər</div>
							<div></div>
						</div>
						{paginatedTeacherAssignmentRows.map((row) => (
							<div className="data-row" key={row.teacherId}>
								<div className="stack">
									<button
										className="btn ghost"
										type="button"
										onClick={() => setSelectedTeacherId(row.teacherId)}
									>
										{row.teacherName}
									</button>
									<div className="meta">{row.assignmentCount} təyinat</div>
								</div>
								<div>{row.classCount}</div>
								<div>{row.subjectCount}</div>
								<div>{row.years.join(", ")}</div>
								<div>
									<button
										className="btn ghost"
										type="button"
										onClick={() => setSelectedTeacherId(row.teacherId)}
									>
										Bax
									</button>
								</div>
							</div>
						))}
						{filteredTeacherAssignmentRows.length === 0 && (
							<div className="empty">Göstərmək üçün müəllim təyinatı yoxdur.</div>
						)}
					</div>
					{filteredTeacherAssignmentRows.length > 0 && (
						<PaginationControls
							totalItems={filteredTeacherAssignmentRows.length}
							page={teacherPage}
							pageSize={teacherPageSize}
							onPageChange={setTeacherPage}
							onPageSizeChange={(nextSize) => {
								setTeacherPageSize(nextSize);
								setTeacherPage(1);
							}}
							pageSizeOptions={[15, 30, 50, 100]}
						/>
					)}
				</div>
			</div>

			<Dialog
				open={Boolean(selectedTeacherAssignments)}
				onOpenChange={(open) => {
					if (!open) setSelectedTeacherId(null);
				}}
			>
				<DialogContent className="left-auto right-0 top-0 h-screen max-h-screen w-full max-w-4xl translate-x-0 translate-y-0 overflow-y-auto rounded-none border-l p-0">
					{selectedTeacherAssignments && (
						<div className="panel gap-0">
							<div className="panel-header sticky top-0 z-10 border-b border-border bg-card px-6 py-5">
								<DialogHeader className="text-left">
									<DialogTitle>
										{selectedTeacherAssignments.teacherName}
									</DialogTitle>
									<div className="meta">
										{selectedTeacherAssignments.classCount} sinif •{" "}
										{selectedTeacherAssignments.subjectCount} fənn •{" "}
										{selectedTeacherAssignments.assignmentCount} təyinat
									</div>
								</DialogHeader>
								<div className="actions">
									<button
										className="btn"
										type="button"
										onClick={() => setSelectedTeacherId(null)}
									>
										Bağla
									</button>
								</div>
							</div>

							<div className="panel-content px-6 py-6">
								<div className="form-row">
									{selectedTeacherAssignments.years.map((itemYear) => (
										<div className="stat-pill" key={itemYear}>
											İl: {itemYear}
										</div>
									))}
								</div>
								<div className="data-table">
									<div className="data-row header">
										<div>Sinif</div>
										<div>Fənn</div>
										<div>İl</div>
										<div></div>
									</div>
									{selectedTeacherAssignments.details.map((detail) => (
										<div className="data-row" key={detail.assignmentId}>
											<div>{detail.groupName}</div>
											<div>{detail.subjectName}</div>
											<div>{detail.year}</div>
											<div>
												<button
													className="btn ghost"
													type="button"
													onClick={() => void handleDelete(detail.assignmentId)}
												>
													Sil
												</button>
											</div>
										</div>
									))}
								</div>
							</div>
						</div>
					)}
				</DialogContent>
			</Dialog>
			{dialog}
		</div>
	);
};
