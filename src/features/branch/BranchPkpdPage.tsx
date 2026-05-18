import { useEffect, useMemo, useState } from "react";
import { useFeedbackState } from "../../components/feedback/FeedbackProvider";
import { PaginationControls } from "../../components/PaginationControls";
import { ORG_ID, supabase } from "../../lib/supabase";
import {
	mapAnswerRow,
	mapBiqClassResultRow,
	mapGroupRow,
	mapPkpdAchievementRow,
	mapPkpdDecisionRow,
	mapPkpdExamRow,
	mapPkpdPortfolioRow,
	mapPkpdSelfReviewRow,
	mapPkpdTeacherBiqResultRow,
	mapQuestionRow,
	mapSubjectRow,
	mapSurveyCycleRow,
	mapTaskRow,
	mapTeacherRow,
	mapTeachingAssignmentRow,
} from "../../lib/supabaseMappers";
import {
	buildPkpdSelfReviewNote,
	isPkpdSelfReviewQuestionScoresError,
} from "../../lib/pkpdSelfReview";
import {
	computePkpdPortfolioScore,
	getPkpdPortfolioLimits,
	getPkpdWeights,
	normalizePkpdScale,
	pkpdBucket,
} from "../../lib/pkpdScoring";
import type {
	AnswerDoc,
	BiqClassResultDoc,
	GroupDoc,
	PkpdAchievementDoc,
	PkpdDecisionDoc,
	PkpdDecisionStatus,
	PkpdExamDoc,
	PkpdPortfolioDoc,
	PkpdSelfReviewDoc,
	PkpdTeacherBiqResultDoc,
	QuestionDoc,
	SubjectDoc,
	SurveyCycleDoc,
	TaskDoc,
	TeacherCategory,
	TeacherDoc,
	TeachingAssignmentDoc,
} from "../../lib/types";
import { usePagination } from "../../lib/usePagination";
import {
	chunkArray,
	chunkValuesForInFilter,
	formatShortDate,
	toJsDate,
	toNumber,
} from "../../lib/utils";
import { useAuth } from "../auth/AuthProvider";
import { BranchSelector } from "./BranchSelector";
import { parseSpreadsheet } from "./importUtils";
import { useBranchScope } from "./useBranchScope";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../../components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";

type DocEntry<T> = { id: string; data: T };
type SummaryRow = {
	teacherId: string;
	name: string;
	category: TeacherCategory;
	studentScore: number | null;
	managementScore: number | null;
	selfScore: number | null;
	hrSelfReviewScore: number | null;
	biqScore: number | null;
	examScore: number | null;
	portfolioScore: number | null;
	bonus: number;
	total: number;
};

const teacherCategoryLabel = (category?: TeacherCategory) => {
	switch (category) {
		case "drama_gym":
			return "Dram/Gimnastika";
		case "chess":
			return "Åžahmat";
		default:
			return "Æsas";
	}
};

const decisionLabel: Record<PkpdDecisionStatus, string> = {
	PENDING: "GÃ¶zlÉ™mÉ™dÉ™",
	APPROVED: "UyÄŸundur",
	REJECTED: "UyÄŸun deyil",
};

const formatScoreValue = (value: number | null) =>
	value === null ? "-" : value.toFixed(1);

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
	const [teacherBiqResults, setTeacherBiqResults] = useState<
		Array<DocEntry<PkpdTeacherBiqResultDoc>>
	>([]);
	const [examResults, setExamResults] = useState<Array<DocEntry<PkpdExamDoc>>>(
		[],
	);
	const [portfolios, setPortfolios] = useState<
		Array<DocEntry<PkpdPortfolioDoc>>
	>([]);
	const [selfReviews, setSelfReviews] = useState<
		Array<DocEntry<PkpdSelfReviewDoc>>
	>([]);
	const [achievements, setAchievements] = useState<
		Array<DocEntry<PkpdAchievementDoc>>
	>([]);
	const [decisions, setDecisions] = useState<Array<DocEntry<PkpdDecisionDoc>>>(
		[],
	);
	const [status, setStatus] = useFeedbackState();

	const [biqGroupId, setBiqGroupId] = useState("");
	const [biqSubjectId, setBiqSubjectId] = useState("");
	const [biqScore, setBiqScore] = useState("");
	const [biqImportStatus, setBiqImportStatus] = useFeedbackState();
	const [teacherBiqTeacherId, setTeacherBiqTeacherId] = useState("");
	const [teacherBiqGroupId, setTeacherBiqGroupId] = useState("");
	const [teacherBiqSubjectId, setTeacherBiqSubjectId] = useState("");
	const [teacherBiqScore, setTeacherBiqScore] = useState("");
	const [teacherBiqEditTeacherId, setTeacherBiqEditTeacherId] = useState<
		string | null
	>(null);
	const [teacherBiqEditAssignmentKey, setTeacherBiqEditAssignmentKey] =
		useState("");
	const [teacherBiqEditScore, setTeacherBiqEditScore] = useState("");
	const [teacherBiqEditSaving, setTeacherBiqEditSaving] = useState(false);
	const [teacherBiqImportStatus, setTeacherBiqImportStatus] = useFeedbackState();

	const [examDrafts, setExamDrafts] = useState<Record<string, string>>({});
	const [examImportStatus, setExamImportStatus] = useFeedbackState();

	const [portfolioTeacherId, setPortfolioTeacherId] = useState("");
	const [portfolioEducation, setPortfolioEducation] = useState("");
	const [portfolioAttendance, setPortfolioAttendance] = useState("");
	const [portfolioTraining, setPortfolioTraining] = useState("");
	const [portfolioOlympiad, setPortfolioOlympiad] = useState("");
	const [portfolioEvents, setPortfolioEvents] = useState("");
	const [portfolioNote, setPortfolioNote] = useState("");
	const [selfReviewTeacherId, setSelfReviewTeacherId] = useState("");
	const [selfReviewScore, setSelfReviewScore] = useState("");
	const [selfReviewNote, setSelfReviewNote] = useState("");
	const [selfReviewEditUnlocked, setSelfReviewEditUnlocked] = useState(false);
	const [selfReviewUnlockOpen, setSelfReviewUnlockOpen] = useState(false);
	const [selfReviewUnlockPassword, setSelfReviewUnlockPassword] = useState("");
	const [selfReviewUnlockReason, setSelfReviewUnlockReason] = useState("");
	const [selfReviewUnlockError, setSelfReviewUnlockError] = useFeedbackState();
	const [selfReviewUnlockSubmitting, setSelfReviewUnlockSubmitting] =
		useState(false);

	const [achievementTeacherId, setAchievementTeacherId] = useState("");
	const [achievementType, setAchievementType] = useState("");
	const [achievementPoints, setAchievementPoints] = useState("");
	const [achievementNote, setAchievementNote] = useState("");
	const [decisionDrafts, setDecisionDrafts] = useState<
		Record<string, { status: PkpdDecisionStatus; note: string }>
	>({});
	const [selectedSummaryTeacherId, setSelectedSummaryTeacherId] = useState<
		string | null
	>(null);

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
				teacherBiqRes,
				examRes,
				portfolioRes,
				selfReviewRes,
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
					.from("pkpd_teacher_biq_results")
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
					.from("pkpd_self_reviews")
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
			const teacherBiqDocs = (teacherBiqRes.data ?? []).map((row) => ({
				id: row.id,
				data: mapPkpdTeacherBiqResultRow(row),
			}));
			setTeacherBiqResults(teacherBiqDocs);

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

			const selfReviewDocs = (selfReviewRes.data ?? []).map((row) => ({
				id: row.id,
				data: mapPkpdSelfReviewRow(row),
			}));
			setSelfReviews(selfReviewDocs);

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

			const ids = Array.from(new Set(taskDocs.map((item) => item.id)));
			const chunks = chunkValuesForInFilter(ids);
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
	const teacherNameMap = useMemo(() => {
		const map = new Map<string, string>();
		teachers.forEach((teacher) => {
			const normalizedName = teacher.data.name.trim().toLowerCase();
			map.set(normalizedName, teacher.id);
			if (teacher.data.login) {
				map.set(teacher.data.login.trim().toLowerCase(), teacher.id);
			}
		});
		return map;
	}, [teachers]);

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
	const teacherBiqMap = useMemo(
		() =>
			Object.fromEntries(
				teacherBiqResults.map((item) => [
					`${item.data.teacherId}_${item.data.groupId}_${item.data.subjectId}`,
					item.data,
				]),
			),
		[teacherBiqResults],
	);

	const portfolioMap = useMemo(
		() =>
			Object.fromEntries(
				portfolios.map((item) => [item.data.teacherId, item.data]),
			),
		[portfolios],
	);
	const selfReviewMap = useMemo(
		() =>
			Object.fromEntries(
				selfReviews.map((item) => [item.data.teacherId, item.data]),
			),
		[selfReviews],
	);

	const portfolioTeacher = portfolioTeacherId
		? teacherMap[portfolioTeacherId]
		: undefined;
	const portfolioMax = getPkpdPortfolioLimits(portfolioTeacher?.category);
	const selfReviewTeacher = selfReviewTeacherId
		? teacherMap[selfReviewTeacherId]
		: null;

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

	const teacherSelfResponses = useMemo(() => {
		const taskMap = Object.fromEntries(tasks.map((item) => [item.id, item.data]));
		const responseMap: Record<
			string,
			{
				declaredScore: number | null;
				textAnswers: Array<{ questionId: string; questionText: string; answerText: string }>;
			}
		> = {};

		answers.forEach((answer) => {
			const task = taskMap[answer.data.submissionId];
			if (!task) return;
			if (task.raterRole !== "teacher" || task.targetType !== "teacher") return;

			const question = questions[answer.data.questionId];
			if (!question) return;
			if (question.category !== "teacher_self_pkpd") return;

			const teacherId = task.targetId;
			responseMap[teacherId] = responseMap[teacherId] ?? {
				declaredScore: null,
				textAnswers: [],
			};

			if (question.type === "scale") {
				const numeric = toNumber(answer.data.value);
				if (numeric !== null) {
					responseMap[teacherId].declaredScore = numeric;
				}
				return;
			}

			if (question.type !== "text") return;
			const answerText =
				typeof answer.data.value === "string"
					? answer.data.value
					: String(answer.data.value ?? "");
			if (!answerText.trim()) return;

			responseMap[teacherId].textAnswers.push({
				questionId: answer.data.questionId,
				questionText: question.text,
				answerText,
			});
		});

		return responseMap;
	}, [answers, questions, tasks]);
	const selectedTeacherSelfResponse = selfReviewTeacherId
		? (teacherSelfResponses[selfReviewTeacherId] ?? null)
		: null;
	const selectedTeacherSelfReview = selfReviewTeacherId
		? (selfReviewMap[selfReviewTeacherId] ?? null)
		: null;
	const selectedTeacherHasSavedSelfReview = Boolean(
		selectedTeacherSelfReview &&
			(typeof selectedTeacherSelfReview.score === "number" ||
				Boolean(selectedTeacherSelfReview.reviewedAt)),
	);
	const selectedTeacherSelfReviewLocked =
		selectedTeacherHasSavedSelfReview && !selfReviewEditUnlocked;

	const assignmentByTeacher = useMemo(() => {
		const map: Record<string, TeachingAssignmentDoc[]> = {};
		assignments.forEach((assignment) => {
			if (assignment.data.year !== cycleYear) return;
			map[assignment.data.teacherId] = map[assignment.data.teacherId] || [];
			map[assignment.data.teacherId].push(assignment.data);
		});
		return map;
	}, [assignments, cycleYear]);
	const assignmentKeySet = useMemo(() => {
		const keys = new Set<string>();
		assignments.forEach((assignment) => {
			if (assignment.data.year !== cycleYear) return;
			keys.add(
				`${assignment.data.teacherId}_${assignment.data.groupId}_${assignment.data.subjectId}`,
			);
		});
		return keys;
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
			const normalized = normalizePkpdScale(
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

	const summaryRows = useMemo<SummaryRow[]>(() => {
		return teachers.map((teacher) => {
			const category = teacher.data.category ?? "standard";
			const weights = getPkpdWeights(category);

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
				.map((assignment) => {
					const teacherBiqKey = `${teacher.id}_${assignment.groupId}_${assignment.subjectId}`;
					const teacherOverride = teacherBiqMap[teacherBiqKey]?.score;
					if (typeof teacherOverride === "number") return teacherOverride;
					return biqMap[`${assignment.groupId}_${assignment.subjectId}`]?.score;
				})
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
			const portfolioScore = computePkpdPortfolioScore(
				portfolioMap[teacher.id] ?? null,
				category,
			);
			const hrSelfReviewScore = selfReviewMap[teacher.id]?.score ?? null;
			const bonus = achievementTotals[teacher.id] ?? 0;

			const baseTotal =
				(studentScore ?? 0) +
				(managementScore ?? 0) +
				(selfScore ?? 0) +
				(biqScore ?? 0) +
				(examScore ?? 0) +
				(portfolioScore ?? 0);

			const total = baseTotal + (hrSelfReviewScore ?? 0) + bonus;

			return {
				teacherId: teacher.id,
				name: teacher.data.name,
				category,
				studentScore,
				managementScore,
				selfScore,
				hrSelfReviewScore,
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
		selfReviewMap,
		teacherBiqMap,
		teachers,
	]);

	const biqPagination = usePagination(biqResults);
	const teacherBiqPagination = usePagination(teacherBiqResults);
	const examPagination = usePagination(standardTeachers);
	const achievementPagination = usePagination(achievements);
	const summaryPagination = usePagination(summaryRows);

	const selectedSummaryRow = useMemo(
		() =>
			selectedSummaryTeacherId
				? (summaryRows.find((row) => row.teacherId === selectedSummaryTeacherId) ?? null)
				: null,
		[selectedSummaryTeacherId, summaryRows],
	);
	const selectedSummaryAssignments = selectedSummaryTeacherId
		? (assignmentByTeacher[selectedSummaryTeacherId] ?? [])
		: [];
	const teacherBiqEditAssignments = teacherBiqEditTeacherId
		? (assignmentByTeacher[teacherBiqEditTeacherId] ?? [])
		: [];
	const teacherBiqEditTeacher = teacherBiqEditTeacherId
		? (teacherMap[teacherBiqEditTeacherId] ?? null)
		: null;
	const selectedTeacherBiqEditAssignment = teacherBiqEditAssignments.find(
		(assignment) =>
			`${assignment.groupId}_${assignment.subjectId}` === teacherBiqEditAssignmentKey,
	);

	const refreshTeacherBiqResults = async () => {
		if (!branchId || !selectedCycleId) return;
		const { data } = await supabase
			.from("pkpd_teacher_biq_results")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("cycle_id", selectedCycleId)
			.eq("branch_id", branchId);
		setTeacherBiqResults(
			(data ?? []).map((row) => ({
				id: row.id,
				data: mapPkpdTeacherBiqResultRow(row),
			})),
		);
	};

	const openTeacherBiqEdit = (teacherId: string) => {
		const teacherAssignments = assignmentByTeacher[teacherId] ?? [];
		const firstAssignment = teacherAssignments[0];
		const firstKey = firstAssignment
			? `${firstAssignment.groupId}_${firstAssignment.subjectId}`
			: "";
		const existingScore = firstAssignment
			? teacherBiqMap[
					`${teacherId}_${firstAssignment.groupId}_${firstAssignment.subjectId}`
				]?.score
			: null;
		setTeacherBiqEditTeacherId(teacherId);
		setTeacherBiqEditAssignmentKey(firstKey);
		setTeacherBiqEditScore(
			existingScore === null || existingScore === undefined
				? ""
				: String(existingScore),
		);
	};

	const openTeacherBiqEditForAssignment = (
		teacherId: string,
		groupId: string,
		subjectId: string,
	) => {
		const existingScore =
			teacherBiqMap[`${teacherId}_${groupId}_${subjectId}`]?.score;
		setTeacherBiqEditTeacherId(teacherId);
		setTeacherBiqEditAssignmentKey(`${groupId}_${subjectId}`);
		setTeacherBiqEditScore(
			existingScore === null || existingScore === undefined
				? ""
				: String(existingScore),
		);
	};

	const handleTeacherBiqEditAssignmentChange = (assignmentKey: string) => {
		if (!teacherBiqEditTeacherId) return;
		const assignment = (assignmentByTeacher[teacherBiqEditTeacherId] ?? []).find(
			(item) => `${item.groupId}_${item.subjectId}` === assignmentKey,
		);
		const existingScore = assignment
			? teacherBiqMap[
					`${teacherBiqEditTeacherId}_${assignment.groupId}_${assignment.subjectId}`
				]?.score
			: null;
		setTeacherBiqEditAssignmentKey(assignmentKey);
		setTeacherBiqEditScore(
			existingScore === null || existingScore === undefined
				? ""
				: String(existingScore),
		);
	};

	const handleSaveBiq = async () => {
		if (!branchId || !selectedCycleId) return;
		if (!biqGroupId || !biqSubjectId) {
			setStatus("Qrup vÉ™ fÉ™nn seÃ§in");
			return;
		}
		const scoreValue = Number(biqScore);
		if (Number.isNaN(scoreValue) || scoreValue < 0 || scoreValue > 100) {
			setStatus("BÄ°Q balÄ± 0-100 arasÄ± olmalÄ±dÄ±r");
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
			setStatus("BÄ°Q nÉ™ticÉ™si saxlanmadÄ±");
			return;
		}
		setBiqScore("");
		setStatus("BÄ°Q nÉ™ticÉ™si saxlanÄ±ldÄ±");
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
		let emptyScore = 0;

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
				normalized["fÉ™nn"] ||
				normalized.fen;
			const scoreRaw = normalized.score || normalized.biq || normalized.bal;
			if (String(scoreRaw ?? "").trim() === "") {
				emptyScore += 1;
				return;
			}

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
			setBiqImportStatus("YÃ¼klÉ™nÉ™cÉ™k dÃ¼zgÃ¼n sÉ™tir tapÄ±lmadÄ±");
			return;
		}

		const chunks = chunkArray(prepared, 200);
		for (const chunk of chunks) {
			const { error } = await supabase.from("biq_class_results").upsert(chunk, {
				onConflict: "org_id,branch_id,cycle_id,group_id,subject_id",
			});
			if (error) {
				setBiqImportStatus("BÄ°Q import zamanÄ± xÉ™ta oldu");
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

		const report = `Yükləndi: ${prepared.length}. Boş bal: ${emptyScore}. Qrup tapılmadı: ${missingGroup}. Fənn tapılmadı: ${missingSubject}. Bal səhv: ${invalidScore}.`;
		setBiqImportStatus(report);
	};

	const handleSaveTeacherBiq = async () => {
		if (!branchId || !selectedCycleId) return;
		if (!teacherBiqTeacherId || !teacherBiqGroupId || !teacherBiqSubjectId) {
			setStatus("MÃ¼É™llim, qrup vÉ™ fÉ™nn seÃ§in");
			return;
		}
		const assignmentKey = `${teacherBiqTeacherId}_${teacherBiqGroupId}_${teacherBiqSubjectId}`;
		if (!assignmentKeySet.has(assignmentKey)) {
			setStatus("SeÃ§ilÉ™n mÃ¼É™llim Ã¼Ã§Ã¼n bu qrup/fÉ™nn tÉ™yinatÄ± yoxdur");
			return;
		}
		const scoreValue = Number(teacherBiqScore);
		if (Number.isNaN(scoreValue) || scoreValue < 0 || scoreValue > 100) {
			setStatus("BÄ°Q balÄ± 0-100 arasÄ± olmalÄ±dÄ±r");
			return;
		}

		const { error } = await supabase.from("pkpd_teacher_biq_results").upsert(
			{
				org_id: ORG_ID,
				branch_id: branchId,
				cycle_id: selectedCycleId,
				teacher_id: teacherBiqTeacherId,
				group_id: teacherBiqGroupId,
				subject_id: teacherBiqSubjectId,
				score: scoreValue,
			},
			{
				onConflict:
					"org_id,branch_id,cycle_id,teacher_id,group_id,subject_id",
			},
		);
		if (error) {
			setStatus("MÃ¼É™llim Ã¼zrÉ™ BÄ°Q nÉ™ticÉ™si saxlanmadÄ±");
			return;
		}
		setTeacherBiqScore("");
		setStatus("Müəllim üzrə BİQ nəticəsi saxlanıldı");
		await refreshTeacherBiqResults();
	};

	const handleSaveTeacherBiqEdit = async () => {
		if (
			!branchId ||
			!selectedCycleId ||
			!teacherBiqEditTeacherId ||
			!selectedTeacherBiqEditAssignment
		) {
			setStatus("Müəllim üçün dərs təyinatı seçin");
			return;
		}
		const scoreValue = Number(teacherBiqEditScore);
		if (Number.isNaN(scoreValue) || scoreValue < 0 || scoreValue > 100) {
			setStatus("BİQ balı 0-100 arası olmalıdır");
			return;
		}

		setTeacherBiqEditSaving(true);
		try {
			const { error } = await supabase.from("pkpd_teacher_biq_results").upsert(
				{
					org_id: ORG_ID,
					branch_id: branchId,
					cycle_id: selectedCycleId,
					teacher_id: teacherBiqEditTeacherId,
					group_id: selectedTeacherBiqEditAssignment.groupId,
					subject_id: selectedTeacherBiqEditAssignment.subjectId,
					score: scoreValue,
				},
				{
					onConflict:
						"org_id,branch_id,cycle_id,teacher_id,group_id,subject_id",
				},
			);
			if (error) throw error;
			await refreshTeacherBiqResults();
			setStatus(
				`${teacherBiqEditTeacher?.name ?? "Müəllim"} üçün BİQ balı saxlanıldı`,
			);
			setTeacherBiqEditTeacherId(null);
			setTeacherBiqEditAssignmentKey("");
			setTeacherBiqEditScore("");
		} catch (error) {
			setStatus(
				error instanceof Error
					? error.message
					: "Müəllim üzrə BİQ nəticəsi saxlanmadı",
			);
		} finally {
			setTeacherBiqEditSaving(false);
		}
	};

	const handleImportTeacherBiq = async (file: File) => {
		if (!branchId || !selectedCycleId) return;
		const rows = await parseSpreadsheet(file);
		const prepared: Array<{
			org_id: string;
			branch_id: string;
			cycle_id: string;
			teacher_id: string;
			group_id: string;
			subject_id: string;
			score: number;
		}> = [];

		let missingTeacher = 0;
		let missingGroup = 0;
		let missingSubject = 0;
		let missingAssignment = 0;
		let invalidScore = 0;
		let emptyScore = 0;

		rows.forEach((row) => {
			const normalized: Record<string, string> = {};
			Object.entries(row).forEach(([key, value]) => {
				normalized[key.trim().toLowerCase()] = String(value ?? "").trim();
			});

			const teacherRaw =
				normalized.teacher_id ||
				normalized.teacher ||
				normalized.teacher_name ||
				normalized.muellim ||
				normalized["mÃ¼É™llim"];
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
				normalized["fÉ™nn"] ||
				normalized.fen;
			const scoreRaw = normalized.score || normalized.biq || normalized.bal;
			if (String(scoreRaw ?? "").trim() === "") {
				emptyScore += 1;
				return;
			}

			const teacherId =
				(teacherRaw && teacherMap[teacherRaw] ? teacherRaw : null) ||
				(teacherRaw
					? (teacherNameMap.get(teacherRaw.toLowerCase()) ?? null)
					: null);
			if (!teacherId) {
				missingTeacher += 1;
				return;
			}

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

			const assignmentKey = `${teacherId}_${groupId}_${subjectId}`;
			if (!assignmentKeySet.has(assignmentKey)) {
				missingAssignment += 1;
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
				teacher_id: teacherId,
				group_id: groupId,
				subject_id: subjectId,
				score: numericScore,
			});
		});

		if (prepared.length === 0) {
			setTeacherBiqImportStatus("YÃ¼klÉ™nÉ™cÉ™k dÃ¼zgÃ¼n sÉ™tir tapÄ±lmadÄ±");
			return;
		}

		const chunks = chunkArray(prepared, 200);
		for (const chunk of chunks) {
			const { error } = await supabase
				.from("pkpd_teacher_biq_results")
				.upsert(chunk, {
					onConflict:
						"org_id,branch_id,cycle_id,teacher_id,group_id,subject_id",
				});
			if (error) {
				setTeacherBiqImportStatus("MÃ¼É™llim Ã¼zrÉ™ BÄ°Q import zamanÄ± xÉ™ta oldu");
				return;
			}
		}

		const { data } = await supabase
			.from("pkpd_teacher_biq_results")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("cycle_id", selectedCycleId)
			.eq("branch_id", branchId);
		setTeacherBiqResults(
			(data ?? []).map((row) => ({
				id: row.id,
				data: mapPkpdTeacherBiqResultRow(row),
			})),
		);

		const report = `Yükləndi: ${prepared.length}. Boş bal: ${emptyScore}. Müəllim tapılmadı: ${missingTeacher}. Qrup tapılmadı: ${missingGroup}. Fənn tapılmadı: ${missingSubject}. Təyinat tapılmadı: ${missingAssignment}. Bal səhv: ${invalidScore}.`;
		setTeacherBiqImportStatus(report);
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

	const handleDeleteTeacherBiq = async (id: string) => {
		if (!branchId || !selectedCycleId) return;
		await supabase
			.from("pkpd_teacher_biq_results")
			.delete()
			.eq("org_id", ORG_ID)
			.eq("id", id);
		setTeacherBiqResults((prev) => prev.filter((item) => item.id !== id));
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
			setStatus("Ä°mtahan balÄ± 0-30 arasÄ± olmalÄ±dÄ±r");
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
			setStatus("Ä°mtahan balÄ± saxlanmadÄ±");
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
		setExamDrafts(
			Object.fromEntries(
				(data ?? []).map((row) => [
					row.teacher_id,
					row.score !== null && row.score !== undefined ? String(row.score) : "",
				]),
			),
		);
	};

	const handleImportExam = async (file: File) => {
		if (!branchId || !selectedCycleId) return;

		const rows = await parseSpreadsheet(file);
		const prepared: Array<{
			org_id: string;
			branch_id: string;
			cycle_id: string;
			teacher_id: string;
			score: number;
		}> = [];

		let missingTeacher = 0;
		let nonStandardTeacher = 0;
		let invalidScore = 0;

		rows.forEach((row) => {
			const normalized: Record<string, string> = {};
			Object.entries(row).forEach(([key, value]) => {
				normalized[key.trim().toLowerCase()] = String(value ?? "").trim();
			});

			const teacherRaw =
				normalized.teacher_id ||
				normalized.teacher ||
				normalized.teacher_name ||
				normalized.muellim ||
				normalized["mÃ¼É™llim"];
			const scoreRaw =
				normalized.score ||
				normalized.exam ||
				normalized.exam_score ||
				normalized.imtahan ||
				normalized.imtahan_bali ||
				normalized.attestasiya ||
				normalized.attestasiya_imtahani ||
				normalized.bal;

			const teacherId =
				(teacherRaw && teacherMap[teacherRaw] ? teacherRaw : null) ||
				(teacherRaw
					? (teacherNameMap.get(teacherRaw.toLowerCase()) ?? null)
					: null);
			if (!teacherId) {
				missingTeacher += 1;
				return;
			}

			if ((teacherMap[teacherId]?.category ?? "standard") !== "standard") {
				nonStandardTeacher += 1;
				return;
			}

			const numericScore = Number(String(scoreRaw ?? "").replace(",", "."));
			if (
				Number.isNaN(numericScore) ||
				numericScore < 0 ||
				numericScore > 30
			) {
				invalidScore += 1;
				return;
			}

			prepared.push({
				org_id: ORG_ID,
				branch_id: branchId,
				cycle_id: selectedCycleId,
				teacher_id: teacherId,
				score: numericScore,
			});
		});

		if (prepared.length === 0) {
			setExamImportStatus("YÃ¼klÉ™nÉ™cÉ™k dÃ¼zgÃ¼n sÉ™tir tapÄ±lmadÄ±");
			return;
		}

		const chunks = chunkArray(prepared, 200);
		for (const chunk of chunks) {
			const { error } = await supabase.from("pkpd_exam_results").upsert(chunk, {
				onConflict: "org_id,cycle_id,teacher_id",
			});
			if (error) {
				setExamImportStatus("Ä°mtahan import zamanÄ± xÉ™ta oldu");
				return;
			}
		}

		const { data } = await supabase
			.from("pkpd_exam_results")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("cycle_id", selectedCycleId)
			.eq("branch_id", branchId);
		const examDocs = (data ?? []).map((row) => ({
			id: row.id,
			data: mapPkpdExamRow(row),
		}));
		setExamResults(examDocs);
		setExamDrafts(
			Object.fromEntries(
				examDocs.map((row) => [
					row.data.teacherId,
					row.data.score !== null && row.data.score !== undefined
						? String(row.data.score)
						: "",
				]),
			),
		);

		setExamImportStatus(
			`YÃ¼klÉ™ndi: ${prepared.length}. MÃ¼É™llim tapÄ±lmadÄ±: ${missingTeacher}. Standart olmayan mÃ¼É™llim: ${nonStandardTeacher}. Bal sÉ™hv: ${invalidScore}.`,
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

	const loadSelfReviewForTeacher = (teacherId: string) => {
		if (!teacherId) {
			setSelfReviewTeacherId("");
			setSelfReviewScore("");
			setSelfReviewNote("");
			setSelfReviewEditUnlocked(false);
			setSelfReviewUnlockOpen(false);
			setSelfReviewUnlockPassword("");
			setSelfReviewUnlockReason("");
			setSelfReviewUnlockError(null);
			setSelfReviewUnlockSubmitting(false);
			return;
		}

		const review = selfReviewMap[teacherId];
		setSelfReviewTeacherId(teacherId);
		setSelfReviewScore(
			typeof review?.score === "number" ? review.score.toString() : "",
		);
		setSelfReviewNote(review?.note ?? "");
		setSelfReviewEditUnlocked(false);
		setSelfReviewUnlockOpen(false);
		setSelfReviewUnlockPassword("");
		setSelfReviewUnlockReason("");
		setSelfReviewUnlockError(null);
		setSelfReviewUnlockSubmitting(false);
	};

	const handleRequestSelfReviewEdit = () => {
		setSelfReviewUnlockPassword("");
		setSelfReviewUnlockReason("");
		setSelfReviewUnlockError(null);
		setSelfReviewUnlockOpen(true);
	};

	const handleUnlockSelfReviewEdit = async () => {
		if (!user?.email) {
			setSelfReviewUnlockError("Hesab email-i tapÄ±lmadÄ±. YenidÉ™n daxil olun.");
			return;
		}
		if (!selfReviewUnlockPassword.trim()) {
			setSelfReviewUnlockError("Admin ÅŸifrÉ™sini daxil edin.");
			return;
		}
		if (!selfReviewUnlockReason.trim()) {
			setSelfReviewUnlockError("DÃ¼zÉ™liÅŸ sÉ™bÉ™bini yazÄ±n.");
			return;
		}

		setSelfReviewUnlockSubmitting(true);
		setSelfReviewUnlockError(null);

		const { error } = await supabase.auth.signInWithPassword({
			email: user.email,
			password: selfReviewUnlockPassword,
		});
		if (error) {
			setSelfReviewUnlockError("ÅžifrÉ™ yanlÄ±ÅŸdÄ±r.");
			setSelfReviewUnlockSubmitting(false);
			return;
		}

		setSelfReviewEditUnlocked(true);
		setSelfReviewUnlockOpen(false);
		setSelfReviewUnlockPassword("");
		setSelfReviewUnlockError(null);
		setStatus("DÃ¼zÉ™liÅŸ Ã¼Ã§Ã¼n sahÉ™lÉ™r aÃ§Ä±ldÄ±.");
		setSelfReviewUnlockSubmitting(false);
	};

	const handleSavePortfolio = async () => {
		if (!branchId || !selectedCycleId || !portfolioTeacherId) return;
		const teacherCategory = teacherMap[portfolioTeacherId]?.category;
		const limits = getPkpdPortfolioLimits(teacherCategory);

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
			setStatus("Portfolio ballarÄ± kateqoriyanÄ±n limitlÉ™rini aÅŸÄ±r");
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
			setStatus("Portfolio saxlanmadÄ±");
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
		setStatus("Portfolio saxlanÄ±ldÄ±");
	};

	const handleSaveSelfReview = async () => {
		if (!branchId || !selectedCycleId || !selfReviewTeacherId) return;
		if (selectedTeacherSelfReviewLocked) {
			setStatus(
				"Bu qiymÉ™tlÉ™ndirmÉ™ kilidlÉ™nib. DÃ¼zÉ™liÅŸ Ã¼Ã§Ã¼n admin ÅŸifrÉ™si tÉ™lÉ™b olunur.",
			);
			return;
		}

		const scoreRaw = selfReviewScore.trim();
		const noteValue = selfReviewNote.trim() || null;

		if (scoreRaw === "") {
			if (!noteValue) {
				await supabase
					.from("pkpd_self_reviews")
					.delete()
					.eq("org_id", ORG_ID)
					.eq("cycle_id", selectedCycleId)
					.eq("teacher_id", selfReviewTeacherId);

				const { data } = await supabase
					.from("pkpd_self_reviews")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("cycle_id", selectedCycleId)
					.eq("branch_id", branchId);
				setSelfReviews(
					(data ?? []).map((row) => ({
						id: row.id,
						data: mapPkpdSelfReviewRow(row),
					})),
				);
				setStatus("HR qiymÉ™tlÉ™ndirmÉ™si silindi");
				return;
			}

			setStatus("HR balÄ± 0-10 aralÄ±ÄŸÄ±nda daxil edilmÉ™lidir");
			return;
		}

		const scoreValue = Number(scoreRaw);
		if (Number.isNaN(scoreValue) || scoreValue < 0 || scoreValue > 10) {
			setStatus("HR balÄ± 0-10 aralÄ±ÄŸÄ±nda daxil edilmÉ™lidir");
			return;
		}

		const existingQuestionScores =
			selfReviewMap[selfReviewTeacherId]?.questionScores ?? null;
		const editReason = selectedTeacherHasSavedSelfReview
			? selfReviewUnlockReason.trim()
			: null;
		const payload = {
			org_id: ORG_ID,
			branch_id: branchId,
			cycle_id: selectedCycleId,
			teacher_id: selfReviewTeacherId,
			score: scoreValue,
			question_scores: existingQuestionScores,
			note:
				selectedTeacherHasSavedSelfReview && editReason
					? buildPkpdSelfReviewNote(noteValue, existingQuestionScores, editReason)
					: noteValue,
			reviewed_by: user?.id ?? null,
			reviewed_at: new Date().toISOString(),
		};

		let { error } = await supabase.from("pkpd_self_reviews").upsert(payload, {
			onConflict: "org_id,cycle_id,teacher_id",
		});
		if (error && isPkpdSelfReviewQuestionScoresError(error.message)) {
			const fallbackPayload = {
				...payload,
				note: buildPkpdSelfReviewNote(
					noteValue,
					existingQuestionScores,
					editReason,
				),
			};
			delete (
				fallbackPayload as {
					question_scores?: Record<string, number | null> | null;
				}
			).question_scores;

			const fallbackResult = await supabase
				.from("pkpd_self_reviews")
				.upsert(fallbackPayload, {
					onConflict: "org_id,cycle_id,teacher_id",
				});
			error = fallbackResult.error;
		}
		if (error) {
			setStatus(
				`HR qiymÉ™tlÉ™ndirmÉ™si saxlanmadÄ±: ${error.message ?? "namÉ™lum xÉ™ta"}`,
			);
			return;
		}

		const { data } = await supabase
			.from("pkpd_self_reviews")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("cycle_id", selectedCycleId)
			.eq("branch_id", branchId);
		setSelfReviews(
			(data ?? []).map((row) => ({
				id: row.id,
				data: mapPkpdSelfReviewRow(row),
			})),
		);
		setStatus("HR qiymÉ™tlÉ™ndirmÉ™si saxlanÄ±ldÄ±");
		setSelfReviewEditUnlocked(false);
		setSelfReviewUnlockReason("");
	};

	const handleAddAchievement = async () => {
		if (!branchId || !selectedCycleId) return;
		if (!achievementTeacherId || !achievementType.trim()) {
			setStatus("MÃ¼É™llim vÉ™ nÃ¶v seÃ§in");
			return;
		}
		const pointsValue = Number(achievementPoints);
		if (Number.isNaN(pointsValue) || pointsValue < 0 || pointsValue > 10) {
			setStatus("Bonus balÄ± 0-10 arasÄ± olmalÄ±dÄ±r");
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
			setStatus("Bonus saxlanmadÄ±");
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
		setStatus("Bonus É™lavÉ™ edildi");
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
			setStatus("QÉ™rar saxlanmadÄ±");
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
		setStatus("QÉ™rar saxlanÄ±ldÄ±");
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
					<p>PKPD mÉ™lumatlarÄ± vÉ™ yekun hesablamalar.</p>
				</div>
				<div className="actions">
					<label className="field">
						<span className="label">SorÄŸu dÃ¶vrÃ¼</span>
						<select
							className="input"
							value={selectedCycleId}
							onChange={(event) => setSelectedCycleId(event.target.value)}
						>
							<option value="">SorÄŸu dÃ¶vrÃ¼ seÃ§in</option>
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

			<Tabs defaultValue="inputs" className="stack">
				<div className="card">
					<div className="section-header">
						<div>
							<div className="section-kicker">PKPD idarÉ™etmÉ™si</div>
							<h3 className="section-title">BÃ¶lmÉ™lÉ™r</h3>
						</div>
						<TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
							<TabsTrigger value="inputs">Bal giriÅŸlÉ™ri</TabsTrigger>
							<TabsTrigger value="summary">Yekun cÉ™dvÉ™l</TabsTrigger>
							<TabsTrigger value="self-review">Ã–zÃ¼nÃ¼qiymÉ™tlÉ™ndirmÉ™</TabsTrigger>
						</TabsList>
					</div>
				</div>

				<TabsContent value="inputs" className="stack">
					<div className="card">
						<h3>BÄ°Q nÉ™ticÉ™lÉ™ri (sinif + fÉ™nn)</h3>
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
								<option value="">FÉ™nn</option>
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
								placeholder="BÄ°Q balÄ± (0-100)"
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
							<span className="hint">Åžablon: group/qrup, subject/fÉ™nn, score/biq/bal</span>
						</div>
						{biqImportStatus && <div className="notice">{biqImportStatus}</div>}
						<div className="data-table">
							<div className="data-row header">
								<div>Qrup</div>
								<div>FÉ™nn</div>
								<div>Bal</div>
								<div></div>
							</div>
							{biqPagination.paginatedItems.map((item) => (
								<div className="data-row" key={item.id}>
									<div>{groupMap[item.data.groupId]?.name ?? item.data.groupId}</div>
									<div>{subjectMap[item.data.subjectId]?.name ?? item.data.subjectId}</div>
									<div>{item.data.score}</div>
									<div className="actions">
										<button className="btn ghost" type="button" onClick={() => void handleDeleteBiq(item.id)}>
											Sil
										</button>
									</div>
								</div>
							))}
							{biqResults.length === 0 && <div className="empty">MÉ™lumat yoxdur.</div>}
						</div>
						{biqResults.length > 0 && (
							<PaginationControls
								totalItems={biqPagination.totalItems}
								page={biqPagination.page}
								pageSize={biqPagination.pageSize}
								onPageChange={biqPagination.setPage}
								onPageSizeChange={(nextSize) => {
									biqPagination.setPageSize(nextSize);
									biqPagination.setPage(1);
								}}
							/>
						)}
					</div>

					<div className="card">
						<h3>MÃ¼É™llim Ã¼zrÉ™ BÄ°Q nÉ™ticÉ™lÉ™ri (override)</h3>
						<div className="form-row">
							<select className="input" value={teacherBiqTeacherId} onChange={(event) => setTeacherBiqTeacherId(event.target.value)}>
								<option value="">MÃ¼É™llim</option>
								{teachers.map((teacher) => (
									<option key={teacher.id} value={teacher.id}>{teacher.data.name}</option>
								))}
							</select>
							<select className="input" value={teacherBiqGroupId} onChange={(event) => setTeacherBiqGroupId(event.target.value)}>
								<option value="">Qrup</option>
								{groups.map((group) => (
									<option key={group.id} value={group.id}>{group.data.name} ({group.data.classLevel})</option>
								))}
							</select>
							<select className="input" value={teacherBiqSubjectId} onChange={(event) => setTeacherBiqSubjectId(event.target.value)}>
								<option value="">FÉ™nn</option>
								{subjects.map((subject) => (
									<option key={subject.id} value={subject.id}>{subject.data.name}</option>
								))}
							</select>
						</div>
						<div className="form-row">
							<input className="input" type="number" placeholder="BÄ°Q balÄ± (0-100)" value={teacherBiqScore} onChange={(event) => setTeacherBiqScore(event.target.value)} />
							<button className="btn primary" type="button" onClick={handleSaveTeacherBiq} disabled={!selectedCycleId}>Saxla</button>
						</div>
						<div className="form-row">
							<input
								className="input"
								type="file"
								accept=".csv,.xlsx"
								onChange={(event) => {
									const file = event.target.files?.[0];
									if (file) void handleImportTeacherBiq(file);
								}}
							/>
							<span className="hint">Åžablon: teacher/teacher_id, group/qrup, subject/fÉ™nn, score/biq/bal</span>
						</div>
						{teacherBiqImportStatus && <div className="notice">{teacherBiqImportStatus}</div>}
						<div className="data-table">
							<div className="data-row header">
								<div>MÃ¼É™llim</div>
								<div>Qrup</div>
								<div>FÉ™nn</div>
								<div>Bal</div>
								<div></div>
							</div>
							{teacherBiqPagination.paginatedItems.map((item) => (
								<div className="data-row" key={item.id}>
									<div>{teacherMap[item.data.teacherId]?.name ?? item.data.teacherId}</div>
									<div>{groupMap[item.data.groupId]?.name ?? item.data.groupId}</div>
									<div>{subjectMap[item.data.subjectId]?.name ?? item.data.subjectId}</div>
									<div>{item.data.score}</div>
									<div className="actions">
										<button
											className="btn"
											type="button"
											onClick={() =>
												openTeacherBiqEditForAssignment(
													item.data.teacherId,
													item.data.groupId,
													item.data.subjectId,
												)
											}
										>
											Redaktə
										</button>
										<button className="btn ghost" type="button" onClick={() => void handleDeleteTeacherBiq(item.id)}>Sil</button>
									</div>
								</div>
							))}
							{teacherBiqResults.length === 0 && <div className="empty">MÉ™lumat yoxdur.</div>}
						</div>
						{teacherBiqResults.length > 0 && (
							<PaginationControls
								totalItems={teacherBiqPagination.totalItems}
								page={teacherBiqPagination.page}
								pageSize={teacherBiqPagination.pageSize}
								onPageChange={teacherBiqPagination.setPage}
								onPageSizeChange={(nextSize) => {
									teacherBiqPagination.setPageSize(nextSize);
									teacherBiqPagination.setPage(1);
								}}
							/>
						)}
					</div>

					<div className="card">
						<div className="section-header">
							<div>
								<h3>Attestasiya imtahanÄ± (0-30)</h3>
								<p className="hint">Bu siyahÄ± 15-li sÉ™hifÉ™lÉ™nir ki, imtahan ballarÄ± daha rahat idarÉ™ olunsun.</p>
							</div>
							<div className="stat-pill">CÉ™mi: {standardTeachers.length}</div>
						</div>
						<div className="form-row">
							<input
								className="input"
								type="file"
								accept=".csv,.xlsx"
								onChange={(event) => {
									const file = event.target.files?.[0];
									if (file) void handleImportExam(file);
								}}
							/>
							<span className="hint">Şablon: teacher/teacher_id, score/exam/bal</span>
						</div>
						{examImportStatus && <div className="notice">{examImportStatus}</div>}
						<div className="data-table">
							<div className="data-row header"><div>MÃ¼É™llim</div><div>Bal</div><div></div></div>
							{examPagination.paginatedItems.map((teacher) => (
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
									<div className="actions"><button className="btn" type="button" onClick={() => void handleSaveExam(teacher.id)}>Saxla</button></div>
								</div>
							))}
							{standardTeachers.length === 0 && <div className="empty">Standart mÃ¼É™llim yoxdur.</div>}
						</div>
						{standardTeachers.length > 0 && (
							<PaginationControls
								totalItems={examPagination.totalItems}
								page={examPagination.page}
								pageSize={examPagination.pageSize}
								onPageChange={examPagination.setPage}
								onPageSizeChange={(nextSize) => {
									examPagination.setPageSize(nextSize);
									examPagination.setPage(1);
								}}
							/>
						)}
					</div>

					<div className="card">
						<h3>Portfolio (bal + qeyd)</h3>
						<div className="form-row">
							<select className="input" value={portfolioTeacherId} onChange={(event) => loadPortfolioForTeacher(event.target.value)}>
								<option value="">MÃ¼É™llim seÃ§in</option>
								{teachers.map((teacher) => (
									<option key={teacher.id} value={teacher.id}>
										{teacher.data.name} ({teacherCategoryLabel(teacher.data.category)})
									</option>
								))}
							</select>
						</div>
						{portfolioTeacherId && (
							<>
								<div className="form-grid">
									<input className="input" type="number" placeholder={`TÉ™hsil pillÉ™si (max ${portfolioMax.education})`} value={portfolioEducation} onChange={(event) => setPortfolioEducation(event.target.value)} />
									<input className="input" type="number" placeholder={`DavamiyyÉ™t (max ${portfolioMax.attendance})`} value={portfolioAttendance} onChange={(event) => setPortfolioAttendance(event.target.value)} />
									<input className="input" type="number" placeholder={`TÉ™lim/nÉ™ÅŸr (max ${portfolioMax.training})`} value={portfolioTraining} onChange={(event) => setPortfolioTraining(event.target.value)} />
									<input className="input" type="number" placeholder={`Olimpiada (max ${portfolioMax.olympiad})`} value={portfolioOlympiad} onChange={(event) => setPortfolioOlympiad(event.target.value)} />
									<input className="input" type="number" placeholder={`TÉ™dbir/layihÉ™ (max ${portfolioMax.events})`} value={portfolioEvents} onChange={(event) => setPortfolioEvents(event.target.value)} />
								</div>
								<div className="form-row">
									<input className="input" placeholder="Qeyd (istÉ™yÉ™ baÄŸlÄ±)" value={portfolioNote} onChange={(event) => setPortfolioNote(event.target.value)} />
									<button className="btn primary" type="button" onClick={handleSavePortfolio}>Saxla</button>
								</div>
							</>
						)}
					</div>

					<div className="card">
						<h3>Bonus nailiyyÉ™tlÉ™r</h3>
						<div className="form-grid">
							<select className="input" value={achievementTeacherId} onChange={(event) => setAchievementTeacherId(event.target.value)}>
								<option value="">MÃ¼É™llim</option>
								{teachers.map((teacher) => (
									<option key={teacher.id} value={teacher.id}>{teacher.data.name}</option>
								))}
							</select>
							<input className="input" placeholder="NÃ¶v (mÉ™s: DÃ¶vlÉ™t tÉ™ltifi)" value={achievementType} onChange={(event) => setAchievementType(event.target.value)} />
							<input className="input" type="number" placeholder="Bal (0-10)" value={achievementPoints} onChange={(event) => setAchievementPoints(event.target.value)} />
						</div>
						<div className="form-row">
							<input className="input" placeholder="Qeyd (istÉ™yÉ™ baÄŸlÄ±)" value={achievementNote} onChange={(event) => setAchievementNote(event.target.value)} />
							<button className="btn primary" type="button" onClick={handleAddAchievement}>ÆlavÉ™ et</button>
						</div>
						<div className="data-table">
							<div className="data-row header"><div>MÃ¼É™llim</div><div>NÃ¶v</div><div>Bal</div><div>Tarix</div><div></div></div>
							{achievementPagination.paginatedItems.map((item) => (
								<div className="data-row" key={item.id}>
									<div>{teacherMap[item.data.teacherId]?.name ?? item.data.teacherId}</div>
									<div>{item.data.type}</div>
									<div>{item.data.points}</div>
									<div>{formatShortDate(toJsDate(item.data.createdAt))}</div>
									<div className="actions"><button className="btn ghost" type="button" onClick={() => void handleDeleteAchievement(item.id)}>Sil</button></div>
								</div>
							))}
							{achievements.length === 0 && <div className="empty">Bonus yoxdur.</div>}
						</div>
						{achievements.length > 0 && (
							<PaginationControls
								totalItems={achievementPagination.totalItems}
								page={achievementPagination.page}
								pageSize={achievementPagination.pageSize}
								onPageChange={achievementPagination.setPage}
								onPageSizeChange={(nextSize) => {
									achievementPagination.setPageSize(nextSize);
									achievementPagination.setPage(1);
								}}
							/>
						)}
					</div>
				</TabsContent>

				<TabsContent value="summary" className="stack">
					<div className="card">
						<div className="section-header">
							<div>
								<h3>PKPD yekun cÉ™dvÉ™li</h3>
								<p className="hint">ÆtraflÄ± bal bÃ¶lgÃ¼sÃ¼ vÉ™ qÉ™rar redaktÉ™si Ã¼Ã§Ã¼n hÉ™r mÃ¼É™llimdÉ™ <code>Detallar</code> dÃ¼ymÉ™sini aÃ§Ä±n.</p>
							</div>
							<div className="stat-pill">CÉ™mi: {summaryRows.length}</div>
						</div>
						<div className="data-table">
							<div className="data-row header"><div>MÃ¼É™llim</div><div>MÃ¼É™llim tipi</div><div>Yekun</div><div>PKPD kateqoriyasÄ±</div><div>QÉ™rar</div><div>Qeyd</div><div></div></div>
							{summaryPagination.paginatedItems.map((row) => {
								const decision = decisionDrafts[row.teacherId] ?? decisionMap[row.teacherId] ?? null;
								const notePreview = decision?.note?.trim() || '-';
								return (
									<div className="data-row" key={row.teacherId}>
										<div>{row.name}</div>
										<div>{teacherCategoryLabel(row.category)}</div>
										<div>{row.total.toFixed(1)}</div>
										<div>{pkpdBucket(row.total)}</div>
										<div>{decisionLabel[decision?.status ?? 'PENDING']}</div>
										<div>{notePreview}</div>
										<div className="actions">
											<button className="btn" type="button" onClick={() => setSelectedSummaryTeacherId(row.teacherId)}>Detallar</button>
											<button className="btn ghost" type="button" onClick={() => openTeacherBiqEdit(row.teacherId)}>BİQ</button>
										</div>
									</div>
								);
							})}
							{summaryRows.length === 0 && <div className="empty">MÉ™lumat yoxdur.</div>}
						</div>
						{summaryRows.length > 0 && (
							<PaginationControls
								totalItems={summaryPagination.totalItems}
								page={summaryPagination.page}
								pageSize={summaryPagination.pageSize}
								onPageChange={summaryPagination.setPage}
								onPageSizeChange={(nextSize) => {
									summaryPagination.setPageSize(nextSize);
									summaryPagination.setPage(1);
								}}
							/>
						)}
					</div>
				</TabsContent>

				<TabsContent value="self-review" className="stack">
					<div className="card">
						<h3>Ã–zÃ¼nÃ¼qiymÉ™tlÉ™ndirmÉ™ cavablarÄ± vÉ™ HR balÄ±</h3>
						<div className="form-row">
							<select className="input" value={selfReviewTeacherId} onChange={(event) => loadSelfReviewForTeacher(event.target.value)}>
								<option value="">MÃ¼É™llim seÃ§in</option>
								{teachers.map((teacher) => (
									<option key={teacher.id} value={teacher.id}>{teacher.data.name}</option>
								))}
							</select>
						</div>
						{selfReviewTeacherId && selectedTeacherHasSavedSelfReview && (
							<div className="form-row">
								{selectedTeacherSelfReviewLocked ? (
									<button className="btn ghost" type="button" onClick={handleRequestSelfReviewEdit}>DÃ¼zÉ™liÅŸ et</button>
								) : (
									<span className="tag success">DÃ¼zÉ™liÅŸ aÃ§Ä±qdÄ±r</span>
								)}
							</div>
						)}
						{selfReviewTeacherId && (
							<>
								{selectedTeacherHasSavedSelfReview && (
									<div className="notice">{selectedTeacherSelfReviewLocked ? "Bu HR qiymÉ™tlÉ™ndirmÉ™si kilidlÉ™nib. DÉ™yiÅŸiklik Ã¼Ã§Ã¼n admin ÅŸifrÉ™si vÉ™ sÉ™bÉ™b tÉ™lÉ™b olunur." : "DÃ¼zÉ™liÅŸ rejimi aktivdir. YenidÉ™n saxladÄ±qdan sonra forma yenÉ™ kilidlÉ™nÉ™cÉ™k."}</div>
								)}
								<div className="notice">{selfReviewTeacher?.name ?? "MÃ¼É™llim"} Ã¼Ã§Ã¼n mÃ¼É™llimin Ã¶z balÄ±: {selectedTeacherSelfResponse?.declaredScore ?? "-"} / 10</div>
								{selectedTeacherSelfReview?.editReason && <div className="hint">Son dÃ¼zÉ™liÅŸ sÉ™bÉ™bi: {selectedTeacherSelfReview.editReason}</div>}
								<div className="data-table">
									<div className="data-row header"><div>Sual</div><div>Cavab</div></div>
									{selectedTeacherSelfResponse?.textAnswers.map((item) => (
										<div className="data-row" key={item.questionId}><div>{item.questionText}</div><div>{item.answerText}</div></div>
									))}
									{(!selectedTeacherSelfResponse || selectedTeacherSelfResponse.textAnswers.length === 0) && <div className="empty">MÃ¼É™llim bu sorÄŸuda hÉ™lÉ™ aÃ§Ä±q cavab yazmayÄ±b.</div>}
								</div>
								<div className="form-row">
									<input className="input" type="number" min="0" max="10" step="0.1" placeholder="HR balÄ± (0-10)" value={selfReviewScore} disabled={selectedTeacherSelfReviewLocked} onChange={(event) => setSelfReviewScore(event.target.value)} />
									<input className="input" placeholder="HR qeydi (istÉ™yÉ™ baÄŸlÄ±)" value={selfReviewNote} disabled={selectedTeacherSelfReviewLocked} onChange={(event) => setSelfReviewNote(event.target.value)} />
									<button className="btn primary" type="button" onClick={handleSaveSelfReview} disabled={selectedTeacherSelfReviewLocked}>Saxla</button>
								</div>
								<div className="hint">HR balÄ± mÃ¼É™llimin yekun PKPD cÉ™minin Ã¼zÉ™rinÉ™ É™lavÉ™ olunur.</div>
							</>
						)}
					</div>
				</TabsContent>
			</Tabs>
			<Dialog open={Boolean(selectedSummaryRow)} onOpenChange={(open) => { if (!open) setSelectedSummaryTeacherId(null); }}>
				<DialogContent className="max-w-4xl">
					{selectedSummaryRow && (
						<>
							<DialogHeader>
								<DialogTitle>{selectedSummaryRow.name}</DialogTitle>
								<DialogDescription>{cycleYear} dÃ¶vrÃ¼ Ã¼Ã§Ã¼n PKPD detal gÃ¶rÃ¼nÃ¼ÅŸÃ¼ vÉ™ qÉ™rar redaktÉ™si.</DialogDescription>
							</DialogHeader>
							<div className="grid three">
								<div className="stat-card"><div className="stat-label">Åžagird</div><div className="stat-value">{formatScoreValue(selectedSummaryRow.studentScore)}</div></div>
								<div className="stat-card"><div className="stat-label">RÉ™hbÉ™rlik</div><div className="stat-value">{formatScoreValue(selectedSummaryRow.managementScore)}</div></div>
								<div className="stat-card"><div className="stat-label">Ã–zÃ¼</div><div className="stat-value">{formatScoreValue(selectedSummaryRow.selfScore)}</div></div>
								<div className="stat-card"><div className="stat-label">BIQ</div><div className="stat-value">{formatScoreValue(selectedSummaryRow.biqScore)}</div></div>
								<div className="stat-card"><div className="stat-label">Ä°mtahan</div><div className="stat-value">{formatScoreValue(selectedSummaryRow.examScore)}</div></div>
								<div className="stat-card"><div className="stat-label">Portfolio</div><div className="stat-value">{formatScoreValue(selectedSummaryRow.portfolioScore)}</div></div>
								<div className="stat-card"><div className="stat-label">HR</div><div className="stat-value">{formatScoreValue(selectedSummaryRow.hrSelfReviewScore)}</div></div>
								<div className="stat-card"><div className="stat-label">Bonus</div><div className="stat-value">{selectedSummaryRow.bonus.toFixed(1)}</div></div>
								<div className="stat-card"><div className="stat-label">Yekun</div><div className="stat-value">{selectedSummaryRow.total.toFixed(1)}</div><div className="stat-meta">{pkpdBucket(selectedSummaryRow.total)}</div></div>
							</div>
							<div className="card">
								<div className="section-header">
									<div><div className="section-kicker">Cari il</div><h3 className="section-title">DÉ™rs tÉ™yinatlarÄ±</h3></div>
									<div className="tag">{teacherCategoryLabel(selectedSummaryRow.category)}</div>
								</div>
								<div className="list">
									{selectedSummaryAssignments.map((assignment) => (
										<div className="list-item" key={`${assignment.teacherId}_${assignment.groupId}_${assignment.subjectId}`}>
											<div><div className="list-title">{subjectMap[assignment.subjectId]?.name ?? assignment.subjectId}</div><div className="list-meta">{groupMap[assignment.groupId]?.name ?? assignment.groupId}</div></div>
											<div className="tag">{cycleYear}</div>
										</div>
									))}
									{selectedSummaryAssignments.length === 0 && <div className="empty">Bu mÃ¼É™llim Ã¼Ã§Ã¼n cari ildÉ™ dÉ™rs tÉ™yinatÄ± yoxdur.</div>}
								</div>
							</div>
							<div className="card">
								<h3>QÉ™rar vÉ™ qeyd</h3>
								<div className="form-row">
									<select
										className="input"
										value={decisionDrafts[selectedSummaryRow.teacherId]?.status ?? decisionMap[selectedSummaryRow.teacherId]?.status ?? 'PENDING'}
										onChange={(event) =>
											setDecisionDrafts((prev) => ({
												...prev,
												[selectedSummaryRow.teacherId]: {
													status: event.target.value as PkpdDecisionStatus,
													note: prev[selectedSummaryRow.teacherId]?.note ?? decisionMap[selectedSummaryRow.teacherId]?.note ?? '',
												},
											}))
										}
									>
										{Object.entries(decisionLabel).map(([value, label]) => (
											<option key={value} value={value}>{label}</option>
										))}
									</select>
									<input
										className="input"
										placeholder="Qeyd"
										value={decisionDrafts[selectedSummaryRow.teacherId]?.note ?? decisionMap[selectedSummaryRow.teacherId]?.note ?? ''}
										onChange={(event) =>
											setDecisionDrafts((prev) => ({
												...prev,
												[selectedSummaryRow.teacherId]: {
													status: prev[selectedSummaryRow.teacherId]?.status ?? decisionMap[selectedSummaryRow.teacherId]?.status ?? 'PENDING',
													note: event.target.value,
												},
											}))
										}
									/>
									<button className="btn primary" type="button" onClick={() => void handleSaveDecision(selectedSummaryRow.teacherId)}>Saxla</button>
								</div>
							</div>
						</>
					)}
				</DialogContent>
			</Dialog>
			<Dialog
				open={Boolean(teacherBiqEditTeacherId)}
				onOpenChange={(open) => {
					if (!open) {
						setTeacherBiqEditTeacherId(null);
						setTeacherBiqEditAssignmentKey("");
						setTeacherBiqEditScore("");
					}
				}}
			>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>BİQ balını redaktə et</DialogTitle>
						<DialogDescription>
							{teacherBiqEditTeacher?.name ?? "Müəllim"} üçün sinif və fənn üzrə
							fərdi BİQ balını daxil edin.
						</DialogDescription>
					</DialogHeader>
					<div className="stack">
						<label className="field">
							<span className="label">Dərs təyinatı</span>
							<select
								className="input"
								value={teacherBiqEditAssignmentKey}
								onChange={(event) =>
									handleTeacherBiqEditAssignmentChange(event.target.value)
								}
							>
								<option value="">Sinif və fənn seçin</option>
								{teacherBiqEditAssignments.map((assignment) => {
									const key = `${assignment.groupId}_${assignment.subjectId}`;
									const currentScore =
										teacherBiqMap[
											`${teacherBiqEditTeacherId}_${assignment.groupId}_${assignment.subjectId}`
										]?.score;
									return (
										<option key={key} value={key}>
											{groupMap[assignment.groupId]?.name ?? assignment.groupId} -{" "}
											{subjectMap[assignment.subjectId]?.name ?? assignment.subjectId}
											{currentScore !== undefined ? ` (${currentScore})` : ""}
										</option>
									);
								})}
							</select>
						</label>
						<label className="field">
							<span className="label">BİQ balı</span>
							<input
								className="input"
								type="number"
								min="0"
								max="100"
								step="0.01"
								value={teacherBiqEditScore}
								onChange={(event) => setTeacherBiqEditScore(event.target.value)}
								placeholder="0-100"
							/>
						</label>
						{selectedTeacherBiqEditAssignment && (
							<div className="notice">
								Ümumi sinif/fənn balı:{" "}
								{biqMap[
									`${selectedTeacherBiqEditAssignment.groupId}_${selectedTeacherBiqEditAssignment.subjectId}`
								]?.score ?? "-"}
							</div>
						)}
						{teacherBiqEditAssignments.length === 0 && (
							<div className="empty">
								Bu müəllim üçün cari ildə dərs təyinatı yoxdur.
							</div>
						)}
					</div>
					<DialogFooter>
						<button
							className="btn ghost"
							type="button"
							onClick={() => setTeacherBiqEditTeacherId(null)}
							disabled={teacherBiqEditSaving}
						>
							Ləğv et
						</button>
						<button
							className="btn primary"
							type="button"
							onClick={() => void handleSaveTeacherBiqEdit()}
							disabled={
								teacherBiqEditSaving ||
								!teacherBiqEditAssignmentKey ||
								teacherBiqEditAssignments.length === 0
							}
						>
							{teacherBiqEditSaving ? "Saxlanır..." : "Saxla"}
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<Dialog open={selfReviewUnlockOpen} onOpenChange={setSelfReviewUnlockOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>DÃ¼zÉ™liÅŸi tÉ™sdiqlÉ™</DialogTitle>
						<DialogDescription>
							SaxlanmÄ±ÅŸ HR balÄ±nÄ± dÉ™yiÅŸmÉ™k Ã¼Ã§Ã¼n admin ÅŸifrÉ™sini vÉ™ dÃ¼zÉ™liÅŸ
							sÉ™bÉ™bini daxil edin.
						</DialogDescription>
					</DialogHeader>
					<div className="stack">
						<label className="field">
							<span className="label">Admin ÅŸifrÉ™si</span>
							<input
								className="input"
								type="password"
								value={selfReviewUnlockPassword}
								onChange={(event) =>
									setSelfReviewUnlockPassword(event.target.value)
								}
							/>
						</label>
						<label className="field">
							<span className="label">DÃ¼zÉ™liÅŸ sÉ™bÉ™bi</span>
							<textarea
								className="input"
								rows={4}
								value={selfReviewUnlockReason}
								onChange={(event) =>
									setSelfReviewUnlockReason(event.target.value)
								}
							/>
						</label>
						{selfReviewUnlockError && (
							<div className="notice">{selfReviewUnlockError}</div>
						)}
					</div>
					<DialogFooter>
						<button
							className="btn ghost"
							type="button"
							onClick={() => setSelfReviewUnlockOpen(false)}
							disabled={selfReviewUnlockSubmitting}
						>
							LÉ™ÄŸv et
						</button>
						<button
							className="btn primary"
							type="button"
							onClick={handleUnlockSelfReviewEdit}
							disabled={selfReviewUnlockSubmitting}
						>
							{selfReviewUnlockSubmitting ? "YoxlanÄ±r..." : "TÉ™sdiqlÉ™"}
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
};



