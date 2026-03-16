import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PaginationControls } from "../../components/PaginationControls";
import { ORG_ID, supabase } from "../../lib/supabase";
import {
	mapBranchRow,
	mapGroupRow,
	mapManagementAssignmentRow,
	mapQuestionRow,
	mapQuestionSetRow,
	mapStudentRow,
	mapSubjectRow,
	mapSurveyCycleRow,
	mapTeacherRow,
	mapTeachingAssignmentRow,
	mapUserRow,
} from "../../lib/supabaseMappers";
import type {
	BranchDoc,
	QuestionDoc,
	SurveyCycleDoc,
	TaskDoc,
} from "../../lib/types";
import {
	STUDENT_EVALUATION_CRITERIA,
	STUDENT_TEACHER_INSTRUCTION_QUESTION_ID,
	buildStudentTeacherInstructionQuestionDoc,
	ensureStudentTeacherInstructionQuestionIds,
	isStudentTeacherInstructionQuestion,
} from "../../lib/surveyQuestions";
import { chunkArray, toJsDate } from "../../lib/utils";
import { useAuth } from "../auth/AuthProvider";

const flows = ["student_teacher", "management_teacher", "teacher_self"] as const;
type EnabledFlow = (typeof flows)[number];
const SUPABASE_BATCH_SIZE = 1000;
const flowLabels: Record<EnabledFlow, string> = {
	student_teacher: "Şagird → Müəllim",
	management_teacher: "Rəhbərlik → Müəllim",
	teacher_self: "Müəllim → Özünü",
};

const TEACHER_SELF_PKPD_QUESTION_TEMPLATES = [
	{
		key: "self-score",
		buildText: (academicYearLabel: string) =>
			`${academicYearLabel} üçün fəaliyyətinizi nəzərə alaraq özünüzə neçə bal verirsiniz?`,
		type: "scale" as const,
		scaleMin: 0,
		scaleMax: 10,
	},
	{
		key: "certificates-publications-media",
		legacyId: "pkpd-self-certificates-publications-media",
		buildText: (academicYearLabel: string) =>
			`${academicYearLabel} üçün beynəlxalq və ölkədaxili sertifikatlar, elmi-metodiki nəşrlərdə müəlliflik, TV çıxışları, məqalələr, təlim və konfranslarda iştirak və ya çıxışlar varmı? Varsa, nailiyyətlərinizi yazın.`,
		type: "text" as const,
	},
	{
		key: "olympiad-competition-results",
		legacyId: "pkpd-self-olympiad-competition-results",
		buildText: (academicYearLabel: string) =>
			`${academicYearLabel} üçün olimpiada və digər fənn müsabiqə və yarışlarda şagirdlərinizin nəticələri varmı? Varsa, nailiyyətlərinizi yazın.`,
		type: "text" as const,
	},
	{
		key: "projects-and-events",
		legacyId: "pkpd-self-projects-and-events",
		buildText: (academicYearLabel: string) =>
			`${academicYearLabel} üçün dövlət və digər təşkilatlarla həyata keçirdiyiniz və ya iştirak etdiyiniz layihələr, həmçinin liseydə təşkil etdiyiniz tədbir və layihələr varmı? Varsa, nailiyyətlərinizi yazın.`,
		type: "text" as const,
	},
] as const;

const buildAcademicYearLabel = (cycleYear: number) =>
	`${cycleYear - 1}-${cycleYear}-cı il`;

const buildTeacherSelfPkpdQuestionId = (cycleId: string, key: string) =>
	`pkpd-self-${cycleId}-${key}`;

const ensureTeacherSelfPkpdQuestionSet = async (cycleId: string) => {
	const { data: cycleRow, error: cycleError } = await supabase
		.from("survey_cycles")
		.select("id, year")
		.eq("org_id", ORG_ID)
		.eq("id", cycleId)
		.maybeSingle();
	if (cycleError || !cycleRow) {
		return {
			questionIds: [] as string[],
			error: cycleError?.message ?? "Sorğu dövrü tapılmadı",
		};
	}

	const academicYearLabel = buildAcademicYearLabel(cycleRow.year);
	const questionRows = TEACHER_SELF_PKPD_QUESTION_TEMPLATES.map((item) => ({
		id: buildTeacherSelfPkpdQuestionId(cycleId, item.key),
		org_id: ORG_ID,
		text: item.buildText(academicYearLabel),
		type: item.type,
		required: true,
		options: null,
		scale_min: item.type === "scale" ? item.scaleMin ?? 0 : null,
		scale_max: item.type === "scale" ? item.scaleMax ?? 10 : null,
		category: "teacher_self_pkpd",
	}));
	const legacyQuestionRows = TEACHER_SELF_PKPD_QUESTION_TEMPLATES.filter(
		(item) => "legacyId" in item,
	).map((item) => ({
		id: item.legacyId,
		org_id: ORG_ID,
		text: item.buildText(academicYearLabel),
		type: item.type,
		required: true,
		options: null,
		scale_min: null,
		scale_max: null,
		category: "teacher_self_pkpd",
	}));
	const { error: questionError } = await supabase
		.from("questions")
		.upsert([...legacyQuestionRows, ...questionRows], {
			onConflict: "id",
		});
	if (questionError) {
		return { questionIds: [] as string[], error: questionError.message };
	}

	const questionIds = questionRows.map((item) => item.id);
	const { error: questionSetError } = await supabase.from("question_sets").upsert(
		{
			org_id: ORG_ID,
			cycle_id: cycleId,
			target_flow: "teacher_self",
			question_ids: questionIds,
			updated_at: new Date().toISOString(),
		},
		{
			onConflict: "org_id,cycle_id,target_flow",
		},
	);
	if (questionSetError) {
		return { questionIds: [] as string[], error: questionSetError.message };
	}

	return { questionIds, error: null as string | null };
};

const ensureStudentTeacherInstructionQuestionSet = async (
	cycleId: string,
	sourceQuestionIds?: string[],
) => {
	const instructionQuestion = buildStudentTeacherInstructionQuestionDoc();
	const { error: questionError } = await supabase.from("questions").upsert(
		{
			id: STUDENT_TEACHER_INSTRUCTION_QUESTION_ID,
			org_id: ORG_ID,
			text: instructionQuestion.text,
			type: instructionQuestion.type,
			required: instructionQuestion.required,
			options: null,
			scale_min: null,
			scale_max: null,
			category: instructionQuestion.category ?? null,
		},
		{
			onConflict: "id",
		},
	);
	if (questionError) {
		return {
			questionIds: [] as string[],
			error: questionError.message,
			hasQuestionSet: false,
		};
	}

	let baseQuestionIds = sourceQuestionIds;
	if (!baseQuestionIds) {
		const { data: setRow, error: setError } = await supabase
			.from("question_sets")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("cycle_id", cycleId)
			.eq("target_flow", "student_teacher")
			.maybeSingle();
		if (setError) {
			return {
				questionIds: [] as string[],
				error: setError.message,
				hasQuestionSet: false,
			};
		}
		if (!setRow) {
			return {
				questionIds: [] as string[],
				error: null as string | null,
				hasQuestionSet: false,
			};
		}
		baseQuestionIds = mapQuestionSetRow(setRow).questionIds ?? [];
	}

	const questionIds = ensureStudentTeacherInstructionQuestionIds(baseQuestionIds);
	const { error: questionSetError } = await supabase
		.from("question_sets")
		.upsert(
			{
				org_id: ORG_ID,
				cycle_id: cycleId,
				target_flow: "student_teacher",
				question_ids: questionIds,
				updated_at: new Date().toISOString(),
			},
			{
				onConflict: "org_id,cycle_id,target_flow",
			},
		);
	if (questionSetError) {
		return {
			questionIds: [] as string[],
			error: questionSetError.message,
			hasQuestionSet: true,
		};
	}

	return {
		questionIds,
		error: null as string | null,
		hasQuestionSet: true,
	};
};

const buildTaskId = (task: {
	cycleId: string;
	raterUid: string;
	targetType: string;
	targetId: string;
	groupId?: string | null;
	subjectId?: string | null;
}) =>
	[
		task.cycleId,
		task.raterUid,
		task.targetType,
		task.targetId,
		task.groupId ?? "all",
	task.subjectId ?? "all",
	].join("_");

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

export const AdminCyclesPage = () => {
	const { user } = useAuth();
	const [cycles, setCycles] = useState<
		Array<{ id: string; data: SurveyCycleDoc }>
	>([]);
	const [questions, setQuestions] = useState<
		Array<{ id: string; data: QuestionDoc }>
	>([]);
	const [branches, setBranches] = useState<
		Array<{ id: string; data: BranchDoc }>
	>([]);
	const [selectedCycleId, setSelectedCycleId] = useState<string>("");
	const [selectedFlow, setSelectedFlow] =
		useState<EnabledFlow>("student_teacher");
	const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
	const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
	const [year, setYear] = useState(String(new Date().getFullYear()));
	const [startAt, setStartAt] = useState("");
	const [durationDays, setDurationDays] = useState("7");
	const [thresholdY, setThresholdY] = useState("3");
	const [thresholdP, setThresholdP] = useState("3");
	const [status, setStatus] = useState<string | null>(null);
	const [deleteCycle, setDeleteCycle] = useState<{
		id: string;
		year: number;
	} | null>(null);
	const [deletePassword, setDeletePassword] = useState("");
	const [deleteSubmitting, setDeleteSubmitting] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(25);

	const loadCycles = async () => {
		const { data, error } = await supabase
			.from("survey_cycles")
			.select("*")
			.eq("org_id", ORG_ID);
		if (error) return;
		const items = (data ?? []).map((row) => ({
			id: row.id,
			data: mapSurveyCycleRow(row),
		}));
		setCycles(items);
	};

	const loadQuestions = async () => {
		const { data, error } = await supabase
			.from("questions")
			.select("*")
			.eq("org_id", ORG_ID);
		if (error) return;
		const items = (data ?? []).map((row) => ({
			id: row.id,
			data: mapQuestionRow(row),
		}));
		setQuestions(items);
	};

	const loadBranches = async () => {
		const { data, error } = await supabase
			.from("branches")
			.select("*")
			.eq("org_id", ORG_ID)
			.is("deleted_at", null);
		if (error) return;
		const items = (data ?? []).map((row) => ({
			id: row.id,
			data: mapBranchRow(row),
		}));
		setBranches(items);
	};

	useEffect(() => {
		void loadCycles();
		void loadQuestions();
		void loadBranches();
	}, []);

	useEffect(() => {
		const loadQuestionSet = async () => {
			if (!selectedCycleId) return;
			if (selectedFlow === "teacher_self") {
				const ensured = await ensureTeacherSelfPkpdQuestionSet(selectedCycleId);
				if (ensured.error) {
					setSelectedQuestionIds([]);
					setStatus(
						`Özünüqiymətləndirmə sualları hazırlanmadı: ${ensured.error}`,
					);
					return;
				}
				setSelectedQuestionIds(ensured.questionIds);

				const { data: refreshedQuestions, error: refreshedQuestionsError } =
					await supabase
						.from("questions")
						.select("*")
						.eq("org_id", ORG_ID);
				if (!refreshedQuestionsError) {
					const items = (refreshedQuestions ?? []).map((row) => ({
						id: row.id,
						data: mapQuestionRow(row),
					}));
					setQuestions(items);
				}
				return;
			}

			const { data, error } = await supabase
				.from("question_sets")
				.select("*")
				.eq("org_id", ORG_ID)
				.eq("cycle_id", selectedCycleId)
				.eq("target_flow", selectedFlow)
				.maybeSingle();

			if (error || !data) {
				setSelectedQuestionIds([]);
				return;
			}

			const mapped = mapQuestionSetRow(data);
			if (selectedFlow === "student_teacher") {
				const ensured = await ensureStudentTeacherInstructionQuestionSet(
					selectedCycleId,
					mapped.questionIds ?? [],
				);
				if (ensured.error) {
					setSelectedQuestionIds([]);
					setStatus(
						`Şagird müəllim qiymətləndirilməsi təlimatı hazırlanmadı: ${ensured.error}`,
					);
					return;
				}
				setSelectedQuestionIds(ensured.questionIds);

				const { data: refreshedQuestions, error: refreshedQuestionsError } =
					await supabase
						.from("questions")
						.select("*")
						.eq("org_id", ORG_ID);
				if (!refreshedQuestionsError) {
					const items = (refreshedQuestions ?? []).map((row) => ({
						id: row.id,
						data: mapQuestionRow(row),
					}));
					setQuestions(items);
				}
				return;
			}

			setSelectedQuestionIds(mapped.questionIds ?? []);
		};

		void loadQuestionSet();
	}, [selectedCycleId, selectedFlow]);

	useEffect(() => {
		if (!deleteCycle) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = previous;
		};
	}, [deleteCycle]);

	useEffect(() => {
		const totalPages = Math.max(1, Math.ceil(cycles.length / pageSize));
		if (page > totalPages) setPage(totalPages);
	}, [cycles.length, page, pageSize]);

	const handleCreate = async () => {
		if (!year || !startAt || !durationDays) {
			setStatus("Bütün sahələri doldurun");
			return;
		}

		const yearNum = Number(year);
		const durationNum = Number(durationDays);
		const thresholdYNum = Number(thresholdY);
		const thresholdPNum = Number(thresholdP);

		if (!Number.isInteger(yearNum) || yearNum < 2000) {
			setStatus("İl düzgün daxil edilməyib");
			return;
		}
		if (!Number.isFinite(durationNum) || durationNum <= 0) {
			setStatus("Müddət düzgün daxil edilməyib");
			return;
		}
		if (!Number.isFinite(thresholdYNum) || !Number.isFinite(thresholdPNum)) {
			setStatus("Risk hədləri düzgün daxil edilməyib");
			return;
		}
		if (cycles.some((cycle) => cycle.data.year === yearNum)) {
			setStatus(`Bu il (${yearNum}) üçün sorğu dövrü artıq mövcuddur.`);
			return;
		}

		const startDate = new Date(startAt);
		const endDate = new Date(startDate);
		endDate.setDate(endDate.getDate() + durationNum);

		const { error } = await supabase.from("survey_cycles").insert({
			org_id: ORG_ID,
			branch_ids: selectedBranchIds.length > 0 ? selectedBranchIds : null,
			year: yearNum,
			start_at: startDate.toISOString(),
			end_at: endDate.toISOString(),
			duration_days: durationNum,
			status: "DRAFT",
			threshold_y: thresholdYNum,
			threshold_p: thresholdPNum,
		});

		if (error) {
			const duplicateYear =
				error.code === "23505" ||
				error.message.includes("survey_cycles_org_year_uidx");
			setStatus(
				duplicateYear
					? `Bu il (${yearNum}) üçün sorğu dövrü artıq mövcuddur.`
					: error.message || "Yaratma zamanı xəta oldu",
			);
			return;
		}

		setStatus("Sorğu dövrü yaradıldı");
		await loadCycles();
	};

	const handleStatusChange = async (
		cycleId: string,
		statusValue: SurveyCycleDoc["status"],
	) => {
		const { error } = await supabase
			.from("survey_cycles")
			.update({ status: statusValue })
			.eq("org_id", ORG_ID)
			.eq("id", cycleId);
		if (error) {
			setStatus("Status yenilənmədi");
			return;
		}
		await loadCycles();
	};

	const openDeleteModal = (cycleId: string, yearValue: number) => {
		setDeleteCycle({ id: cycleId, year: yearValue });
		setDeletePassword("");
		setDeleteError(null);
	};

	const closeDeleteModal = () => {
		if (deleteSubmitting) return;
		setDeleteCycle(null);
		setDeletePassword("");
		setDeleteError(null);
	};

	const handleDeleteCycle = async () => {
		if (!deleteCycle) return;
		if (!deletePassword.trim()) {
			setDeleteError("Silmə üçün şifrəni daxil edin.");
			return;
		}
		if (!user?.email) {
			setDeleteError("Hesab email-i tapılmadı. Yenidən daxil olun.");
			return;
		}

		setDeleteSubmitting(true);
		setDeleteError(null);

		const { error: authError } = await supabase.auth.signInWithPassword({
			email: user.email,
			password: deletePassword,
		});
		if (authError) {
			setDeleteError("Şifrə yanlışdır.");
			setDeleteSubmitting(false);
			return;
		}

		const { error } = await supabase
			.from("survey_cycles")
			.delete()
			.eq("org_id", ORG_ID)
			.eq("id", deleteCycle.id);

		if (error) {
			setDeleteError(error.message || "Sorğu dövrü silinmədi.");
			setDeleteSubmitting(false);
			return;
		}

		if (selectedCycleId === deleteCycle.id) {
			setSelectedCycleId("");
		}
		setStatus(`Sorğu dövrü (${deleteCycle.year}) silindi.`);
		setDeleteSubmitting(false);
		closeDeleteModal();
		await loadCycles();
	};

	const handleSaveQuestionSet = async () => {
		if (!selectedCycleId) return;
		if (selectedFlow === "teacher_self") {
			const ensured = await ensureTeacherSelfPkpdQuestionSet(selectedCycleId);
			if (ensured.error) {
				setStatus(
					`Özünüqiymətləndirmə sualları saxlanmadı: ${ensured.error}`,
				);
				return;
			}
			setSelectedQuestionIds(ensured.questionIds);
			setStatus("Özünüqiymətləndirmə sualları avtomatik yeniləndi");
			return;
		}
		const questionIdsWithoutInstruction = selectedQuestionIds.filter(
			(id) => id !== STUDENT_TEACHER_INSTRUCTION_QUESTION_ID,
		);
		if (questionIdsWithoutInstruction.length === 0) {
			setStatus("Ən azı 1 sual seçilməlidir");
			return;
		}
		if (selectedFlow === "student_teacher") {
			const ensured = await ensureStudentTeacherInstructionQuestionSet(
				selectedCycleId,
				questionIdsWithoutInstruction,
			);
			if (ensured.error) {
				setStatus(
					`Şagird müəllim qiymətləndirilməsi təlimatı saxlanmadı: ${ensured.error}`,
				);
				return;
			}
			setSelectedQuestionIds(ensured.questionIds);
			setStatus("Şagird müəllim qiymətləndirilməsi təlimatı avtomatik əlavə olundu");
			await loadQuestions();
			return;
		}

		const { error } = await supabase.from("question_sets").upsert(
			{
				org_id: ORG_ID,
				cycle_id: selectedCycleId,
				target_flow: selectedFlow,
				question_ids: selectedQuestionIds,
				updated_at: new Date().toISOString(),
			},
			{ onConflict: "org_id,cycle_id,target_flow" },
		);

		if (error) {
			setStatus(error.message || "Sual seti yenilənmədi");
			return;
		}
		setStatus("Sual seti yeniləndi");
	};

	const handleCopyFromPreviousCycle = async () => {
		if (!selectedCycle) return;

		const prevCycle = [...cycles]
			.filter((cycle) => cycle.data.year < selectedCycle.data.year)
			.sort((a, b) => b.data.year - a.data.year)[0];

		if (!prevCycle) {
			setStatus("Əvvəlki sorğu dövrü tapılmadı");
			return;
		}

		const { data, error } = await supabase
			.from("question_sets")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("cycle_id", prevCycle.id);

		if (error || !data || data.length === 0) {
			setStatus("Əvvəlki sorğu dövrü üçün sual seti yoxdur");
			return;
		}

		const nowIso = new Date().toISOString();
		const rows = data
			.map((row) => {
				const mapped = mapQuestionSetRow(row);
				return {
					org_id: ORG_ID,
					cycle_id: selectedCycle.id,
					target_flow: mapped.targetFlow,
					question_ids: mapped.questionIds ?? [],
					updated_at: nowIso,
				};
			})
			.filter((row) => flows.includes(row.target_flow as EnabledFlow));

		const { error: upsertError } = await supabase
			.from("question_sets")
			.upsert(rows, {
				onConflict: "org_id,cycle_id,target_flow",
			});

		if (upsertError) {
			setStatus("Sual setləri köçürülmədi");
			return;
		}

		const ensuredTeacherSelf = rows.some(
			(row) => row.target_flow === "teacher_self",
		)
			? await ensureTeacherSelfPkpdQuestionSet(selectedCycle.id)
			: null;
		const studentTeacherRow = rows.find(
			(row) => row.target_flow === "student_teacher",
		);
		const ensuredStudentTeacher = studentTeacherRow
			? await ensureStudentTeacherInstructionQuestionSet(
					selectedCycle.id,
					studentTeacherRow.question_ids ?? [],
				)
			: null;
		if (ensuredTeacherSelf?.error) {
			setStatus(
				`Sual setləri köçürüldü, amma özünüqiymətləndirmə yenilənmədi: ${ensuredTeacherSelf.error}`,
			);
			return;
		}
		if (ensuredStudentTeacher?.error) {
			setStatus(
				`Sual setləri köçürüldü, amma şagird müəllim qiymətləndirilməsi təlimatı yenilənmədi: ${ensuredStudentTeacher.error}`,
			);
			return;
		}

		if (selectedFlow === "teacher_self") {
			setSelectedQuestionIds(ensuredTeacherSelf?.questionIds ?? []);
		} else if (selectedFlow === "student_teacher") {
			setSelectedQuestionIds(ensuredStudentTeacher?.questionIds ?? []);
		} else {
			const currentFlowRow = rows.find((row) => row.target_flow === selectedFlow);
			if (currentFlowRow)
				setSelectedQuestionIds(currentFlowRow.question_ids ?? []);
		}

		await loadQuestions();
		setStatus(`Sual setləri ${prevCycle.data.year} ilindən köçürüldü`);
	};

	const generateTasksForCycle = async (cycleId: string) => {
		setStatus("Tapşırıqlar hazırlanır...");
		const ensured = await ensureTeacherSelfPkpdQuestionSet(cycleId);
		if (ensured.error) {
			setStatus(`Özünüqiymətləndirmə sualları hazırlanmadı: ${ensured.error}`);
			return;
		}
		const ensuredStudentTeacher =
			await ensureStudentTeacherInstructionQuestionSet(cycleId);
		if (ensuredStudentTeacher.error) {
			setStatus(
				`Şagird müəllim qiymətləndirilməsi təlimatı hazırlanmadı: ${ensuredStudentTeacher.error}`,
			);
			return;
		}
		if (selectedCycleId === cycleId && selectedFlow === "teacher_self") {
			setSelectedQuestionIds(ensured.questionIds);
		}
		if (selectedCycleId === cycleId && selectedFlow === "student_teacher") {
			setSelectedQuestionIds(ensuredStudentTeacher.questionIds);
		}

		let userRows: any[] = [];
		let studentRows: any[] = [];
		let teacherRows: any[] = [];
		let groupRows: any[] = [];
		let subjectRows: any[] = [];
		let assignmentRows: any[] = [];
		let managementAssignmentRows: any[] = [];
		let existingTaskRows: any[] = [];

		try {
			[
				userRows,
				studentRows,
				teacherRows,
				groupRows,
				subjectRows,
				assignmentRows,
				managementAssignmentRows,
				existingTaskRows,
			] = await Promise.all([
				fetchAllBatched<any>(async (from, to) =>
					supabase
						.from("users")
						.select("*")
						.eq("org_id", ORG_ID)
						.is("deleted_at", null)
						.order("id")
						.range(from, to),
				),
				fetchAllBatched<any>(async (from, to) =>
					supabase
						.from("students")
						.select("*")
						.eq("org_id", ORG_ID)
						.is("deleted_at", null)
						.order("id")
						.range(from, to),
				),
				fetchAllBatched<any>(async (from, to) =>
					supabase
						.from("teachers")
						.select("*")
						.eq("org_id", ORG_ID)
						.is("deleted_at", null)
						.order("id")
						.range(from, to),
				),
				fetchAllBatched<any>(async (from, to) =>
					supabase
						.from("groups")
						.select("*")
						.eq("org_id", ORG_ID)
						.is("deleted_at", null)
						.order("id")
						.range(from, to),
				),
				fetchAllBatched<any>(async (from, to) =>
					supabase
						.from("subjects")
						.select("*")
						.eq("org_id", ORG_ID)
						.is("deleted_at", null)
						.order("id")
						.range(from, to),
				),
				fetchAllBatched<any>(async (from, to) =>
					supabase
						.from("teaching_assignments")
						.select("*")
						.eq("org_id", ORG_ID)
						.is("deleted_at", null)
						.order("id")
						.range(from, to),
				),
				fetchAllBatched<any>(async (from, to) =>
					supabase
						.from("management_assignments")
						.select("*")
						.eq("org_id", ORG_ID)
						.is("deleted_at", null)
						.order("id")
						.range(from, to),
				),
				fetchAllBatched<any>(async (from, to) =>
					supabase
						.from("tasks")
						.select("id,rater_id,target_type,target_id,group_id")
						.eq("org_id", ORG_ID)
						.eq("cycle_id", cycleId)
						.order("id")
						.range(from, to),
				),
			]);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Məlumat yüklənmədi";
			setStatus(`Tapşırıqlar hazırlanmadı: ${message}`);
			return;
		}

		const users = userRows.map((row) => ({
			id: row.id,
			data: mapUserRow(row),
		}));
		const students = studentRows.map((row) => ({
			id: row.id,
			data: mapStudentRow(row),
		}));
		const teachers = teacherRows.map((row) => ({
			id: row.id,
			data: mapTeacherRow(row),
		}));
		const groups = groupRows.map((row) => ({
			id: row.id,
			data: mapGroupRow(row),
		}));
		const subjects = subjectRows.map((row) => ({
			id: row.id,
			data: mapSubjectRow(row),
		}));
		const assignments = assignmentRows.map((row) => ({
			id: row.id,
			data: mapTeachingAssignmentRow(row),
		}));
		const managementAssignments = managementAssignmentRows.map(
			(row) => ({
				id: row.id,
				data: mapManagementAssignmentRow(row),
			}),
		);

		const existingTaskIds = new Set(
			existingTaskRows.map((row) => row.id as string),
		);
		const scheduledTaskIds = new Set(existingTaskIds);
		const existingStudentTeacherTaskKeys = new Set(
			existingTaskRows
				.filter((row) => row.target_type === "teacher" && row.group_id)
				.map(
					(row) =>
						`${row.rater_id as string}_${row.target_id as string}_${row.group_id as string}`,
				),
		);
		const cycle = cycles.find((item) => item.id === cycleId)?.data;
		const cycleYear = cycle?.year ?? new Date().getFullYear();
		const branchScope =
			cycle?.branchIds && cycle.branchIds.length > 0
				? new Set(cycle.branchIds)
				: null;

		const inBranchScope = (branchId?: string | null) => {
			if (!branchScope) return true;
			if (!branchId) return false;
			return branchScope.has(branchId);
		};

		const usersScoped = branchScope
			? users.filter((user) => inBranchScope(user.data.branchId))
			: users;
		const studentsScoped = branchScope
			? students.filter((student) => inBranchScope(student.data.branchId))
			: students;
		const teachersScoped = branchScope
			? teachers.filter((teacher) => {
					if (inBranchScope(teacher.data.branchId)) return true;
					return (teacher.data.branchIds ?? []).some((id) =>
						branchScope.has(id),
					);
				})
			: teachers;
		const groupsScoped = branchScope
			? groups.filter((group) => inBranchScope(group.data.branchId))
			: groups;
		const assignmentsScoped = branchScope
			? assignments.filter((assignment) =>
					inBranchScope(assignment.data.branchId),
				)
			: assignments;
		const managementAssignmentsScoped = branchScope
			? managementAssignments.filter((assignment) =>
					inBranchScope(assignment.data.branchId),
				)
			: managementAssignments;

		const assignmentYears = Array.from(
			new Set(assignmentsScoped.map((assignment) => assignment.data.year)),
		).sort((a, b) => a - b);
		const assignmentYear =
			assignmentYears.length === 0
				? null
				: assignmentYears.includes(cycleYear)
					? cycleYear
					: assignmentYears[assignmentYears.length - 1];

		const groupMap = Object.fromEntries(
			groupsScoped.map((group) => [group.id, group.data]),
		);
		const subjectMap = Object.fromEntries(
			subjects.map((subject) => [subject.id, subject.data]),
		);
		const teacherMap = Object.fromEntries(
			teachersScoped.map((teacher) => [teacher.id, teacher.data]),
		);
		const userMapAll = Object.fromEntries(
			users.map((account) => [account.id, account.data]),
		);
		const teacherIdByUserId = teachersScoped.reduce<Record<string, string>>(
			(acc, teacher) => {
				if (teacher.data.uid) {
					acc[teacher.data.uid] = teacher.id;
				}
				acc[teacher.id] = teacher.id;
				return acc;
			},
			{},
		);
		const teacherIdByUserIdAll = teachers.reduce<Record<string, string>>(
			(acc, teacher) => {
				if (teacher.data.uid) {
					acc[teacher.data.uid] = teacher.id;
				}
				acc[teacher.id] = teacher.id;
				return acc;
			},
			{},
		);

		const tasksToCreate: Array<{ id: string; data: TaskDoc }> = [];
		let skippedTeacherSelfWithoutProfile = 0;
		let skippedManagementAssignments = 0;
		let skippedManagementSelf = 0;

		if (!assignmentYear) {
			setStatus("Tapşırıq yaradılmadı: dərs təyinatı tapılmadı");
			return;
		}

		const assignmentsForYear = assignmentsScoped.filter(
			(assignment) => assignment.data.year === assignmentYear,
		);

		const studentUsers = usersScoped.filter(
			(user) => user.data.role === "student",
		);
		studentUsers.forEach((user) => {
			const student = studentsScoped.find(
				(studentDoc) =>
					studentDoc.id === user.id || studentDoc.data.uid === user.id,
			);
			if (!student) return;
			const studentAssignments = assignmentsForYear.filter(
				(assignment) => assignment.data.groupId === student.data.groupId,
			);
			const groupedTeacherAssignments = new Map<
				string,
				{
					teacherId: string;
					groupId: string;
					branchId: string;
					subjectNames: string[];
				}
			>();
			studentAssignments.forEach((assignment) => {
				const dedupKey = `${assignment.data.teacherId}_${assignment.data.groupId}`;
				const subjectName =
					subjectMap[assignment.data.subjectId]?.name ??
					assignment.data.subjectId;
				const existing = groupedTeacherAssignments.get(dedupKey);
				if (!existing) {
					groupedTeacherAssignments.set(dedupKey, {
						teacherId: assignment.data.teacherId,
						groupId: assignment.data.groupId,
						branchId: assignment.data.branchId,
						subjectNames: subjectName ? [subjectName] : [],
					});
					return;
				}
				if (subjectName && !existing.subjectNames.includes(subjectName)) {
					existing.subjectNames.push(subjectName);
				}
			});

			groupedTeacherAssignments.forEach((entry) => {
				const subjectsLabel =
					entry.subjectNames.length > 0
						? entry.subjectNames.join(", ")
						: "Fənn göstərilməyib";
				const task: TaskDoc = {
					cycleId,
					raterUid: user.id,
					raterRole: "student",
					targetType: "teacher",
					targetId: entry.teacherId,
					targetName: teacherMap[entry.teacherId]?.name ?? null,
					branchId: entry.branchId,
					groupId: entry.groupId,
					groupName: groupMap[entry.groupId]?.name ?? null,
					subjectId: null,
					subjectName: subjectsLabel,
					status: "OPEN",
				};
				const taskId = buildTaskId({
					cycleId,
					raterUid: user.id,
					targetType: "teacher",
					targetId: entry.teacherId,
					groupId: entry.groupId,
				});
				const existingStudentTeacherTaskKey = `${user.id}_${entry.teacherId}_${entry.groupId}`;
				if (
					!scheduledTaskIds.has(taskId) &&
					!existingStudentTeacherTaskKeys.has(existingStudentTeacherTaskKey)
				) {
					tasksToCreate.push({ id: taskId, data: task });
					scheduledTaskIds.add(taskId);
				}
			});
		});

		const teacherUsers = usersScoped.filter(
			(user) => user.data.role === "teacher",
		);

		teacherUsers.forEach((user) => {
			const teacherId = teacherIdByUserId[user.id];
			if (!teacherId) {
				skippedTeacherSelfWithoutProfile += 1;
				return;
			}
			const teacher = teacherMap[teacherId];
			const branch = teacher?.branchId ?? user.data.branchId;
			if (!branch) return;
			const task: TaskDoc = {
				cycleId,
				raterUid: user.id,
				raterRole: "teacher",
				targetType: "teacher",
				targetId: teacherId,
				targetName:
					teacher?.name ?? user.data.displayName ?? user.data.login ?? null,
				branchId: branch,
				status: "OPEN",
			};
			const taskId = buildTaskId({
				cycleId,
				raterUid: user.id,
				targetType: "teacher",
				targetId: teacherId,
			});
			if (!scheduledTaskIds.has(taskId)) {
				tasksToCreate.push({ id: taskId, data: task });
				scheduledTaskIds.add(taskId);
			}
		});

		const managementAssignmentsForYear = managementAssignmentsScoped.filter(
			(assignment) => assignment.data.year === assignmentYear,
		);

		if (managementAssignmentsForYear.length === 0) {
			const managerUsers = usersScoped.filter(
				(user) => user.data.role === "manager",
			);
			managerUsers.forEach((user) => {
				if (!user.data.branchId) return;
				const managerBranchId = user.data.branchId;
				const branchTeachers = teachersScoped.filter((teacher) => {
					if (teacher.data.branchId === managerBranchId) return true;
					return (teacher.data.branchIds ?? []).includes(managerBranchId);
				});
				branchTeachers.forEach((teacher) => {
					const task: TaskDoc = {
						cycleId,
						raterUid: user.id,
						raterRole: "manager",
						targetType: "teacher",
						targetId: teacher.id,
						targetName: teacherMap[teacher.id]?.name ?? null,
						branchId: managerBranchId,
						status: "OPEN",
					};
					const taskId = buildTaskId({
						cycleId,
						raterUid: user.id,
						targetType: "teacher",
						targetId: teacher.id,
					});
					if (!scheduledTaskIds.has(taskId)) {
						tasksToCreate.push({ id: taskId, data: task });
						scheduledTaskIds.add(taskId);
					}
				});
			});
		} else {
			managementAssignmentsForYear.forEach((assignment) => {
				const rater = userMapAll[assignment.data.managerUid];
				if (!rater) {
					skippedManagementAssignments += 1;
					return;
				}
				if (rater.role !== "manager" && rater.role !== "teacher") {
					skippedManagementAssignments += 1;
					return;
				}

				const raterTeacherId = teacherIdByUserIdAll[assignment.data.managerUid];
				const targetTeachers = teachersScoped.filter((teacher) => {
					const inAssignmentBranch =
						teacher.data.branchId === assignment.data.branchId ||
						(teacher.data.branchIds ?? []).includes(assignment.data.branchId);
					if (!inAssignmentBranch) return false;
					if (assignment.data.departmentId) {
						return teacher.data.departmentId === assignment.data.departmentId;
					}
					return true;
				});

				targetTeachers.forEach((teacher) => {
					if (raterTeacherId && raterTeacherId === teacher.id) {
						skippedManagementSelf += 1;
						return;
					}

					const task: TaskDoc = {
						cycleId,
						raterUid: assignment.data.managerUid,
						raterRole: "manager",
						targetType: "teacher",
						targetId: teacher.id,
						targetName: teacherMap[teacher.id]?.name ?? null,
						branchId: assignment.data.branchId,
						status: "OPEN",
					};
					const taskId = buildTaskId({
						cycleId,
						raterUid: assignment.data.managerUid,
						targetType: "teacher",
						targetId: teacher.id,
					});
					if (!scheduledTaskIds.has(taskId)) {
						tasksToCreate.push({ id: taskId, data: task });
						scheduledTaskIds.add(taskId);
					}
				});
			});
		}

		const warnings: string[] = [];
		if (assignmentYear !== cycleYear) {
			warnings.push(`Dərs təyinatı ${assignmentYear} ilindən istifadə olundu`);
		}
		if (managementAssignmentsForYear.length === 0) {
			warnings.push(
				"Rəhbərlik təyinatı tapılmadığı üçün filial üzrə standart qayda tətbiq olundu",
			);
		}
		if (skippedTeacherSelfWithoutProfile > 0) {
			warnings.push(
				`${skippedTeacherSelfWithoutProfile} müəllim üçün profil tapılmadığına görə özünüqiymətləndirmə tapşırığı yaradılmadı`,
			);
		}
		if (skippedManagementAssignments > 0) {
			warnings.push(
				`${skippedManagementAssignments} rəhbərlik təyinatı istifadəçi/rol uyğunsuzluğuna görə buraxıldı`,
			);
		}
		if (skippedManagementSelf > 0) {
			warnings.push(
				`${skippedManagementSelf} rəhbərlik tapşırığı həmin şəxslərin öz profili olduğu üçün yaradılmadı`,
			);
		}

		if (tasksToCreate.length === 0) {
			if (existingTaskIds.size > 0) {
				setStatus(
					`Yeni tapşırıq yoxdur. Mövcud tapşırıqlar: ${existingTaskIds.size}`,
				);
				return;
			}
			const reasons: string[] = [];
			if (studentsScoped.length === 0) reasons.push("şagird tapılmadı");
			if (teachersScoped.length === 0) reasons.push("müəllim tapılmadı");
			if (assignmentsScoped.length === 0) reasons.push("dərs təyinatı yoxdur");
			const reasonText = reasons.length > 0 ? `: ${reasons.join(", ")}` : "";
			setStatus(`Tapşırıq yaradılmadı${reasonText}`);
			return;
		}

		const batches = chunkArray(tasksToCreate, 400);
		for (const chunk of batches) {
			const rows = chunk.map((item) => ({
				id: item.id,
				org_id: ORG_ID,
				cycle_id: item.data.cycleId,
				rater_id: item.data.raterUid,
				rater_role: item.data.raterRole,
				target_type: item.data.targetType,
				target_id: item.data.targetId,
				target_name: item.data.targetName ?? null,
				branch_id: item.data.branchId,
				group_id: item.data.groupId ?? null,
				subject_id: item.data.subjectId ?? null,
				group_name: item.data.groupName ?? null,
				subject_name: item.data.subjectName ?? null,
				status: item.data.status,
			}));
			const { error } = await supabase.from("tasks").upsert(rows, {
				onConflict: "id",
				ignoreDuplicates: true,
			});
			if (error) {
				const parts = [error.message, error.details, error.hint].filter(
					(value): value is string => Boolean(value),
				);
				setStatus(
					parts.length > 0
						? `Tapşırıqlar hazırlanmadı: ${parts.join(" | ")}`
						: "Tapşırıqlar hazırlanmadı",
				);
				return;
			}
		}

		const warningText = warnings.length > 0 ? `. ${warnings.join(". ")}` : "";
		setStatus(`Tapşırıqlar hazırdır: ${tasksToCreate.length}${warningText}`);
	};

	const selectedCycle = cycles.find((cycle) => cycle.id === selectedCycleId);
	const branchMap = Object.fromEntries(
		branches.map((branch) => [branch.id, branch.data]),
	);
	const selectableQuestions = useMemo(
		() => {
			const visibleQuestions = questions.filter(
				(question) => !isStudentTeacherInstructionQuestion(question.data),
			);
			if (selectedFlow !== "teacher_self") {
				return visibleQuestions;
			}

			const questionById = new Map(
				visibleQuestions.map((question) => [question.id, question]),
			);
			return selectedQuestionIds
				.map((questionId) => questionById.get(questionId) ?? null)
				.filter(
					(
						question,
					): question is (typeof visibleQuestions)[number] => question !== null,
				);
		},
		[questions, selectedFlow, selectedQuestionIds],
	);
	const paginatedCycles = useMemo(() => {
		const start = (page - 1) * pageSize;
		return cycles.slice(start, start + pageSize);
	}, [cycles, page, pageSize]);
	const summary = cycles.length;

	return (
		<div className="panel">
			<div className="panel-header">
				<div>
					<h2>Sorğu dövrləri</h2>
					<p>İllik sorğuların yaradılması və açılıb-bağlanması.</p>
				</div>
				<div className="stat-pill">Cəmi: {summary}</div>
			</div>

			<div className="card">
				<h3>Yeni sorğu dövrü</h3>
				<div className="form-grid">
					<label className="field">
						<span className="label">İl</span>
						<input
							className="input"
							placeholder="Məs: 2026"
							value={year}
							onChange={(event) => setYear(event.target.value)}
						/>
					</label>
					<label className="field">
						<span className="label">Başlanğıc tarixi</span>
						<input
							className="input"
							type="date"
							value={startAt}
							onChange={(event) => setStartAt(event.target.value)}
						/>
					</label>
					<label className="field">
						<span className="label">Müddət (gün)</span>
						<input
							className="input"
							placeholder="Məs: 7"
							value={durationDays}
							onChange={(event) => setDurationDays(event.target.value)}
						/>
					</label>
					<label className="field">
						<span className="label">Risk həddi (Y)</span>
						<input
							className="input"
							placeholder="Məs: 3"
							value={thresholdY}
							onChange={(event) => setThresholdY(event.target.value)}
						/>
					</label>
					<label className="field">
						<span className="label">İzləmə həddi (P)</span>
						<input
							className="input"
							placeholder="Məs: 3"
							value={thresholdP}
							onChange={(event) => setThresholdP(event.target.value)}
						/>
					</label>
					<button className="btn primary" type="button" onClick={handleCreate}>
						Yarat
					</button>
				</div>
				<div className="field">
					<span className="label">
						Filiallar (boş buraxsanız bütün filiallar)
					</span>
					<div className="checkbox-grid">
						{branches.map((branch) => (
							<label key={branch.id} className="checkbox-item">
								<input
									type="checkbox"
									checked={selectedBranchIds.includes(branch.id)}
									onChange={(event) => {
										if (event.target.checked) {
											setSelectedBranchIds((prev) => [...prev, branch.id]);
										} else {
											setSelectedBranchIds((prev) =>
												prev.filter((id) => id !== branch.id),
											);
										}
									}}
								/>
								<span>{branch.data.name}</span>
							</label>
						))}
					</div>
				</div>
				{status && <div className="notice">{status}</div>}
			</div>

			<div className="data-table">
				<div className="data-row header">
					<div>İl</div>
					<div>Başlanğıc</div>
					<div>Bitmə</div>
					<div>Filiallar</div>
					<div>Vəziyyət</div>
					<div></div>
				</div>
				{paginatedCycles.map((cycle) => {
					const startDate = toJsDate(cycle.data.startAt);
					const endDate = toJsDate(cycle.data.endAt);
					const branchNames =
						cycle.data.branchIds && cycle.data.branchIds.length > 0
							? cycle.data.branchIds
									.map((id) => branchMap[id]?.name ?? id)
									.join(", ")
							: "Bütün filiallar";
					return (
						<div className="data-row" key={cycle.id}>
							<div>{cycle.data.year}</div>
							<div>
								{startDate ? startDate.toLocaleDateString("az-AZ") : "-"}
							</div>
							<div>{endDate ? endDate.toLocaleDateString("az-AZ") : "-"}</div>
							<div>{branchNames}</div>
							<div>{cycle.data.status}</div>
							<div className="actions">
								<button
									className="btn ghost"
									type="button"
									onClick={() => setSelectedCycleId(cycle.id)}
								>
									Seç
								</button>
								<Link className="btn ghost" to={`/admin/cycles/${cycle.id}`}>
									Detallara bax
								</Link>
								{cycle.data.status !== "OPEN" && (
									<button
										className="btn"
										type="button"
										onClick={() => void handleStatusChange(cycle.id, "OPEN")}
									>
										Aç
									</button>
								)}
								{cycle.data.status !== "CLOSED" && (
									<button
										className="btn"
										type="button"
										onClick={() => void handleStatusChange(cycle.id, "CLOSED")}
									>
										Bağla
									</button>
								)}
								<button
									className="btn danger"
									type="button"
									onClick={() => openDeleteModal(cycle.id, cycle.data.year)}
								>
									Sil
								</button>
							</div>
						</div>
					);
				})}
			</div>
			{cycles.length > 0 && (
				<PaginationControls
					totalItems={cycles.length}
					page={page}
					pageSize={pageSize}
					onPageChange={setPage}
					onPageSizeChange={(nextSize) => {
						setPageSize(nextSize);
						setPage(1);
					}}
				/>
			)}

			{selectedCycle && (
				<div className="card">
					<h3>Sual setləri ({selectedCycle.data.year})</h3>
					<div className="segmented">
						{flows.map((flow) => (
							<button
								key={flow}
								className={
									selectedFlow === flow
										? "segmented__item active"
										: "segmented__item"
								}
								type="button"
								onClick={() => setSelectedFlow(flow)}
							>
								{flowLabels[flow]}
							</button>
						))}
					</div>
					{selectedFlow === "student_teacher" && (
						<div className="hint">
							Şagird müəllim qiymətləndirilməsi üçün təlimat bloku avtomatik
							əlavə olunur:
							{" "}
							{STUDENT_EVALUATION_CRITERIA.join(", ")}.
						</div>
					)}
					<div className="checkbox-grid">
						{selectableQuestions.map((question) => (
							<label key={question.id} className="checkbox-item">
								<input
									type="checkbox"
									disabled={selectedFlow === "teacher_self"}
									checked={selectedQuestionIds.includes(question.id)}
									onChange={(event) => {
										if (event.target.checked) {
											setSelectedQuestionIds((prev) => [...prev, question.id]);
										} else {
											setSelectedQuestionIds((prev) =>
												prev.filter((id) => id !== question.id),
											);
										}
									}}
								/>
								<span>{question.data.text}</span>
							</label>
						))}
					</div>
					{selectedFlow === "teacher_self" && (
						<div className="hint">
							Bu axın üçün PKPD özünüqiymətləndirmə sualları avtomatik tətbiq
							olunur: müəllim əvvəl 0-10 arası öz balını verir, sonra açıq
							suallarda nailiyyətlərini yazır.
						</div>
					)}
					<div className="actions">
						<button
							className="btn primary"
							type="button"
							onClick={handleSaveQuestionSet}
						>
							Sual setini saxla
						</button>
						<button
							className="btn ghost"
							type="button"
							onClick={handleCopyFromPreviousCycle}
						>
							Keçən ildən köçür
						</button>
						<button
							className="btn"
							type="button"
							onClick={() => void generateTasksForCycle(selectedCycle.id)}
						>
							Tapşırıqları yarat
						</button>
					</div>
				</div>
			)}

			{deleteCycle && (
				<div className="modal-overlay" role="dialog" aria-modal="true">
					<div className="modal-card">
						<div className="modal-title">Sorğu dövrünü sil</div>
						<p className="modal-message">
							{deleteCycle.year} ili üçün sorğu dövrü və bağlı məlumatlar silinəcək.
							Davam etmək üçün hesab şifrənizi daxil edin.
						</p>
						<label className="field modal-field">
							<span className="label">Şifrə</span>
							<input
								className="input"
								type="password"
								value={deletePassword}
								onChange={(event) => setDeletePassword(event.target.value)}
								placeholder="Şifrənizi daxil edin"
								autoFocus
								disabled={deleteSubmitting}
							/>
						</label>
						{deleteError && <div className="notice modal-error">{deleteError}</div>}
						<div className="actions modal-actions">
							<button
								className="btn ghost"
								type="button"
								onClick={closeDeleteModal}
								disabled={deleteSubmitting}
							>
								İmtina
							</button>
							<button
								className="btn danger"
								type="button"
								onClick={() => void handleDeleteCycle()}
								disabled={deleteSubmitting}
							>
								{deleteSubmitting ? "Silinir..." : "Təsdiqlə və sil"}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};







