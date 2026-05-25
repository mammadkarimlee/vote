import { useCallback, useEffect, useMemo, useState } from "react";
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
	const [cycles, setCycles] = useState<CycleEntry[]>([]);
	const [cycleId, setCycleId] = useState("");
	const [targets, setTargets] = useState<Target[]>([]);
	const [selected, setSelected] = useState<Target | null>(null);
	const [scores, setScores] = useState<LeadershipCriterionScores>(emptyScores);
	const [comment, setComment] = useState("");
	const [status, setStatus] = useFeedbackState();
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		const loadCycles = async () => {
			const { data, error } = await supabase
				.from("survey_cycles")
				.select("*")
				.eq("org_id", ORG_ID)
				.order("year", { ascending: false });
			if (error) {
				setStatus(error.message);
				setLoading(false);
				return;
			}
			const rows = (data ?? []).map((row) => ({
				id: row.id,
				data: mapSurveyCycleRow(row),
			}));
			setCycles(rows);
			const firstOpen = rows.find((cycle) => cycle.data.status === "OPEN") ?? rows[0];
			setCycleId(firstOpen?.id ?? "");
		};
		void loadCycles();
	}, [setStatus]);

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

	const targetsPagination = usePagination(targets);
	const completion = useMemo(
		() => targets.filter((target) => target.isSubmitted).length,
		[targets],
	);
	const totalScore = computeLeadershipVoteScore(scores);

	const openEvaluation = (target: Target) => {
		setSelected(target);
		setScores({
			disciplineScore: target.disciplineScore,
			teamworkScore: target.teamworkScore,
			communicationScore: target.communicationScore,
			professionalDevelopmentScore: target.professionalDevelopmentScore,
			platformUsageScore: target.platformUsageScore,
		});
		setComment(target.comment);
	};

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
				<div className="data-table">
					<div className="data-row header">
						<div>Müəllim</div><div>Campus</div><div>Kafedra</div><div>Sinif / kurasiya qrupu</div>
						<div>Qiymətləndirmə statusu</div><div>Verilmiş bal</div><div>Son yenilənmə</div><div></div>
					</div>
					{targetsPagination.paginatedItems.map((target) => (
						<div className="data-row" key={target.teacherId}>
							<div>{target.teacherName}</div>
							<div>{target.campusName}</div>
							<div>{target.departmentName}</div>
							<div>
								{target.gradeScope}
								<div className="hint">{leadershipCoverageLabels[target.coverageType]}</div>
							</div>
							<div>
								{target.isSubmitted ? "Səs verilib" : "Gözləyir"}
								<div className="hint">{target.submittedCount} / {target.eligibleCount} rəhbərlik səsi</div>
							</div>
							<div>{target.totalScore === null ? "-" : `${target.totalScore.toFixed(2)} / 10`}</div>
							<div>{formatShortDate(toJsDate(target.updatedAt))}</div>
							<div>
								<button className="btn primary" type="button" onClick={() => openEvaluation(target)}>
									{target.isSubmitted ? "Redaktə et" : "Qiymətləndir"}
								</button>
							</div>
						</div>
					))}
					{!loading && targets.length === 0 && (
						<div className="empty">Bu dövr üçün aktiv rəhbərlik kurasiyanızda müəllim yoxdur.</div>
					)}
					{loading && <div className="empty">Yüklənir...</div>}
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
