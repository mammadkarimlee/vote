import { useEffect, useMemo, useState } from "react";
import { useFeedbackState } from "../../components/feedback/FeedbackProvider";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ORG_ID, supabase } from "../../lib/supabase";
import {
	mapQuestionRow,
	mapQuestionSetRow,
	mapSurveyCycleRow,
	mapTaskRow,
} from "../../lib/supabaseMappers";
import type {
	QuestionDoc,
	QuestionSetDoc,
	SurveyCycleDoc,
	TaskDoc,
} from "../../lib/types";
import {
	STUDENT_EVALUATION_CRITERIA,
	STUDENT_TEACHER_INSTRUCTION_LINES,
	isStudentTeacherInstructionQuestion,
	shouldRenderStudentTeacherInstructionBlock,
} from "../../lib/surveyQuestions";
import { chunkArray, formatDate, toJsDate } from "../../lib/utils";
import { useAuth } from "../auth/AuthProvider";

const flowFromTask = (task: TaskDoc): QuestionSetDoc["targetFlow"] => {
	if (task.raterRole === "student" && task.targetType === "teacher")
		return "student_teacher";
	if (task.raterRole === "teacher" && task.targetType === "teacher")
		return "teacher_self";
	return "management_teacher";
};

const normalizeDraft = (
	raw: Record<string, unknown>,
	questions: Array<{ id: string; data: QuestionDoc }>,
) => {
	const allowedIds = new Set(questions.map((question) => question.id));
	const next: Record<string, string | number> = {};

	Object.entries(raw).forEach(([questionId, value]) => {
		if (!allowedIds.has(questionId)) return;
		const question = questions.find((item) => item.id === questionId)?.data;
		if (!question) return;
		if (isStudentTeacherInstructionQuestion(question)) return;
		if (question.type === "scale" && typeof value === "number") {
			next[questionId] = value;
			return;
		}
		if ((question.type === "choice" || question.type === "text") && value) {
			next[questionId] = String(value);
		}
	});

	return next;
};

export const TaskVotePage = () => {
	const { taskId } = useParams();
	const navigate = useNavigate();
	const { user } = useAuth();
	const [task, setTask] = useState<TaskDoc | null>(null);
	const [questions, setQuestions] = useState<
		Array<{ id: string; data: QuestionDoc }>
	>([]);
	const [cycle, setCycle] = useState<SurveyCycleDoc | null>(null);
	const [questionSet, setQuestionSet] = useState<QuestionSetDoc | null>(null);
	const [answers, setAnswers] = useState<Record<string, string | number>>({});
	const [status, setStatus] = useFeedbackState();
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [draftLoaded, setDraftLoaded] = useState(false);

	const draftKey = taskId ? `vote_draft_${taskId}` : "";

	useEffect(() => {
		if (!taskId || !user) return;

		const loadTask = async () => {
			setLoading(true);
			setStatus(null);
			setQuestionSet(null);

			const taskRes = await supabase
				.from("tasks")
				.select("*")
				.eq("org_id", ORG_ID)
				.eq("id", taskId)
				.maybeSingle();

			if (!taskRes.data) {
				setStatus("Tapşırıq tapılmadı.");
				setTask(null);
				setQuestions([]);
				setQuestionSet(null);
				setLoading(false);
				return;
			}

			const taskData = mapTaskRow(taskRes.data);
			if (taskData.raterUid !== user.id) {
				setStatus("Bu tapşırığa giriş icazəniz yoxdur.");
				setTask(null);
				setQuestions([]);
				setQuestionSet(null);
				setLoading(false);
				return;
			}

			if (taskData.targetType !== "teacher") {
				setStatus("Bu qiymetlendirme bolmesi deaktiv edilib.");
				setTask(null);
				setQuestions([]);
				setQuestionSet(null);
				setLoading(false);
				return;
			}

			setTask(taskData);

			const cycleRes = await supabase
				.from("survey_cycles")
				.select("*")
				.eq("org_id", ORG_ID)
				.eq("id", taskData.cycleId)
				.maybeSingle();
			setCycle(cycleRes.data ? mapSurveyCycleRow(cycleRes.data) : null);

			const flow = flowFromTask(taskData);
			const questionSetRes = await supabase
				.from("question_sets")
				.select("*")
				.eq("org_id", ORG_ID)
				.eq("cycle_id", taskData.cycleId)
				.eq("target_flow", flow)
				.maybeSingle();

			if (!questionSetRes.data) {
				setStatus("Bu tapşırıq üçün sual seti tapılmadı.");
				setQuestions([]);
				setQuestionSet(null);
				setLoading(false);
				return;
			}

			const questionSet = mapQuestionSetRow(questionSetRes.data);
			setQuestionSet(questionSet);
			if (!questionSet.isOpen) {
				setStatus("Bu sorğu hazırda bağlıdır.");
			}
			const ids = questionSet.questionIds ?? [];
			if (ids.length === 0) {
				setQuestions([]);
				setLoading(false);
				return;
			}

			const loaded: Array<{ id: string; data: QuestionDoc }> = [];
			for (const chunk of chunkArray(ids, 200)) {
				const qRes = await supabase
					.from("questions")
					.select("*")
					.eq("org_id", ORG_ID)
					.in("id", chunk);
				(qRes.data ?? []).forEach((row) => {
					loaded.push({ id: row.id, data: mapQuestionRow(row) });
				});
			}

			loaded.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
			setQuestions(loaded);
			setLoading(false);
		};

		void loadTask();
	}, [taskId, user]);

	useEffect(() => {
		if (!draftKey || questions.length === 0 || draftLoaded) return;
		const raw = localStorage.getItem(draftKey);
		if (!raw) {
			setDraftLoaded(true);
			return;
		}
		try {
			const parsed = JSON.parse(raw) as Record<string, unknown>;
			setAnswers(normalizeDraft(parsed, questions));
		} catch {
			localStorage.removeItem(draftKey);
		}
		setDraftLoaded(true);
	}, [draftKey, draftLoaded, questions]);

	useEffect(() => {
		if (!draftKey || !draftLoaded) return;
		localStorage.setItem(draftKey, JSON.stringify(answers));
	}, [answers, draftKey, draftLoaded]);

	const isOpen = useMemo(() => {
		if (!cycle) return false;
		if (!questionSet?.isOpen) return false;
		if (cycle.status !== "OPEN") return false;
		const now = new Date();
		const start = toJsDate(cycle.startAt);
		const end = toJsDate(cycle.endAt);
		if (start && now < start) return false;
		if (end && now > end) return false;
		return true;
	}, [cycle, questionSet]);

	const answerableQuestions = useMemo(
		() =>
			questions.filter(
				(question) => !isStudentTeacherInstructionQuestion(question.data),
			),
		[questions],
	);
	const hasStudentTeacherInstruction = useMemo(
		() =>
			questions.some((question) =>
				isStudentTeacherInstructionQuestion(question.data),
			),
		[questions],
	);

	const requiredTotal = useMemo(
		() => answerableQuestions.filter((question) => question.data.required).length,
		[answerableQuestions],
	);
	const requiredDone = useMemo(
		() =>
			answerableQuestions.filter(
				(question) =>
					question.data.required &&
					answers[question.id] !== undefined &&
					answers[question.id] !== "",
			).length,
		[answerableQuestions, answers],
	);
	const completion = useMemo(() => {
		if (answerableQuestions.length === 0) return 0;
		const answeredCount = answerableQuestions.filter(
			(question) => answers[question.id] !== undefined && answers[question.id] !== "",
		).length;
		return Math.round((answeredCount / answerableQuestions.length) * 100);
	}, [answerableQuestions, answers]);

	const cycleInfo = useMemo(() => {
		if (!cycle) return "Sorğu dövrü məlumatı yoxdur";
		const start = formatDate(toJsDate(cycle.startAt));
		const end = formatDate(toJsDate(cycle.endAt));
		return `${cycle.year} • ${cycle.status} • ${start} - ${end}`;
	}, [cycle]);

	const handleChange = (questionId: string, value: string | number) => {
		setAnswers((prev) => ({ ...prev, [questionId]: value }));
	};

	const clearDraft = () => {
		if (draftKey) localStorage.removeItem(draftKey);
		setAnswers({});
		setStatus("Saxlanmış qaralama təmizləndi.");
	};

	const handleSubmit = async () => {
		if (!taskId || !task || !user) return;
		setStatus(null);

		if (submitting) return;
		if (task.status === "DONE") {
			setStatus("Bu tapşırıq artıq tamamlanıb.");
			return;
		}
		if (!isOpen) {
			setStatus("Sorğu dövrü açıq deyil. Göndəriş mümkün deyil.");
			return;
		}

		const missingRequired = answerableQuestions.filter(
			(question) =>
				question.data.required &&
				(answers[question.id] === undefined || answers[question.id] === ""),
		);
		if (missingRequired.length > 0) {
			setStatus("Bütün məcburi suallar cavablanmalıdır.");
			return;
		}

		const answersPayload = Object.entries(answers)
			.map(([questionId, value]) => ({
				question_id: questionId,
				value,
			}))
			.filter((item) => item.value !== undefined && item.value !== "");

		setSubmitting(true);
		const { error } = await supabase.rpc("submit_vote", {
			p_task_id: taskId,
			p_answers: answersPayload,
		});
		setSubmitting(false);

		if (error) {
			setStatus(error.message || "Cavablar göndərilə bilmədi.");
			return;
		}

		if (draftKey) localStorage.removeItem(draftKey);
		setStatus("Cavablar uğurla göndərildi.");
		navigate("/vote", { replace: true });
	};

	if (loading) {
		return (
			<div className="page">
				<div className="card">Yüklənir...</div>
			</div>
		);
	}

	if (!task) {
		return (
			<div className="page">
				<div className="card">
					<div className="stack">
						<Link to="/vote" className="link">
							← Tapşırıqlara qayıt
						</Link>
						<div className="notice">{status ?? "Tapşırıq yüklənmədi."}</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="page">
			<section className="card vote-form-header">
				<div className="stack">
					<Link to="/vote" className="link">
						← Tapşırıqlara qayıt
					</Link>
					<h1>Səsvermə formu</h1>
					<div className="meta">{cycleInfo}</div>
				</div>
				<div className="vote-progress">
					<div className="stat-card">
						<div className="stat-label">Ümumi irəliləyiş</div>
						<div className="stat-value">{completion}%</div>
						<div className="progress-track">
							<div className="progress-fill" style={{ width: `${completion}%` }} />
						</div>
					</div>
					<div className="stat-card">
						<div className="stat-label">Məcburi suallar</div>
						<div className="stat-value">
							{requiredDone}/{requiredTotal}
						</div>
						<div className="stat-meta">
							{isOpen ? "Göndəriş aktivdir" : "Göndəriş bağlıdır"}
						</div>
					</div>
				</div>
			</section>

			<div className="card">
				{questions.length === 0 ? (
					<div className="empty">Bu task üçün sual yoxdur.</div>
				) : (
					<div className="stack">
						{hasStudentTeacherInstruction && (
							<div className="question">
								<div className="stack">
									<div className="question-title">
										{STUDENT_TEACHER_INSTRUCTION_LINES[0]}
									</div>
									<div className="hint">
										{STUDENT_TEACHER_INSTRUCTION_LINES[1]}
									</div>
									<ul className="instruction-list">
										{STUDENT_EVALUATION_CRITERIA.map((criterion) => (
											<li className="instruction-list__item" key={criterion}>
												<span className="instruction-list__label">
													{criterion}
												</span>
											</li>
										))}
									</ul>
								</div>
							</div>
						)}
						{answerableQuestions.map((question, index) => (
							<div className="question" key={question.id}>
								{shouldRenderStudentTeacherInstructionBlock(question.data) ? (
									<div className="stack">
										<div className="question-title">
											<span className="question-number">#{index + 1}</span>{" "}
											Təlimat
											{question.data.required && (
												<span className="required">*</span>
											)}
										</div>
										<div className="hint">
											{STUDENT_TEACHER_INSTRUCTION_LINES[0]}
										</div>
										<div className="hint">
											{STUDENT_TEACHER_INSTRUCTION_LINES[1]}
										</div>
										<ul className="instruction-list">
											{STUDENT_EVALUATION_CRITERIA.map((criterion) => (
												<li className="instruction-list__item" key={criterion}>
													<span className="instruction-list__label">
														{criterion}
													</span>
												</li>
											))}
										</ul>
									</div>
								) : (
									<div className="question-title">
										<span className="question-number">#{index + 1}</span>{" "}
										{question.data.text}
										{question.data.required && (
											<span className="required">*</span>
										)}
									</div>
								)}

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
												<label key={value} className="scale-item">
													<input
														type="radio"
														name={question.id}
														value={value}
														checked={answers[question.id] === value}
														onChange={() => handleChange(question.id, value)}
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
											<label key={option} className="choice-item">
												<input
													type="radio"
													name={question.id}
													value={option}
													checked={answers[question.id] === option}
													onChange={() => handleChange(question.id, option)}
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
											handleChange(question.id, event.target.value)
										}
									/>
								)}
							</div>
						))}
						{answerableQuestions.length === 0 && (
							<div className="empty">Bu task üçün cavab veriləcək sual yoxdur.</div>
						)}
					</div>
				)}

				{status && <div className="notice">{status}</div>}

				<div className="actions">
					<button className="btn ghost" type="button" onClick={clearDraft}>
						Qaralamanı təmizlə
					</button>
					<button
						className="btn primary"
						type="button"
						onClick={handleSubmit}
						disabled={!isOpen || submitting || answerableQuestions.length === 0}
					>
						{submitting ? "Göndərilir..." : "Göndər"}
					</button>
				</div>
			</div>
		</div>
	);
};
