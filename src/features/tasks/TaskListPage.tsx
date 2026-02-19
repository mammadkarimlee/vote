import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ORG_ID, supabase } from "../../lib/supabase";
import {
	mapGroupRow,
	mapQuestionRow,
	mapQuestionSetRow,
	mapSubjectRow,
	mapSurveyCycleRow,
	mapTaskRow,
	mapTeacherRow,
} from "../../lib/supabaseMappers";
import type {
	GroupDoc,
	QuestionDoc,
	SubjectDoc,
	SurveyCycleDoc,
	TaskDoc,
	TeacherDoc,
} from "../../lib/types";
import { chunkArray, formatShortDate, toJsDate } from "../../lib/utils";
import { useAuth } from "../auth/AuthProvider";

type TaskEntry = { id: string; data: TaskDoc };

type StudentVoteEntry = {
	id: string;
	cycleId: string;
	teacherId: string;
	teacherName: string;
	taskIds: string[];
	metaItems: string[];
	endAt: Date | null;
	questions: Array<{ id: string; data: QuestionDoc }>;
};

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
	const { user, userDoc, loading: authLoading } = useAuth();
	const isStudent = userDoc?.role === "student";
	const [tasks, setTasks] = useState<TaskEntry[]>([]);
	const [loading, setLoading] = useState(false);
	const [teacherNames, setTeacherNames] = useState<Record<string, string>>({});
	const [groupNames, setGroupNames] = useState<Record<string, string>>({});
	const [subjectNames, setSubjectNames] = useState<Record<string, string>>({});
	const [cycles, setCycles] = useState<Record<string, SurveyCycleDoc>>({});
	const [statusFilter, setStatusFilter] = useState<"all" | "OPEN" | "DONE">(
		"all",
	);
	const [targetFilter, setTargetFilter] = useState<"all" | "teacher">("all");
	const [sortBy, setSortBy] = useState<"urgency" | "recent" | "target">(
		"urgency",
	);
	const [search, setSearch] = useState("");

	const [studentQuestionsByCycle, setStudentQuestionsByCycle] = useState<
		Record<string, Array<{ id: string; data: QuestionDoc }>>
	>({});
	const [studentQuestionsLoading, setStudentQuestionsLoading] = useState(false);
	const [studentAnswers, setStudentAnswers] = useState<
		Record<string, Record<string, string | number>>
	>({});
	const [studentSubmitting, setStudentSubmitting] = useState(false);
	const [studentStatus, setStudentStatus] = useState<string | null>(null);
	const [studentSubmitErrors, setStudentSubmitErrors] = useState<string[]>([]);

	const loadTasks = useCallback(async () => {
		if (!user) {
			setTasks([]);
			setCycles({});
			return;
		}

		setLoading(true);

		const { data, error } = await supabase
			.from("tasks")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("rater_id", user.id)
			.eq("target_type", "teacher")
			.order("created_at", { ascending: false });

		if (error) {
			setTasks([]);
			setCycles({});
			setLoading(false);
			return;
		}

		const nextTasks = (data ?? []).map((row) => ({
			id: row.id,
			data: mapTaskRow(row),
		}));
		setTasks(nextTasks);

		const cycleIds = Array.from(new Set(nextTasks.map((task) => task.data.cycleId)));
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
		setLoading(false);
	}, [user]);

	useEffect(() => {
		void loadTasks();
	}, [loadTasks]);

	useEffect(() => {
		const loadLookups = async () => {
			if (tasks.length === 0) {
				setTeacherNames({});
				setGroupNames({});
				setSubjectNames({});
				return;
			}

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

	useEffect(() => {
		if (!isStudent) {
			setStudentQuestionsByCycle({});
			return;
		}

		const loadStudentQuestions = async () => {
			const cycleIds = Array.from(new Set(tasks.map((task) => task.data.cycleId)));
			if (cycleIds.length === 0) {
				setStudentQuestionsByCycle({});
				return;
			}

			setStudentQuestionsLoading(true);

			const questionSetByCycle: Record<string, string[]> = {};
			for (const chunk of chunkArray(cycleIds, 200)) {
				if (chunk.length === 0) continue;
				const setRes = await supabase
					.from("question_sets")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("target_flow", "student_teacher")
					.in("cycle_id", chunk);

				(setRes.data ?? []).forEach((row) => {
					const mapped = mapQuestionSetRow(row);
					questionSetByCycle[row.cycle_id] = mapped.questionIds ?? [];
				});
			}

			const allQuestionIds = Array.from(
				new Set(Object.values(questionSetByCycle).flat()),
			);
			const questionMap: Record<string, QuestionDoc> = {};

			for (const chunk of chunkArray(allQuestionIds, 200)) {
				if (chunk.length === 0) continue;
				const questionRes = await supabase
					.from("questions")
					.select("*")
					.eq("org_id", ORG_ID)
					.in("id", chunk);

				(questionRes.data ?? []).forEach((row) => {
					questionMap[row.id] = mapQuestionRow(row);
				});
			}

			const next: Record<string, Array<{ id: string; data: QuestionDoc }>> = {};
			Object.entries(questionSetByCycle).forEach(([cycleId, ids]) => {
				next[cycleId] = ids
					.map((id) =>
						questionMap[id]
							? {
									id,
									data: questionMap[id],
								}
							: null,
					)
					.filter(
						(
							item,
						): item is {
							id: string;
							data: QuestionDoc;
						} => Boolean(item),
					);
			});

			setStudentQuestionsByCycle(next);
			setStudentQuestionsLoading(false);
		};

		void loadStudentQuestions();
	}, [isStudent, tasks]);

	const resolveTargetName = useCallback(
		(task: TaskDoc) => {
			if (task.targetName) return task.targetName;
			return teacherNames[task.targetId] ?? task.targetId;
		},
		[teacherNames],
	);

	const resolveMetaParts = useCallback(
		(task: TaskDoc) => {
			const groupLabel =
				task.groupName ?? (task.groupId ? groupNames[task.groupId] : "");
			const subjectLabel =
				task.subjectName ??
				(task.subjectId ? subjectNames[task.subjectId] ?? task.subjectId : "");
			return { groupLabel, subjectLabel };
		},
		[groupNames, subjectNames],
	);

	const resolveMeta = useCallback(
		(task: TaskDoc) => {
			const { groupLabel, subjectLabel } = resolveMetaParts(task);
			return [groupLabel, subjectLabel].filter(Boolean).join(" - ");
		},
		[resolveMetaParts],
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

	const studentVotableEntries = useMemo<StudentVoteEntry[]>(() => {
		if (!isStudent) return [];

		type MutableEntry = {
			id: string;
			cycleId: string;
			teacherId: string;
			teacherName: string;
			taskIds: string[];
			metaSet: Set<string>;
			endAt: Date | null;
		};

		const grouped = new Map<string, MutableEntry>();
		tasks.forEach((task) => {
			if (task.data.targetType !== "teacher") return;
			if (task.data.status !== "OPEN") return;

			const cycle = cycles[task.data.cycleId];
			const cycleState = resolveCycleState(cycle);
			if (!cycleState.open) return;

			const key = `${task.data.cycleId}:${task.data.targetId}`;
			const teacherName = resolveTargetName(task.data);
			const { groupLabel, subjectLabel } = resolveMetaParts(task.data);
			const metaLabel = [groupLabel, subjectLabel].filter(Boolean).join(" - ");
			const endAt = toJsDate(cycle?.endAt);

			const existing = grouped.get(key);
			if (existing) {
				existing.taskIds.push(task.id);
				if (metaLabel) existing.metaSet.add(metaLabel);
				if (endAt && (!existing.endAt || endAt < existing.endAt)) {
					existing.endAt = endAt;
				}
				return;
			}

			grouped.set(key, {
				id: key,
				cycleId: task.data.cycleId,
				teacherId: task.data.targetId,
				teacherName,
				taskIds: [task.id],
				metaSet: new Set(metaLabel ? [metaLabel] : []),
				endAt,
			});
		});

		return Array.from(grouped.values())
			.map((entry) => ({
				id: entry.id,
				cycleId: entry.cycleId,
				teacherId: entry.teacherId,
				teacherName: entry.teacherName,
				taskIds: entry.taskIds,
				metaItems: Array.from(entry.metaSet.values()),
				endAt: entry.endAt,
				questions: studentQuestionsByCycle[entry.cycleId] ?? [],
			}))
			.sort((a, b) => a.teacherName.localeCompare(b.teacherName));
	}, [
		cycles,
		isStudent,
		resolveMetaParts,
		resolveTargetName,
		studentQuestionsByCycle,
		tasks,
	]);

	const studentDoneTeacherTasks = useMemo(
		() =>
			tasks.filter(
				(task) =>
					task.data.targetType === "teacher" && task.data.status === "DONE",
			).length,
		[tasks],
	);
	const studentOpenTeacherTasks = useMemo(
		() =>
			tasks.filter((task) => {
				if (task.data.targetType !== "teacher") return false;
				if (task.data.status !== "OPEN") return false;
				return resolveCycleState(cycles[task.data.cycleId]).open;
			}).length,
		[cycles, tasks],
	);
	const studentTeacherProgress = useMemo(() => {
		const total = studentDoneTeacherTasks + studentOpenTeacherTasks;
		if (total === 0) return 0;
		return Math.round((studentDoneTeacherTasks / total) * 100);
	}, [studentDoneTeacherTasks, studentOpenTeacherTasks]);

	useEffect(() => {
		if (!isStudent) {
			setStudentAnswers({});
			setStudentStatus(null);
			setStudentSubmitErrors([]);
			return;
		}

		setStudentAnswers((prev) => {
			const next: Record<string, Record<string, string | number>> = {};
			studentVotableEntries.forEach((entry) => {
				const prevEntry = prev[entry.id] ?? {};
				const questionMap = new Map(
					entry.questions.map((question) => [question.id, question.data]),
				);
				const filtered: Record<string, string | number> = {};

				Object.entries(prevEntry).forEach(([questionId, value]) => {
					const question = questionMap.get(questionId);
					if (!question) return;

					if (question.type === "scale" && typeof value === "number") {
						filtered[questionId] = value;
						return;
					}

					if (
						(question.type === "choice" || question.type === "text") &&
						value !== ""
					) {
						filtered[questionId] = String(value);
					}
				});

				next[entry.id] = filtered;
			});
			return next;
		});
	}, [isStudent, studentVotableEntries]);

	const handleStudentAnswerChange = useCallback(
		(entryId: string, questionId: string, value: string | number) => {
			setStudentAnswers((prev) => ({
				...prev,
				[entryId]: {
					...(prev[entryId] ?? {}),
					[questionId]: value,
				},
			}));
		},
		[],
	);

	const clearStudentAnswers = useCallback(() => {
		setStudentAnswers({});
		setStudentStatus("Seçimlər təmizləndi.");
		setStudentSubmitErrors([]);
	}, []);

	const handleStudentSubmitAll = useCallback(async () => {
		if (studentSubmitting) return;
		setStudentStatus(null);
		setStudentSubmitErrors([]);

		if (studentVotableEntries.length === 0) {
			setStudentStatus("Göndəriləcək açıq səsvermə yoxdur.");
			return;
		}

		const validationErrors: string[] = [];
		studentVotableEntries.forEach((entry) => {
			if (entry.questions.length === 0) {
				validationErrors.push(`${entry.teacherName}: sual seti tapılmadı.`);
				return;
			}

			const answers = studentAnswers[entry.id] ?? {};
			const missingRequired = entry.questions.some(
				(question) =>
					question.data.required &&
					(answers[question.id] === undefined || answers[question.id] === ""),
			);
			if (missingRequired) {
				validationErrors.push(`${entry.teacherName}: məcburi suallar doldurulmayıb.`);
			}
		});

		if (validationErrors.length > 0) {
			setStudentStatus(validationErrors[0]);
			setStudentSubmitErrors(validationErrors.slice(1, 4));
			return;
		}

		setStudentSubmitting(true);
		let successCount = 0;
		const submitErrors: string[] = [];

		for (const entry of studentVotableEntries) {
			const answers = studentAnswers[entry.id] ?? {};
			const answersPayload = Object.entries(answers)
				.map(([questionId, value]) => ({
					question_id: questionId,
					value,
				}))
				.filter((item) => item.value !== undefined && item.value !== "");

			for (const taskId of entry.taskIds) {
				const { error } = await supabase.rpc("submit_vote", {
					p_task_id: taskId,
					p_answers: answersPayload,
				});
				if (error) {
					submitErrors.push(
						`${entry.teacherName}: ${error.message ?? "göndərmə xətası."}`,
					);
				} else {
					successCount += 1;
				}
			}
		}

		setStudentSubmitting(false);

		if (submitErrors.length === 0) {
			setStudentStatus(`${successCount} tapşırıq uğurla göndərildi.`);
		} else {
			setStudentStatus(
				`${successCount} tapşırıq göndərildi, ${submitErrors.length} xəta var.`,
			);
			setStudentSubmitErrors(submitErrors.slice(0, 5));
		}

		await loadTasks();
	}, [loadTasks, studentAnswers, studentSubmitting, studentVotableEntries]);

	if (authLoading) {
		return (
			<div className="page">
				<div className="card">Yüklənir...</div>
			</div>
		);
	}

	if (isStudent) {
		return (
			<div className="page">
				<section className="vote-hero">
					<div className="vote-hero__content">
						<div className="eyebrow">Səsvermə mərkəzi</div>
						<h1>Müəllimlərə bir səhifədə səs ver</h1>
						<p>
							Hər müəllimi bir kartda görürsən. Balları seç, sonra bir dəfə
							"Hamısını göndər" et.
						</p>
					</div>
					<div className="vote-hero__stats">
						<div className="stat-card">
							<div className="stat-label">Ümumi irəliləyiş</div>
							<div className="stat-value">{studentTeacherProgress}%</div>
							<div className="progress-track">
								<div
									className="progress-fill"
									style={{ width: `${studentTeacherProgress}%` }}
								/>
							</div>
						</div>
						<div className="stat-card">
							<div className="stat-label">Açıq tapşırıq</div>
							<div className="stat-value">{studentOpenTeacherTasks}</div>
							<div className="stat-meta">
								Tamamlanan: {studentDoneTeacherTasks}
							</div>
						</div>
						<div className="stat-card">
							<div className="stat-label">Müəllim kartları</div>
							<div className="stat-value">{studentVotableEntries.length}</div>
							<div className="stat-meta">Qruplaşdırılıb tək görünür</div>
						</div>
					</div>
				</section>

				<section className="card">
					<div className="section-header">
						<div>
							<h2>Açıq səsvermələr</h2>
							<p className="hint">
								Müəllimin altında dərsləri görüb eyni səhifədə qiymətləndir.
							</p>
						</div>
					</div>

					{(loading || studentQuestionsLoading) && (
						<div className="empty">Yüklənir...</div>
					)}

					{!loading &&
						!studentQuestionsLoading &&
						studentVotableEntries.length === 0 && (
							<div className="empty">Açıq səsvermə tapşırığı yoxdur.</div>
						)}

					<div className="bulk-vote-list">
						{studentVotableEntries.map((entry) => {
							const answers = studentAnswers[entry.id] ?? {};
							const requiredTotal = entry.questions.filter(
								(question) => question.data.required,
							).length;
							const requiredDone = entry.questions.filter(
								(question) =>
									question.data.required &&
									answers[question.id] !== undefined &&
									answers[question.id] !== "",
							).length;
							const answeredCount = entry.questions.filter(
								(question) =>
									answers[question.id] !== undefined && answers[question.id] !== "",
							).length;
							const entryCompletion =
								entry.questions.length === 0
									? 0
									: Math.round((answeredCount / entry.questions.length) * 100);

							return (
								<article className="bulk-vote-card" key={entry.id}>
									<div className="task-card__head">
										<div>
											<div className="task-card__title">{entry.teacherName}</div>
											<div className="task-card__meta">
												Son tarix: {formatShortDate(entry.endAt)}
											</div>
										</div>
										<span className="task-pill ok">{entry.taskIds.length} dərs</span>
									</div>

									{entry.metaItems.length > 0 && (
										<div className="bulk-meta-list">
											{entry.metaItems.map((item) => (
												<span className="bulk-meta-pill" key={`${entry.id}-${item}`}>
													{item}
												</span>
											))}
										</div>
									)}

									<div className="bulk-summary">
										<div className="bulk-summary__item">
											<div className="stat-label">Kart irəliləyişi</div>
											<div className="stat-value">{entryCompletion}%</div>
										</div>
										<div className="bulk-summary__item">
											<div className="stat-label">Məcburi suallar</div>
											<div className="stat-value">
												{requiredDone}/{requiredTotal}
											</div>
										</div>
									</div>

									{entry.questions.length === 0 ? (
										<div className="empty">Bu dövr üçün sual seti tapılmadı.</div>
									) : (
										<div className="stack">
											{entry.questions.map((question, index) => (
												<div className="question" key={`${entry.id}-${question.id}`}>
													<div className="question-title">
														<span className="question-number">#{index + 1}</span>{" "}
														{question.data.text}
														{question.data.required && (
															<span className="required">*</span>
														)}
													</div>

													{question.data.type === "scale" && (
														<div className="scale">
															{Array.from({
																length:
																	(question.data.scaleMax ?? 10) -
																	(question.data.scaleMin ?? 1) +
																	1,
															}).map((_, idx) => {
																const value = (question.data.scaleMin ?? 1) + idx;
																return (
																	<label
																		key={`${entry.id}-${question.id}-${value}`}
																		className="scale-item"
																	>
																		<input
																			type="radio"
																			name={`${entry.id}-${question.id}`}
																			value={value}
																			checked={answers[question.id] === value}
																			onChange={() =>
																				handleStudentAnswerChange(
																					entry.id,
																					question.id,
																					value,
																				)
																			}
																		/>
																		<span>{value}</span>
																	</label>
																);
															})}
														</div>
													)}

													{question.data.type === "choice" && (
														<div className="choice">
															{(question.data.options ?? []).map((option) => (
																<label
																	key={`${entry.id}-${question.id}-${option}`}
																	className="choice-item"
																>
																	<input
																		type="radio"
																		name={`${entry.id}-${question.id}`}
																		value={option}
																		checked={answers[question.id] === option}
																		onChange={() =>
																			handleStudentAnswerChange(
																				entry.id,
																				question.id,
																				option,
																			)
																		}
																	/>
																	<span>{option}</span>
																</label>
															))}
														</div>
													)}

													{question.data.type === "text" && (
														<textarea
															className="input"
															rows={4}
															placeholder="Fikrinizi yazın..."
															value={String(answers[question.id] ?? "")}
															onChange={(event) =>
																handleStudentAnswerChange(
																	entry.id,
																	question.id,
																	event.target.value,
																)
															}
														/>
													)}
												</div>
											))}
										</div>
									)}
								</article>
							);
						})}
					</div>

					{studentStatus && <div className="notice">{studentStatus}</div>}
					{studentSubmitErrors.length > 0 && (
						<div className="stack">
							{studentSubmitErrors.map((errorText) => (
								<div className="notice" key={errorText}>
									{errorText}
								</div>
							))}
						</div>
					)}

					<div className="actions">
						<button className="btn ghost" type="button" onClick={clearStudentAnswers}>
							Seçimləri təmizlə
						</button>
						<button
							className="btn primary"
							type="button"
							onClick={handleStudentSubmitAll}
							disabled={
								studentSubmitting ||
								studentVotableEntries.length === 0 ||
								loading ||
								studentQuestionsLoading
							}
						>
							{studentSubmitting ? "Göndərilir..." : "Hamısını göndər"}
						</button>
					</div>
				</section>
			</div>
		);
	}

	return (
		<div className="page">
			<section className="vote-hero">
				<div className="vote-hero__content">
					<div className="eyebrow">Səsvermə mərkəzi</div>
					<h1>Tapşırıqlarım</h1>
					<p>
						Filtrlərlə prioritetləri seç, təcili tapşırıqları önə çıxar və formu
						vaxtında tamamla.
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
									event.target.value as "all" | "teacher",
								)
							}
						>
							<option value="all">Hamısı</option>
							<option value="teacher">Müəllim</option>
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
							<p className="hint">Əvvəlcə təcili olanları tamamla.</p>
						</div>
						<span className="stat-pill">{openTasks.length}</span>
					</div>
					{loading && <div className="empty">Yüklənir...</div>}
					{!loading && openTasks.length === 0 && (
						<div className="empty">Açıq tapşırıq yoxdur.</div>
					)}
					<div className="task-board">
						{openTasks.map((task) =>
							task.cycleState.open ? (
								<Link to={`/vote/${task.id}`} className="task-card" key={task.id}>
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
							),
						)}
					</div>
				</section>

				<section className="card">
					<div className="section-header">
						<div>
							<h2>Tamamlananlar</h2>
							<p className="hint">Uğurla tamamlanan tapşırıqlar.</p>
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

