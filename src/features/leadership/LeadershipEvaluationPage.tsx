import { useCallback, useEffect, useMemo, useState } from "react";
import { useFeedbackState } from "../../components/feedback/FeedbackProvider";
import { PaginationControls } from "../../components/PaginationControls";
import { DataTable, sortData, type DataTableColumn, type SortState } from "../../components/DataTable";
import { LoadingSkeleton, StatusBadge } from "../../components/dashboard";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../../components/ui/dialog";
import {
	computeLeadershipVoteScore,
	leadershipCoverageLabels,
	leadershipCriteria,
	leadershipRoleLabels,
	type LeadershipCriterionKey,
	type LeadershipCriterionScores,
} from "../../lib/leadership";
import { ORG_ID, supabase } from "../../lib/supabase";
import { mapSurveyCycleRow } from "../../lib/supabaseMappers";
import type {
	CampusLeadershipRole,
	LeadershipCoverageType,
	SurveyCycleDoc,
} from "../../lib/types";
import { usePagination } from "../../lib/usePagination";
import { formatShortDate, toJsDate } from "../../lib/utils";
import { useAuth } from "../auth/AuthProvider";

type CycleEntry = { id: string; data: SurveyCycleDoc };
type Target = {
	teacherId: string;
	teacherName: string;
	campusName: string;
	departmentName: string;
	gradeScope: string;
	evaluatorRole: CampusLeadershipRole;
	coverageType: LeadershipCoverageType;
	submittedCount: number;
	eligibleCount: number;
	isComplete: boolean;
	totalScore: number | null;
	disciplineScore: number | null;
	teamworkScore: number | null;
	communicationScore: number | null;
	professionalDevelopmentScore: number | null;
	platformUsageScore: number | null;
	comment: string;
	isSubmitted: boolean;
	updatedAt: unknown;
};

const emptyScores = (): LeadershipCriterionScores => ({
	disciplineScore: null,
	teamworkScore: null,
	communicationScore: null,
	professionalDevelopmentScore: null,
	platformUsageScore: null,
});

const mapTarget = (row: Record<string, unknown>): Target => ({
	teacherId: String(row.teacher_id),
	teacherName: String(row.teacher_name ?? row.teacher_id),
	campusName: String(row.campus_name ?? "-"),
	departmentName: String(row.department_name ?? "-"),
	gradeScope: String(row.grade_scope ?? "-"),
	evaluatorRole: row.evaluator_role as CampusLeadershipRole,
	coverageType: row.coverage_type as LeadershipCoverageType,
	submittedCount: Number(row.submitted_count ?? 0),
	eligibleCount: Number(row.eligible_count ?? 0),
	isComplete: Boolean(row.is_complete),
	totalScore:
		row.total_score === null || row.total_score === undefined
			? null
			: Number(row.total_score),
	disciplineScore:
		row.discipline_score === null || row.discipline_score === undefined
			? null
			: Number(row.discipline_score),
	teamworkScore:
		row.teamwork_score === null || row.teamwork_score === undefined
			? null
			: Number(row.teamwork_score),
	communicationScore:
		row.communication_score === null || row.communication_score === undefined
			? null
			: Number(row.communication_score),
	professionalDevelopmentScore:
		row.professional_development_score === null ||
		row.professional_development_score === undefined
			? null
			: Number(row.professional_development_score),
	platformUsageScore:
		row.platform_usage_score === null || row.platform_usage_score === undefined
			? null
			: Number(row.platform_usage_score),
	comment: String(row.comment ?? ""),
	isSubmitted: Boolean(row.is_submitted),
	updatedAt: row.updated_at ?? null,
});

export const LeadershipEvaluationPage = () => {
	const { user } = useAuth();
	const [cycles, setCycles] = useState<CycleEntry[]>([]);
	const [cycleId, setCycleId] = useState("");
	const [targets, setTargets] = useState<Target[]>([]);
	const [selected, setSelected] = useState<Target | null>(null);
	const [scores, setScores] = useState<LeadershipCriterionScores>(emptyScores);
	const [comment, setComment] = useState("");
	const [status, setStatus] = useFeedbackState();
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [targetQuery, setTargetQuery] = useState("");
	const [targetStatusFilter, setTargetStatusFilter] = useState("all");
	const [targetSort, setTargetSort] = useState<SortState>(null);

	useEffect(() => {
		const loadCycles = async () => {
			if (!user) {
				setCycles([]);
				setCycleId("");
				setLoading(false);
				return;
			}

			const [cyclesRes, leadershipRes] = await Promise.all([
				supabase
					.from("survey_cycles")
					.select("*")
					.eq("org_id", ORG_ID)
					.order("year", { ascending: false }),
				supabase
					.from("campus_leadership")
					.select("campus_id")
					.eq("org_id", ORG_ID)
					.eq("user_id", user.id)
					.eq("is_active", true)
					.eq("can_evaluate_teachers", true)
					.neq("coverage_type", "PENDING")
					.is("deleted_at", null),
			]);

			if (cyclesRes.error || leadershipRes.error) {
				setStatus(cyclesRes.error?.message ?? leadershipRes.error?.message ?? null);
				setCycles([]);
				setCycleId("");
				setLoading(false);
				return;
			}

			const leadershipCampusIds = new Set(
				(leadershipRes.data ?? []).map((row) => String(row.campus_id)),
			);
			const rows = (cyclesRes.data ?? []).map((row) => ({
				id: row.id,
				data: mapSurveyCycleRow(row),
			})).filter((cycle) => {
				const branchIds = cycle.data.branchIds ?? [];
				if (branchIds.length === 0) return true;
				return branchIds.some((branchId) => leadershipCampusIds.has(branchId));
			});
			setCycles(rows);
			const firstOpen = rows.find((cycle) => cycle.data.status === "OPEN") ?? rows[0];
			setCycleId((current) =>
				rows.some((cycle) => cycle.id === current) ? current : (firstOpen?.id ?? ""),
			);
			setLoading(false);
		};
		void loadCycles();
	}, [setStatus, user]);

	const loadTargets = useCallback(async () => {
		if (!cycleId) {
			setTargets([]);
			setLoading(false);
			return;
		}
		setLoading(true);
		const { data, error } = await supabase.rpc("leadership_targets", {
			p_cycle_id: cycleId,
		});
		if (error) {
			setStatus(error.message);
			setTargets([]);
		} else {
			setTargets(((data ?? []) as Array<Record<string, unknown>>).map(mapTarget));
		}
		setLoading(false);
	}, [cycleId, setStatus]);

	useEffect(() => {
		void loadTargets();
	}, [loadTargets]);

	const completion = useMemo(
		() => targets.filter((target) => target.isSubmitted).length,
		[targets],
	);
	const totalScore = computeLeadershipVoteScore(scores);

	const openEvaluation = useCallback((target: Target) => {
		setSelected(target);
		setScores({
			disciplineScore: target.disciplineScore,
			teamworkScore: target.teamworkScore,
			communicationScore: target.communicationScore,
			professionalDevelopmentScore: target.professionalDevelopmentScore,
			platformUsageScore: target.platformUsageScore,
		});
		setComment(target.comment);
	}, []);

	const updateScore = (key: LeadershipCriterionKey, rawValue: string) => {
		setScores((previous) => ({
			...previous,
			[key]: rawValue === "" ? null : Number(rawValue),
		}));
	};

	const submitEvaluation = async () => {
		if (!selected || totalScore === null) {
			setStatus("Hər beş meyar üçün 0–2 arası bal daxil edin.");
			return;
		}
		setSubmitting(true);
		const { error } = await supabase.rpc("submit_leadership_evaluation", {
			p_cycle_id: cycleId,
			p_teacher_id: selected.teacherId,
			p_discipline_score: scores.disciplineScore,
			p_teamwork_score: scores.teamworkScore,
			p_communication_score: scores.communicationScore,
			p_professional_development_score: scores.professionalDevelopmentScore,
			p_platform_usage_score: scores.platformUsageScore,
			p_comment: comment.trim() || null,
		});
		setSubmitting(false);
		if (error) {
			setStatus(error.message);
			return;
		}
		setSelected(null);
		setStatus("Rəhbərlik qiymətləndirməsi təqdim edildi.");
		await loadTargets();
	};

	const filteredTargets = useMemo(() => {
		const query = targetQuery.trim().toLocaleLowerCase("az");
		return targets.filter((target) => {
			if (targetStatusFilter === "submitted" && !target.isSubmitted) return false;
			if (targetStatusFilter === "waiting" && target.isSubmitted) return false;
			if (!query) return true;
			return [
				target.teacherName,
				target.campusName,
				target.departmentName,
				target.isSubmitted ? "Səs verilib" : "Gözləyir",
			]
				.join(" ")
				.toLocaleLowerCase("az")
				.includes(query);
		});
	}, [targetQuery, targetStatusFilter, targets]);

	const targetColumns = useMemo<Array<DataTableColumn<Target>>>(
		() => [
			{
				key: "teacher",
				header: "Müəllim",
				sortValue: (target) => target.teacherName,
				render: (target) => target.teacherName,
			},
			{
				key: "campus",
				header: "Campus",
				sortValue: (target) => target.campusName,
				render: (target) => target.campusName,
			},
			{
				key: "department",
				header: "Kafedra",
				sortValue: (target) => target.departmentName,
				render: (target) => target.departmentName,
			},
			{
				key: "scope",
				header: "Kurasiya",
				sortValue: (target) => target.gradeScope,
				render: (target) => (
					<div>
						{target.gradeScope}
						<div className="hint">{leadershipCoverageLabels[target.coverageType]}</div>
					</div>
				),
			},
			{
				key: "status",
				header: "Status",
				sortValue: (target) => (target.isSubmitted ? "Səs verilib" : "Gözləyir"),
				render: (target) => (
					<div className="stack gap-1">
						<StatusBadge tone={target.isSubmitted ? "success" : "warning"}>
							{target.isSubmitted ? "Səs verilib" : "Gözləyir"}
						</StatusBadge>
						<div className="hint">
							{target.submittedCount} / {target.eligibleCount} rəhbərlik səsi
						</div>
					</div>
				),
			},
			{
				key: "score",
				header: "Verilmiş bal",
				sortValue: (target) => target.totalScore,
				render: (target) =>
					target.totalScore === null ? "Daxil edilməyib" : `${target.totalScore.toFixed(2)} / 10`,
			},
			{
				key: "updated",
				header: "Son yenilənmə",
				sortValue: (target) =>
					target.updatedAt ? new Date(String(target.updatedAt)).getTime() : 0,
				render: (target) => formatShortDate(toJsDate(target.updatedAt)),
			},
			{
				key: "actions",
				header: "",
				render: (target) => (
					<button className="btn primary" type="button" onClick={() => openEvaluation(target)}>
						{target.isSubmitted ? "Redaktə et" : "Qiymətləndir"}
					</button>
				),
			},
		],
		[openEvaluation],
	);
	const sortedTargets = useMemo(
		() => sortData(filteredTargets, targetColumns, targetSort),
		[filteredTargets, targetColumns, targetSort],
	);
	const targetsPagination = usePagination(sortedTargets);

	return (
		<div className="panel">
			<div className="page-hero">
				<div className="page-hero__content">
					<div className="eyebrow">PKPD</div>
					<h1>Rəhbərlik qiymətləndirməsi</h1>
					<p>Yalnız kurasiyanıza daxil olan müəllimlər görünür. Hər səs beş meyar üzrə avtomatik 10 baldan hesablanır.</p>
				</div>
				<div className="page-hero__aside">
					<label className="field">
						<span>Sorğu dövrü</span>
						<select className="input" value={cycleId} onChange={(event) => setCycleId(event.target.value)}>
							{cycles.map((cycle) => (
								<option key={cycle.id} value={cycle.id}>
									{cycle.data.year} ({cycle.data.status})
								</option>
							))}
						</select>
					</label>
					<div className="stat-pill">Verilmiş səs: {completion} / {targets.length}</div>
				</div>
			</div>
			{status && <div className="notice">{status}</div>}
			<div className="card">
				<div className="section-header">
					<div>
						<h3>Qiymətləndirmə siyahısı</h3>
						<p className="hint">Müəllim, kafedra, campus və status üzrə axtarın.</p>
					</div>
					<StatusBadge tone="neutral">Cəmi: {filteredTargets.length}</StatusBadge>
				</div>
				<div className="filters mt-4">
					<label className="field">
						<span className="label">Axtarış</span>
						<input
							className="input"
							placeholder="Müəllim, kafedra və ya campus üzrə axtar..."
							value={targetQuery}
							onChange={(event) => {
								setTargetQuery(event.target.value);
								targetsPagination.setPage(1);
							}}
						/>
					</label>
					<label className="field">
						<span className="label">Status</span>
						<select
							className="input"
							value={targetStatusFilter}
							onChange={(event) => {
								setTargetStatusFilter(event.target.value);
								targetsPagination.setPage(1);
							}}
						>
							<option value="all">Hamısı</option>
							<option value="submitted">Səs verilib</option>
							<option value="waiting">Gözləyir</option>
						</select>
					</label>
					<label className="field">
						<span className="label">Əməliyyat</span>
						<button
							className="btn"
							type="button"
							onClick={() => {
								setTargetQuery("");
								setTargetStatusFilter("all");
								setTargetSort(null);
								targetsPagination.setPage(1);
							}}
						>
							Filterləri sıfırla
						</button>
					</label>
				</div>
				<div className="mt-4">
					{loading ? (
						<LoadingSkeleton rows={5} />
					) : (
						<DataTable
							columns={targetColumns}
							rows={targetsPagination.paginatedItems}
							getRowKey={(target) => target.teacherId}
							sort={targetSort}
							onSortChange={(nextSort) => {
								setTargetSort(nextSort);
								targetsPagination.setPage(1);
							}}
							emptyTitle="Bu dövr üçün aktiv rəhbərlik kurasiyanızda müəllim yoxdur."
							emptyDescription="Sorğu dövrünü və ya filterləri dəyişərək yenidən yoxlayın."
						/>
					)}
				</div>
				{targets.length > 0 && (
					<PaginationControls
						totalItems={targetsPagination.totalItems}
						page={targetsPagination.page}
						pageSize={targetsPagination.pageSize}
						onPageChange={targetsPagination.setPage}
						onPageSizeChange={targetsPagination.setPageSize}
					/>
				)}
			</div>
			<Dialog open={Boolean(selected)} onOpenChange={(nextOpen) => { if (!nextOpen) setSelected(null); }}>
				<DialogContent className="max-w-2xl">
					{selected && (
						<>
							<DialogHeader>
								<DialogTitle>{selected.teacherName}</DialogTitle>
								<DialogDescription>
									{leadershipRoleLabels[selected.evaluatorRole]} · {selected.campusName} · Hər meyar maksimum 2 baldır.
								</DialogDescription>
							</DialogHeader>
							<div className="stack">
								{leadershipCriteria.map((criterion) => (
									<label className="field" key={criterion.key}>
										<span>{criterion.label}</span>
										<select
											className="input"
											value={scores[criterion.key] ?? ""}
											onChange={(event) => updateScore(criterion.key, event.target.value)}
										>
											<option value="">Bal seçin</option>
											<option value="0">0</option>
											<option value="1">1</option>
											<option value="2">2</option>
										</select>
									</label>
								))}
								<label className="field">
									<span>Qeyd</span>
									<textarea className="input" rows={3} value={comment} onChange={(event) => setComment(event.target.value)} />
								</label>
								<div className="stat-card">
									<div className="stat-label">Cəmi bal</div>
									<div className="stat-value">{totalScore === null ? "-" : `${totalScore} / 10`}</div>
								</div>
							</div>
							<DialogFooter>
								<button className="btn ghost" type="button" onClick={() => setSelected(null)}>Ləğv et</button>
								<button className="btn primary" type="button" disabled={submitting || totalScore === null} onClick={() => void submitEvaluation()}>
									{submitting ? "Göndərilir..." : "Təqdim et"}
								</button>
							</DialogFooter>
						</>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
};
