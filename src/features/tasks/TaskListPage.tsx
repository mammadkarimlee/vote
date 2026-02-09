import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ORG_ID, supabase } from "../../lib/supabase";
import {
	mapGroupRow,
	mapSubjectRow,
	mapSurveyCycleRow,
	mapTaskRow,
	mapTeacherRow,
} from "../../lib/supabaseMappers";
import type {
	GroupDoc,
	SubjectDoc,
	SurveyCycleDoc,
	TaskDoc,
	TeacherDoc,
} from "../../lib/types";
import { chunkArray, formatShortDate, toJsDate } from "../../lib/utils";
import { useAuth } from "../auth/AuthProvider";

type TaskEntry = { id: string; data: TaskDoc };

const buildNameMap = <T extends { name?: string }>(
	docs: { id: string; data: T }[],
) => {
	const map: Record<string, string> = {};
	docs.forEach((doc) => {
		map[doc.id] = doc.data.name ?? doc.id;
	});
	return map;
};

const resolveCycleState = (cycle?: SurveyCycleDoc | null) => {
	if (!cycle) {
		return { open: false, label: "Dövr tapılmadı", tone: "closed" as const };
	}

	if (cycle.status !== "OPEN") {
		return {
			open: false,
			label: `Dövr ${cycle.status.toLowerCase()}`,
			tone: "closed" as const,
		};
	}

	const now = new Date();
	const start = toJsDate(cycle.startAt);
	const end = toJsDate(cycle.endAt);
	if (start && now < start) {
		return { open: false, label: "Hələ başlamayıb", tone: "closed" as const };
	}
	if (end && now > end) {
		return { open: false, label: "Müddət bitib", tone: "closed" as const };
	}
	if (end && end.getTime() - now.getTime() <= 1000 * 60 * 60 * 24 * 2) {
		return { open: true, label: "Təcili: 48 saatdan az", tone: "warn" as const };
	}

	return { open: true, label: "Aktiv", tone: "ok" as const };
};

export const TaskListPage = () => {
	const { user } = useAuth();
	const [tasks, setTasks] = useState<TaskEntry[]>([]);
	const [loading, setLoading] = useState(false);
	const [teacherNames, setTeacherNames] = useState<Record<string, string>>({});
	const [groupNames, setGroupNames] = useState<Record<string, string>>({});
	const [subjectNames, setSubjectNames] = useState<Record<string, string>>({});
	const [cycles, setCycles] = useState<Record<string, SurveyCycleDoc>>({});
	const [statusFilter, setStatusFilter] = useState<"all" | "OPEN" | "DONE">(
		"all",
	);
	const [targetFilter, setTargetFilter] = useState<"all" | "teacher" | "manager">(
		"all",
	);
	const [sortBy, setSortBy] = useState<"urgency" | "recent" | "target">(
		"urgency",
	);
	const [search, setSearch] = useState("");

	useEffect(() => {
		if (!user) return undefined;

		const loadTasks = async () => {
			setLoading(true);
			const { data, error } = await supabase
				.from("tasks")
				.select("*")
				.eq("org_id", ORG_ID)
				.eq("rater_id", user.id)
				.order("created_at", { ascending: false });

			if (!error) {
				const nextTasks = (data ?? []).map((row) => ({
					id: row.id,
					data: mapTaskRow(row),
				}));
				setTasks(nextTasks);

				const cycleIds = Array.from(
					new Set(nextTasks.map((task) => task.data.cycleId)),
				);
				const cycleMap: Record<string, SurveyCycleDoc> = {};
				for (const chunk of chunkArray(cycleIds, 200)) {
					if (chunk.length === 0) continue;
					const cycleRes = await supabase
						.from("survey_cycles")
						.select("*")
						.eq("org_id", ORG_ID)
						.in("id", chunk);
					(cycleRes.data ?? []).forEach((row) => {
						cycleMap[row.id] = mapSurveyCycleRow(row);
					});
				}
				setCycles(cycleMap);
			}

			setLoading(false);
		};

		void loadTasks();
	}, [user]);

	useEffect(() => {
		const loadLookups = async () => {
			const teacherIds = Array.from(
				new Set(
					tasks
						.filter((task) => task.data.targetType === "teacher")
						.map((task) => task.data.targetId),
				),
			);
			const groupIds = Array.from(
				new Set(
					tasks
						.map((task) => task.data.groupId)
						.filter((id): id is string => Boolean(id)),
				),
			);
			const subjectIds = Array.from(
				new Set(
					tasks
						.map((task) => task.data.subjectId)
						.filter((id): id is string => Boolean(id)),
				),
			);

			const teacherMap: Record<string, string> = {};
			const groupMap: Record<string, string> = {};
			const subjectMap: Record<string, string> = {};

			for (const chunk of chunkArray(teacherIds, 200)) {
				if (chunk.length === 0) continue;
				const res = await supabase
					.from("teachers")
					.select("*")
					.eq("org_id", ORG_ID)
					.in("id", chunk)
					.is("deleted_at", null);
				Object.assign(
					teacherMap,
					buildNameMap(
						(res.data ?? []).map((row) => ({
							id: row.id,
							data: mapTeacherRow(row) as TeacherDoc,
						})),
					),
				);
			}

			for (const chunk of chunkArray(groupIds, 200)) {
				if (chunk.length === 0) continue;
				const res = await supabase
					.from("groups")
					.select("*")
					.eq("org_id", ORG_ID)
					.in("id", chunk)
					.is("deleted_at", null);
				Object.assign(
					groupMap,
					buildNameMap(
						(res.data ?? []).map((row) => ({
							id: row.id,
							data: mapGroupRow(row) as GroupDoc,
						})),
					),
				);
			}

			for (const chunk of chunkArray(subjectIds, 200)) {
				if (chunk.length === 0) continue;
				const res = await supabase
					.from("subjects")
					.select("*")
					.eq("org_id", ORG_ID)
					.in("id", chunk)
					.is("deleted_at", null);
				Object.assign(
					subjectMap,
					buildNameMap(
						(res.data ?? []).map((row) => ({
							id: row.id,
							data: mapSubjectRow(row) as SubjectDoc,
						})),
					),
				);
			}

			setTeacherNames(teacherMap);
			setGroupNames(groupMap);
			setSubjectNames(subjectMap);
		};

		void loadLookups();
	}, [tasks]);

	const resolveTargetName = useCallback(
		(task: TaskDoc) => {
			if (task.targetName) return task.targetName;
			if (task.targetType === "teacher")
				return teacherNames[task.targetId] ?? task.targetId;
			return `Rəhbərlik (${task.targetId})`;
		},
		[teacherNames],
	);

	const resolveMeta = useCallback(
		(task: TaskDoc) => {
			const groupLabel =
				task.groupName ?? (task.groupId ? groupNames[task.groupId] : "");
			const subjectLabel =
				task.subjectName ??
				(task.subjectId ? subjectNames[task.subjectId] ?? task.subjectId : "");
			return [groupLabel, subjectLabel].filter(Boolean).join(" • ");
		},
		[groupNames, subjectNames],
	);

	const enriched = useMemo(() => {
		return tasks.map((task) => {
			const cycle = cycles[task.data.cycleId];
			const cycleState = resolveCycleState(cycle);
			const endAt = toJsDate(cycle?.endAt);
			return {
				...task,
				cycle,
				cycleState,
				targetName: resolveTargetName(task.data),
				meta: resolveMeta(task.data),
				endAt,
			};
		});
	}, [cycles, tasks, resolveTargetName, resolveMeta]);

	const filtered = useMemo(() => {
		return enriched
			.filter((task) => {
				if (statusFilter !== "all" && task.data.status !== statusFilter)
					return false;
				if (targetFilter !== "all" && task.data.targetType !== targetFilter)
					return false;
				if (search.trim()) {
					const q = search.trim().toLowerCase();
					const haystack = `${task.targetName} ${task.meta}`.toLowerCase();
					if (!haystack.includes(q)) return false;
				}
				return true;
			})
			.sort((a, b) => {
				if (sortBy === "target") {
					return a.targetName.localeCompare(b.targetName);
				}
				if (sortBy === "recent") {
					const aTime = toJsDate(a.data.submittedAt)?.getTime() ?? 0;
					const bTime = toJsDate(b.data.submittedAt)?.getTime() ?? 0;
					return bTime - aTime;
				}
				const aUrgency = a.endAt?.getTime() ?? Number.POSITIVE_INFINITY;
				const bUrgency = b.endAt?.getTime() ?? Number.POSITIVE_INFINITY;
				return aUrgency - bUrgency;
			});
	}, [enriched, search, sortBy, statusFilter, targetFilter]);

	const openTasks = useMemo(
		() => filtered.filter((task) => task.data.status === "OPEN"),
		[filtered],
	);
	const doneTasks = useMemo(
		() => filtered.filter((task) => task.data.status === "DONE"),
		[filtered],
	);

	const doneCount = tasks.filter((task) => task.data.status === "DONE").length;
	const openCount = tasks.length - doneCount;
	const completion =
		tasks.length === 0 ? 0 : Math.round((doneCount / tasks.length) * 100);
	const urgentCount = enriched.filter(
		(task) =>
			task.data.status === "OPEN" &&
			task.cycleState.open &&
			task.cycleState.tone === "warn",
	).length;

	return (
		<div className="page">
			<section className="vote-hero">
				<div className="vote-hero__content">
					<div className="eyebrow">Səsvermə mərkəzi</div>
					<h1>Tapşırıqlarım</h1>
					<p>
						Filtrlərlə prioritetləri seçin, təcili tapşırıqları önə çıxarın və
						formu vaxtında tamamlayın.
					</p>
				</div>
				<div className="vote-hero__stats">
					<div className="stat-card">
						<div className="stat-label">Tamamlama faizi</div>
						<div className="stat-value">{completion}%</div>
						<div className="progress-track">
							<div className="progress-fill" style={{ width: `${completion}%` }} />
						</div>
					</div>
					<div className="stat-card">
						<div className="stat-label">Açıq tapşırıq</div>
						<div className="stat-value">{openCount}</div>
						<div className="stat-meta">Təcili: {urgentCount}</div>
					</div>
				</div>
			</section>

			<div className="card">
				<div className="filters">
					<label className="field">
						<span className="label">Axtarış</span>
						<input
							className="input"
							value={search}
							placeholder="Müəllim, qrup və ya fənn"
							onChange={(event) => setSearch(event.target.value)}
						/>
					</label>
					<label className="field">
						<span className="label">Status</span>
						<select
							className="input"
							value={statusFilter}
							onChange={(event) =>
								setStatusFilter(event.target.value as "all" | "OPEN" | "DONE")
							}
						>
							<option value="all">Hamısı</option>
							<option value="OPEN">Açıq</option>
							<option value="DONE">Tamamlanmış</option>
						</select>
					</label>
					<label className="field">
						<span className="label">Hədəf tipi</span>
						<select
							className="input"
							value={targetFilter}
							onChange={(event) =>
								setTargetFilter(
									event.target.value as "all" | "teacher" | "manager",
								)
							}
						>
							<option value="all">Hamısı</option>
							<option value="teacher">Müəllim</option>
							<option value="manager">Rəhbərlik</option>
						</select>
					</label>
					<label className="field">
						<span className="label">Sıralama</span>
						<select
							className="input"
							value={sortBy}
							onChange={(event) =>
								setSortBy(event.target.value as "urgency" | "recent" | "target")
							}
						>
							<option value="urgency">Təcillik</option>
							<option value="recent">Son tamamlanan</option>
							<option value="target">Hədəf adına görə</option>
						</select>
					</label>
				</div>
			</div>

			<div className="grid two">
				<section className="card">
					<div className="section-header">
						<div>
							<h2>Açıq tapşırıqlar</h2>
							<p className="hint">Əvvəlcə təcili olanları tamamlayın.</p>
						</div>
						<span className="stat-pill">{openTasks.length}</span>
					</div>
					{loading && <div className="empty">Yüklənir...</div>}
					{!loading && openTasks.length === 0 && (
						<div className="empty">Açıq tapşırıq yoxdur.</div>
					)}
					<div className="task-board">
						{openTasks.map((task) => (
							task.cycleState.open ? (
								<Link
									to={`/vote/${task.id}`}
									className="task-card"
									key={task.id}
								>
									<div className="task-card__head">
										<div className="task-card__title">{task.targetName}</div>
										<span
											className={`task-pill ${
												task.cycleState.tone === "warn" ? "warn" : "ok"
											}`}
										>
											{task.cycleState.label}
										</span>
									</div>
									<div className="task-card__meta">{task.meta || "Meta yoxdur"}</div>
									<div className="task-card__meta">
										Son tarix: {formatShortDate(task.endAt)}
									</div>
								</Link>
							) : (
								<div className="task-card blocked" key={task.id}>
									<div className="task-card__head">
										<div className="task-card__title">{task.targetName}</div>
										<span className="task-pill closed">{task.cycleState.label}</span>
									</div>
									<div className="task-card__meta">{task.meta || "Meta yoxdur"}</div>
									<div className="task-card__meta">
										Son tarix: {formatShortDate(task.endAt)}
									</div>
								</div>
							)
						))}
					</div>
				</section>

				<section className="card">
					<div className="section-header">
						<div>
							<h2>Tamamlananlar</h2>
							<p className="hint">Uğurla tamamladığınız tapşırıqlar.</p>
						</div>
						<span className="stat-pill">{doneTasks.length}</span>
					</div>
					{loading && <div className="empty">Yüklənir...</div>}
					{!loading && doneTasks.length === 0 && (
						<div className="empty">Hələ tamamlanan tapşırıq yoxdur.</div>
					)}
					<div className="task-board">
						{doneTasks.map((task) => (
							<div className="task-card done" key={task.id}>
								<div className="task-card__head">
									<div className="task-card__title">{task.targetName}</div>
									<span className="task-pill ok">Tamamlandı</span>
								</div>
								<div className="task-card__meta">{task.meta || "Meta yoxdur"}</div>
								<div className="task-card__meta">
									Göndərilmə: {formatShortDate(toJsDate(task.data.submittedAt))}
								</div>
							</div>
						))}
					</div>
				</section>
			</div>
		</div>
	);
};
