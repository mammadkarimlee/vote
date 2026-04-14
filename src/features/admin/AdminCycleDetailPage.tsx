import { useEffect, useMemo, useState } from "react";
import { useFeedbackState } from "../../components/feedback/FeedbackProvider";
import { Link, useParams } from "react-router-dom";
import { InfoTip } from "../../components/InfoTip";
import { PaginationControls } from "../../components/PaginationControls";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../../components/ui/dialog";
import { downloadCsv } from "../../lib/csv";
import {
	buildPkpdSelfReviewNote,
	isPkpdSelfReviewQuestionScoresError,
} from "../../lib/pkpdSelfReview";
import { ORG_ID, supabase } from "../../lib/supabase";
import {
	mapAnswerRow,
	mapBiqClassResultRow,
	mapBranchRow,
	mapDepartmentRow,
	mapPkpdSelfReviewRow,
	mapPkpdTeacherBiqResultRow,
	mapQuestionRow,
	mapSubmissionRow,
	mapSurveyCycleRow,
	mapTaskRow,
	mapTeacherRow,
	mapTeachingAssignmentRow,
	mapUserRow,
} from "../../lib/supabaseMappers";
import type {
	AnswerDoc,
	BiqClassResultDoc,
	BranchDoc,
	DepartmentDoc,
	PkpdSelfReviewDoc,
	PkpdTeacherBiqResultDoc,
	QuestionDoc,
	SubmissionDoc,
	SurveyCycleDoc,
	TaskDoc,
	TeacherDoc,
	TeachingAssignmentDoc,
	UserDoc,
} from "../../lib/types";
import { chunkArray, toNumber } from "../../lib/utils";
import { useAuth } from "../auth/AuthProvider";

type DocEntry<T> = { id: string; data: T };
const SUPABASE_BATCH_SIZE = 1000;

type FlowAggregate = { sum: number; count: number };

type TeacherClassScore = {
	groupId: string;
	groupName: string;
	avg: number;
	submissionCount: number;
};

type TeacherFlowAggregate = {
	management: FlowAggregate;
	self: FlowAggregate;
};

type TeacherRow = {
	teacherId: string;
	name: string;
	firstName: string;
	lastName: string;
	departmentName: string;
	branchName: string;
	studentAvg: number | null;
	managementAvg: number | null;
	selfAvg: number | null;
	selfDeclaredScore: number | null;
	academicIndicator: number | null;
	teacherCriteriaTotal: number | null;
	hrEvaluationScore: number | null;
	selfTotal: number | null;
	biqAvg: number | null;
	finalScore: number | null;
	surveySubmissionCount: number;
	studentCount: number;
	studentClassCount: number;
	studentClassScores: TeacherClassScore[];
	managementCount: number;
	selfCount: number;
};

type TeacherSelfResponse = {
	declaredScore: number | null;
	textAnswers: Array<{
		questionId: string;
		questionText: string;
		answerText: string;
	}>;
};

const emptyFlowAggregate = (): TeacherFlowAggregate => ({
	management: { sum: 0, count: 0 },
	self: { sum: 0, count: 0 },
});

const average = (agg: FlowAggregate) =>
	agg.count > 0 ? agg.sum / agg.count : null;

const averageNumbers = (values: number[]) =>
	values.length > 0
		? values.reduce((acc, value) => acc + value, 0) / values.length
		: null;

const sumNumbers = (values: number[]) =>
	values.length > 0 ? values.reduce((acc, value) => acc + value, 0) : null;

const averageQuestionScores = (scores: Array<number | null | undefined>) => {
	const numericScores = scores.filter(
		(value): value is number => typeof value === "number" && !Number.isNaN(value),
	);
	return averageNumbers(numericScores);
};

const sumQuestionScores = (scores: Array<number | null | undefined>) => {
	const numericScores = scores.filter(
		(value): value is number => typeof value === "number" && !Number.isNaN(value),
	);
	return sumNumbers(numericScores);
};

const getAcademicIndicator = (review?: PkpdSelfReviewDoc | null) => {
	if (!review) return null;
	return averageQuestionScores(Object.values(review.questionScores ?? {}));
};

const getTeacherCriteriaTotal = (review?: PkpdSelfReviewDoc | null) => {
	if (!review) return null;
	const questionTotal = sumQuestionScores(Object.values(review.questionScores ?? {}));
	return questionTotal ?? null;
};

const normalizeScale = (
	value: number,
	min?: number | null,
	max?: number | null,
) => {
	const safeMin = min ?? 1;
	const safeMax = max ?? 10;
	if (safeMin === 1 && safeMax === 10) return value;
	if (safeMax <= safeMin) return value;
	return ((value - safeMin) / (safeMax - safeMin)) * 10;
};

const formatScore = (value: number | null | undefined) => {
	if (value === null || value === undefined) return "—";
	return value.toFixed(2);
};

const splitFullName = (fullName: string) => {
	const parts = fullName.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return { firstName: "", lastName: "" };
	if (parts.length === 1) return { firstName: parts[0], lastName: "" };
	return {
		firstName: parts[0],
		lastName: parts.slice(1).join(" "),
	};
};

const escapeHtml = (value: string) =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");

type TeacherFeedback = {
	levelLabel: string;
	summary: string;
	strengths: string[];
	improvements: string[];
	actionPlan: string[];
};

const scoreLabel = (score: number | null) => {
	if (score === null) return "Məlumat yoxdur";
	if (score >= 9) return "Əla";
	if (score >= 8) return "Yaxşı";
	if (score >= 7) return "Kafi";
	if (score >= 6) return "Risk zonası";
	return "Kritik diqqət tələb olunur";
};

const buildTeacherFeedback = (teacher: TeacherRow): TeacherFeedback => {
	const performanceScore = averageNumbers(
		[
			teacher.studentAvg,
			teacher.managementAvg,
			teacher.selfAvg,
			teacher.biqAvg,
		].filter((value): value is number => typeof value === "number" && !Number.isNaN(value)),
	);
	const levelLabel = scoreLabel(performanceScore);
	const finalScoreText = formatScore(teacher.finalScore);

	const components = [
		{ key: "student", label: "Şagird sorğusu", value: teacher.studentAvg },
		{ key: "management", label: "Rəhbərlik sorğusu", value: teacher.managementAvg },
		{ key: "self", label: "Özünüqiymətləndirmə", value: teacher.selfAvg },
		{ key: "biq", label: "BİQ nəticəsi", value: teacher.biqAvg },
	];

	const strengths = components
		.filter((item) => item.value !== null && item.value >= 8)
		.map((item) => `${item.label}: ${formatScore(item.value)} / 10`);

	const improvements = components
		.filter((item) => item.value !== null && item.value < 7)
		.map((item) => `${item.label}: ${formatScore(item.value)} / 10`);

	const actionPlan: string[] = [];

	if ((teacher.studentAvg ?? 0) < 7) {
		actionPlan.push(
			"Sinif idarəetməsi və dərsin izah modeli üzrə hədəfli metodik dəstək planlaşdırılsın.",
		);
	}
	if ((teacher.managementAvg ?? 0) < 7) {
		actionPlan.push(
			"Rəhbərliklə aylıq monitorinq görüşü və dərs planı üzrə inkişaf checklist-i tətbiq olunsun.",
		);
	}
	if ((teacher.selfAvg ?? 0) < 7) {
		actionPlan.push(
			"Özünüqiymətləndirmə üçün aylıq refleksiya formu və fərdi inkişaf planı hazırlanıb izlənilsin.",
		);
	}
	if ((teacher.biqAvg ?? 0) < 7) {
		actionPlan.push(
			"BİQ nəticələri aşağı olan qrup/fənlər üçün əlavə təkrar, mini-diaqnostik və fərdi dəstək tətbiq edilsin.",
		);
	}

	if (actionPlan.length === 0) {
		actionPlan.push(
			"Mövcud performansın qorunması üçün uğurlu təcrübələr sənədləşdirilib digər müəllimlərlə paylaşım sessiyası keçirilsin.",
		);
	}

	const weakestClass = teacher.studentClassScores
		.slice()
		.sort((a, b) => a.avg - b.avg)[0];
	if (weakestClass && weakestClass.avg < 7) {
		actionPlan.push(
			`${weakestClass.groupName} sinfi üzrə əlavə fokus planı: ortalama ${formatScore(weakestClass.avg)} / 10.`,
		);
	}

	return {
		levelLabel,
		summary: `${teacher.name} üçün yekun cəm balı ${finalScoreText}, ümumi performans səviyyəsi ${levelLabel}.`,
		strengths:
			strengths.length > 0
				? strengths
				: ["Yüksək nəticə göstərən komponent hələ formalaşmayıb və inkişaf potensialı mövcuddur."],
		improvements:
			improvements.length > 0
				? improvements
				: ["Aşağı performanslı komponent görünmür, cari nəticə stabil saxlanılır."],
		actionPlan,
	};
};

const fetchAllBatched = async <T,>(
	fetchPage: (
		from: number,
		to: number,
	) => Promise<{ data: T[] | null; error: { message?: string } | null }>,
) => {
	const rows: T[] = [];
	let from = 0;

	while (true) {
		const to = from + SUPABASE_BATCH_SIZE - 1;
		const { data, error } = await fetchPage(from, to);
		if (error) {
			throw new Error(error.message ?? "Məlumat yüklənmədi");
		}

		const page = data ?? [];
		rows.push(...page);
		if (page.length < SUPABASE_BATCH_SIZE) {
			break;
		}

		from += SUPABASE_BATCH_SIZE;
	}

	return rows;
};

export const AdminCycleDetailPage = () => {
	const { cycleId } = useParams<{ cycleId: string }>();
	const { user, userDoc } = useAuth();
	const isHr = userDoc?.role === "hr";
	const scopedBranchId = "";
	const cycleListPath = isHr ? "/hr/cycles" : "/admin/cycles";

	const [cycle, setCycle] = useState<SurveyCycleDoc | null>(null);
	const [teachers, setTeachers] = useState<Array<DocEntry<TeacherDoc>>>([]);
	const [branches, setBranches] = useState<Array<DocEntry<BranchDoc>>>([]);
	const [departments, setDepartments] = useState<Array<DocEntry<DepartmentDoc>>>(
		[],
	);
	const [questions, setQuestions] = useState<Record<string, QuestionDoc>>({});
	const [tasks, setTasks] = useState<Array<DocEntry<TaskDoc>>>([]);
	const [assignments, setAssignments] = useState<
		Array<DocEntry<TeachingAssignmentDoc>>
	>([]);
	const [biqResults, setBiqResults] = useState<
		Array<DocEntry<BiqClassResultDoc>>
	>([]);
	const [teacherBiqResults, setTeacherBiqResults] = useState<
		Array<DocEntry<PkpdTeacherBiqResultDoc>>
	>([]);
	const [selfReviews, setSelfReviews] = useState<
		Array<DocEntry<PkpdSelfReviewDoc>>
	>([]);
	const [submissions, setSubmissions] = useState<
		Array<DocEntry<SubmissionDoc>>
	>([]);
	const [answers, setAnswers] = useState<Array<DocEntry<AnswerDoc>>>([]);
	const [raters, setRaters] = useState<Array<DocEntry<UserDoc>>>([]);

	const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
	const [showAllTeachers, setShowAllTeachers] = useState(false);
	const [teacherQuery, setTeacherQuery] = useState("");
	const [showRaters, setShowRaters] = useState(false);
	const [showComments, setShowComments] = useState(false);
	const [selfReviewQuestionScores, setSelfReviewQuestionScores] = useState<
		Record<string, string>
	>({});
	const [selfReviewHrScore, setSelfReviewHrScore] = useState("");
	const [selfReviewNote, setSelfReviewNote] = useState("");
	const [selfReviewStatus, setSelfReviewStatus] = useFeedbackState();
	const [selfReviewEditUnlocked, setSelfReviewEditUnlocked] = useState(false);
	const [selfReviewUnlockOpen, setSelfReviewUnlockOpen] = useState(false);
	const [selfReviewUnlockPassword, setSelfReviewUnlockPassword] = useState("");
	const [selfReviewUnlockReason, setSelfReviewUnlockReason] = useState("");
	const [selfReviewUnlockError, setSelfReviewUnlockError] = useFeedbackState();
	const [selfReviewUnlockSubmitting, setSelfReviewUnlockSubmitting] =
		useState(false);

	const [teacherPage, setTeacherPage] = useState(1);
	const [teacherPageSize, setTeacherPageSize] = useState(15);
	const [raterPage, setRaterPage] = useState(1);
	const [raterPageSize, setRaterPageSize] = useState(15);
	const [commentPage, setCommentPage] = useState(1);
	const [commentPageSize, setCommentPageSize] = useState(15);

	useEffect(() => {
		const loadLookups = async () => {
			if (!cycleId) return;

			const teacherQuery = supabase
				.from("teachers")
				.select("*")
				.eq("org_id", ORG_ID)
				.is("deleted_at", null);
			const raterQuery = supabase
				.from("users")
				.select("*")
				.eq("org_id", ORG_ID)
				.is("deleted_at", null)
				.in("role", ["student", "teacher", "manager"]);
			const branchQuery = supabase.from("branches").select("*").eq("org_id", ORG_ID);
			const departmentQuery = supabase
				.from("departments")
				.select("*")
				.eq("org_id", ORG_ID)
				.is("deleted_at", null);

			if (scopedBranchId) {
				teacherQuery.eq("branch_id", scopedBranchId);
				raterQuery.eq("branch_id", scopedBranchId);
				branchQuery.eq("id", scopedBranchId);
				departmentQuery.eq("branch_id", scopedBranchId);
			}

			const [
				cycleRes,
				teacherRes,
				questionRes,
				raterRes,
				branchRes,
				departmentRes,
			] = await Promise.all([
				supabase
					.from("survey_cycles")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("id", cycleId)
					.maybeSingle(),
				teacherQuery,
					supabase.from("questions").select("*").eq("org_id", ORG_ID),
				raterQuery,
				branchQuery,
				departmentQuery,
			]);

			setCycle(cycleRes.data ? mapSurveyCycleRow(cycleRes.data) : null);
			setTeachers(
				(teacherRes.data ?? []).map((row) => ({
					id: row.id,
					data: mapTeacherRow(row),
				})),
			);
			setBranches(
				(branchRes.data ?? []).map((row) => ({
					id: row.id,
					data: mapBranchRow(row),
				})),
			);
			setDepartments(
				(departmentRes.data ?? []).map((row) => ({
					id: row.id,
					data: mapDepartmentRow(row),
				})),
			);

			const questionMap: Record<string, QuestionDoc> = {};
			(questionRes.data ?? []).forEach((row) => {
				questionMap[row.id] = mapQuestionRow(row);
			});
			setQuestions(questionMap);

			setRaters(
				(raterRes.data ?? []).map((row) => ({
					id: row.id,
					data: mapUserRow(row),
				})),
			);
			setSelectedTeacherId(null);
		};

		void loadLookups();
	}, [cycleId, scopedBranchId]);

	useEffect(() => {
		const loadCycleData = async () => {
			if (!cycleId) return;

			try {
				const [taskRows, submissionRows, biqRows, teacherBiqRows, selfReviewRows] =
					await Promise.all([
						fetchAllBatched<any>(async (from, to) =>
							await (() => {
								let query = supabase
									.from("tasks")
									.select("*")
									.eq("org_id", ORG_ID)
									.eq("cycle_id", cycleId);
								if (scopedBranchId) {
									query = query.eq("branch_id", scopedBranchId);
								}
								return query.range(from, to);
							})(),
						),
						fetchAllBatched<any>(async (from, to) =>
							await (() => {
								let query = supabase
									.from("submissions")
									.select("*")
									.eq("org_id", ORG_ID)
									.eq("cycle_id", cycleId);
								if (scopedBranchId) {
									query = query.eq("branch_id", scopedBranchId);
								}
								return query.range(from, to);
							})(),
						),
						fetchAllBatched<any>(async (from, to) =>
							await (() => {
								let query = supabase
									.from("biq_class_results")
									.select("*")
									.eq("org_id", ORG_ID)
									.eq("cycle_id", cycleId);
								if (scopedBranchId) {
									query = query.eq("branch_id", scopedBranchId);
								}
								return query.range(from, to);
							})(),
						),
						fetchAllBatched<any>(async (from, to) =>
							await (() => {
								let query = supabase
									.from("pkpd_teacher_biq_results")
									.select("*")
									.eq("org_id", ORG_ID)
									.eq("cycle_id", cycleId);
								if (scopedBranchId) {
									query = query.eq("branch_id", scopedBranchId);
								}
								return query.range(from, to);
							})(),
						),
						fetchAllBatched<any>(async (from, to) =>
							await (() => {
								let query = supabase
									.from("pkpd_self_reviews")
									.select("*")
									.eq("org_id", ORG_ID)
									.eq("cycle_id", cycleId);
								if (scopedBranchId) {
									query = query.eq("branch_id", scopedBranchId);
								}
								return query.range(from, to);
							})(),
						),
					]);

				setTasks(
					taskRows.map((row) => ({
						id: row.id,
						data: mapTaskRow(row),
					})),
				);
				setSubmissions(
					submissionRows.map((row) => ({
						id: row.task_id ?? row.id,
						data: mapSubmissionRow(row),
					})),
				);
				setBiqResults(
					biqRows.map((row) => ({
						id: row.id,
						data: mapBiqClassResultRow(row),
					})),
				);
				setTeacherBiqResults(
					teacherBiqRows.map((row) => ({
						id: row.id,
						data: mapPkpdTeacherBiqResultRow(row),
					})),
				);
				setSelfReviews(
					selfReviewRows.map((row) => ({
						id: row.id,
						data: mapPkpdSelfReviewRow(row),
					})),
				);

				if (cycle?.year) {
					const assignmentRows = await fetchAllBatched<any>(async (from, to) =>
						await (() => {
							let query = supabase
								.from("teaching_assignments")
								.select("*")
								.eq("org_id", ORG_ID)
								.eq("year", cycle.year)
								.is("deleted_at", null);
							if (scopedBranchId) {
								query = query.eq("branch_id", scopedBranchId);
							}
							return query.range(from, to);
						})(),
					);

					setAssignments(
						assignmentRows.map((row) => ({
							id: row.id,
							data: mapTeachingAssignmentRow(row),
						})),
					);
				} else {
					setAssignments([]);
				}

				const submissionIds = submissionRows.map((row) => row.task_id ?? row.id);
				if (submissionIds.length === 0) {
					setAnswers([]);
					return;
				}

				const answerDocs: Array<DocEntry<AnswerDoc>> = [];
				const chunks = chunkArray(submissionIds, 200);
				for (const chunk of chunks) {
					if (chunk.length === 0) continue;
					const answerRows = await fetchAllBatched<any>(async (from, to) =>
						await supabase
							.from("answers")
							.select("*")
							.eq("org_id", ORG_ID)
							.in("submission_id", chunk)
							.range(from, to),
					);

					answerRows.forEach((row) => {
						const key = `${row.submission_id}_${row.question_id}`;
						answerDocs.push({ id: key, data: mapAnswerRow(row) });
					});
				}
				setAnswers(answerDocs);
			} catch {
				setTasks([]);
				setSubmissions([]);
				setBiqResults([]);
				setTeacherBiqResults([]);
				setSelfReviews([]);
				setAssignments([]);
				setAnswers([]);
			}
		};

		void loadCycleData();
	}, [cycleId, cycle?.year, scopedBranchId]);

	const teacherMap = useMemo(
		() => Object.fromEntries(teachers.map((item) => [item.id, item.data])),
		[teachers],
	);
	const branchMap = useMemo(
		() => Object.fromEntries(branches.map((item) => [item.id, item.data])),
		[branches],
	);
	const departmentMap = useMemo(
		() => Object.fromEntries(departments.map((item) => [item.id, item.data])),
		[departments],
	);
	const taskMap = useMemo(
		() => Object.fromEntries(tasks.map((item) => [item.id, item.data])),
		[tasks],
	);

	const submissionCountByTeacher = useMemo(() => {
		const counts: Record<string, number> = {};
		submissions.forEach((submission) => {
			const task = taskMap[submission.id];
			if (!task || task.targetType !== "teacher") return;
			counts[task.targetId] = (counts[task.targetId] ?? 0) + 1;
		});
		return counts;
	}, [submissions, taskMap]);

	const submissionScaleStats = useMemo(() => {
		const stats: Record<string, FlowAggregate> = {};
		answers.forEach((answer) => {
			const question = questions[answer.data.questionId];
			if (!question || question.type !== "scale") return;

			const numeric = toNumber(answer.data.value);
			if (numeric === null) return;

			const normalized = normalizeScale(
				numeric,
				question.scaleMin,
				question.scaleMax,
			);
			const submissionId = answer.data.submissionId;
			stats[submissionId] = stats[submissionId] ?? { sum: 0, count: 0 };
			stats[submissionId].sum += normalized;
			stats[submissionId].count += 1;
		});
		return stats;
	}, [answers, questions]);

	const submissionScoreById = useMemo(() => {
		const scores: Record<string, number> = {};
		Object.entries(submissionScaleStats).forEach(([submissionId, agg]) => {
			if (agg.count > 0) {
				scores[submissionId] = agg.sum / agg.count;
			}
		});
		return scores;
	}, [submissionScaleStats]);

	const studentClassScoresByTeacher = useMemo(() => {
		const byTeacher: Record<
			string,
			Record<string, { groupId: string; groupName: string; sum: number; count: number }>
		> = {};

		submissions.forEach((submission) => {
			const task = taskMap[submission.id];
			if (!task || task.targetType !== "teacher" || task.raterRole !== "student") {
				return;
			}

			const submissionScore = submissionScoreById[submission.id];
			if (typeof submissionScore !== "number") return;

			const groupId = task.groupId ?? "no-group";
			const groupName = task.groupName?.trim() || groupId;
			byTeacher[task.targetId] = byTeacher[task.targetId] ?? {};
			const classStats = byTeacher[task.targetId][groupId] ?? {
				groupId,
				groupName,
				sum: 0,
				count: 0,
			};

			classStats.sum += submissionScore;
			classStats.count += 1;
			byTeacher[task.targetId][groupId] = classStats;
		});

		const result: Record<string, TeacherClassScore[]> = {};
		Object.entries(byTeacher).forEach(([teacherId, classMap]) => {
			result[teacherId] = Object.values(classMap)
				.map((item) => ({
					groupId: item.groupId,
					groupName: item.groupName,
					avg: item.count > 0 ? item.sum / item.count : 0,
					submissionCount: item.count,
				}))
				.sort((a, b) => a.groupName.localeCompare(b.groupName, "az"));
		});

		return result;
	}, [submissions, submissionScoreById, taskMap]);

	const studentSubmissionStatsByTeacher = useMemo(() => {
		const stats: Record<string, FlowAggregate> = {};

		submissions.forEach((submission) => {
			const task = taskMap[submission.id];
			if (!task || task.targetType !== "teacher" || task.raterRole !== "student") {
				return;
			}

			const submissionScore = submissionScoreById[submission.id];
			if (typeof submissionScore !== "number") return;

			stats[task.targetId] = stats[task.targetId] ?? { sum: 0, count: 0 };
			stats[task.targetId].sum += submissionScore;
			stats[task.targetId].count += 1;
		});

		return stats;
	}, [submissions, submissionScoreById, taskMap]);

	const flowStats = useMemo(() => {
		const stats: Record<string, TeacherFlowAggregate> = {};
		teachers.forEach((teacher) => {
			stats[teacher.id] = emptyFlowAggregate();
		});

		submissions.forEach((submission) => {
			const task = taskMap[submission.id];
			if (!task || task.targetType !== "teacher") return;

			const submissionScore = submissionScoreById[submission.id];
			if (typeof submissionScore !== "number") return;
			const targetId = task.targetId;
			stats[targetId] = stats[targetId] ?? emptyFlowAggregate();

			if (task.raterRole === "manager") {
				stats[targetId].management.sum += submissionScore;
				stats[targetId].management.count += 1;
				return;
			}
			if (task.raterRole === "teacher") {
				stats[targetId].self.sum += submissionScore;
				stats[targetId].self.count += 1;
			}
		});

		return stats;
	}, [submissions, submissionScoreById, taskMap, teachers]);

	const assignmentByTeacher = useMemo(() => {
		const map: Record<string, TeachingAssignmentDoc[]> = {};
		assignments.forEach((assignment) => {
			map[assignment.data.teacherId] = map[assignment.data.teacherId] || [];
			map[assignment.data.teacherId].push(assignment.data);
		});
		return map;
	}, [assignments]);

	const biqByKey = useMemo(
		() =>
			Object.fromEntries(
				biqResults.map((item) => [
					`${item.data.branchId}_${item.data.groupId}_${item.data.subjectId}`,
					item.data.score,
				]),
			),
		[biqResults],
	);

	const teacherBiqByKey = useMemo(
		() =>
			Object.fromEntries(
				teacherBiqResults.map((item) => [
					`${item.data.teacherId}_${item.data.groupId}_${item.data.subjectId}`,
					item.data.score,
				]),
			),
		[teacherBiqResults],
	);

	const selfReviewMap = useMemo(
		() =>
			Object.fromEntries(
				selfReviews.map((item) => [item.data.teacherId, item.data]),
			),
		[selfReviews],
	);

	const teacherSelfResponses = useMemo<Record<string, TeacherSelfResponse>>(() => {
		const responseMap: Record<string, TeacherSelfResponse> = {};

		answers.forEach((answer) => {
			const task = taskMap[answer.data.submissionId];
			if (!task || task.targetType !== "teacher" || task.raterRole !== "teacher") {
				return;
			}

			const question = questions[answer.data.questionId];
			if (!question || question.category !== "teacher_self_pkpd") return;

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
	}, [answers, questions, taskMap]);

	const teacherRows = useMemo<TeacherRow[]>(() => {
		return teachers
			.map((teacher) => {
				const flow = flowStats[teacher.id] ?? emptyFlowAggregate();
				const classScores = studentClassScoresByTeacher[teacher.id] ?? [];
				const studentStats = studentSubmissionStatsByTeacher[teacher.id] ?? {
					sum: 0,
					count: 0,
				};
				const studentAvg = average(studentStats);
				const studentCount = studentStats.count;
				const managementAvg = average(flow.management);
				const selfDeclaredScore = average(flow.self);
				const teacherSelfReview = selfReviewMap[teacher.id] ?? null;
				const academicIndicator = getAcademicIndicator(teacherSelfReview);
				const teacherCriteriaTotal = getTeacherCriteriaTotal(teacherSelfReview);
				const hrEvaluationScore =
					typeof teacherSelfReview?.score === "number" &&
					!Number.isNaN(teacherSelfReview.score)
						? teacherSelfReview.score
						: null;
				const selfAvg = averageNumbers(
					[selfDeclaredScore, academicIndicator].filter(
						(value): value is number =>
							typeof value === "number" && !Number.isNaN(value),
					),
				);
				const selfTotal = [selfDeclaredScore, teacherCriteriaTotal].reduce<number>(
					(acc, value) => acc + (typeof value === "number" ? value : 0),
					0,
				);
				const resolvedSelfTotal =
					selfDeclaredScore === null && teacherCriteriaTotal === null
						? null
						: selfTotal;

				const assignmentsForTeacher = assignmentByTeacher[teacher.id] ?? [];
				const biqValues = assignmentsForTeacher
					.map((assignment) => {
						const teacherKey = `${teacher.id}_${assignment.groupId}_${assignment.subjectId}`;
						const teacherOverride = teacherBiqByKey[teacherKey];
						if (typeof teacherOverride === "number") return teacherOverride;

						const classKey = `${assignment.branchId}_${assignment.groupId}_${assignment.subjectId}`;
						const classScore = biqByKey[classKey];
						return typeof classScore === "number" ? classScore : null;
					})
					.filter((value): value is number => typeof value === "number");
				const biqAvg =
					biqValues.length > 0
						? biqValues.reduce((acc, value) => acc + value, 0) / biqValues.length
						: null;

				const finalScoreParts = [
					selfDeclaredScore,
					teacherCriteriaTotal,
					hrEvaluationScore,
				].filter(
					(value): value is number =>
						typeof value === "number" && !Number.isNaN(value),
				);
				const finalScore =
					finalScoreParts.length > 0
						? finalScoreParts.reduce((acc, value) => acc + value, 0)
						: null;

				const resolvedName = teacher.data.name ?? teacher.id;
				const nameParts = splitFullName(resolvedName);
				const firstName = teacher.data.firstName?.trim() || nameParts.firstName;
				const lastName = teacher.data.lastName?.trim() || nameParts.lastName;
				const departmentName = teacher.data.departmentId
					? (departmentMap[teacher.data.departmentId]?.name ?? "-")
					: "-";
				const branchName = teacher.data.branchId
					? (branchMap[teacher.data.branchId]?.name ?? "-")
					: "-";

				return {
					teacherId: teacher.id,
					name: resolvedName,
					firstName,
					lastName,
					departmentName,
					branchName,
					studentAvg,
					managementAvg,
					selfAvg,
					selfDeclaredScore,
					academicIndicator,
					teacherCriteriaTotal,
					hrEvaluationScore,
					selfTotal: resolvedSelfTotal,
					biqAvg,
					finalScore,
					surveySubmissionCount: submissionCountByTeacher[teacher.id] ?? 0,
					studentCount,
					studentClassCount: classScores.length,
					studentClassScores: classScores,
					managementCount: flow.management.count,
					selfCount: flow.self.count,
				};
			})
			.sort((a, b) => {
				if (a.finalScore === null && b.finalScore === null) {
					return a.name.localeCompare(b.name, "az");
				}
				if (a.finalScore === null) return 1;
				if (b.finalScore === null) return -1;
				if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
				return a.name.localeCompare(b.name, "az");
			});
	}, [
		assignmentByTeacher,
		biqByKey,
		branchMap,
		departmentMap,
		flowStats,
		selfReviewMap,
		submissionCountByTeacher,
		studentSubmissionStatsByTeacher,
		studentClassScoresByTeacher,
		teacherBiqByKey,
		teachers,
	]);

	const selectedTeacher = useMemo(
		() =>
			selectedTeacherId
				? (teacherRows.find((item) => item.teacherId === selectedTeacherId) ?? null)
				: null,
		[selectedTeacherId, teacherRows],
	);
	const selectedTeacherSelfResponse = selectedTeacherId
		? (teacherSelfResponses[selectedTeacherId] ?? null)
		: null;
	const selectedTeacherSelfReview = selectedTeacherId
		? (selfReviewMap[selectedTeacherId] ?? null)
		: null;
	const selectedTeacherOpenQuestionIds = useMemo(
		() => selectedTeacherSelfResponse?.textAnswers.map((item) => item.questionId) ?? [],
		[selectedTeacherSelfResponse],
	);
	const selectedTeacherAcademicIndicator = getAcademicIndicator(selectedTeacherSelfReview);
	const selectedTeacherHasOpenAnswers = Boolean(
		selectedTeacherSelfResponse &&
			selectedTeacherSelfResponse.textAnswers.length > 0,
	);
	const selectedTeacherHasSavedOpenReview = Boolean(
		selectedTeacherSelfReview &&
			(typeof selectedTeacherSelfReview.score === "number" ||
				Object.keys(selectedTeacherSelfReview.questionScores ?? {}).length > 0 ||
				Boolean(selectedTeacherSelfReview.reviewedAt)),
	);
	const selectedTeacherOpenReviewLocked =
		selectedTeacherHasSavedOpenReview && !selfReviewEditUnlocked;

	useEffect(() => {
		if (!selectedTeacherId) {
			setSelfReviewQuestionScores({});
			setSelfReviewHrScore("");
			setSelfReviewNote("");
			setSelfReviewStatus(null);
			setSelfReviewEditUnlocked(false);
			setSelfReviewUnlockOpen(false);
			setSelfReviewUnlockPassword("");
			setSelfReviewUnlockReason("");
			setSelfReviewUnlockError(null);
			setSelfReviewUnlockSubmitting(false);
			return;
		}

		const nextScores = Object.fromEntries(
			selectedTeacherOpenQuestionIds.map((questionId) => [
				questionId,
				typeof selectedTeacherSelfReview?.questionScores?.[questionId] === "number"
					? String(selectedTeacherSelfReview.questionScores?.[questionId])
					: "",
			]),
		);
		setSelfReviewQuestionScores(nextScores);
		setSelfReviewHrScore(
			typeof selectedTeacherSelfReview?.score === "number"
				? String(selectedTeacherSelfReview.score)
				: "",
		);
		setSelfReviewNote(selectedTeacherSelfReview?.note ?? "");
		setSelfReviewStatus(null);
		setSelfReviewEditUnlocked(false);
		setSelfReviewUnlockOpen(false);
		setSelfReviewUnlockPassword("");
		setSelfReviewUnlockReason("");
		setSelfReviewUnlockError(null);
		setSelfReviewUnlockSubmitting(false);
	}, [
		selectedTeacherId,
		selectedTeacherOpenQuestionIds,
		selectedTeacherSelfReview,
	]);

	const validTeacherScores = useMemo(
		() => teacherRows.filter((row) => row.finalScore !== null),
		[teacherRows],
	);

	const visibleTeacherRows = useMemo(() => {
		const query = teacherQuery.trim().toLowerCase();
		return teacherRows.filter((row) => {
			const hasAnyData =
				row.finalScore !== null ||
				row.studentCount > 0 ||
				row.managementCount > 0 ||
				row.selfCount > 0 ||
				row.biqAvg !== null;

			if (!showAllTeachers && !hasAnyData) return false;
			if (!query) return true;

			return (
				row.name.toLowerCase().includes(query) ||
				row.departmentName.toLowerCase().includes(query) ||
				row.branchName.toLowerCase().includes(query)
			);
		});
	}, [showAllTeachers, teacherQuery, teacherRows]);

	const topTeacher = validTeacherScores[0];
	const bottomTeacher =
		validTeacherScores.length > 0
			? validTeacherScores[validTeacherScores.length - 1]
			: undefined;

	const overallSummary = useMemo(() => {
		const total = validTeacherScores.reduce(
			(acc, row) => acc + (row.finalScore ?? 0),
			0,
		);
		return {
			avg:
				validTeacherScores.length > 0 ? total / validTeacherScores.length : null,
			submissions: submissions.length,
		};
	}, [validTeacherScores, submissions.length]);

	const raterStats = useMemo(() => {
		const doneSet = new Set(submissions.map((item) => item.data.raterUid));
		const counts: Record<string, number> = {};
		submissions.forEach((item) => {
			counts[item.data.raterUid] = (counts[item.data.raterUid] ?? 0) + 1;
		});
		return {
			doneSet,
			counts,
		};
	}, [submissions]);

	const raterRows = useMemo(() => {
		return raters.map((rater) => ({
			id: rater.id,
			name: rater.data.displayName ?? rater.data.login ?? rater.id,
			role: rater.data.role,
			done: raterStats.doneSet.has(rater.id),
			submissions: raterStats.counts[rater.id] ?? 0,
		}));
	}, [raters, raterStats]);

	const comments = useMemo(() => {
		return answers
			.filter((answer) => questions[answer.data.questionId]?.type === "text")
			.map((answer) => {
				const task = taskMap[answer.data.submissionId];
				if (!task || task.targetType !== "teacher") return null;

				return {
					teacherId: task.targetId,
					text: String(answer.data.value ?? "").trim(),
					createdAt: answer.data.createdAt,
				};
			})
			.filter(
				(comment): comment is { teacherId: string; text: string; createdAt: unknown } =>
					Boolean(comment && comment.text.length > 0),
			)
			.sort((a, b) => {
				const aRaw = a.createdAt ? new Date(a.createdAt as string).getTime() : 0;
				const bRaw = b.createdAt ? new Date(b.createdAt as string).getTime() : 0;
				return bRaw - aRaw;
			});
	}, [answers, questions, taskMap]);

	useEffect(() => {
		const totalPages = Math.max(
			1,
			Math.ceil(visibleTeacherRows.length / teacherPageSize),
		);
		if (teacherPage > totalPages) setTeacherPage(totalPages);
	}, [teacherPage, teacherPageSize, visibleTeacherRows.length]);

	useEffect(() => {
		const totalPages = Math.max(1, Math.ceil(raterRows.length / raterPageSize));
		if (raterPage > totalPages) setRaterPage(totalPages);
	}, [raterPage, raterPageSize, raterRows.length]);

	useEffect(() => {
		const totalPages = Math.max(1, Math.ceil(comments.length / commentPageSize));
		if (commentPage > totalPages) setCommentPage(totalPages);
	}, [commentPage, commentPageSize, comments.length]);

	const paginatedTeacherRows = useMemo(() => {
		const start = (teacherPage - 1) * teacherPageSize;
		return visibleTeacherRows.slice(start, start + teacherPageSize);
	}, [teacherPage, teacherPageSize, visibleTeacherRows]);

	const paginatedRaterRows = useMemo(() => {
		const start = (raterPage - 1) * raterPageSize;
		return raterRows.slice(start, start + raterPageSize);
	}, [raterPage, raterPageSize, raterRows]);

	const paginatedComments = useMemo(() => {
		const start = (commentPage - 1) * commentPageSize;
		return comments.slice(start, start + commentPageSize);
	}, [commentPage, commentPageSize, comments]);

	const handleExportCsv = () => {
		if (!cycleId) return;
		const year = cycle?.year ?? "-";
		const rows = teacherRows.map((item) => [
			item.branchName,
			item.firstName,
			item.lastName,
			item.departmentName,
			item.finalScore === null ? "" : item.finalScore.toFixed(2),
		]);

		downloadCsv(
			`cycle-${year}-teacher-final-scores.csv`,
			["campus", "ad", "soyad", "kafedra", "yekun_bal"],
			rows,
		);
	};

	const handleExportTeacherPdf = () => {
		if (!selectedTeacher) return;
		const feedback = buildTeacherFeedback(selectedTeacher);

		const toListHtml = (items: string[]) =>
			items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
		const academicIndicatorText = formatScore(selectedTeacherAcademicIndicator);
		const teacherCriteriaTotalText = formatScore(selectedTeacher.teacherCriteriaTotal);
		const hrEvaluationText = formatScore(selectedTeacher.hrEvaluationScore);
		const selfDeclaredScoreText = formatScore(selectedTeacher.selfDeclaredScore);
		const academicReviewedAtText = selectedTeacherSelfReview?.reviewedAt
			? new Date(String(selectedTeacherSelfReview.reviewedAt)).toLocaleString("az-AZ")
			: null;
		const academicEditReasonText = selectedTeacherSelfReview?.editReason
			? escapeHtml(selectedTeacherSelfReview.editReason)
			: null;
		const openAnswerRowsHtml =
			selectedTeacherSelfResponse && selectedTeacherSelfResponse.textAnswers.length > 0
				? selectedTeacherSelfResponse.textAnswers
						.map((item, index) => {
							const questionScore =
								selectedTeacherSelfReview?.questionScores?.[item.questionId] ?? null;
							return `
								<tr>
									<td>${index + 1}</td>
									<td>${escapeHtml(item.questionText)}</td>
									<td>${escapeHtml(item.answerText)}</td>
									<td>${formatScore(questionScore)}</td>
								</tr>
							`;
						})
						.join("")
				: `
					<tr>
						<td colspan="4">Açıq özünüqiymətləndirmə cavabı yoxdur.</td>
					</tr>
				`;

		const classRowsHtml =
			selectedTeacher.studentClassScores.length > 0
				? selectedTeacher.studentClassScores
						.map(
							(item) => `
								<tr>
									<td>${escapeHtml(item.groupName)}</td>
									<td>${item.submissionCount}</td>
									<td>${formatScore(item.avg)}</td>
								</tr>
							`,
						)
						.join("")
				: `
					<tr>
						<td colspan="3">Sinif/blok üzrə şagird nəticəsi yoxdur.</td>
					</tr>
				`;

		const year = cycle?.year ?? "-";
		const generatedAt = new Date().toLocaleString("az-AZ");
		const teacherName = escapeHtml(selectedTeacher.name);
		const campus = escapeHtml(selectedTeacher.branchName);
		const department = escapeHtml(selectedTeacher.departmentName);
		const feedbackSummary = escapeHtml(feedback.summary);
		const feedbackLevel = escapeHtml(feedback.levelLabel);

		const html = `
			<!doctype html>
			<html lang="az">
				<head>
					<meta charset="utf-8" />
					<title>${teacherName} - Yekun Nəticə</title>
					<style>
						body {
							font-family: Arial, Helvetica, sans-serif;
							margin: 24px;
							color: #0f172a;
						}
						h1, h2 {
							margin: 0 0 8px 0;
						}
						.meta {
							margin: 0 0 4px 0;
							color: #334155;
							font-size: 14px;
						}
						.section {
							margin-top: 18px;
						}
						.grid {
							display: grid;
							grid-template-columns: 1fr 1fr;
							gap: 10px;
							margin-top: 8px;
						}
						.card {
							border: 1px solid #cbd5e1;
							border-radius: 8px;
							padding: 10px;
						}
						.label {
							font-size: 12px;
							color: #475569;
						}
						.value {
							font-size: 20px;
							font-weight: 700;
						}
						table {
							width: 100%;
							border-collapse: collapse;
							margin-top: 8px;
						}
						th, td {
							border: 1px solid #cbd5e1;
							padding: 8px;
							text-align: left;
							font-size: 14px;
						}
						th {
							background: #f1f5f9;
						}
						.feedback-box {
							border: 1px solid #cbd5e1;
							border-radius: 10px;
							padding: 12px;
							background: #f8fafc;
							margin-top: 10px;
						}
						.feedback-title {
							font-size: 16px;
							font-weight: 700;
							margin-bottom: 8px;
						}
						.feedback-meta {
							font-size: 13px;
							color: #334155;
							margin-bottom: 8px;
						}
						.feedback-section-title {
							margin: 10px 0 6px;
							font-size: 14px;
							font-weight: 600;
						}
						.feedback-list {
							margin: 0;
							padding-left: 18px;
						}
						.feedback-list li {
							margin-bottom: 5px;
							font-size: 14px;
						}
						.meta-stack {
							display: grid;
							gap: 6px;
							margin-top: 8px;
						}
						.signature-section {
							margin-top: 26px;
							padding-top: 8px;
							border-top: 2px solid #e2e8f0;
						}
						.signature-grid {
							display: grid;
							grid-template-columns: 1fr 1fr;
							gap: 14px;
							margin-top: 10px;
						}
						.signature-card {
							border: 1px solid #cbd5e1;
							border-radius: 8px;
							padding: 12px 10px;
							min-height: 86px;
						}
						.signature-role {
							font-size: 13px;
							font-weight: 600;
							margin-bottom: 22px;
						}
						.signature-line {
							border-bottom: 1px solid #334155;
							height: 18px;
						}
						.signature-note {
							margin-top: 6px;
							font-size: 12px;
							color: #64748b;
						}
						.signature-date {
							margin-top: 14px;
							font-size: 14px;
						}
						.stamp-box {
							margin-top: 14px;
							border: 1px dashed #94a3b8;
							border-radius: 8px;
							padding: 10px;
							min-height: 58px;
							display: flex;
							align-items: center;
							justify-content: center;
							font-size: 13px;
							color: #64748b;
						}
						@media print {
							body {
								margin: 12mm;
							}
							.signature-card {
								break-inside: avoid;
							}
						}
					</style>
				</head>
				<body>
					<h1>Müəllim Yekun Nəticə Hesabatı</h1>
					<p class="meta">Sorğu dövrü: ${year}</p>
					<p class="meta">Müəllim: ${teacherName}</p>
					<p class="meta">Kampus: ${campus}</p>
					<p class="meta">Kafedra: ${department}</p>
					<p class="meta">Hazırlanma vaxtı: ${generatedAt}</p>

					<div class="section">
						<h2>Yekun Göstəricilər</h2>
						<div class="grid">
							<div class="card"><div class="label">Şagird sorğusu (ümumi orta)</div><div class="value">${formatScore(selectedTeacher.studentAvg)}</div></div>
							<div class="card"><div class="label">Rəhbərlik sorğusu</div><div class="value">${formatScore(selectedTeacher.managementAvg)}</div></div>
							<div class="card"><div class="label">Özünüqiymətləndirmə (cəm)</div><div class="value">${formatScore(selectedTeacher.selfTotal)}</div></div>
							<div class="card"><div class="label">BİQ nəticəsi</div><div class="value">${formatScore(selectedTeacher.biqAvg)}</div></div>
							<div class="card"><div class="label">Müəllimin 3 meyar üzrə orta balı</div><div class="value">${academicIndicatorText}</div></div>
							<div class="card"><div class="label">Müəllimin 3 meyar üzrə cəmi</div><div class="value">${teacherCriteriaTotalText}</div></div>
							<div class="card"><div class="label">Müəllimin öz verdiyi bal</div><div class="value">${selfDeclaredScoreText}</div></div>
							<div class="card"><div class="label">HR qiymətləndirməsi</div><div class="value">${hrEvaluationText}</div></div>
							<div class="card"><div class="label">Yekun bal</div><div class="value">${formatScore(selectedTeacher.finalScore)}</div></div>
							<div class="card"><div class="label">Şagird cavab sayı</div><div class="value">${selectedTeacher.studentCount}</div></div>
						</div>
					</div>

					<div class="section">
						<h2>3 Meyar Cəmi və Açıq Cavablar</h2>
						<div class="grid">
							<div class="card"><div class="label">Müəllimin 3 meyar üzrə cəmi</div><div class="value">${teacherCriteriaTotalText}</div></div>
							<div class="card"><div class="label">HR qiymətləndirməsi</div><div class="value">${hrEvaluationText}</div></div>
							<div class="card"><div class="label">Müəllimin öz verdiyi bal</div><div class="value">${selfDeclaredScoreText}</div></div>
						</div>
						<div class="meta-stack">
							<p class="meta">Son qiymətləndirmə: ${academicReviewedAtText ?? "—"}</p>
							<p class="meta">Son düzəliş səbəbi: ${academicEditReasonText ?? "—"}</p>
						</div>
						<table>
							<thead>
								<tr>
									<th>#</th>
									<th>Sual</th>
									<th>Cavab</th>
									<th>Bal</th>
								</tr>
							</thead>
							<tbody>
								${openAnswerRowsHtml}
							</tbody>
						</table>
					</div>

					<div class="section">
						<h2>Sinif/Blok Üzrə Şagird Balları</h2>
						<table>
							<thead>
								<tr>
									<th>Sinif / blok</th>
									<th>Cavab sayı</th>
									<th>Sinif orta balı</th>
								</tr>
							</thead>
							<tbody>
								${classRowsHtml}
							</tbody>
						</table>
					</div>

					<div class="section">
						<h2>Rəy və Tövsiyələr</h2>
						<div class="feedback-box">
							<div class="feedback-title">Avtomatik qiymətləndirmə rəyi</div>
							<div class="feedback-meta">Səviyyə: ${feedbackLevel}</div>
							<div class="feedback-meta">${feedbackSummary}</div>

							<div class="feedback-section-title">Güclü tərəflər</div>
							<ul class="feedback-list">
								${toListHtml(feedback.strengths)}
							</ul>

							<div class="feedback-section-title">İnkişaf tələb edən istiqamətlər</div>
							<ul class="feedback-list">
								${toListHtml(feedback.improvements)}
							</ul>

							<div class="feedback-section-title">Tövsiyə olunan fəaliyyət planı</div>
							<ul class="feedback-list">
								${toListHtml(feedback.actionPlan)}
							</ul>
						</div>
					</div>

					<div class="section signature-section">
						<h2>Təsdiq və İmzalar</h2>
						<div class="signature-grid">
							<div class="signature-card">
								<div class="signature-role">Müəllim</div>
								<div class="signature-line"></div>
								<div class="signature-note">Ad, soyad və imza</div>
							</div>
							<div class="signature-card">
								<div class="signature-role">Kafedra müdiri</div>
								<div class="signature-line"></div>
								<div class="signature-note">Ad, soyad və imza</div>
							</div>
							<div class="signature-card">
								<div class="signature-role">Filial rəhbəri</div>
								<div class="signature-line"></div>
								<div class="signature-note">Ad, soyad və imza</div>
							</div>
							<div class="signature-card">
								<div class="signature-role">Mərkəzi idarə nümayəndəsi</div>
								<div class="signature-line"></div>
								<div class="signature-note">Ad, soyad və imza</div>
							</div>
						</div>
						<div class="signature-date">Tarix: ____ / ____ / ______</div>
						<div class="stamp-box">Möhür üçün yer</div>
					</div>
				</body>
			</html>
		`;

		const blob = new Blob([html], { type: "text/html;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const popup = window.open(url, "_blank");
		if (!popup) {
			URL.revokeObjectURL(url);
			return;
		}

		popup.addEventListener("load", () => {
			popup.focus();
			popup.print();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		});
	};

	const handleTeacherDetailOpenChange = (open: boolean) => {
		if (!open) {
			setSelectedTeacherId(null);
			setSelfReviewQuestionScores({});
			setSelfReviewHrScore("");
			setSelfReviewStatus(null);
			setSelfReviewEditUnlocked(false);
			setSelfReviewUnlockOpen(false);
			setSelfReviewUnlockPassword("");
			setSelfReviewUnlockReason("");
			setSelfReviewUnlockError(null);
			setSelfReviewUnlockSubmitting(false);
		}
	};

	const handleRequestSelfReviewEdit = () => {
		setSelfReviewUnlockPassword("");
		setSelfReviewUnlockReason("");
		setSelfReviewUnlockError(null);
		setSelfReviewUnlockOpen(true);
	};

	const handleUnlockSelfReviewEdit = async () => {
		if (!user?.email) {
			setSelfReviewUnlockError("Hesab email-i tapılmadı. Yenidən daxil olun.");
			return;
		}
		if (!selfReviewUnlockPassword.trim()) {
			setSelfReviewUnlockError("Admin şifrəsini daxil edin.");
			return;
		}
		if (!selfReviewUnlockReason.trim()) {
			setSelfReviewUnlockError("Düzəliş səbəbini yazın.");
			return;
		}

		setSelfReviewUnlockSubmitting(true);
		setSelfReviewUnlockError(null);

		const { error } = await supabase.auth.signInWithPassword({
			email: user.email,
			password: selfReviewUnlockPassword,
		});
		if (error) {
			setSelfReviewUnlockError("Şifrə yanlışdır.");
			setSelfReviewUnlockSubmitting(false);
			return;
		}

		setSelfReviewEditUnlocked(true);
		setSelfReviewUnlockOpen(false);
		setSelfReviewUnlockPassword("");
		setSelfReviewUnlockError(null);
		setSelfReviewUnlockSubmitting(false);
		setSelfReviewStatus("Düzəliş üçün sahələr açıldı.");
	};

	const handleSaveSelfReview = async () => {
		if (!cycleId || !selectedTeacherId) return;
		if (!selectedTeacherHasOpenAnswers) {
			setSelfReviewStatus("Açıq cavab olmadığı üçün bal verilə bilməz");
			return;
		}
		if (selectedTeacherOpenReviewLocked) {
			setSelfReviewStatus(
				"Bu qiymətləndirmə kilidlənib. Düzəliş üçün admin şifrəsi tələb olunur.",
			);
			return;
		}

		const teacherBranchId = teacherMap[selectedTeacherId]?.branchId;
		if (!teacherBranchId) {
			setSelfReviewStatus("Müəllimin filialı tapılmadı");
			return;
		}

		const noteValue = selfReviewNote.trim() || null;
		const hrScoreRaw = selfReviewHrScore.trim();
		const questionScores = Object.fromEntries(
			selectedTeacherOpenQuestionIds.map((questionId) => [
				questionId,
				selfReviewQuestionScores[questionId]?.trim() ?? "",
			]),
		);
		const hasAnyScore = Object.values(questionScores).some((value) => value !== "");

		if (!hasAnyScore) {
			if (!noteValue && !hrScoreRaw) {
				await supabase
					.from("pkpd_self_reviews")
					.delete()
					.eq("org_id", ORG_ID)
					.eq("cycle_id", cycleId)
					.eq("teacher_id", selectedTeacherId);

				const refreshedRows = await fetchAllBatched<any>(async (from, to) =>
					await supabase
						.from("pkpd_self_reviews")
						.select("*")
						.eq("org_id", ORG_ID)
						.eq("cycle_id", cycleId)
						.range(from, to),
				);
				setSelfReviews(
					refreshedRows.map((row) => ({
						id: row.id,
						data: mapPkpdSelfReviewRow(row),
					})),
				);
				setSelfReviewStatus("Açıq sual cəmi və HR qiymətləndirməsi silindi");
				return;
			}

			setSelfReviewStatus("Hər açıq sual üçün bal daxil edilməlidir");
			return;
		}

		const normalizedQuestionScores: Record<string, number> = {};
		for (const [questionId, rawValue] of Object.entries(questionScores)) {
			if (rawValue === "") {
				setSelfReviewStatus("Hər açıq sual üçün bal daxil edilməlidir");
				return;
			}
			const scoreValue = Number(rawValue);
			if (Number.isNaN(scoreValue) || scoreValue < 0 || scoreValue > 10) {
				setSelfReviewStatus("Hər sualın balı 0-10 arasında olmalıdır");
				return;
			}
			normalizedQuestionScores[questionId] = scoreValue;
		}

		const teacherCriteriaTotal = sumQuestionScores(
			Object.values(normalizedQuestionScores),
		);
		if (teacherCriteriaTotal === null) {
			setSelfReviewStatus("Bal hesablanmadı");
			return;
		}
		if (hrScoreRaw === "") {
			setSelfReviewStatus("HR qiymətləndirməsi üçün 1-10 aralığında bal daxil edin");
			return;
		}
		const hrScoreValue = Number(hrScoreRaw);
		if (Number.isNaN(hrScoreValue) || hrScoreValue < 1 || hrScoreValue > 10) {
			setSelfReviewStatus("HR qiymətləndirməsi 1-10 aralığında olmalıdır");
			return;
		}

		const editReason = selectedTeacherHasSavedOpenReview
			? selfReviewUnlockReason.trim()
			: null;
		const payload = {
			org_id: ORG_ID,
			branch_id: teacherBranchId,
			cycle_id: cycleId,
			teacher_id: selectedTeacherId,
			score: hrScoreValue,
			question_scores: normalizedQuestionScores,
			note:
				selectedTeacherHasSavedOpenReview && editReason
					? buildPkpdSelfReviewNote(noteValue, null, editReason)
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
					normalizedQuestionScores,
					editReason,
				),
			};
			delete (fallbackPayload as { question_scores?: Record<string, number> })
				.question_scores;

			const fallbackResult = await supabase
				.from("pkpd_self_reviews")
				.upsert(fallbackPayload, {
					onConflict: "org_id,cycle_id,teacher_id",
				});
			error = fallbackResult.error;
		}
		if (error) {
			setSelfReviewStatus(
				`Açıq sual balı saxlanmadı: ${error.message ?? "naməlum xəta"}`,
			);
			return;
		}

		const refreshedRows = await fetchAllBatched<any>(async (from, to) =>
			await supabase
				.from("pkpd_self_reviews")
				.select("*")
				.eq("org_id", ORG_ID)
				.eq("cycle_id", cycleId)
				.range(from, to),
		);
		setSelfReviews(
			refreshedRows.map((row) => ({
				id: row.id,
				data: mapPkpdSelfReviewRow(row),
			})),
		);
		setSelfReviewStatus(
			`3 meyar üzrə cəm (${teacherCriteriaTotal.toFixed(1)}) və HR qiymətləndirməsi saxlanıldı`,
		);
		setSelfReviewEditUnlocked(false);
		setSelfReviewUnlockReason("");
	};

	return (
		<div className="panel">
			<div className="panel-header">
				<div>
					<h2>Sorğu dövrü detalları</h2>
					<p>Seçilmiş sorğu dövrü üzrə nəticələr və iştirak statistikası.</p>
				</div>
				<div className="actions">
					<Link className="btn ghost" to={cycleListPath}>
						Geri
					</Link>
					<button
						className="btn"
						type="button"
						onClick={handleExportCsv}
						disabled={!cycleId}
					>
						CSV ixracı
					</button>
				</div>
			</div>

			<div className="card">
				<div className="section-header">
					<div>
						<h3>Ümumi xülasə</h3>
						<p>Yekun bal və iştirak göstəriciləri.</p>
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
								Yekun orta cəm balı
								<InfoTip text="Yekun bal: müəllimin özünə verdiyi bal + 3 meyar üzrə cəm + HR qiymətləndirməsi. Burada həmin yekun cəmin müəllimlər üzrə ortası göstərilir." />
							</div>
							<div className="stat-value">{formatScore(overallSummary.avg)}</div>
							<div className="stat-meta">
								nəticəsi olan müəllim: {validTeacherScores.length} /{" "}
								{teacherRows.length}
							</div>
						</div>
					<div className="stat-card">
						<div className="stat-label">Səs verənlər</div>
						<div className="stat-value">{raterStats.doneSet.size}</div>
						<div className="stat-meta">unikal səs verən</div>
					</div>
					<div className="stat-card">
						<div className="stat-label">Tapşırıqlar</div>
						<div className="stat-value">{overallSummary.submissions}</div>
						<div className="stat-meta">ümumi səsvermə</div>
					</div>
				</div>
				<div className="divider" />
				<div className="grid two">
					<div className="stat-card">
						<div className="stat-label">Ən yaxşı nəticə</div>
						<div className="stat-value">
							{topTeacher ? formatScore(topTeacher.finalScore) : "—"}
						</div>
						<div className="stat-meta">
							{topTeacher ? topTeacher.name : "Məlumat yoxdur"}
						</div>
					</div>
					<div className="stat-card">
						<div className="stat-label">Ən aşağı nəticə</div>
						<div className="stat-value">
							{bottomTeacher ? formatScore(bottomTeacher.finalScore) : "—"}
						</div>
						<div className="stat-meta">
							{bottomTeacher ? bottomTeacher.name : "Məlumat yoxdur"}
						</div>
					</div>
				</div>
			</div>

			<div className="card">
					<div className="section-header">
						<div>
							<h3>Müəllim nəticələri</h3>
							<p>
								Müəllim adına klik edin: detallar drawer içində açılacaq.
							</p>
						</div>
					</div>
					<div className="form-row">
						<input
							className="input"
							placeholder="Müəllim, kampus və ya kafedra axtar..."
							value={teacherQuery}
							onChange={(event) => {
								setTeacherQuery(event.target.value);
								setTeacherPage(1);
							}}
						/>
						<button
							className="btn ghost"
							type="button"
							onClick={() => {
								setShowAllTeachers((prev) => !prev);
								setTeacherPage(1);
							}}
						>
							{showAllTeachers ? "Yalnız nəticə olanlar" : "Hamısını göstər"}
						</button>
					</div>
					<div className="data-table">
					<div className="data-row header">
						<div>Müəllim</div>
						<div>Kampus</div>
						<div>Kafedra</div>
						<div>Yekun bal</div>
						<div>n</div>
					</div>
					{paginatedTeacherRows.map((item) => (
						<div className="data-row" key={item.teacherId}>
							<div>
								<button
									className="btn ghost"
									type="button"
									onClick={() => setSelectedTeacherId(item.teacherId)}
								>
									{item.name}
								</button>
							</div>
							<div>{item.branchName}</div>
							<div>{item.departmentName}</div>
							<div>{formatScore(item.finalScore)}</div>
							<div>{item.surveySubmissionCount}</div>
						</div>
					))}
						{visibleTeacherRows.length === 0 && (
							<div className="empty">
								Göstərmək üçün müəllim tapılmadı. Axtarışı dəyişin və ya
								&quot;Hamısını göstər&quot; seçin.
							</div>
						)}
					</div>
					{visibleTeacherRows.length > 0 && (
						<PaginationControls
							totalItems={visibleTeacherRows.length}
							page={teacherPage}
							pageSize={teacherPageSize}
							onPageChange={setTeacherPage}
						onPageSizeChange={(nextSize) => {
							setTeacherPageSize(nextSize);
							setTeacherPage(1);
						}}
					/>
				)}
			</div>

			<Dialog
				open={Boolean(selectedTeacher)}
				onOpenChange={handleTeacherDetailOpenChange}
			>
				<DialogContent className="left-auto right-0 top-0 h-screen max-h-screen w-full max-w-5xl translate-x-0 translate-y-0 overflow-y-auto rounded-none border-l p-0">
					{selectedTeacher && (
						<div className="panel gap-0">
							<div className="panel-header sticky top-0 z-10 border-b border-border bg-card px-6 py-5">
								<DialogHeader className="text-left">
									<DialogTitle>{selectedTeacher.name}</DialogTitle>
									<p className="text-sm text-muted-foreground">
										Kampus: {selectedTeacher.branchName} • Kafedra:{" "}
										{selectedTeacher.departmentName}
									</p>
								</DialogHeader>
								<div className="actions">
									<button
										className="btn ghost"
										type="button"
										onClick={handleExportTeacherPdf}
									>
										PDF yüklə
									</button>
									<button
										className="btn"
										type="button"
										onClick={() => handleTeacherDetailOpenChange(false)}
									>
										Bağla
									</button>
								</div>
							</div>

							<div className="panel-content px-6 py-6">
								<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
									<div className="stat-card">
										<div className="stat-label">Şagird sorğusu (ümumi orta)</div>
										<div className="stat-value">
											{formatScore(selectedTeacher.studentAvg)}
										</div>
										<div className="stat-meta">
											sinif/blok sayı: {selectedTeacher.studentClassCount} • cavab sayı:{" "}
											{selectedTeacher.studentCount}
										</div>
									</div>
									<div className="stat-card">
										<div className="stat-label">Rəhbərlik sorğusu</div>
										<div className="stat-value">
											{formatScore(selectedTeacher.managementAvg)}
										</div>
										<div className="stat-meta">
											cavab sayı: {selectedTeacher.managementCount}
										</div>
									</div>
									<div className="stat-card">
										<div className="stat-label">Özünüqiymətləndirmə (cəm)</div>
										<div className="stat-value">
											{formatScore(selectedTeacher.selfTotal)}
										</div>
										<div className="stat-meta">
											cavab sayı: {selectedTeacher.selfCount} • öz balı + 3 meyar cəmi
										</div>
									</div>
									<div className="stat-card">
										<div className="stat-label">BİQ nəticəsi</div>
										<div className="stat-value">
											{formatScore(selectedTeacher.biqAvg)}
										</div>
										<div className="stat-meta">qrup/fənn ortalaması</div>
									</div>
								</div>

								<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
									<div className="stat-card">
										<div className="stat-label">Yekun bal</div>
										<div className="stat-value">
											{formatScore(selectedTeacher.finalScore)}
										</div>
										<div className="stat-meta">
											öz balı + 3 meyar cəmi + HR qiymətləndirməsi
										</div>
									</div>
									<div className="stat-card">
										<div className="stat-label">Müəllimin öz verdiyi bal</div>
										<div className="stat-value">
											{formatScore(selectedTeacher.selfDeclaredScore)}
										</div>
										<div className="stat-meta">1-10</div>
									</div>
									<div className="stat-card">
										<div className="stat-label">Müəllimin 3 meyar üzrə cəmi</div>
										<div className="stat-value">
											{formatScore(selectedTeacher.teacherCriteriaTotal)}
										</div>
										<div className="stat-meta">
											{selectedTeacherSelfReview?.reviewedAt
												? `Son qiymətləndirmə: ${new Date(
														String(selectedTeacherSelfReview.reviewedAt),
													).toLocaleString("az-AZ")}`
												: "Hələ bal verilməyib"}
										</div>
									</div>
									<div className="stat-card">
										<div className="stat-label">HR qiymətləndirməsi</div>
										<div className="stat-value">
											{formatScore(selectedTeacher.hrEvaluationScore)}
										</div>
										<div className="stat-meta">1-10</div>
									</div>
								</div>

								<div className="card">
									<div className="section-header">
										<div>
											<h3>Açıq özünüqiymətləndirmə cavabları</h3>
											<p>
												Superadmin burada müəllimin açıq cavablarını oxuyub ayrıca
												bal verə bilər. Bu göstərici PKPD hesabında istifadə olunur.
											</p>
										</div>
										{selectedTeacherHasSavedOpenReview && (
											<div className="actions">
												{selectedTeacherOpenReviewLocked ? (
													<button
														className="btn ghost"
														type="button"
														onClick={handleRequestSelfReviewEdit}
													>
														Düzəliş et
													</button>
												) : (
													<span className="tag success">Düzəliş açıqdır</span>
												)}
											</div>
										)}
									</div>
									{selectedTeacherHasSavedOpenReview && (
										<div className="notice">
											{selectedTeacherOpenReviewLocked
												? "Bu qiymətləndirmə kilidlənib. Dəyişiklik üçün admin şifrəsi tələb olunur."
												: "Düzəliş rejimi aktivdir. Yenidən saxladıqdan sonra forma yenə kilidlənəcək."}
										</div>
									)}
									<div className="stat-card">
										<div className="stat-label">Müəllimin öz verdiyi bal</div>
										<div className="stat-value">
											{selectedTeacherSelfResponse?.declaredScore?.toFixed(1) ?? "—"}
										</div>
										<div className="stat-meta">0-10</div>
									</div>
									<div className="stat-card">
										<div className="stat-label">Müəllimin 3 meyar üzrə cəmi</div>
										<div className="stat-value">
											{sumQuestionScores(
												selectedTeacherOpenQuestionIds.map((questionId) => {
													const value =
														selfReviewQuestionScores[questionId]?.trim() ?? "";
													return value === "" ? null : Number(value);
												}),
											)?.toFixed(1) ?? "—"}
										</div>
										<div className="stat-meta">3 açıq meyar üzrə cəm bal</div>
									</div>
									{selectedTeacherSelfReview?.editReason && (
										<div className="hint">
											Son düzəliş səbəbi: {selectedTeacherSelfReview.editReason}
										</div>
									)}
									<div className="stack">
										{selectedTeacherSelfResponse?.textAnswers.map((item, index) => (
											<div className="question" key={item.questionId}>
												<div className="label">Sual {index + 1}</div>
												<div className="mt-1 text-sm font-semibold text-foreground">
													{item.questionText}
												</div>
												<div className="divider" />
												<div className="label">Cavab</div>
												<div className="comment-text">{item.answerText}</div>
												<div className="form-row">
													<div className="field w-full max-w-40">
														<span className="label">Bal</span>
														<input
															className="input"
															type="number"
															min="0"
															max="10"
															step="0.1"
															placeholder="0-10"
															value={selfReviewQuestionScores[item.questionId] ?? ""}
															disabled={selectedTeacherOpenReviewLocked}
															onChange={(event) =>
																setSelfReviewQuestionScores((prev) => ({
																	...prev,
																	[item.questionId]: event.target.value,
																}))
															}
														/>
													</div>
												</div>
											</div>
										))}
										{(!selectedTeacherSelfResponse ||
											selectedTeacherSelfResponse.textAnswers.length === 0) && (
											<div className="empty">
												Bu müəllim açıq suallara hələ cavab yazmayıb.
											</div>
										)}
									</div>
									<div className="question">
										<div className="question-title">
											HRın qiymətləndirməsi <span className="required">*</span>
										</div>
										<div className="hint">
											Müəllimin yazılı cavablarına əsasən 1-10 aralığında yekun bal verin.
										</div>
										<div className="form-row">
											<div className="field w-full max-w-40">
												<span className="label">Bal</span>
												<input
													className="input"
													type="number"
													min="1"
													max="10"
													step="0.1"
													placeholder="1-10"
													value={selfReviewHrScore}
													disabled={selectedTeacherOpenReviewLocked}
													onChange={(event) => setSelfReviewHrScore(event.target.value)}
												/>
											</div>
										</div>
									</div>
									<div className="form-row">
										<input
											className="input"
											placeholder="Qeyd (istəyə bağlı)"
											value={selfReviewNote}
											disabled={selectedTeacherOpenReviewLocked}
											onChange={(event) => setSelfReviewNote(event.target.value)}
										/>
										<button
											className="btn primary"
											type="button"
											onClick={handleSaveSelfReview}
											disabled={
												!selectedTeacherHasOpenAnswers ||
												selectedTeacherOpenReviewLocked
											}
										>
											Saxla
										</button>
									</div>
									{selfReviewStatus && <div className="notice">{selfReviewStatus}</div>}
								</div>

								{selectedTeacher.studentClassScores.length > 0 && (
									<div className="card">
										<div className="section-header">
											<div>
												<h3>Sinif/blok üzrə şagird balları</h3>
												<p>Hər sinif üçün orta bal və cavab sayı.</p>
											</div>
										</div>
										<div className="data-table">
											<div className="data-row header">
												<div>Sinif / blok</div>
												<div>Cavab sayı</div>
												<div>Sinif orta balı</div>
											</div>
											{selectedTeacher.studentClassScores.map((item) => (
												<div
													className="data-row"
													key={`${selectedTeacher.teacherId}_${item.groupId}`}
												>
													<div>{item.groupName}</div>
													<div>{item.submissionCount}</div>
													<div>{formatScore(item.avg)}</div>
												</div>
											))}
										</div>
									</div>
								)}
							</div>
						</div>
					)}
				</DialogContent>
			</Dialog>

			<Dialog open={selfReviewUnlockOpen} onOpenChange={setSelfReviewUnlockOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Düzəlişi təsdiqlə</DialogTitle>
						<DialogDescription>
							Saxlanmış açıq sual balını dəyişmək üçün admin şifrəsini və
							düzəliş səbəbini daxil edin.
						</DialogDescription>
					</DialogHeader>
					<div className="stack">
						<label className="field">
							<span className="label">Admin şifrəsi</span>
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
							<span className="label">Düzəliş səbəbi</span>
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
							Ləğv et
						</button>
						<button
							className="btn primary"
							type="button"
							onClick={handleUnlockSelfReviewEdit}
							disabled={selfReviewUnlockSubmitting}
						>
							{selfReviewUnlockSubmitting ? "Yoxlanır..." : "Təsdiqlə"}
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

				<div className="card">
					<div className="section-header">
						<div>
							<h3>Əlavə Bölmələr</h3>
							<p>Ekranı sadə saxlamaq üçün bu bölmələr bağlıdır.</p>
						</div>
					</div>
					<div className="form-row">
						<button
							className="btn ghost"
							type="button"
							onClick={() => setShowRaters((prev) => !prev)}
						>
							{showRaters ? "İştirak edənləri gizlət" : "İştirak edənləri göstər"}
						</button>
						{comments.length > 0 && (
							<button
								className="btn ghost"
								type="button"
								onClick={() => setShowComments((prev) => !prev)}
							>
								{showComments ? "Şərhləri gizlət" : "Şərhləri göstər"}
							</button>
						)}
					</div>
				</div>

				{showRaters && (
					<div className="card">
					<div className="section-header">
						<div>
							<h3>İştirak edənlər</h3>
						<p>Anonim nəticələr: yalnız səs verib-verməməsi göstərilir.</p>
					</div>
				</div>
				<div className="data-table">
					<div className="data-row header">
						<div>Ad</div>
						<div>Rol</div>
						<div>Səs verib</div>
						<div>n</div>
					</div>
					{paginatedRaterRows.map((item) => (
						<div className="data-row" key={item.id}>
							<div>{item.name}</div>
							<div>{item.role}</div>
							<div>{item.done ? "Bəli" : "Xeyr"}</div>
							<div>{item.submissions}</div>
						</div>
					))}
					{raterRows.length === 0 && <div className="empty">Məlumat yoxdur.</div>}
				</div>
					{raterRows.length > 0 && (
						<PaginationControls
							totalItems={raterRows.length}
						page={raterPage}
						pageSize={raterPageSize}
						onPageChange={setRaterPage}
						onPageSizeChange={(nextSize) => {
							setRaterPageSize(nextSize);
							setRaterPage(1);
							}}
						/>
					)}
				</div>
				)}

				{showComments && comments.length > 0 && (
					<div className="card">
						<div className="section-header">
						<div>
							<h3>Şərhlər</h3>
							<p>Son yazılı rəylər.</p>
						</div>
					</div>
					<div className="comment-feed">
						{paginatedComments.map((comment, index) => (
							<div className="comment" key={`${comment.teacherId}_${index}`}>
								<div className="comment-title">
									{teacherMap[comment.teacherId]?.name ?? comment.teacherId}
								</div>
								<div className="comment-text">{comment.text}</div>
							</div>
						))}
					</div>
					<PaginationControls
						totalItems={comments.length}
						page={commentPage}
						pageSize={commentPageSize}
						onPageChange={setCommentPage}
						onPageSizeChange={(nextSize) => {
							setCommentPageSize(nextSize);
							setCommentPage(1);
						}}
					/>
				</div>
			)}
		</div>
	);
};
