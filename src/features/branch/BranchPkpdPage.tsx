import { useEffect, useMemo, useState } from "react";
import { ORG_ID, supabase } from "../../lib/supabase";
import {
	mapAnswerRow,
	mapBiqClassResultRow,
	mapGroupRow,
	mapPkpdAchievementRow,
	mapPkpdDecisionRow,
	mapPkpdExamRow,
	mapPkpdPortfolioRow,
	mapQuestionRow,
	mapSubjectRow,
	mapSurveyCycleRow,
	mapTaskRow,
	mapTeacherRow,
	mapTeachingAssignmentRow,
} from "../../lib/supabaseMappers";
import type {
	AnswerDoc,
	BiqClassResultDoc,
	GroupDoc,
	PkpdAchievementDoc,
	PkpdDecisionDoc,
	PkpdDecisionStatus,
	PkpdExamDoc,
	PkpdPortfolioDoc,
	QuestionDoc,
	SubjectDoc,
	SurveyCycleDoc,
	TaskDoc,
	TeacherCategory,
	TeacherDoc,
	TeachingAssignmentDoc,
} from "../../lib/types";
import { chunkArray, formatShortDate, toJsDate, toNumber } from "../../lib/utils";
import { useAuth } from "../auth/AuthProvider";
import { BranchSelector } from "./BranchSelector";
import { parseSpreadsheet } from "./importUtils";
import { useBranchScope } from "./useBranchScope";

type DocEntry<T> = { id: string; data: T };

const teacherCategoryLabel = (category?: TeacherCategory) => {
	switch (category) {
		case "drama_gym":
			return "Dram/Gimnastika";
		case "chess":
			return "Şahmat";
		default:
			return "Əsas";
	}
};

const normalizeScale = (
	value: number,
	min?: number | null,
	max?: number | null,
) => {
	const safeMin = min ?? 1;
	const safeMax = max ?? 10;
	if (safeMin === 1 && safeMax === 10) return value * 10;
	if (safeMax <= safeMin) return value;
	return ((value - safeMin) / (safeMax - safeMin)) * 100;
};

const pkpdBucket = (score: number | null) => {
	if (score === null) return "-";
	if (score >= 90) return "Tələblərə tam cavab verən";
	if (score >= 80) return "Tələblərə cavab verən";
	if (score >= 60) return "Tələblərə əsasən cavab verən";
	if (score >= 50) return "İnkişaf etdirilməsi zəruri olan";
	if (score >= 30) return "İnkişafı aşağı olan";
	return "İnkişafı çox aşağı olan";
};

const decisionLabel: Record<PkpdDecisionStatus, string> = {
	PENDING: "Gözləmədə",
	APPROVED: "Uyğundur",
	REJECTED: "Uyğun deyil",
};

const portfolioLimits = (category?: TeacherCategory) => {
	if (category === "drama_gym") {
		return {
			education: 3,
			attendance: 3,
			training: 9,
			olympiad: 20,
			events: 25,
		};
	}
	if (category === "chess") {
		return {
			education: 3,
			attendance: 3,
			training: 9,
			olympiad: 30,
			events: 15,
		};
	}
	return { education: 3, attendance: 3, training: 5, olympiad: 4, events: 5 };
};

export const BranchPkpdPage = () => {
	const { user } = useAuth();
	const { branchId, setBranchId, branches, isSuperAdmin } = useBranchScope();
	const [cycles, setCycles] = useState<Array<DocEntry<SurveyCycleDoc>>>([]);
	const [selectedCycleId, setSelectedCycleId] = useState("");
	const [teachers, setTeachers] = useState<Array<DocEntry<TeacherDoc>>>([]);
	const [groups, setGroups] = useState<Array<DocEntry<GroupDoc>>>([]);
	const [subjects, setSubjects] = useState<Array<DocEntry<SubjectDoc>>>([]);
	const [assignments, setAssignments] = useState<
		Array<DocEntry<TeachingAssignmentDoc>>
	>([]);
	const [questions, setQuestions] = useState<Record<string, QuestionDoc>>({});
	const [tasks, setTasks] = useState<Array<DocEntry<TaskDoc>>>([]);
	const [answers, setAnswers] = useState<Array<DocEntry<AnswerDoc>>>([]);
	const [biqResults, setBiqResults] = useState<
		Array<DocEntry<BiqClassResultDoc>>
	>([]);
	const [examResults, setExamResults] = useState<Array<DocEntry<PkpdExamDoc>>>(
		[],
	);
	const [portfolios, setPortfolios] = useState<
		Array<DocEntry<PkpdPortfolioDoc>>
	>([]);
	const [achievements, setAchievements] = useState<
		Array<DocEntry<PkpdAchievementDoc>>
	>([]);
	const [decisions, setDecisions] = useState<Array<DocEntry<PkpdDecisionDoc>>>(
		[],
	);
	const [status, setStatus] = useState<string | null>(null);

	const [biqGroupId, setBiqGroupId] = useState("");
	const [biqSubjectId, setBiqSubjectId] = useState("");
	const [biqScore, setBiqScore] = useState("");
	const [biqImportStatus, setBiqImportStatus] = useState<string | null>(null);

	const [examDrafts, setExamDrafts] = useState<Record<string, string>>({});

	const [portfolioTeacherId, setPortfolioTeacherId] = useState("");
	const [portfolioEducation, setPortfolioEducation] = useState("");
	const [portfolioAttendance, setPortfolioAttendance] = useState("");
	const [portfolioTraining, setPortfolioTraining] = useState("");
	const [portfolioOlympiad, setPortfolioOlympiad] = useState("");
	const [portfolioEvents, setPortfolioEvents] = useState("");
	const [portfolioNote, setPortfolioNote] = useState("");

	const [achievementTeacherId, setAchievementTeacherId] = useState("");
	const [achievementType, setAchievementType] = useState("");
	const [achievementPoints, setAchievementPoints] = useState("");
	const [achievementNote, setAchievementNote] = useState("");
	const [decisionDrafts, setDecisionDrafts] = useState<
		Record<string, { status: PkpdDecisionStatus; note: string }>
	>({});

	useEffect(() => {
		const loadLookups = async () => {
			if (!branchId) return;
			const [cycleRes, teacherRes, groupRes, subjectRes, assignmentRes] =
				await Promise.all([
					supabase.from("survey_cycles").select("*").eq("org_id", ORG_ID),
					supabase
						.from("teachers")
						.select("*")
						.eq("org_id", ORG_ID)
						.is("deleted_at", null)
						.eq("branch_id", branchId),
					supabase
						.from("groups")
						.select("*")
						.eq("org_id", ORG_ID)
						.is("deleted_at", null)
						.eq("branch_id", branchId),
					supabase
						.from("subjects")
						.select("*")
						.eq("org_id", ORG_ID)
						.is("deleted_at", null),
					supabase
						.from("teaching_assignments")
						.select("*")
						.eq("org_id", ORG_ID)
						.eq("branch_id", branchId),
				]);

			const cycleDocs = (cycleRes.data ?? []).map((row) => ({
				id: row.id,
				data: mapSurveyCycleRow(row),
			}));
			const visibleCycles = cycleDocs.filter((cycle) => {
				const branchIds = cycle.data.branchIds ?? [];
				if (branchIds.length === 0) return true;
				return branchId ? branchIds.includes(branchId) : false;
			});
			setCycles(visibleCycles);
			setTeachers(
				(teacherRes.data ?? []).map((row) => ({
					id: row.id,
					data: mapTeacherRow(row),
				})),
			);
			setGroups(
				(groupRes.data ?? []).map((row) => ({
					id: row.id,
					data: mapGroupRow(row),
				})),
			);
			setSubjects(
				(subjectRes.data ?? []).map((row) => ({
					id: row.id,
					data: mapSubjectRow(row),
				})),
			);
			setAssignments(
				(assignmentRes.data ?? []).map((row) => ({
					id: row.id,
					data: mapTeachingAssignmentRow(row),
				})),
			);

			if (visibleCycles.length > 0) {
				const latest = [...visibleCycles].sort(
					(a, b) => b.data.year - a.data.year,
				)[0];
				if (
					!selectedCycleId ||
					!visibleCycles.some((cycle) => cycle.id === selectedCycleId)
				) {
					setSelectedCycleId(latest.id);
				}
			}
		};

		void loadLookups();
	}, [branchId, selectedCycleId]);

	useEffect(() => {
		const loadPkpdData = async () => {
			if (!branchId || !selectedCycleId) return;

			const [
				questionRes,
				taskRes,
				biqRes,
				examRes,
				portfolioRes,
				achievementRes,
				decisionRes,
			] = await Promise.all([
				supabase.from("questions").select("*").eq("org_id", ORG_ID),
				supabase
					.from("tasks")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("cycle_id", selectedCycleId)
					.eq("branch_id", branchId),
				supabase
					.from("biq_class_results")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("cycle_id", selectedCycleId)
					.eq("branch_id", branchId),
				supabase
					.from("pkpd_exam_results")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("cycle_id", selectedCycleId)
					.eq("branch_id", branchId),
				supabase
					.from("pkpd_portfolios")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("cycle_id", selectedCycleId)
					.eq("branch_id", branchId),
				supabase
					.from("pkpd_achievements")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("cycle_id", selectedCycleId)
					.eq("branch_id", branchId),
				supabase
					.from("pkpd_decisions")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("cycle_id", selectedCycleId)
					.eq("branch_id", branchId),
			]);

			const questionMap: Record<string, QuestionDoc> = {};
			(questionRes.data ?? []).forEach((row) => {
				questionMap[row.id] = mapQuestionRow(row);
			});
			setQuestions(questionMap);

			const taskDocs = (taskRes.data ?? []).map((row) => ({
				id: row.id,
				data: mapTaskRow(row),
			}));
			setTasks(taskDocs);

			const biqDocs = (biqRes.data ?? []).map((row) => ({
				id: row.id,
				data: mapBiqClassResultRow(row),
			}));
			setBiqResults(biqDocs);

			const examDocs = (examRes.data ?? []).map((row) => ({
				id: row.id,
				data: mapPkpdExamRow(row),
			}));
			setExamResults(examDocs);
			setExamDrafts(
				Object.fromEntries(
					examDocs.map((row) => [
						row.data.teacherId,
						row.data.score !== null ? String(row.data.score) : "",
					]),
				),
			);

			const portfolioDocs = (portfolioRes.data ?? []).map((row) => ({
				id: row.id,
				data: mapPkpdPortfolioRow(row),
			}));
			setPortfolios(portfolioDocs);

			const achievementDocs = (achievementRes.data ?? []).map((row) => ({
				id: row.id,
				data: mapPkpdAchievementRow(row),
			}));
			setAchievements(achievementDocs);

			const decisionDocs = (decisionRes.data ?? []).map((row) => ({
				id: row.id,
				data: mapPkpdDecisionRow(row),
			}));
			setDecisions(decisionDocs);
			setDecisionDrafts(
				decisionDocs.reduce<
					Record<string, { status: PkpdDecisionStatus; note: string }>
				>((acc, item) => {
					acc[item.data.teacherId] = {
						status: item.data.status ?? "PENDING",
						note: item.data.note ?? "",
					};
					return acc;
				}, {}),
			);

			if (taskDocs.length === 0) {
				setAnswers([]);
				return;
			}

			const ids = taskDocs.map((item) => item.id);
			const chunks = chunkArray(ids, 200);
			const answerDocs: Array<DocEntry<AnswerDoc>> = [];
			for (const chunk of chunks) {
				if (chunk.length === 0) continue;
				const answerRes = await supabase
					.from("answers")
					.select("*")
					.eq("org_id", ORG_ID)
					.in("submission_id", chunk);
				(answerRes.data ?? []).forEach((row) => {
					const key = `${row.submission_id}_${row.question_id}`;
					answerDocs.push({ id: key, data: mapAnswerRow(row) });
				});
			}
			setAnswers(answerDocs);
		};

		void loadPkpdData();
	}, [branchId, selectedCycleId]);

	const cycle = useMemo(
		() => cycles.find((item) => item.id === selectedCycleId),
		[cycles, selectedCycleId],
	);
	const cycleYear = cycle?.data.year ?? new Date().getFullYear();

	const teacherMap = useMemo(
		() => Object.fromEntries(teachers.map((t) => [t.id, t.data])),
		[teachers],
	);
	const groupMap = useMemo(
		() => Object.fromEntries(groups.map((g) => [g.id, g.data])),
		[groups],
	);
	const subjectMap = useMemo(
		() => Object.fromEntries(subjects.map((s) => [s.id, s.data])),
		[subjects],
	);
	const groupNameMap = useMemo(() => {
		const map = new Map<string, string>();
		groups.forEach((group) => {
			map.set(group.data.name.trim().toLowerCase(), group.id);
		});
		return map;
	}, [groups]);
	const subjectNameMap = useMemo(() => {
		const map = new Map<string, string>();
		subjects.forEach((subject) => {
			map.set(subject.data.name.trim().toLowerCase(), subject.id);
			if (subject.data.code) {
				map.set(subject.data.code.trim().toLowerCase(), subject.id);
			}
		});
		return map;
	}, [subjects]);

	const biqMap = useMemo(
		() =>
			Object.fromEntries(
				biqResults.map((item) => [
					`${item.data.groupId}_${item.data.subjectId}`,
					item.data,
				]),
			),
		[biqResults],
	);

	const portfolioMap = useMemo(
		() =>
			Object.fromEntries(
				portfolios.map((item) => [item.data.teacherId, item.data]),
			),
		[portfolios],
	);

	const portfolioTeacher = portfolioTeacherId
		? teacherMap[portfolioTeacherId]
		: undefined;
	const portfolioMax = portfolioLimits(portfolioTeacher?.category);

	const examMap = useMemo(
		() =>
			Object.fromEntries(
				examResults.map((item) => [item.data.teacherId, item.data]),
			),
		[examResults],
	);

	const achievementTotals = useMemo(() => {
		const totals: Record<string, number> = {};
		achievements.forEach((item) => {
			totals[item.data.teacherId] =
				(totals[item.data.teacherId] ?? 0) + item.data.points;
		});
		return totals;
	}, [achievements]);

	const decisionMap = useMemo(
		() =>
			Object.fromEntries(
				decisions.map((item) => [item.data.teacherId, item.data]),
			),
		[decisions],
	);

	const assignmentByTeacher = useMemo(() => {
		const map: Record<string, TeachingAssignmentDoc[]> = {};
		assignments.forEach((assignment) => {
			if (assignment.data.year !== cycleYear) return;
			map[assignment.data.teacherId] = map[assignment.data.teacherId] || [];
			map[assignment.data.teacherId].push(assignment.data);
		});
		return map;
	}, [assignments, cycleYear]);

	const flowStats = useMemo(() => {
		const taskMap = Object.fromEntries(
			tasks.map((item) => [item.id, item.data]),
		);
		const stats: Record<
			string,
			{
				student: { sum: number; count: number };
				management: { sum: number; count: number };
				self: { sum: number; count: number };
			}
		> = {};

		answers.forEach((answer) => {
			const task = taskMap[answer.data.submissionId];
			if (!task) return;
			const question = questions[answer.data.questionId];
			if (!question || question.type !== "scale") return;
			const numeric = toNumber(answer.data.value);
			if (numeric === null) return;
			const normalized = normalizeScale(
				numeric,
				question.scaleMin,
				question.scaleMax,
			);

			const targetId = task.targetId;
			stats[targetId] = stats[targetId] ?? {
				student: { sum: 0, count: 0 },
				management: { sum: 0, count: 0 },
				self: { sum: 0, count: 0 },
			};

			if (task.raterRole === "student" && task.targetType === "teacher") {
				stats[targetId].student.sum += normalized;
				stats[targetId].student.count += 1;
			} else if (
				task.raterRole === "manager" &&
				task.targetType === "teacher"
			) {
				stats[targetId].management.sum += normalized;
				stats[targetId].management.count += 1;
			} else if (
				task.raterRole === "teacher" &&
				task.targetType === "teacher"
			) {
				stats[targetId].self.sum += normalized;
				stats[targetId].self.count += 1;
			}
		});

		return stats;
	}, [answers, questions, tasks]);

	const standardTeachers = useMemo(
		() =>
			teachers.filter(
				(teacher) => (teacher.data.category ?? "standard") === "standard",
			),
		[teachers],
	);

	const summaryRows = useMemo(() => {
		return teachers.map((teacher) => {
			const category = teacher.data.category ?? "standard";
			const weights =
				category === "standard"
					? {
							student: 15,
							management: 10,
							self: 10,
							biq: 15,
							exam: 30,
							portfolio: 20,
						}
					: {
							student: 20,
							management: 10,
							self: 10,
							biq: 0,
							exam: 0,
							portfolio: 60,
						};

			const stats = flowStats[teacher.id];
			const studentAvg =
				stats && stats.student.count > 0
					? stats.student.sum / stats.student.count
					: null;
			const managementAvg =
				stats && stats.management.count > 0
					? stats.management.sum / stats.management.count
					: null;
			const selfAvg =
				stats && stats.self.count > 0
					? stats.self.sum / stats.self.count
					: null;

			const studentScore =
				studentAvg === null ? null : (studentAvg * weights.student) / 100;
			const managementScore =
				managementAvg === null
					? null
					: (managementAvg * weights.management) / 100;
			const selfScore =
				selfAvg === null ? null : (selfAvg * weights.self) / 100;

			const assignmentsForTeacher = assignmentByTeacher[teacher.id] ?? [];
			const biqScores = assignmentsForTeacher
				.map(
					(assignment) =>
						biqMap[`${assignment.groupId}_${assignment.subjectId}`]?.score,
				)
				.filter((value): value is number => typeof value === "number");
			const biqAvg =
				biqScores.length > 0
					? biqScores.reduce((a, b) => a + b, 0) / biqScores.length
					: null;
			const biqScore =
				weights.biq === 0 || biqAvg === null
					? null
					: (biqAvg * weights.biq) / 100;

			const examScore =
				weights.exam === 0 ? null : (examMap[teacher.id]?.score ?? null);
			const portfolio = portfolioMap[teacher.id];
			const limits = portfolioLimits(category);
			const portfolioScoreRaw =
				Math.min(portfolio?.educationScore ?? 0, limits.education) +
				Math.min(portfolio?.attendanceScore ?? 0, limits.attendance) +
				Math.min(portfolio?.trainingScore ?? 0, limits.training) +
				Math.min(portfolio?.olympiadScore ?? 0, limits.olympiad) +
				Math.min(portfolio?.eventsScore ?? 0, limits.events);
			const portfolioScore = portfolio ? portfolioScoreRaw : null;
			const bonus = achievementTotals[teacher.id] ?? 0;

			const baseTotal =
				(studentScore ?? 0) +
				(managementScore ?? 0) +
				(selfScore ?? 0) +
				(biqScore ?? 0) +
				(examScore ?? 0) +
				(portfolioScore ?? 0);

			const total = baseTotal + bonus;

			return {
				teacherId: teacher.id,
				name: teacher.data.name,
				category,
				studentScore,
				managementScore,
				selfScore,
				biqScore,
				examScore,
				portfolioScore,
				bonus,
				total,
			};
		});
	}, [
		achievementTotals,
		assignmentByTeacher,
		biqMap,
		examMap,
		flowStats,
		portfolioMap,
		teachers,
	]);

	const handleSaveBiq = async () => {
		if (!branchId || !selectedCycleId) return;
		if (!biqGroupId || !biqSubjectId) {
			setStatus("Qrup və fənn seçin");
			return;
		}
		const scoreValue = Number(biqScore);
		if (Number.isNaN(scoreValue) || scoreValue < 0 || scoreValue > 100) {
			setStatus("BİQ balı 0-100 arası olmalıdır");
			return;
		}

		const { error } = await supabase.from("biq_class_results").upsert(
			{
				org_id: ORG_ID,
				branch_id: branchId,
				cycle_id: selectedCycleId,
				group_id: biqGroupId,
				subject_id: biqSubjectId,
				score: scoreValue,
			},
			{ onConflict: "org_id,branch_id,cycle_id,group_id,subject_id" },
		);
		if (error) {
			setStatus("BİQ nəticəsi saxlanmadı");
			return;
		}
		setBiqScore("");
		setStatus("BİQ nəticəsi saxlanıldı");
		const { data } = await supabase
			.from("biq_class_results")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("cycle_id", selectedCycleId)
			.eq("branch_id", branchId);
		setBiqResults(
			(data ?? []).map((row) => ({
				id: row.id,
				data: mapBiqClassResultRow(row),
			})),
		);
	};

	const handleImportBiq = async (file: File) => {
		if (!branchId || !selectedCycleId) return;
		const rows = await parseSpreadsheet(file);
		const prepared: Array<{
			org_id: string;
			branch_id: string;
			cycle_id: string;
			group_id: string;
			subject_id: string;
			score: number;
		}> = [];

		let missingGroup = 0;
		let missingSubject = 0;
		let invalidScore = 0;

		rows.forEach((row) => {
			const normalized: Record<string, string> = {};
			Object.entries(row).forEach(([key, value]) => {
				normalized[key.trim().toLowerCase()] = String(value ?? "").trim();
			});

			const groupRaw =
				normalized.group_id ||
				normalized.group ||
				normalized.group_name ||
				normalized.qrup ||
				normalized.sinif ||
				normalized.class;
			const subjectRaw =
				normalized.subject_id ||
				normalized.subject ||
				normalized.subject_name ||
				normalized.fenn ||
				normalized.fənn ||
				normalized.fen;
			const scoreRaw = normalized.score || normalized.biq || normalized.bal;

			const groupId =
				(groupRaw && groupMap[groupRaw]?.branchId ? groupRaw : null) ||
				(groupRaw ? (groupNameMap.get(groupRaw.toLowerCase()) ?? null) : null);
			if (!groupId) {
				missingGroup += 1;
				return;
			}

			const subjectId =
				(subjectRaw && subjectMap[subjectRaw] ? subjectRaw : null) ||
				(subjectRaw
					? (subjectNameMap.get(subjectRaw.toLowerCase()) ?? null)
					: null);
			if (!subjectId) {
				missingSubject += 1;
				return;
			}

			const numericScore = Number(String(scoreRaw ?? "").replace(",", "."));
			if (
				Number.isNaN(numericScore) ||
				numericScore < 0 ||
				numericScore > 100
			) {
				invalidScore += 1;
				return;
			}

			prepared.push({
				org_id: ORG_ID,
				branch_id: branchId,
				cycle_id: selectedCycleId,
				group_id: groupId,
				subject_id: subjectId,
				score: numericScore,
			});
		});

		if (prepared.length === 0) {
			setBiqImportStatus("Yüklənəcək düzgün sətr tapılmadı");
			return;
		}

		const chunks = chunkArray(prepared, 200);
		for (const chunk of chunks) {
			const { error } = await supabase.from("biq_class_results").upsert(chunk, {
				onConflict: "org_id,branch_id,cycle_id,group_id,subject_id",
			});
			if (error) {
				setBiqImportStatus("BİQ import zamanı xəta oldu");
				return;
			}
		}

		const { data } = await supabase
			.from("biq_class_results")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("cycle_id", selectedCycleId)
			.eq("branch_id", branchId);
		setBiqResults(
			(data ?? []).map((row) => ({
				id: row.id,
				data: mapBiqClassResultRow(row),
			})),
		);

		const report = `Yükləndi: ${prepared.length}. Qrup tapılmadı: ${missingGroup}. Fənn tapılmadı: ${missingSubject}. Bal səhv: ${invalidScore}.`;
		setBiqImportStatus(report);
	};

	const handleDeleteBiq = async (id: string) => {
		if (!branchId || !selectedCycleId) return;
		await supabase
			.from("biq_class_results")
			.delete()
			.eq("org_id", ORG_ID)
			.eq("id", id);
		setBiqResults((prev) => prev.filter((item) => item.id !== id));
	};

	const handleSaveExam = async (teacherId: string) => {
		if (!branchId || !selectedCycleId) return;
		const raw = examDrafts[teacherId];
		if (!raw || raw.trim() === "") {
			await supabase
				.from("pkpd_exam_results")
				.delete()
				.eq("org_id", ORG_ID)
				.eq("cycle_id", selectedCycleId)
				.eq("teacher_id", teacherId);
			setExamResults((prev) =>
				prev.filter((item) => item.data.teacherId !== teacherId),
			);
			return;
		}
		const scoreValue = Number(raw);
		if (Number.isNaN(scoreValue) || scoreValue < 0 || scoreValue > 30) {
			setStatus("İmtahan balı 0-30 arası olmalıdır");
			return;
		}
		const { error } = await supabase.from("pkpd_exam_results").upsert(
			{
				org_id: ORG_ID,
				branch_id: branchId,
				cycle_id: selectedCycleId,
				teacher_id: teacherId,
				score: scoreValue,
			},
			{ onConflict: "org_id,cycle_id,teacher_id" },
		);
		if (error) {
			setStatus("İmtahan balı saxlanmadı");
			return;
		}
		const { data } = await supabase
			.from("pkpd_exam_results")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("cycle_id", selectedCycleId)
			.eq("branch_id", branchId);
		setExamResults(
			(data ?? []).map((row) => ({ id: row.id, data: mapPkpdExamRow(row) })),
		);
	};

	const loadPortfolioForTeacher = (teacherId: string) => {
		if (!teacherId) {
			setPortfolioTeacherId("");
			setPortfolioEducation("");
			setPortfolioAttendance("");
			setPortfolioTraining("");
			setPortfolioOlympiad("");
			setPortfolioEvents("");
			setPortfolioNote("");
			return;
		}
		const portfolio = portfolioMap[teacherId];
		setPortfolioTeacherId(teacherId);
		setPortfolioEducation(portfolio?.educationScore?.toString() ?? "");
		setPortfolioAttendance(portfolio?.attendanceScore?.toString() ?? "");
		setPortfolioTraining(portfolio?.trainingScore?.toString() ?? "");
		setPortfolioOlympiad(portfolio?.olympiadScore?.toString() ?? "");
		setPortfolioEvents(portfolio?.eventsScore?.toString() ?? "");
		setPortfolioNote(portfolio?.note ?? "");
	};

	const handleSavePortfolio = async () => {
		if (!branchId || !selectedCycleId || !portfolioTeacherId) return;
		const teacherCategory = teacherMap[portfolioTeacherId]?.category;
		const limits = portfolioLimits(teacherCategory);

		const educationValue = toNumber(portfolioEducation);
		const attendanceValue = toNumber(portfolioAttendance);
		const trainingValue = toNumber(portfolioTraining);
		const olympiadValue = toNumber(portfolioOlympiad);
		const eventsValue = toNumber(portfolioEvents);

		if (
			(educationValue !== null && educationValue > limits.education) ||
			(attendanceValue !== null && attendanceValue > limits.attendance) ||
			(trainingValue !== null && trainingValue > limits.training) ||
			(olympiadValue !== null && olympiadValue > limits.olympiad) ||
			(eventsValue !== null && eventsValue > limits.events)
		) {
			setStatus("Portfolio balları kateqoriyanın limitlərini aşır");
			return;
		}

		const payload = {
			org_id: ORG_ID,
			branch_id: branchId,
			cycle_id: selectedCycleId,
			teacher_id: portfolioTeacherId,
			education_score: educationValue,
			attendance_score: attendanceValue,
			training_score: trainingValue,
			olympiad_score: olympiadValue,
			events_score: eventsValue,
			note: portfolioNote.trim() || null,
		};
		const { error } = await supabase.from("pkpd_portfolios").upsert(payload, {
			onConflict: "org_id,cycle_id,teacher_id",
		});
		if (error) {
			setStatus("Portfolio saxlanmadı");
			return;
		}
		const { data } = await supabase
			.from("pkpd_portfolios")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("cycle_id", selectedCycleId)
			.eq("branch_id", branchId);
		setPortfolios(
			(data ?? []).map((row) => ({
				id: row.id,
				data: mapPkpdPortfolioRow(row),
			})),
		);
		setStatus("Portfolio saxlanıldı");
	};

	const handleAddAchievement = async () => {
		if (!branchId || !selectedCycleId) return;
		if (!achievementTeacherId || !achievementType.trim()) {
			setStatus("Müəllim və növ seçin");
			return;
		}
		const pointsValue = Number(achievementPoints);
		if (Number.isNaN(pointsValue) || pointsValue < 0 || pointsValue > 10) {
			setStatus("Bonus balı 0-10 arası olmalıdır");
			return;
		}
		const { error } = await supabase.from("pkpd_achievements").insert({
			org_id: ORG_ID,
			branch_id: branchId,
			cycle_id: selectedCycleId,
			teacher_id: achievementTeacherId,
			type: achievementType.trim(),
			points: pointsValue,
			note: achievementNote.trim() || null,
		});
		if (error) {
			setStatus("Bonus saxlanmadı");
			return;
		}
		setAchievementType("");
		setAchievementPoints("");
		setAchievementNote("");
		const { data } = await supabase
			.from("pkpd_achievements")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("cycle_id", selectedCycleId)
			.eq("branch_id", branchId);
		setAchievements(
			(data ?? []).map((row) => ({
				id: row.id,
				data: mapPkpdAchievementRow(row),
			})),
		);
		setStatus("Bonus əlavə edildi");
	};

	const handleDeleteAchievement = async (id: string) => {
		await supabase
			.from("pkpd_achievements")
			.delete()
			.eq("org_id", ORG_ID)
			.eq("id", id);
		setAchievements((prev) => prev.filter((item) => item.id !== id));
	};

	const handleSaveDecision = async (teacherId: string) => {
		if (!branchId || !selectedCycleId) return;
		const draft = decisionDrafts[teacherId] ?? { status: "PENDING", note: "" };
		const summary = summaryRows.find((row) => row.teacherId === teacherId);
		const payload = {
			org_id: ORG_ID,
			branch_id: branchId,
			cycle_id: selectedCycleId,
			teacher_id: teacherId,
			status: draft.status,
			note: draft.note.trim() || null,
			total_score: summary?.total ?? null,
			category: summary ? pkpdBucket(summary.total) : null,
			decided_by: user?.id ?? null,
			decided_at: new Date().toISOString(),
		};

		const { error } = await supabase.from("pkpd_decisions").upsert(payload, {
			onConflict: "org_id,cycle_id,teacher_id",
		});
		if (error) {
			setStatus("Qərar saxlanmadı");
			return;
		}
		const { data } = await supabase
			.from("pkpd_decisions")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("cycle_id", selectedCycleId)
			.eq("branch_id", branchId);
		setDecisions(
			(data ?? []).map((row) => ({
				id: row.id,
				data: mapPkpdDecisionRow(row),
			})),
		);
		setStatus("Qərar saxlanıldı");
	};

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
					<h2>PKPD</h2>
					<p>PKPD məlumatları və yekun hesablamalar.</p>
				</div>
				<div className="actions">
					<label className="field">
						<span className="label">Sorğu dövrü</span>
						<select
							className="input"
							value={selectedCycleId}
							onChange={(event) => setSelectedCycleId(event.target.value)}
						>
							<option value="">Sorğu dövrü seçin</option>
							{cycles.map((cycleItem) => (
								<option key={cycleItem.id} value={cycleItem.id}>
									{cycleItem.data.year} ({cycleItem.data.status})
								</option>
							))}
						</select>
					</label>
				</div>
			</div>

			{status && <div className="notice">{status}</div>}

			<div className="card">
				<h3>BİQ nəticələri (sinif + fənn)</h3>
				<div className="form-row">
					<select
						className="input"
						value={biqGroupId}
						onChange={(event) => setBiqGroupId(event.target.value)}
					>
						<option value="">Qrup</option>
						{groups.map((group) => (
							<option key={group.id} value={group.id}>
								{group.data.name} ({group.data.classLevel})
							</option>
						))}
					</select>
					<select
						className="input"
						value={biqSubjectId}
						onChange={(event) => setBiqSubjectId(event.target.value)}
					>
						<option value="">Fənn</option>
						{subjects.map((subject) => (
							<option key={subject.id} value={subject.id}>
								{subject.data.name}
							</option>
						))}
					</select>
				</div>
				<div className="form-row">
					<input
						className="input"
						type="number"
						placeholder="BİQ balı (0-100)"
						value={biqScore}
						onChange={(event) => setBiqScore(event.target.value)}
					/>
					<button
						className="btn primary"
						type="button"
						onClick={handleSaveBiq}
						disabled={!selectedCycleId}
					>
						Saxla
					</button>
				</div>
				<div className="form-row">
					<input
						className="input"
						type="file"
						accept=".csv,.xlsx"
						onChange={(event) => {
							const file = event.target.files?.[0];
							if (file) void handleImportBiq(file);
						}}
					/>
					<span className="hint">
						Şablon: group/qrup, subject/fənn, score/biq/bal
					</span>
				</div>
				{biqImportStatus && <div className="notice">{biqImportStatus}</div>}
				<div className="data-table">
					<div className="data-row header">
						<div>Qrup</div>
						<div>Fənn</div>
						<div>Bal</div>
						<div></div>
					</div>
					{biqResults.map((item) => (
						<div className="data-row" key={item.id}>
							<div>
								{groupMap[item.data.groupId]?.name ?? item.data.groupId}
							</div>
							<div>
								{subjectMap[item.data.subjectId]?.name ?? item.data.subjectId}
							</div>
							<div>{item.data.score}</div>
							<div className="actions">
								<button
									className="btn ghost"
									type="button"
									onClick={() => void handleDeleteBiq(item.id)}
								>
									Sil
								</button>
							</div>
						</div>
					))}
					{biqResults.length === 0 && (
						<div className="empty">Məlumat yoxdur.</div>
					)}
				</div>
			</div>

			<div className="card">
				<h3>Attestasiya imtahanı (0-30)</h3>
				<div className="data-table">
					<div className="data-row header">
						<div>Müəllim</div>
						<div>Bal</div>
						<div></div>
					</div>
					{standardTeachers.map((teacher) => (
						<div className="data-row" key={teacher.id}>
							<div>{teacher.data.name}</div>
							<div>
								<input
									className="input"
									type="number"
									min="0"
									max="30"
									value={examDrafts[teacher.id] ?? ""}
									onChange={(event) =>
										setExamDrafts((prev) => ({
											...prev,
											[teacher.id]: event.target.value,
										}))
									}
								/>
							</div>
							<div className="actions">
								<button
									className="btn"
									type="button"
									onClick={() => void handleSaveExam(teacher.id)}
								>
									Saxla
								</button>
							</div>
						</div>
					))}
					{standardTeachers.length === 0 && (
						<div className="empty">Standart müəllim yoxdur.</div>
					)}
				</div>
			</div>

			<div className="card">
				<h3>Portfolio (bal + qeyd)</h3>
				<div className="form-row">
					<select
						className="input"
						value={portfolioTeacherId}
						onChange={(event) => loadPortfolioForTeacher(event.target.value)}
					>
						<option value="">Müəllim seçin</option>
						{teachers.map((teacher) => (
							<option key={teacher.id} value={teacher.id}>
								{teacher.data.name} (
								{teacherCategoryLabel(teacher.data.category)})
							</option>
						))}
					</select>
				</div>
				{portfolioTeacherId && (
					<>
						<div className="form-grid">
							<input
								className="input"
								type="number"
								placeholder={`Təhsil pilləsi (max ${portfolioMax.education})`}
								value={portfolioEducation}
								onChange={(event) => setPortfolioEducation(event.target.value)}
							/>
							<input
								className="input"
								type="number"
								placeholder={`Davamiyyət (max ${portfolioMax.attendance})`}
								value={portfolioAttendance}
								onChange={(event) => setPortfolioAttendance(event.target.value)}
							/>
							<input
								className="input"
								type="number"
								placeholder={`Təlim/nəşr (max ${portfolioMax.training})`}
								value={portfolioTraining}
								onChange={(event) => setPortfolioTraining(event.target.value)}
							/>
							<input
								className="input"
								type="number"
								placeholder={`Olimpiada (max ${portfolioMax.olympiad})`}
								value={portfolioOlympiad}
								onChange={(event) => setPortfolioOlympiad(event.target.value)}
							/>
							<input
								className="input"
								type="number"
								placeholder={`Tədbir/layihə (max ${portfolioMax.events})`}
								value={portfolioEvents}
								onChange={(event) => setPortfolioEvents(event.target.value)}
							/>
						</div>
						<div className="form-row">
							<input
								className="input"
								placeholder="Qeyd (optional)"
								value={portfolioNote}
								onChange={(event) => setPortfolioNote(event.target.value)}
							/>
							<button
								className="btn primary"
								type="button"
								onClick={handleSavePortfolio}
							>
								Saxla
							</button>
						</div>
					</>
				)}
			</div>

			<div className="card">
				<h3>Bonus nailiyyətlər</h3>
				<div className="form-grid">
					<select
						className="input"
						value={achievementTeacherId}
						onChange={(event) => setAchievementTeacherId(event.target.value)}
					>
						<option value="">Müəllim</option>
						{teachers.map((teacher) => (
							<option key={teacher.id} value={teacher.id}>
								{teacher.data.name}
							</option>
						))}
					</select>
					<input
						className="input"
						placeholder="Növ (məs: Dövlət təltifi)"
						value={achievementType}
						onChange={(event) => setAchievementType(event.target.value)}
					/>
					<input
						className="input"
						type="number"
						placeholder="Bal (0-10)"
						value={achievementPoints}
						onChange={(event) => setAchievementPoints(event.target.value)}
					/>
				</div>
				<div className="form-row">
					<input
						className="input"
						placeholder="Qeyd (optional)"
						value={achievementNote}
						onChange={(event) => setAchievementNote(event.target.value)}
					/>
					<button
						className="btn primary"
						type="button"
						onClick={handleAddAchievement}
					>
						Əlavə et
					</button>
				</div>
				<div className="data-table">
					<div className="data-row header">
						<div>Müəllim</div>
						<div>Növ</div>
						<div>Bal</div>
						<div>Tarix</div>
						<div></div>
					</div>
					{achievements.map((item) => (
						<div className="data-row" key={item.id}>
							<div>
								{teacherMap[item.data.teacherId]?.name ?? item.data.teacherId}
							</div>
							<div>{item.data.type}</div>
							<div>{item.data.points}</div>
							<div>{formatShortDate(toJsDate(item.data.createdAt))}</div>
							<div className="actions">
								<button
									className="btn ghost"
									type="button"
									onClick={() => void handleDeleteAchievement(item.id)}
								>
									Sil
								</button>
							</div>
						</div>
					))}
					{achievements.length === 0 && (
						<div className="empty">Bonus yoxdur.</div>
					)}
				</div>
			</div>

			<div className="card">
				<h3>PKPD yekun cədvəli</h3>
				<div className="data-table">
					<div className="data-row header">
						<div>Müəllim</div>
						<div>Müəllim tipi</div>
						<div>Şagird</div>
						<div>Rəhbərlik</div>
						<div>Özü</div>
						<div>BİQ</div>
						<div>İmtahan</div>
						<div>Portfolio</div>
						<div>Bonus</div>
						<div>Yekun</div>
						<div>PKPD kateqoriyası</div>
						<div>Qərar</div>
						<div>Qeyd</div>
						<div></div>
					</div>
					{summaryRows.map((row) => (
						<div className="data-row" key={row.teacherId}>
							<div>{row.name}</div>
							<div>{teacherCategoryLabel(row.category)}</div>
							<div>{row.studentScore?.toFixed(1) ?? "-"}</div>
							<div>{row.managementScore?.toFixed(1) ?? "-"}</div>
							<div>{row.selfScore?.toFixed(1) ?? "-"}</div>
							<div>{row.biqScore?.toFixed(1) ?? "-"}</div>
							<div>{row.examScore?.toFixed(1) ?? "-"}</div>
							<div>{row.portfolioScore?.toFixed(1) ?? "-"}</div>
							<div>{row.bonus?.toFixed(1) ?? "-"}</div>
							<div>{row.total.toFixed(1)}</div>
							<div>{pkpdBucket(row.total)}</div>
							<div>
								<select
									className="input"
									value={
										decisionDrafts[row.teacherId]?.status ??
										decisionMap[row.teacherId]?.status ??
										"PENDING"
									}
									onChange={(event) =>
										setDecisionDrafts((prev) => ({
											...prev,
											[row.teacherId]: {
												status: event.target.value as PkpdDecisionStatus,
												note:
													prev[row.teacherId]?.note ??
													decisionMap[row.teacherId]?.note ??
													"",
											},
										}))
									}
								>
									{Object.entries(decisionLabel).map(([value, label]) => (
										<option key={value} value={value}>
											{label}
										</option>
									))}
								</select>
							</div>
							<div>
								<input
									className="input"
									placeholder="Qeyd"
									value={
										decisionDrafts[row.teacherId]?.note ??
										decisionMap[row.teacherId]?.note ??
										""
									}
									onChange={(event) =>
										setDecisionDrafts((prev) => ({
											...prev,
											[row.teacherId]: {
												status:
													prev[row.teacherId]?.status ??
													decisionMap[row.teacherId]?.status ??
													"PENDING",
												note: event.target.value,
											},
										}))
									}
								/>
							</div>
							<div className="actions">
								<button
									className="btn"
									type="button"
									onClick={() => void handleSaveDecision(row.teacherId)}
								>
									Saxla
								</button>
							</div>
						</div>
					))}
					{summaryRows.length === 0 && (
						<div className="empty">Məlumat yoxdur.</div>
					)}
				</div>
			</div>
		</div>
	);
};
