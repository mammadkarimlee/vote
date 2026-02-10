import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { InfoTip } from "../../components/InfoTip";
import { downloadCsv } from "../../lib/csv";
import { ORG_ID, supabase } from "../../lib/supabase";
import {
	mapAnswerRow,
	mapBranchRow,
	mapGroupRow,
	mapQuestionRow,
	mapQuestionSetRow,
	mapSubjectRow,
	mapSubmissionRow,
	mapSurveyCycleRow,
	mapTaskRow,
	mapTeacherRow,
} from "../../lib/supabaseMappers";
import type {
	AnswerDoc,
	BranchDoc,
	GroupDoc,
	QuestionDoc,
	SubmissionDoc,
	SubjectDoc,
	SurveyCycleDoc,
	TargetFlow,
	TaskDoc,
	TeacherDoc,
} from "../../lib/types";
import { chunkArray, formatShortDate, toJsDate, toNumber } from "../../lib/utils";

type DocEntry<T> = { id: string; data: T };
type Section = "overview" | "teachers" | "branches" | "comments" | "quality";
const SECTIONS: Array<{ key: Section; label: string }> = [
	{ key: "overview", label: "Ümumi baxış" },
	{ key: "teachers", label: "Müəllimlər" },
	{ key: "branches", label: "Filiallar" },
	{ key: "comments", label: "Şərhlər" },
	{ key: "quality", label: "Keyfiyyət" },
];
const formatAvg = (avg: number | null | undefined, count: number) =>
	avg === null || avg === undefined || count === 0 ? "-" : avg.toFixed(2);
const stdDev = (values: number[]) => {
	if (values.length < 2) return null;
	const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
	const variance =
		values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / values.length;
	return Math.sqrt(variance);
};
const flowFromTask = (task: TaskDoc): TargetFlow => {
	if (task.raterRole === "student" && task.targetType === "teacher")
		return "student_teacher";
	if (task.raterRole === "teacher" && task.targetType === "manager")
		return "teacher_management";
	if (task.raterRole === "teacher" && task.targetType === "teacher")
		return "teacher_self";
	return "management_teacher";
};
const loadAnswers = async (submissionIds: string[]) => {
	const docs: Array<DocEntry<AnswerDoc>> = [];
	for (const chunk of chunkArray(submissionIds, 200)) {
		if (chunk.length === 0) continue;
		const res = await supabase
			.from("answers")
			.select("*")
			.eq("org_id", ORG_ID)
			.in("submission_id", chunk);
		(res.data ?? []).forEach((row) => {
			docs.push({
				id: `${row.submission_id}_${row.question_id}`,
				data: mapAnswerRow(row),
			});
		});
	}
	return docs;
};

export const AdminDashboardPage = () => {
	const [cycles, setCycles] = useState<Array<DocEntry<SurveyCycleDoc>>>([]);
	const [teachers, setTeachers] = useState<Array<DocEntry<TeacherDoc>>>([]);
	const [branches, setBranches] = useState<Array<DocEntry<BranchDoc>>>([]);
	const [groups, setGroups] = useState<Array<DocEntry<GroupDoc>>>([]);
	const [subjects, setSubjects] = useState<Array<DocEntry<SubjectDoc>>>([]);
	const [questions, setQuestions] = useState<Record<string, QuestionDoc>>({});
	const [tasks, setTasks] = useState<Array<DocEntry<TaskDoc>>>([]);
	const [submissions, setSubmissions] = useState<Array<DocEntry<SubmissionDoc>>>([]);
	const [answers, setAnswers] = useState<Array<DocEntry<AnswerDoc>>>([]);
	const [prevSubmissions, setPrevSubmissions] = useState<
		Array<DocEntry<SubmissionDoc>>
	>([]);
	const [prevAnswers, setPrevAnswers] = useState<Array<DocEntry<AnswerDoc>>>([]);
	const [questionSets, setQuestionSets] = useState<Record<TargetFlow, string[]>>({
		student_teacher: [],
		teacher_management: [],
		management_teacher: [],
		teacher_self: [],
	});
	const [selectedCycleId, setSelectedCycleId] = useState("");
	const [selectedTeacherId, setSelectedTeacherId] = useState("");
	const [loading, setLoading] = useState(false);
	const [status, setStatus] = useState<string | null>(null);
	const [nowMs, setNowMs] = useState(() => Date.now());
	const [exportMode, setExportMode] = useState<"summary" | "raw" | "comments">(
		"summary",
	);
	const [reminderDays, setReminderDays] = useState("2");
	const [reminderForce, setReminderForce] = useState(false);
	const [filters, setFilters] = useState({
		branchId: "",
		teacherId: "",
		groupId: "",
		subjectId: "",
		classLevel: "",
		raterRole: "all" as "all" | "student" | "teacher" | "manager",
		targetType: "all" as "all" | "teacher" | "manager",
		search: "",
		minSubmissions: "3",
	});
	const { section } = useParams();
	const activeSection: Section =
		SECTIONS.find((item) => item.key === section)?.key ?? "overview";
	const navigate = useNavigate();

	useEffect(() => {
		if (!section || !SECTIONS.some((item) => item.key === section)) {
			navigate("/admin/dashboard/overview", { replace: true });
		}
	}, [navigate, section]);

	useEffect(() => {
		const loadLookups = async () => {
			const [cycleRes, teacherRes, branchRes, groupRes, subjectRes, questionRes] =
				await Promise.all([
					supabase.from("survey_cycles").select("*").eq("org_id", ORG_ID),
					supabase
						.from("teachers")
						.select("*")
						.eq("org_id", ORG_ID)
						.is("deleted_at", null),
					supabase
						.from("branches")
						.select("*")
						.eq("org_id", ORG_ID)
						.is("deleted_at", null),
					supabase
						.from("groups")
						.select("*")
						.eq("org_id", ORG_ID)
						.is("deleted_at", null),
					supabase
						.from("subjects")
						.select("*")
						.eq("org_id", ORG_ID)
						.is("deleted_at", null),
					supabase.from("questions").select("*").eq("org_id", ORG_ID),
				]);
			const cycleDocs = (cycleRes.data ?? []).map((row) => ({
				id: row.id,
				data: mapSurveyCycleRow(row),
			}));
			setCycles(cycleDocs);
			setTeachers(
				(teacherRes.data ?? []).map((row) => ({ id: row.id, data: mapTeacherRow(row) })),
			);
			setBranches(
				(branchRes.data ?? []).map((row) => ({ id: row.id, data: mapBranchRow(row) })),
			);
			setGroups(
				(groupRes.data ?? []).map((row) => ({ id: row.id, data: mapGroupRow(row) })),
			);
			setSubjects(
				(subjectRes.data ?? []).map((row) => ({ id: row.id, data: mapSubjectRow(row) })),
			);
			const qMap: Record<string, QuestionDoc> = {};
			(questionRes.data ?? []).forEach((row) => {
				qMap[row.id] = mapQuestionRow(row);
			});
			setQuestions(qMap);
			if (cycleDocs.length > 0) {
				const latest = [...cycleDocs].sort((a, b) => b.data.year - a.data.year)[0];
				setSelectedCycleId((prev) => prev || latest.id);
			}
		};
		void loadLookups();
	}, []);

	useEffect(() => {
		if (filters.teacherId) setSelectedTeacherId(filters.teacherId);
	}, [filters.teacherId]);

	useEffect(() => {
		setNowMs(Date.now());
	}, [selectedCycleId, submissions.length, answers.length]);

	useEffect(() => {
		const loadCycleData = async () => {
			if (!selectedCycleId) return;
			setLoading(true);
			const [taskRes, submissionRes, setRes] = await Promise.all([
				supabase
					.from("tasks")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("cycle_id", selectedCycleId),
				supabase
					.from("submissions")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("cycle_id", selectedCycleId),
				supabase
					.from("question_sets")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("cycle_id", selectedCycleId),
			]);
			const taskDocs = (taskRes.data ?? []).map((row) => ({
				id: row.id,
				data: mapTaskRow(row),
			}));
			const submissionDocs = (submissionRes.data ?? []).map((row) => ({
				id: row.task_id ?? row.id,
				data: mapSubmissionRow(row),
			}));
			const answerDocs = await loadAnswers(submissionDocs.map((item) => item.id));
			const setMap: Record<TargetFlow, string[]> = {
				student_teacher: [],
				teacher_management: [],
				management_teacher: [],
				teacher_self: [],
			};
			(setRes.data ?? []).forEach((row) => {
				const item = mapQuestionSetRow(row);
				setMap[item.targetFlow] = item.questionIds ?? [];
			});
			setTasks(taskDocs);
			setSubmissions(submissionDocs);
			setAnswers(answerDocs);
			setQuestionSets(setMap);

			const current = cycles.find((cycle) => cycle.id === selectedCycleId);
			const prev = cycles
				.filter((cycle) => cycle.data.year < (current?.data.year ?? 0))
				.sort((a, b) => b.data.year - a.data.year)[0];
			if (!prev) {
				setPrevSubmissions([]);
				setPrevAnswers([]);
				setLoading(false);
				return;
			}

			const prevSubmissionRes = await supabase
				.from("submissions")
				.select("*")
				.eq("org_id", ORG_ID)
				.eq("cycle_id", prev.id);
			const prevSubmissionDocs = (prevSubmissionRes.data ?? []).map((row) => ({
				id: row.task_id ?? row.id,
				data: mapSubmissionRow(row),
			}));
			const prevAnswerDocs = await loadAnswers(
				prevSubmissionDocs.map((item) => item.id),
			);
			setPrevSubmissions(prevSubmissionDocs);
			setPrevAnswers(prevAnswerDocs);
			setLoading(false);
		};

		void loadCycleData();
	}, [selectedCycleId, cycles]);

	const teacherMap = useMemo(
		() => Object.fromEntries(teachers.map((item) => [item.id, item.data])),
		[teachers],
	);
	const branchMap = useMemo(
		() => Object.fromEntries(branches.map((item) => [item.id, item.data])),
		[branches],
	);
	const groupMap = useMemo(
		() => Object.fromEntries(groups.map((item) => [item.id, item.data])),
		[groups],
	);
	const subjectMap = useMemo(
		() => Object.fromEntries(subjects.map((item) => [item.id, item.data])),
		[subjects],
	);
	const taskMap = useMemo(
		() => Object.fromEntries(tasks.map((item) => [item.id, item.data])),
		[tasks],
	);
	const currentCycle = cycles.find((cycle) => cycle.id === selectedCycleId);

	const filterSubmission = useCallback(
		(submission: DocEntry<SubmissionDoc>) => {
			if (filters.branchId && submission.data.branchId !== filters.branchId)
				return false;
			if (filters.teacherId && submission.data.targetId !== filters.teacherId)
				return false;
			if (filters.groupId && submission.data.groupId !== filters.groupId)
				return false;
			if (filters.subjectId && submission.data.subjectId !== filters.subjectId)
				return false;
			if (filters.classLevel) {
				const group = submission.data.groupId
					? groupMap[submission.data.groupId]
					: null;
				if (!group || group.classLevel !== filters.classLevel) return false;
			}
			const task = taskMap[submission.id];
			if (filters.raterRole !== "all" && task && task.raterRole !== filters.raterRole)
				return false;
			if (
				filters.targetType !== "all" &&
				task &&
				task.targetType !== filters.targetType
			)
				return false;
			if (filters.search.trim()) {
				const q = filters.search.trim().toLowerCase();
				const teacherName = teacherMap[submission.data.targetId]?.name ?? "";
				const groupName = submission.data.groupId
					? (groupMap[submission.data.groupId]?.name ?? "")
					: "";
				const subjectName = submission.data.subjectId
					? (subjectMap[submission.data.subjectId]?.name ?? "")
					: "";
				if (!`${teacherName} ${groupName} ${subjectName}`.toLowerCase().includes(q))
					return false;
			}
			return true;
		},
		[filters, groupMap, subjectMap, taskMap, teacherMap],
	);

	const filteredSubmissions = useMemo(
		() => submissions.filter(filterSubmission),
		[submissions, filterSubmission],
	);
	const filteredIds = useMemo(
		() => new Set(filteredSubmissions.map((item) => item.id)),
		[filteredSubmissions],
	);
	const filteredAnswers = useMemo(
		() =>
			answers.filter((answer) => filteredIds.has(answer.data.submissionId)),
		[answers, filteredIds],
	);
	const prevFilteredSubmissions = useMemo(
		() => prevSubmissions.filter(filterSubmission),
		[prevSubmissions, filterSubmission],
	);
	const prevFilteredIds = useMemo(
		() => new Set(prevFilteredSubmissions.map((item) => item.id)),
		[prevFilteredSubmissions],
	);
	const prevFilteredAnswers = useMemo(
		() =>
			prevAnswers.filter((answer) =>
				prevFilteredIds.has(answer.data.submissionId),
			),
		[prevAnswers, prevFilteredIds],
	);

	const numericValues = useMemo(
		() =>
			filteredAnswers
				.filter((answer) => questions[answer.data.questionId]?.type === "scale")
				.map((answer) => toNumber(answer.data.value))
				.filter((item): item is number => item !== null),
		[filteredAnswers, questions],
	);
	const prevNumericValues = useMemo(
		() =>
			prevFilteredAnswers
				.filter((answer) => questions[answer.data.questionId]?.type === "scale")
				.map((answer) => toNumber(answer.data.value))
				.filter((item): item is number => item !== null),
		[prevFilteredAnswers, questions],
	);
	const avgCurrent = useMemo(() => {
		if (numericValues.length === 0) return null;
		return numericValues.reduce((acc, value) => acc + value, 0) / numericValues.length;
	}, [numericValues]);
	const avgPrev = useMemo(() => {
		if (prevNumericValues.length === 0) return null;
		return (
			prevNumericValues.reduce((acc, value) => acc + value, 0) /
			prevNumericValues.length
		);
	}, [prevNumericValues]);

	const teacherStats = useMemo(() => {
		const stats: Record<
			string,
			{ sum: number; count: number; submissions: Set<string> }
		> = {};
		filteredAnswers.forEach((answer) => {
			const submission = filteredSubmissions.find(
				(item) => item.id === answer.data.submissionId,
			);
			if (!submission) return;
			if (questions[answer.data.questionId]?.type !== "scale") return;
			const numeric = toNumber(answer.data.value);
			if (numeric === null) return;
			const entry = stats[submission.data.targetId] ?? {
				sum: 0,
				count: 0,
				submissions: new Set<string>(),
			};
			entry.sum += numeric;
			entry.count += 1;
			entry.submissions.add(submission.id);
			stats[submission.data.targetId] = entry;
		});
		return Object.entries(stats)
			.map(([teacherId, entry]) => ({
				teacherId,
				avg: entry.count === 0 ? null : entry.sum / entry.count,
				submissions: entry.submissions.size,
			}))
			.sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
	}, [filteredAnswers, filteredSubmissions, questions]);

	useEffect(() => {
		if (!selectedTeacherId && teacherStats.length > 0) {
			setSelectedTeacherId(teacherStats[0].teacherId);
		}
	}, [selectedTeacherId, teacherStats]);

	const branchStats = useMemo(() => {
		const stats: Record<
			string,
			{ sum: number; count: number; submissions: Set<string> }
		> = {};
		filteredAnswers.forEach((answer) => {
			const submission = filteredSubmissions.find(
				(item) => item.id === answer.data.submissionId,
			);
			if (!submission) return;
			if (questions[answer.data.questionId]?.type !== "scale") return;
			const numeric = toNumber(answer.data.value);
			if (numeric === null) return;
			const entry = stats[submission.data.branchId] ?? {
				sum: 0,
				count: 0,
				submissions: new Set<string>(),
			};
			entry.sum += numeric;
			entry.count += 1;
			entry.submissions.add(submission.id);
			stats[submission.data.branchId] = entry;
		});
		return Object.entries(stats)
			.map(([branchId, entry]) => ({
				branchId,
				avg: entry.count === 0 ? null : entry.sum / entry.count,
				submissions: entry.submissions.size,
			}))
			.sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
	}, [filteredAnswers, filteredSubmissions, questions]);

	const commentFeed = useMemo(() => {
		return filteredAnswers
			.filter((answer) => questions[answer.data.questionId]?.type === "text")
			.map((answer) => ({
				answer,
				submission: filteredSubmissions.find(
					(item) => item.id === answer.data.submissionId,
				),
			}))
			.filter(
				(item) => item.submission && String(item.answer.data.value ?? "").trim().length > 0,
			)
			.sort((a, b) => {
				const aTime = toJsDate(a.submission?.data.createdAt)?.getTime() ?? 0;
				const bTime = toJsDate(b.submission?.data.createdAt)?.getTime() ?? 0;
				return bTime - aTime;
			});
	}, [filteredAnswers, filteredSubmissions, questions]);

	const filteredTasks = useMemo(() => {
		return tasks.filter((task) => {
			if (filters.branchId && task.data.branchId !== filters.branchId) return false;
			if (filters.teacherId && task.data.targetId !== filters.teacherId) return false;
			if (filters.groupId && task.data.groupId !== filters.groupId) return false;
			if (filters.subjectId && task.data.subjectId !== filters.subjectId)
				return false;
			if (filters.raterRole !== "all" && task.data.raterRole !== filters.raterRole)
				return false;
			if (
				filters.targetType !== "all" &&
				task.data.targetType !== filters.targetType
			)
				return false;
			return true;
		});
	}, [tasks, filters]);

	const participation = useMemo(() => {
		const done = filteredTasks.filter((task) => task.data.status === "DONE").length;
		const total = filteredTasks.length;
		const uniqueRaters = new Set(filteredTasks.map((task) => task.data.raterUid));
		const doneRaters = new Set(
			filteredTasks
				.filter((task) => task.data.status === "DONE")
				.map((task) => task.data.raterUid),
		);
		return {
			done,
			total,
			open: total - done,
			completionRate: total === 0 ? 0 : (done / total) * 100,
			coverageRate:
				uniqueRaters.size === 0 ? 0 : (doneRaters.size / uniqueRaters.size) * 100,
		};
	}, [filteredTasks]);

	const riskThreshold = currentCycle?.data.thresholds?.y ?? 3;
	const riskTeachers = teacherStats.filter(
		(item) => item.avg !== null && item.avg < riskThreshold,
	);

	const quality = useMemo(() => {
		const bySubmission: Record<string, Array<DocEntry<AnswerDoc>>> = {};
		filteredAnswers.forEach((answer) => {
			bySubmission[answer.data.submissionId] =
				bySubmission[answer.data.submissionId] ?? [];
			bySubmission[answer.data.submissionId].push(answer);
		});
		let expectedRequired = 0;
		let answeredRequired = 0;
		let textSubmissions = 0;
		let uniformSubmissions = 0;
		let missingContext = 0;
		let latestTs = 0;
		const teacherCounts: Record<string, number> = {};

		filteredSubmissions.forEach((submission) => {
			const task = taskMap[submission.id];
			const flow = task ? flowFromTask(task) : null;
			const requiredIds = (flow ? questionSets[flow] : []).filter(
				(id) => questions[id]?.required,
			);
			expectedRequired += requiredIds.length;
			const local = bySubmission[submission.id] ?? [];
			const localLookup = Object.fromEntries(
				local.map((item) => [item.data.questionId, item.data]),
			);
			requiredIds.forEach((id) => {
				const answer = localLookup[id];
				if (!answer) return;
				if (typeof answer.value === "number") {
					answeredRequired += 1;
					return;
				}
				if (String(answer.value ?? "").trim().length > 0) answeredRequired += 1;
			});
			const scoreValues = local
				.filter((item) => questions[item.data.questionId]?.type === "scale")
				.map((item) => toNumber(item.data.value))
				.filter((item): item is number => item !== null);
			if (scoreValues.length > 1 && scoreValues.every((v) => v === scoreValues[0])) {
				uniformSubmissions += 1;
			}
			if (
				local.some(
					(item) =>
						questions[item.data.questionId]?.type === "text" &&
						String(item.data.value ?? "").trim().length > 0,
				)
			) {
				textSubmissions += 1;
			}
			if (!submission.data.groupId || !submission.data.subjectId) missingContext += 1;
			teacherCounts[submission.data.targetId] =
				(teacherCounts[submission.data.targetId] ?? 0) + 1;
			latestTs = Math.max(latestTs, toJsDate(submission.data.createdAt)?.getTime() ?? 0);
		});
		const minSample = Number(filters.minSubmissions || 3);
		const lowSample = Object.values(teacherCounts).filter((v) => v < minSample).length;
		const teacherTotal = Object.keys(teacherCounts).length;
		return {
			requiredRate:
				expectedRequired === 0 ? 100 : (answeredRequired / expectedRequired) * 100,
			textRate:
				filteredSubmissions.length === 0
					? 0
					: (textSubmissions / filteredSubmissions.length) * 100,
			uniformRate:
				filteredSubmissions.length === 0
					? 0
					: (uniformSubmissions / filteredSubmissions.length) * 100,
			std: stdDev(numericValues),
			lowSample,
			lowSampleRate:
				teacherTotal === 0 ? 0 : (lowSample / teacherTotal) * 100,
			staleDays:
				latestTs === 0 ? null : Math.floor((nowMs - latestTs) / 86400000),
			missingContextRate:
				filteredSubmissions.length === 0
					? 0
					: (missingContext / filteredSubmissions.length) * 100,
		};
	}, [filteredAnswers, filteredSubmissions, taskMap, questionSets, questions, filters.minSubmissions, numericValues, nowMs]);

	const selectedTeacherSubmissions = useMemo(
		() => filteredSubmissions.filter((item) => item.data.targetId === selectedTeacherId),
		[filteredSubmissions, selectedTeacherId],
	);

	const handleExport = () => {
		if (!selectedCycleId) return;
		const cycleYear = currentCycle?.data.year ?? "-";
		if (exportMode === "summary") {
			downloadCsv(
				`dashboard-summary-${cycleYear}.csv`,
				["cycle_year", "teacher_name", "teacher_id", "avg", "submissions"],
				teacherStats.map((item) => [
					cycleYear,
					teacherMap[item.teacherId]?.name ?? item.teacherId,
					item.teacherId,
					item.avg === null ? "" : item.avg.toFixed(2),
					item.submissions,
				]),
			);
			return;
		}
		if (exportMode === "comments") {
			downloadCsv(
				`dashboard-comments-${cycleYear}.csv`,
				["cycle_year", "teacher", "question", "comment", "date"],
				commentFeed.map((item) => [
					cycleYear,
					item.submission
						? (teacherMap[item.submission.data.targetId]?.name ??
							item.submission.data.targetId)
						: "-",
					questions[item.answer.data.questionId]?.text ?? item.answer.data.questionId,
					String(item.answer.data.value ?? ""),
					formatShortDate(toJsDate(item.submission?.data.createdAt)),
				]),
			);
			return;
		}
		downloadCsv(
			`dashboard-raw-${cycleYear}.csv`,
			["cycle_year", "submission_id", "teacher", "question", "type", "value"],
			filteredAnswers.map((answer) => {
				const submission = filteredSubmissions.find(
					(item) => item.id === answer.data.submissionId,
				);
				const question = questions[answer.data.questionId];
				return [
					cycleYear,
					answer.data.submissionId,
					submission
						? (teacherMap[submission.data.targetId]?.name ??
							submission.data.targetId)
						: "-",
					question?.text ?? answer.data.questionId,
					question?.type ?? "-",
					typeof answer.data.value === "object"
						? JSON.stringify(answer.data.value)
						: String(answer.data.value ?? ""),
				];
			}),
		);
	};

	const sendReminders = async () => {
		if (!selectedCycleId) return;
		setStatus(null);
		const { data, error } = await supabase.rpc("create_cycle_reminders", {
			p_cycle_id: selectedCycleId,
			p_days_before: Number(reminderDays || 0),
			p_force: reminderForce,
		});
		if (error) {
			setStatus(error.message || "Xatırlatma göndərilə bilmədi");
			return;
		}
		setStatus(`${data ?? 0} xatırlatma yaradıldı.`);
	};

	return (
		<div className="panel">
			<section className="page-hero">
				<div className="page-hero__content">
					<div className="eyebrow">İdarəetmə paneli</div>
					<h2>Rəhbərlik paneli</h2>
					<p>
						Filtrlənmiş nəticələrə əsasən performans, risk və keyfiyyət monitorinqi.
					</p>
				</div>
				<div className="page-hero__aside">
					<label className="field">
						<span className="label">Sorğu dövrü</span>
						<select
							className="input"
							value={selectedCycleId}
							onChange={(event) => setSelectedCycleId(event.target.value)}
						>
							<option value="">Dövr seçin</option>
							{cycles.map((cycle) => (
								<option key={cycle.id} value={cycle.id}>
									{cycle.data.year} ({cycle.data.status})
								</option>
							))}
						</select>
					</label>
					<div className="form-row">
						<select
							className="input"
							value={exportMode}
							onChange={(event) =>
								setExportMode(event.target.value as "summary" | "raw" | "comments")
							}
						>
							<option value="summary">Xülasə ixracı</option>
							<option value="raw">Ətraflı ixrac</option>
							<option value="comments">Şərhlər ixracı</option>
						</select>
						<button className="btn" type="button" onClick={handleExport}>
							CSV ixracı
						</button>
					</div>
				</div>
			</section>

			<div className="segmented">
				{SECTIONS.map((item) => (
					<NavLink
						key={item.key}
						to={`/admin/dashboard/${item.key}`}
						className={`segmented__item${activeSection === item.key ? " active" : ""}`}
					>
						{item.label}
					</NavLink>
				))}
			</div>

			<div className="card">
				<div className="filters">
					<label className="field">
						<span className="label">Filial</span>
						<select
							className="input"
							value={filters.branchId}
							onChange={(event) =>
								setFilters((prev) => ({ ...prev, branchId: event.target.value }))
							}
						>
							<option value="">Hamısı</option>
							{branches.map((branch) => (
								<option key={branch.id} value={branch.id}>
									{branch.data.name}
								</option>
							))}
						</select>
					</label>
					<label className="field">
						<span className="label">Müəllim</span>
						<select
							className="input"
							value={filters.teacherId}
							onChange={(event) =>
								setFilters((prev) => ({ ...prev, teacherId: event.target.value }))
							}
						>
							<option value="">Hamısı</option>
							{teachers.map((teacher) => (
								<option key={teacher.id} value={teacher.id}>
									{teacher.data.name}
								</option>
							))}
						</select>
					</label>
					<label className="field">
						<span className="label">Qrup</span>
						<select
							className="input"
							value={filters.groupId}
							onChange={(event) =>
								setFilters((prev) => ({ ...prev, groupId: event.target.value }))
							}
						>
							<option value="">Hamısı</option>
							{groups.map((group) => (
								<option key={group.id} value={group.id}>
									{group.data.name}
								</option>
							))}
						</select>
					</label>
					<label className="field">
						<span className="label">Sinif səviyyəsi</span>
						<select
							className="input"
							value={filters.classLevel}
							onChange={(event) =>
								setFilters((prev) => ({
									...prev,
									classLevel: event.target.value,
								}))
							}
						>
							<option value="">Hamısı</option>
							{Array.from(new Set(groups.map((group) => group.data.classLevel))).map(
								(level) => (
									<option key={level} value={level}>
										{level}
									</option>
								),
							)}
						</select>
					</label>
					<label className="field">
						<span className="label">Fənn</span>
						<select
							className="input"
							value={filters.subjectId}
							onChange={(event) =>
								setFilters((prev) => ({ ...prev, subjectId: event.target.value }))
							}
						>
							<option value="">Hamısı</option>
							{subjects.map((subject) => (
								<option key={subject.id} value={subject.id}>
									{subject.data.name}
								</option>
							))}
						</select>
					</label>
					<label className="field">
						<span className="label">Qiymətləndirən rolu</span>
						<select
							className="input"
							value={filters.raterRole}
							onChange={(event) =>
								setFilters((prev) => ({
									...prev,
									raterRole: event.target.value as "all" | "student" | "teacher" | "manager",
								}))
							}
						>
							<option value="all">Hamısı</option>
							<option value="student">Şagird</option>
							<option value="teacher">Müəllim</option>
							<option value="manager">Rəhbər</option>
						</select>
					</label>
					<label className="field">
						<span className="label">Hədəf tipi</span>
						<select
							className="input"
							value={filters.targetType}
							onChange={(event) =>
								setFilters((prev) => ({
									...prev,
									targetType: event.target.value as "all" | "teacher" | "manager",
								}))
							}
						>
							<option value="all">Hamısı</option>
							<option value="teacher">Müəllim</option>
							<option value="manager">Rəhbər</option>
						</select>
					</label>
					<label className="field">
						<span className="label">Axtarış</span>
						<input
							className="input"
							value={filters.search}
							onChange={(event) =>
								setFilters((prev) => ({ ...prev, search: event.target.value }))
							}
						/>
					</label>
				</div>
				<div className="divider" />
				<div className="form-row">
					<label className="field">
						<span className="label">Xatırlatma günü</span>
						<input
							className="input"
							type="number"
							value={reminderDays}
							onChange={(event) => setReminderDays(event.target.value)}
						/>
					</label>
					<label className="check-item">
						<input
							type="checkbox"
							checked={reminderForce}
							onChange={(event) => setReminderForce(event.target.checked)}
						/>
						<span>Məcburi xatırlatma</span>
					</label>
					<button className="btn" type="button" onClick={sendReminders}>
						Xatırlatma yarat
					</button>
					<label className="field">
						<span className="label">Minimum nümunə</span>
						<input
							className="input"
							type="number"
							value={filters.minSubmissions}
							onChange={(event) =>
								setFilters((prev) => ({
									...prev,
									minSubmissions: event.target.value,
								}))
							}
						/>
					</label>
				</div>
				{status && <div className="notice">{status}</div>}
			</div>

			{loading && <div className="card">Yüklənir...</div>}

			{activeSection === "overview" && (
				<>
					<div className="grid three">
						<div className="stat-card">
							<div className="stat-label">
								Cari orta göstərici
								<InfoTip text="Filtrlənmiş şkala cavablarının orta göstəricisi." />
							</div>
							<div className="stat-value">{formatAvg(avgCurrent, numericValues.length)}</div>
							<div className="stat-meta">n={filteredSubmissions.length}</div>
						</div>
						<div className="stat-card">
							<div className="stat-label">Ötən il orta göstərici</div>
							<div className="stat-value">
								{formatAvg(avgPrev, prevFilteredSubmissions.length)}
							</div>
							<div className="stat-meta">
								Fərq:{" "}
								{avgCurrent !== null && avgPrev !== null
									? `${avgCurrent > avgPrev ? "+" : ""}${(avgCurrent - avgPrev).toFixed(2)}`
									: "-"}
							</div>
						</div>
						<div className="stat-card">
							<div className="stat-label">İştirak</div>
							<div className="stat-value">{participation.completionRate.toFixed(1)}%</div>
							<div className="stat-meta">
								{participation.done}/{participation.total}
							</div>
						</div>
						<div className="stat-card">
							<div className="stat-label">Əhatə</div>
							<div className="stat-value">{participation.coverageRate.toFixed(1)}%</div>
							<div className="stat-meta">Aktiv qiymətləndirici payı</div>
						</div>
						<div className="stat-card">
							<div className="stat-label">Risk müəllimlər</div>
							<div className="stat-value">{riskTeachers.length}</div>
							<div className="stat-meta">Hədd: {riskThreshold}</div>
						</div>
						<div className="stat-card">
							<div className="stat-label">Açıq tapşırıqlar</div>
							<div className="stat-value">{participation.open}</div>
							<div className="stat-meta">Xatırlatma üçün prioritet</div>
						</div>
					</div>

					<div className="grid two">
						<div className="card">
							<h3>Ən yüksək nəticəli müəllimlər</h3>
							<div className="data-table">
								<div className="data-row header">
									<div>Müəllim</div>
									<div>Orta</div>
									<div>n</div>
								</div>
								{teacherStats.slice(0, 8).map((item) => (
									<div className="data-row" key={item.teacherId}>
										<div>{teacherMap[item.teacherId]?.name ?? item.teacherId}</div>
										<div>{formatAvg(item.avg, item.submissions)}</div>
										<div>{item.submissions}</div>
									</div>
								))}
								{teacherStats.length === 0 && (
									<div className="empty">Məlumat yoxdur.</div>
								)}
							</div>
						</div>
						<div className="card">
							<h3>Risk siyahısı</h3>
							<div className="data-table">
								<div className="data-row header">
									<div>Müəllim</div>
									<div>Orta</div>
									<div>n</div>
								</div>
								{riskTeachers.map((item) => (
									<div className="data-row" key={item.teacherId}>
										<div>{teacherMap[item.teacherId]?.name ?? item.teacherId}</div>
										<div>{formatAvg(item.avg, item.submissions)}</div>
										<div>{item.submissions}</div>
									</div>
								))}
								{riskTeachers.length === 0 && <div className="empty">Risk yoxdur.</div>}
							</div>
						</div>
					</div>
				</>
			)}

			{activeSection === "teachers" && (
				<div className="card">
					<div className="form-row">
						<select
							className="input"
							value={selectedTeacherId}
							onChange={(event) => setSelectedTeacherId(event.target.value)}
						>
							<option value="">Müəllim seçin</option>
							{teachers.map((teacher) => (
								<option key={teacher.id} value={teacher.id}>
									{teacher.data.name}
								</option>
							))}
						</select>
						<div className="stat-pill">
							Səsvermə sayı: {selectedTeacherSubmissions.length}
						</div>
					</div>
					<div className="data-table">
						<div className="data-row header">
							<div>Qrup</div>
							<div>Fənn</div>
							<div>Tarix</div>
						</div>
						{selectedTeacherSubmissions.map((submission) => (
							<div className="data-row" key={submission.id}>
								<div>
									{submission.data.groupId
										? (groupMap[submission.data.groupId]?.name ?? "-")
										: "-"}
								</div>
								<div>
									{submission.data.subjectId
										? (subjectMap[submission.data.subjectId]?.name ?? "-")
										: "-"}
								</div>
								<div>{formatShortDate(toJsDate(submission.data.createdAt))}</div>
							</div>
						))}
						{selectedTeacherSubmissions.length === 0 && (
							<div className="empty">Səsvermə yoxdur.</div>
						)}
					</div>
				</div>
			)}

			{activeSection === "branches" && (
				<div className="card">
					<h3>Filial müqayisəsi</h3>
					<div className="data-table">
						<div className="data-row header">
							<div>Filial</div>
							<div>Orta</div>
							<div>n</div>
						</div>
						{branchStats.map((item) => (
							<div className="data-row" key={item.branchId}>
								<div>{branchMap[item.branchId]?.name ?? item.branchId}</div>
								<div>{formatAvg(item.avg, item.submissions)}</div>
								<div>{item.submissions}</div>
							</div>
						))}
						{branchStats.length === 0 && <div className="empty">Məlumat yoxdur.</div>}
					</div>
				</div>
			)}

			{activeSection === "comments" && (
				<div className="card">
					<h3>Şərh axını</h3>
					<div className="comment-feed">
						{commentFeed.map((item, index) => (
							<div className="comment" key={`${item.submission?.id}_${index}`}>
								<div className="comment-title">
									{item.submission
										? (teacherMap[item.submission.data.targetId]?.name ??
											item.submission.data.targetId)
										: "-"}
								</div>
								<div className="comment-meta">
									{questions[item.answer.data.questionId]?.text ?? "-"}
								</div>
								<div className="comment-text">
									{String(item.answer.data.value ?? "")}
								</div>
							</div>
						))}
						{commentFeed.length === 0 && <div className="empty">Şərh yoxdur.</div>}
					</div>
				</div>
			)}

			{activeSection === "quality" && (
				<>
					<div className="grid three">
						<div className="stat-card">
							<div className="stat-label">Məcburi sualların tamamlanması</div>
							<div className="stat-value">{quality.requiredRate.toFixed(1)}%</div>
						</div>
						<div className="stat-card">
							<div className="stat-label">Mətn cavabı əhatəsi</div>
							<div className="stat-value">{quality.textRate.toFixed(1)}%</div>
						</div>
						<div className="stat-card">
							<div className="stat-label">Şkala üzrə standart yayınma</div>
							<div className="stat-value">
								{quality.std === null ? "-" : quality.std.toFixed(2)}
							</div>
						</div>
						<div className="stat-card">
							<div className="stat-label">Eyni tipli cavab payı</div>
							<div className="stat-value">{quality.uniformRate.toFixed(1)}%</div>
						</div>
						<div className="stat-card">
							<div className="stat-label">Aşağı nümunə sayı</div>
							<div className="stat-value">{quality.lowSample}</div>
							<div className="stat-meta">{quality.lowSampleRate.toFixed(1)}%</div>
						</div>
						<div className="stat-card">
							<div className="stat-label">Məlumatın aktuallığı</div>
							<div className="stat-value">
								{quality.staleDays === null ? "-" : `${quality.staleDays} gün`}
							</div>
							<div className="stat-meta">
								Kontekst boşluğu: {quality.missingContextRate.toFixed(1)}%
							</div>
						</div>
					</div>
					<div className="card">
						<div className="stack">
							<div className="notice">
								{quality.requiredRate < 95
									? "Məcburi sualların tamamlanma faizi aşağıdır."
									: "Məcburi suallar üzrə tamamlanma stabildir."}
							</div>
							<div className="notice">
								{quality.uniformRate > 35
									? "Eyni tipli cavablar çoxdur, sual keyfiyyəti audit olunmalıdır."
									: "Eyni tipli cavablar məqbul həddədir."}
							</div>
							<div className="notice">
								{quality.missingContextRate > 10
									? "Qrup/fənn konteksti olmayan səsvermə çoxdur."
									: "Səsvermə konteksti yetərlidir."}
							</div>
						</div>
					</div>
				</>
			)}
		</div>
	);
};
