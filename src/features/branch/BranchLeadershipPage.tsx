import { useCallback, useEffect, useMemo, useState } from "react";
import { useConfirmDialog } from "../../components/ConfirmDialog";
import { useFeedbackState } from "../../components/feedback/FeedbackProvider";
import { PaginationControls } from "../../components/PaginationControls";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../../components/ui/dialog";
import {
	leadershipCoverageLabels,
	leadershipRoleLabels,
} from "../../lib/leadership";
import { ORG_ID, supabase } from "../../lib/supabase";
import {
	mapCampusLeadershipRow,
	mapCampusLeadershipTeacherScopeRow,
	mapDepartmentRow,
	mapTeacherRow,
	mapUserRow,
} from "../../lib/supabaseMappers";
import type {
	CampusLeadershipDoc,
	CampusLeadershipRole,
	CampusLeadershipTeacherScopeDoc,
	DepartmentDoc,
	LeadershipCoverageType,
	TeacherDoc,
	UserDoc,
} from "../../lib/types";
import { usePagination } from "../../lib/usePagination";
import { formatShortDate, toJsDate } from "../../lib/utils";
import { useAuth } from "../auth/AuthProvider";
import { BranchSelector } from "./BranchSelector";
import { useBranchScope } from "./useBranchScope";

type Entry<T> = { id: string; data: T };
type Draft = {
	userId: string;
	role: CampusLeadershipRole;
	coverageType: LeadershipCoverageType;
	gradeFrom: string;
	gradeTo: string;
	departmentId: string;
	isActive: boolean;
	canEvaluateTeachers: boolean;
	startsAt: string;
	endsAt: string;
	note: string;
	customTeacherIds: string[];
};

const emptyDraft = (): Draft => ({
	userId: "",
	role: "DEPUTY_DIRECTOR",
	coverageType: "ALL_CAMPUS_TEACHERS",
	gradeFrom: "",
	gradeTo: "",
	departmentId: "",
	isActive: true,
	canEvaluateTeachers: true,
	startsAt: "",
	endsAt: "",
	note: "",
	customTeacherIds: [],
});

const roles = Object.entries(leadershipRoleLabels) as Array<
	[CampusLeadershipRole, string]
>;
const coverageTypes = Object.entries(leadershipCoverageLabels) as Array<
	[LeadershipCoverageType, string]
>;

export const BranchLeadershipPage = () => {
	const { user } = useAuth();
	const { confirm, dialog } = useConfirmDialog();
	const { branchId, setBranchId, branches, isSuperAdmin } = useBranchScope();
	const [leadership, setLeadership] = useState<Array<Entry<CampusLeadershipDoc>>>([]);
	const [scopes, setScopes] = useState<Array<Entry<CampusLeadershipTeacherScopeDoc>>>([]);
	const [users, setUsers] = useState<Array<Entry<UserDoc>>>([]);
	const [departments, setDepartments] = useState<Array<Entry<DepartmentDoc>>>([]);
	const [teachers, setTeachers] = useState<Array<Entry<TeacherDoc>>>([]);
	const [status, setStatus] = useFeedbackState();
	const [open, setOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [draft, setDraft] = useState<Draft>(emptyDraft);

	const loadData = useCallback(async () => {
		if (!branchId) {
			setLeadership([]);
			setScopes([]);
			setUsers([]);
			setDepartments([]);
			setTeachers([]);
			return;
		}
		const [leadershipRes, usersRes, departmentsRes, teachersRes] =
			await Promise.all([
				supabase
					.from("campus_leadership")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("campus_id", branchId)
					.is("deleted_at", null)
					.order("created_at"),
				supabase
					.from("users")
					.select("*")
					.eq("org_id", ORG_ID)
					.in("role", ["manager", "teacher"])
					.is("deleted_at", null),
				supabase
					.from("departments")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("branch_id", branchId)
					.is("deleted_at", null),
				supabase
					.from("teachers")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("branch_id", branchId)
					.is("deleted_at", null),
			]);
		if (leadershipRes.error) {
			setStatus(leadershipRes.error.message);
			return;
		}
		const leadershipRows = (leadershipRes.data ?? []).map((row) => ({
			id: row.id,
			data: mapCampusLeadershipRow(row),
		}));
		setLeadership(leadershipRows);
		setUsers(
			(usersRes.data ?? [])
				.map((row) => ({ id: row.id, data: mapUserRow(row) }))
				.sort((a, b) =>
					(a.data.displayName ?? a.id).localeCompare(b.data.displayName ?? b.id, "az"),
				),
		);
		setDepartments(
			(departmentsRes.data ?? []).map((row) => ({
				id: row.id,
				data: mapDepartmentRow(row),
			})),
		);
		setTeachers(
			(teachersRes.data ?? []).map((row) => ({
				id: row.id,
				data: mapTeacherRow(row),
			})),
		);
		const ids = leadershipRows.map((item) => item.id);
		if (ids.length === 0) {
			setScopes([]);
			return;
		}
		const scopeRes = await supabase
			.from("campus_leadership_teacher_scope")
			.select("*")
			.eq("org_id", ORG_ID)
			.in("campus_leadership_id", ids);
		setScopes(
			(scopeRes.data ?? []).map((row) => ({
				id: row.id,
				data: mapCampusLeadershipTeacherScopeRow(row),
			})),
		);
	}, [branchId, setStatus]);

	useEffect(() => {
		void loadData();
	}, [loadData]);

	const userMap = useMemo(
		() => Object.fromEntries(users.map((item) => [item.id, item.data])),
		[users],
	);
	const departmentMap = useMemo(
		() => Object.fromEntries(departments.map((item) => [item.id, item.data])),
		[departments],
	);
	const leadershipPagination = usePagination(leadership);

	const beginCreate = () => {
		setEditingId(null);
		setDraft(emptyDraft());
		setOpen(true);
	};
	const beginEdit = (entry: Entry<CampusLeadershipDoc>) => {
		setEditingId(entry.id);
		setDraft({
			userId: entry.data.userId,
			role: entry.data.role,
			coverageType: entry.data.coverageType,
			gradeFrom: entry.data.gradeFrom === null ? "" : String(entry.data.gradeFrom),
			gradeTo: entry.data.gradeTo === null ? "" : String(entry.data.gradeTo),
			departmentId: entry.data.departmentId ?? "",
			isActive: entry.data.isActive,
			canEvaluateTeachers: entry.data.canEvaluateTeachers,
			startsAt: entry.data.startsAt ? String(entry.data.startsAt).slice(0, 10) : "",
			endsAt: entry.data.endsAt ? String(entry.data.endsAt).slice(0, 10) : "",
			note: entry.data.note ?? "",
			customTeacherIds: scopes
				.filter((scope) => scope.data.campusLeadershipId === entry.id)
				.map((scope) => scope.data.teacherId),
		});
		setOpen(true);
	};

	const setRole = (role: CampusLeadershipRole) => {
		setDraft((previous) => ({
			...previous,
			role,
			coverageType:
				role === "BRANCH_MANAGER"
					? "ALL_CAMPUS_TEACHERS"
					: role === "DEPARTMENT_HEAD"
						? "DEPARTMENT_BASED"
						: previous.coverageType,
		}));
	};

	const handleSave = async () => {
		if (!branchId || !draft.userId) {
			setStatus("Campus və rəhbərlik şəxsi seçilməlidir.");
			return;
		}
		if (
			draft.coverageType === "GRADE_RANGE" &&
			(!draft.gradeFrom || !draft.gradeTo)
		) {
			setStatus("Sinif aralığının başlanğıcı və sonu tələb olunur.");
			return;
		}
		if (draft.coverageType === "DEPARTMENT_BASED" && !draft.departmentId) {
			setStatus("Kafedra seçilməlidir.");
			return;
		}
		if (draft.coverageType === "CUSTOM_TEACHERS" && draft.customTeacherIds.length === 0) {
			setStatus("Manual kurasiya üçün ən azı bir müəllim seçin.");
			return;
		}
		const payload = {
			org_id: ORG_ID,
			campus_id: branchId,
			user_id: draft.userId,
			role: draft.role,
			coverage_type: draft.role === "BRANCH_MANAGER" ? "ALL_CAMPUS_TEACHERS" : draft.coverageType,
			grade_from: draft.coverageType === "GRADE_RANGE" ? Number(draft.gradeFrom) : null,
			grade_to: draft.coverageType === "GRADE_RANGE" ? Number(draft.gradeTo) : null,
			department_id:
				draft.coverageType === "DEPARTMENT_BASED" ? draft.departmentId : null,
			is_active: draft.isActive,
			can_evaluate_teachers:
				draft.coverageType === "PENDING" ? false : draft.canEvaluateTeachers,
			starts_at: draft.startsAt || null,
			ends_at: draft.endsAt || null,
			note: draft.note.trim() || null,
			created_by: user?.id ?? null,
		};
		let leadershipId = editingId;
		if (editingId) {
			const { error } = await supabase
				.from("campus_leadership")
				.update(payload)
				.eq("org_id", ORG_ID)
				.eq("id", editingId);
			if (error) {
				setStatus(error.message);
				return;
			}
		} else {
			const { data, error } = await supabase
				.from("campus_leadership")
				.insert(payload)
				.select("id")
				.single();
			if (error || !data) {
				setStatus(error?.message ?? "Rəhbərlik təyinatı yaradılmadı.");
				return;
			}
			leadershipId = data.id;
		}
		if (!leadershipId) return;
		const { error: clearError } = await supabase
			.from("campus_leadership_teacher_scope")
			.delete()
			.eq("org_id", ORG_ID)
			.eq("campus_leadership_id", leadershipId);
		if (clearError) {
			setStatus(clearError.message);
			return;
		}
		if (draft.coverageType === "CUSTOM_TEACHERS") {
			const { error } = await supabase.from("campus_leadership_teacher_scope").insert(
				draft.customTeacherIds.map((teacherId) => ({
					org_id: ORG_ID,
					campus_leadership_id: leadershipId,
					teacher_id: teacherId,
				})),
			);
			if (error) {
				setStatus(error.message);
				return;
			}
		}
		setOpen(false);
		setStatus(editingId ? "Rəhbərlik təyinatı yeniləndi." : "Rəhbərlik təyinatı əlavə edildi.");
		await loadData();
	};

	const updateStatus = async (
		entry: Entry<CampusLeadershipDoc>,
		values: Record<string, boolean>,
		message: string,
	) => {
		const { error } = await supabase
			.from("campus_leadership")
			.update(values)
			.eq("org_id", ORG_ID)
			.eq("id", entry.id);
		if (error) {
			setStatus(error.message);
			return;
		}
		setStatus(message);
		await loadData();
	};

	const archive = async (entry: Entry<CampusLeadershipDoc>) => {
		const accepted = await confirm({
			title: "Rəhbərlik təyinatını arxivlə",
			message: "Bu şəxs artıq yeni rəhbərlik səslərinə daxil edilməyəcək.",
			confirmText: "Arxivlə",
			cancelText: "İmtina",
			tone: "danger",
		});
		if (!accepted) return;
		const { error } = await supabase
			.from("campus_leadership")
			.update({
				is_active: false,
				deleted_at: new Date().toISOString(),
				deleted_by: user?.id ?? null,
			})
			.eq("org_id", ORG_ID)
			.eq("id", entry.id);
		if (error) setStatus(error.message);
		else {
			setStatus("Rəhbərlik təyinatı arxivləndi.");
			await loadData();
		}
	};

	return (
		<div className="panel branch-page">
			<div className="page-hero">
				<div className="page-hero__content">
					<div className="eyebrow">Campus strukturu</div>
					<h1>Rəhbərlik</h1>
					<p>Filial müdiri, müavinlər və kafedra müdirlərinin müəllim qiymətləndirmə dairəsini idarə edin.</p>
				</div>
				<div className="page-hero__aside">
					{isSuperAdmin && (
						<BranchSelector branchId={branchId} branches={branches} onChange={setBranchId} />
					)}
					<div className="stat-pill">Aktiv rəhbərlik: {leadership.filter((item) => item.data.isActive).length}</div>
					<button className="btn primary" type="button" disabled={!branchId} onClick={beginCreate}>
						Rəhbərlik əlavə et
					</button>
				</div>
			</div>
			{status && <div className="notice">{status}</div>}
			<div className="card">
				<div className="section-header">
					<div>
						<div className="section-kicker">Campus → Rəhbərlik</div>
						<h3 className="section-title">Rəhbərlik siyahısı</h3>
						<p className="hint">
							Təyinatlar yalnız bu moduldan ayrıca əlavə edilir. Kafedra müdiri
							lazım olduqda rol olaraq seçilib müvafiq kafedraya bağlanır.
							Parol ilkin qaydaya əsasən login ilə eyni göstərilir.
						</p>
					</div>
				</div>
				<div className="data-table">
					<div className="data-row header">
						<div>Ad soyad</div><div>Login</div><div>Parol</div><div>Rol</div><div>Kurasiya tipi</div><div>Sinif aralığı</div>
						<div>Kafedra</div><div>Aktiv status</div><div>Qiymətləndirə bilər</div>
						<div>Başlama tarixi</div><div>Bitmə tarixi</div><div>Əməliyyatlar</div>
					</div>
					{leadershipPagination.paginatedItems.map((entry) => (
						<div className="data-row" key={entry.id}>
							<div>{userMap[entry.data.userId]?.displayName ?? entry.data.userId}</div>
							<div>{userMap[entry.data.userId]?.login ?? "-"}</div>
							<div>{userMap[entry.data.userId]?.login ?? "-"}</div>
							<div>{leadershipRoleLabels[entry.data.role]}</div>
							<div>{leadershipCoverageLabels[entry.data.coverageType]}</div>
							<div>{entry.data.coverageType === "GRADE_RANGE" ? `${entry.data.gradeFrom}–${entry.data.gradeTo}` : "-"}</div>
							<div>{entry.data.departmentId ? departmentMap[entry.data.departmentId]?.name ?? "-" : "-"}</div>
							<div>{entry.data.isActive ? "Aktiv" : "Passiv"}</div>
							<div>{entry.data.canEvaluateTeachers ? "Bəli" : "Xeyr"}</div>
							<div>{formatShortDate(toJsDate(entry.data.startsAt))}</div>
							<div>{formatShortDate(toJsDate(entry.data.endsAt))}</div>
							<div className="actions">
								<button className="btn" type="button" onClick={() => beginEdit(entry)}>Redaktə et</button>
								<button className="btn ghost" type="button" onClick={() => void updateStatus(entry, { is_active: !entry.data.isActive }, entry.data.isActive ? "Rəhbərlik passiv edildi." : "Rəhbərlik aktiv edildi.")}>
									{entry.data.isActive ? "Passiv et" : "Aktiv et"}
								</button>
								<button className="btn ghost" type="button" onClick={() => void updateStatus(entry, { can_evaluate_teachers: !entry.data.canEvaluateTeachers }, "Qiymətləndirmə hüququ yeniləndi.")}>
									{entry.data.canEvaluateTeachers ? "Hüququ bağla" : "Hüququ aç"}
								</button>
								<button className="btn ghost" type="button" onClick={() => void archive(entry)}>Arxivlə</button>
							</div>
						</div>
					))}
					{leadership.length === 0 && <div className="empty">Bu campus üçün rəhbərlik təyin edilməyib.</div>}
				</div>
				{leadership.length > 0 && (
					<PaginationControls
						totalItems={leadershipPagination.totalItems}
						page={leadershipPagination.page}
						pageSize={leadershipPagination.pageSize}
						onPageChange={leadershipPagination.setPage}
						onPageSizeChange={leadershipPagination.setPageSize}
					/>
				)}
			</div>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
					<DialogHeader>
						<DialogTitle>{editingId ? "Rəhbərliyi redaktə et" : "Rəhbərlik əlavə et"}</DialogTitle>
						<DialogDescription>Qiymətləndirmə rolu və müəllim kurasiyası bu təyinatdan avtomatik hesablanır.</DialogDescription>
					</DialogHeader>
					<div className="stack">
						<select className="input" value={draft.userId} onChange={(event) => setDraft((value) => ({ ...value, userId: event.target.value }))}>
							<option value="">Şəxs seçin</option>
							{users.map((entry) => <option key={entry.id} value={entry.id}>{entry.data.displayName ?? entry.data.login ?? entry.id}{entry.data.login ? ` (${entry.data.login})` : ""}</option>)}
						</select>
						<select className="input" value={draft.role} onChange={(event) => setRole(event.target.value as CampusLeadershipRole)}>
							{roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
						</select>
						<select className="input" value={draft.coverageType} disabled={draft.role === "BRANCH_MANAGER"} onChange={(event) => setDraft((value) => ({ ...value, coverageType: event.target.value as LeadershipCoverageType }))}>
							{coverageTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
						</select>
						{draft.coverageType === "GRADE_RANGE" && (
							<div className="form-row">
								<input className="input" type="number" min="0" placeholder="Sinif başlanğıcı" value={draft.gradeFrom} onChange={(event) => setDraft((value) => ({ ...value, gradeFrom: event.target.value }))} />
								<input className="input" type="number" min="0" placeholder="Sinif sonu" value={draft.gradeTo} onChange={(event) => setDraft((value) => ({ ...value, gradeTo: event.target.value }))} />
							</div>
						)}
						{draft.coverageType === "DEPARTMENT_BASED" && (
							<select className="input" value={draft.departmentId} onChange={(event) => setDraft((value) => ({ ...value, departmentId: event.target.value }))}>
								<option value="">Kafedra seçin</option>
								{departments.map((department) => <option key={department.id} value={department.id}>{department.data.name}</option>)}
							</select>
						)}
						{draft.coverageType === "CUSTOM_TEACHERS" && (
							<div className="checkbox-grid">
								{teachers.map((teacher) => (
									<label className="checkbox-item" key={teacher.id}>
										<input
											type="checkbox"
											checked={draft.customTeacherIds.includes(teacher.id)}
											onChange={(event) => setDraft((value) => ({
												...value,
												customTeacherIds: event.target.checked
													? [...value.customTeacherIds, teacher.id]
													: value.customTeacherIds.filter((id) => id !== teacher.id),
											}))}
										/>
										{teacher.data.name}
									</label>
								))}
							</div>
						)}
						<div className="form-row">
							<label className="checkbox-item"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft((value) => ({ ...value, isActive: event.target.checked }))} />Aktiv</label>
							<label className="checkbox-item"><input type="checkbox" checked={draft.canEvaluateTeachers} disabled={draft.coverageType === "PENDING"} onChange={(event) => setDraft((value) => ({ ...value, canEvaluateTeachers: event.target.checked }))} />Qiymətləndirə bilər</label>
						</div>
						<div className="form-row">
							<label className="field"><span>Başlama tarixi</span><input className="input" type="date" value={draft.startsAt} onChange={(event) => setDraft((value) => ({ ...value, startsAt: event.target.value }))} /></label>
							<label className="field"><span>Bitmə tarixi</span><input className="input" type="date" value={draft.endsAt} onChange={(event) => setDraft((value) => ({ ...value, endsAt: event.target.value }))} /></label>
						</div>
						<textarea className="input" rows={3} placeholder="Qeyd" value={draft.note} onChange={(event) => setDraft((value) => ({ ...value, note: event.target.value }))} />
					</div>
					<DialogFooter>
						<button className="btn ghost" type="button" onClick={() => setOpen(false)}>Ləğv et</button>
						<button className="btn primary" type="button" onClick={() => void handleSave()}>Saxla</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			{dialog}
		</div>
	);
};
