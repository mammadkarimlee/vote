import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { InfoTip } from "../../components/InfoTip";
import { ORG_ID, supabase } from "../../lib/supabase";
import { mapSurveyCycleRow, mapUserRow } from "../../lib/supabaseMappers";
import type { SurveyCycleDoc, UserDoc } from "../../lib/types";
import { BranchSelector } from "./BranchSelector";
import { useBranchScope } from "./useBranchScope";

type DocEntry<T> = { id: string; data: T };

type TaskSummary = {
	total: number;
	done: number;
};

export const BranchCycleDetailPage = () => {
	const { cycleId } = useParams<{ cycleId: string }>();
	const { branchId, setBranchId, branches, isSuperAdmin } = useBranchScope();
	const [cycle, setCycle] = useState<SurveyCycleDoc | null>(null);
	const [students, setStudents] = useState<Array<DocEntry<UserDoc>>>([]);
	const [taskSummaryByStudent, setTaskSummaryByStudent] = useState<
		Record<string, TaskSummary>
	>({});
	const [status, setStatus] = useState<string | null>(null);

	useEffect(() => {
		const loadLookups = async () => {
			if (!cycleId || !branchId) return;

			const [cycleRes, studentRes] = await Promise.all([
				supabase
					.from("survey_cycles")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("id", cycleId)
					.maybeSingle(),
				supabase
					.from("users")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("role", "student")
					.eq("branch_id", branchId)
					.is("deleted_at", null),
			]);

			const mappedCycle = cycleRes.data
				? mapSurveyCycleRow(cycleRes.data)
				: null;
			if (mappedCycle?.branchIds && mappedCycle.branchIds.length > 0) {
				if (!mappedCycle.branchIds.includes(branchId)) {
					setStatus("Bu sorğu dövrü seçilmiş filial üçün aktiv deyil.");
				} else {
					setStatus(null);
				}
			}
			setCycle(mappedCycle);

			setStudents(
				(studentRes.data ?? []).map((row) => ({
					id: row.id,
					data: mapUserRow(row),
				})),
			);
		};

		if (branchId) {
			void loadLookups();
		} else {
			setStudents([]);
		}
	}, [cycleId, branchId]);

	useEffect(() => {
		const loadTasks = async () => {
			if (!cycleId || !branchId) return;

			const { data } = await supabase
				.from("tasks")
				.select("id, rater_id, status")
				.eq("org_id", ORG_ID)
				.eq("cycle_id", cycleId)
				.eq("branch_id", branchId)
				.eq("rater_role", "student");

			const summary: Record<string, TaskSummary> = {};
			(data ?? []).forEach((task) => {
				const raterId = task.rater_id as string;
				summary[raterId] = summary[raterId] || { total: 0, done: 0 };
				summary[raterId].total += 1;
				if (task.status === "DONE") summary[raterId].done += 1;
			});
			setTaskSummaryByStudent(summary);
		};

		void loadTasks();
	}, [cycleId, branchId]);

	const studentRows = useMemo(() => {
		return students.map((student) => {
			const summary = taskSummaryByStudent[student.id] ?? { total: 0, done: 0 };
			const done = summary.total > 0 && summary.done === summary.total;
			return {
				id: student.id,
				name: student.data.displayName ?? student.data.login ?? student.id,
				done,
				doneCount: summary.done,
				totalCount: summary.total,
			};
		});
	}, [students, taskSummaryByStudent]);

	const totals = useMemo(() => {
		const doneStudents = studentRows.filter((row) => row.done).length;
		const pendingStudents = studentRows.length - doneStudents;
		const totalTasks = studentRows.reduce(
			(acc, row) => acc + row.totalCount,
			0,
		);
		const doneTasks = studentRows.reduce((acc, row) => acc + row.doneCount, 0);
		return { doneStudents, pendingStudents, totalTasks, doneTasks };
	}, [studentRows]);

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
					<h2>Sorğu dövrü detalları</h2>
					<p>Filial üzrə iştirak statusu və tapşırıqlar.</p>
				</div>
				<div className="actions">
					<Link className="btn ghost" to="/branch/cycles">
						Geri
					</Link>
				</div>
			</div>

			{status && <div className="notice">{status}</div>}

			<div className="card">
				<div className="section-header">
					<div>
						<h3>Ümumi xülasə</h3>
						<p>Şagirdlərin “DONE” statusu.</p>
					</div>
					{cycle && (
						<div className="meta">
							Sorğu dövrü: {cycle.year} • Vəziyyət: {cycle.status}
						</div>
					)}
				</div>
				<div className="grid three">
					<div className="stat-card">
						<div className="stat-label">
							Səs verən şagirdlər
							<InfoTip text="Bütün tapşırıqları tamamlayan şagirdlər." />
						</div>
						<div className="stat-value">{totals.doneStudents}</div>
						<div className="stat-meta">Cəmi: {studentRows.length}</div>
					</div>
					<div className="stat-card">
						<div className="stat-label">Gözləmədə olanlar</div>
						<div className="stat-value">{totals.pendingStudents}</div>
						<div className="stat-meta">Şagird</div>
					</div>
					<div className="stat-card">
						<div className="stat-label">Tapşırıqlar</div>
						<div className="stat-value">{totals.doneTasks}</div>
						<div className="stat-meta">/{totals.totalTasks} tamamlandı</div>
					</div>
				</div>
			</div>

			<div className="card">
				<div className="section-header">
					<div>
						<h3>Şagird iştirak siyahısı</h3>
						<p>Anonimdir: yalnız “DONE” statusu görünür.</p>
					</div>
				</div>
				<div className="data-table">
					<div className="data-row header">
						<div>Ad</div>
						<div>DONE</div>
						<div>Tapşırıq</div>
					</div>
					{studentRows.map((student) => (
						<div className="data-row" key={student.id}>
							<div>{student.name}</div>
							<div>{student.done ? "Bəli" : "Xeyr"}</div>
							<div>
								{student.doneCount}/{student.totalCount}
							</div>
						</div>
					))}
					{studentRows.length === 0 && (
						<div className="empty">Məlumat yoxdur.</div>
					)}
				</div>
			</div>
		</div>
	);
};
