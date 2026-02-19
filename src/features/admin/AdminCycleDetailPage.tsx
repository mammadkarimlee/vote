import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { InfoTip } from "../../components/InfoTip";
import { PaginationControls } from "../../components/PaginationControls";
import { downloadCsv } from "../../lib/csv";
import { ORG_ID, supabase } from "../../lib/supabase";
import {
	mapAnswerRow,
	mapGroupRow,
	mapQuestionRow,
	mapSubjectRow,
	mapSubmissionRow,
	mapSurveyCycleRow,
	mapTeacherRow,
	mapUserRow,
} from "../../lib/supabaseMappers";
import type {
	AnswerDoc,
	GroupDoc,
	QuestionDoc,
	SubjectDoc,
	SubmissionDoc,
	SurveyCycleDoc,
	TeacherDoc,
	UserDoc,
} from "../../lib/types";
import {
	chunkArray,
	formatShortDate,
	toJsDate,
	toNumber,
} from "../../lib/utils";

type DocEntry<T> = { id: string; data: T };

const aggregateTeachers = (
	submissions: Array<DocEntry<SubmissionDoc>>,
	answers: Array<DocEntry<AnswerDoc>>,
	questions: Record<string, QuestionDoc>,
) => {
	const teacherStats: Record<
		string,
		{ sum: number; count: number; submissions: number }
	> = {};
	const submissionCounts: Record<string, Set<string>> = {};

	answers.forEach((answer) => {
		const submission = submissions.find(
			(item) => item.id === answer.data.submissionId,
		);
		if (!submission) return;
		const question = questions[answer.data.questionId];
		if (!question || question.type !== "scale") return;
		const numeric = toNumber(answer.data.value);
		if (numeric === null) return;

		const stat = teacherStats[submission.data.targetId] ?? {
			sum: 0,
			count: 0,
			submissions: 0,
		};
		stat.sum += numeric;
		stat.count += 1;
		teacherStats[submission.data.targetId] = stat;

		submissionCounts[submission.data.targetId] =
			submissionCounts[submission.data.targetId] || new Set();
		submissionCounts[submission.data.targetId].add(answer.data.submissionId);
	});

	Object.entries(submissionCounts).forEach(([teacherId, set]) => {
		if (teacherStats[teacherId]) teacherStats[teacherId].submissions = set.size;
	});

	return teacherStats;
};

const formatAvg = (avg: number | null | undefined, count: number) => {
	if (avg === null || avg === undefined || count === 0) return "â€”";
	return avg.toFixed(2);
};

export const AdminCycleDetailPage = () => {
	const { cycleId } = useParams<{ cycleId: string }>();
	const [cycle, setCycle] = useState<SurveyCycleDoc | null>(null);
	const [teachers, setTeachers] = useState<Array<DocEntry<TeacherDoc>>>([]);
	const [groups, setGroups] = useState<Array<DocEntry<GroupDoc>>>([]);
	const [subjects, setSubjects] = useState<Array<DocEntry<SubjectDoc>>>([]);
	const [questions, setQuestions] = useState<Record<string, QuestionDoc>>({});
	const [submissions, setSubmissions] = useState<
		Array<DocEntry<SubmissionDoc>>
	>([]);
	const [answers, setAnswers] = useState<Array<DocEntry<AnswerDoc>>>([]);
	const [raters, setRaters] = useState<Array<DocEntry<UserDoc>>>([]);
	const [teacherPage, setTeacherPage] = useState(1);
	const [teacherPageSize, setTeacherPageSize] = useState(25);
	const [raterPage, setRaterPage] = useState(1);
	const [raterPageSize, setRaterPageSize] = useState(25);
	const [commentPage, setCommentPage] = useState(1);
	const [commentPageSize, setCommentPageSize] = useState(20);

	useEffect(() => {
		const loadLookups = async () => {
			if (!cycleId) return;

			const [
				cycleRes,
				teacherRes,
				groupRes,
				subjectRes,
				questionRes,
				raterRes,
			] = await Promise.all([
				supabase
					.from("survey_cycles")
					.select("*")
					.eq("org_id", ORG_ID)
					.eq("id", cycleId)
					.maybeSingle(),
				supabase
					.from("teachers")
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
				supabase
					.from("users")
					.select("*")
					.eq("org_id", ORG_ID)
					.is("deleted_at", null)
					.in("role", ["student", "teacher", "manager"]),
			]);

			setCycle(cycleRes.data ? mapSurveyCycleRow(cycleRes.data) : null);
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
		};

		void loadLookups();
	}, [cycleId]);

	useEffect(() => {
		const loadCycleData = async () => {
			if (!cycleId) return;

			const submissionRes = await supabase
				.from("submissions")
				.select("*")
				.eq("org_id", ORG_ID)
				.eq("cycle_id", cycleId);

			const submissionDocs = (submissionRes.data ?? []).map((row) => ({
				id: row.task_id ?? row.id,
				data: mapSubmissionRow(row),
			}));
			setSubmissions(submissionDocs);

			const answerDocs: Array<DocEntry<AnswerDoc>> = [];
			const ids = submissionDocs.map((item) => item.id);
			const chunks = chunkArray(ids, 200);
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

		void loadCycleData();
	}, [cycleId]);

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

	const teacherStats = useMemo(
		() => aggregateTeachers(submissions, answers, questions),
		[submissions, answers, questions],
	);

	const teacherRows = useMemo(() => {
		return Object.entries(teacherStats)
			.map(([teacherId, stat]) => ({
				teacherId,
				avg: stat.count === 0 ? null : stat.sum / stat.count,
				submissions: stat.submissions,
			}))
			.sort((a, b) => {
				if (a.avg === null && b.avg === null) return 0;
				if (a.avg === null) return 1;
				if (b.avg === null) return -1;
				return b.avg - a.avg;
			});
	}, [teacherStats]);

	const topTeacher = teacherRows[0];
	const bottomTeacher =
		teacherRows.length > 0 ? teacherRows[teacherRows.length - 1] : undefined;

	const overallSummary = useMemo(() => {
		const sum = Object.values(teacherStats).reduce(
			(acc, item) => acc + item.sum,
			0,
		);
		const count = Object.values(teacherStats).reduce(
			(acc, item) => acc + item.count,
			0,
		);
		return {
			avg: count === 0 ? null : sum / count,
			submissions: submissions.length,
		};
	}, [teacherStats, submissions.length]);

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
				const submission = submissions.find(
					(item) => item.id === answer.data.submissionId,
				);
				return {
					teacherId: submission?.data.targetId ?? "",
					text: String(answer.data.value ?? "").trim(),
					createdAt: answer.data.createdAt,
				};
			})
			.filter((comment) => comment.text.length > 0)
			.sort((a, b) => {
				const aRaw = a.createdAt
					? new Date(a.createdAt as string).getTime()
					: 0;
				const bRaw = b.createdAt
					? new Date(b.createdAt as string).getTime()
					: 0;
				return bRaw - aRaw;
			})
			;
	}, [answers, questions, submissions]);

	useEffect(() => {
		const totalPages = Math.max(1, Math.ceil(teacherRows.length / teacherPageSize));
		if (teacherPage > totalPages) setTeacherPage(totalPages);
	}, [teacherPage, teacherPageSize, teacherRows.length]);

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
		return teacherRows.slice(start, start + teacherPageSize);
	}, [teacherPage, teacherPageSize, teacherRows]);

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
		const rows = submissions.map((submission) => {
			const submissionAnswers = answers.filter(
				(answer) => answer.data.submissionId === submission.id,
			);
			const numericValues: number[] = [];
			const commentsText: string[] = [];

			submissionAnswers.forEach((answer) => {
				const question = questions[answer.data.questionId];
				if (!question) return;
				if (question.type === "text") {
					const text = String(answer.data.value ?? "").trim();
					if (text) commentsText.push(text);
					return;
				}
				if (question.type !== "scale") return;
				const numeric = toNumber(answer.data.value);
				if (numeric !== null) numericValues.push(numeric);
			});

			const avg =
				numericValues.length === 0
					? ""
					: numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
			return [
				year,
				teacherMap[submission.data.targetId]?.name ?? submission.data.targetId,
				submission.data.targetId,
				submission.data.groupId
					? (groupMap[submission.data.groupId]?.name ?? submission.data.groupId)
					: "-",
				submission.data.subjectId
					? (subjectMap[submission.data.subjectId]?.name ??
						submission.data.subjectId)
					: "-",
				avg === "" ? "" : Number(avg).toFixed(2),
				formatShortDate(toJsDate(submission.data.createdAt)),
				commentsText.join(" | "),
			];
		});

		downloadCsv(
			`cycle-${year}-results.csv`,
			[
				"cycle_year",
				"teacher_name",
				"teacher_id",
				"group",
				"subject",
				"score_avg",
				"submitted_at",
				"comment",
			],
			rows,
		);
	};

	return (
		<div className="panel">
			<div className="panel-header">
				<div>
					<h2>SorÄŸu dÃ¶vrÃ¼ detallarÄ±</h2>
					<p>SeÃ§ilmiÅŸ sorÄŸu dÃ¶vrÃ¼ Ã¼zrÉ™ nÉ™ticÉ™lÉ™r vÉ™ iÅŸtirak statistikasÄ±.</p>
				</div>
				<div className="actions">
					<Link className="btn ghost" to="/admin/cycles">
						Geri
					</Link>
					<button
						className="btn"
						type="button"
						onClick={handleExportCsv}
						disabled={!cycleId}
					>
						CSV ixracÄ±
					</button>
				</div>
			</div>

			<div className="card">
				<div className="section-header">
					<div>
						<h3>Ãœmumi xÃ¼lasÉ™</h3>
						<p>SorÄŸu dÃ¶vrÃ¼ vÉ™ nÉ™ticÉ™ gÃ¶stÉ™ricilÉ™ri.</p>
					</div>
					{cycle && (
						<div className="meta">
							SorÄŸu dÃ¶vrÃ¼: {cycle.year} â€¢ VÉ™ziyyÉ™t: {cycle.status}
						</div>
					)}
				</div>
				<div className="grid three">
					<div className="stat-card">
						<div className="stat-label">
							Ãœmumi orta
							<InfoTip text="Åžkala (1â€“10) suallarÄ± Ã¼zrÉ™ bÃ¼tÃ¼n cavablarÄ±n orta gÃ¶stÉ™ricisi." />
						</div>
						<div className="stat-value">
							{formatAvg(overallSummary.avg, overallSummary.submissions)}
						</div>
						<div className="stat-meta">n={overallSummary.submissions}</div>
					</div>
					<div className="stat-card">
						<div className="stat-label">SÉ™s verÉ™nlÉ™r</div>
						<div className="stat-value">{raterStats.doneSet.size}</div>
						<div className="stat-meta">unikal sÉ™s verÉ™n</div>
					</div>
					<div className="stat-card">
						<div className="stat-label">TapÅŸÄ±rÄ±qlar</div>
						<div className="stat-value">{submissions.length}</div>
						<div className="stat-meta">Ã¼mumi sÉ™svermÉ™</div>
					</div>
				</div>
				<div className="divider" />
				<div className="grid two">
					<div className="stat-card">
						<div className="stat-label">Æn yaxÅŸÄ± nÉ™ticÉ™</div>
						<div className="stat-value">
							{topTeacher
								? formatAvg(topTeacher.avg, topTeacher.submissions)
								: "â€”"}
						</div>
						<div className="stat-meta">
							{topTeacher
								? (teacherMap[topTeacher.teacherId]?.name ??
									topTeacher.teacherId)
								: "MÉ™lumat yoxdur"}
						</div>
					</div>
					<div className="stat-card">
						<div className="stat-label">Æn aÅŸaÄŸÄ± nÉ™ticÉ™</div>
						<div className="stat-value">
							{bottomTeacher
								? formatAvg(bottomTeacher.avg, bottomTeacher.submissions)
								: "â€”"}
						</div>
						<div className="stat-meta">
							{bottomTeacher
								? (teacherMap[bottomTeacher.teacherId]?.name ??
									bottomTeacher.teacherId)
								: "MÉ™lumat yoxdur"}
						</div>
					</div>
				</div>
			</div>

			<div className="card">
				<div className="section-header">
					<div>
						<h3>MÃ¼É™llim nÉ™ticÉ™lÉ™ri</h3>
						<p>Orta vÉ™ sÉ™svermÉ™ sayÄ±.</p>
					</div>
				</div>
				<div className="data-table">
					<div className="data-row header">
						<div>MÃ¼É™llim</div>
						<div>Orta</div>
						<div>n</div>
					</div>
					{paginatedTeacherRows.map((item) => (
						<div className="data-row" key={item.teacherId}>
							<div>{teacherMap[item.teacherId]?.name ?? item.teacherId}</div>
							<div>{formatAvg(item.avg, item.submissions)}</div>
							<div>{item.submissions}</div>
						</div>
					))}
					{teacherRows.length === 0 && (
						<div className="empty">MÉ™lumat yoxdur.</div>
					)}
				</div>
				{teacherRows.length > 0 && (
					<PaginationControls
						totalItems={teacherRows.length}
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

			<div className="card">
				<div className="section-header">
					<div>
						<h3>Ä°ÅŸtirak edÉ™nlÉ™r</h3>
						<p>Anonim nÉ™ticÉ™lÉ™r: yalnÄ±z sÉ™s verib-vermÉ™mÉ™si gÃ¶stÉ™rilir.</p>
					</div>
				</div>
				<div className="data-table">
					<div className="data-row header">
						<div>Ad</div>
						<div>Rol</div>
						<div>SÉ™s verib</div>
						<div>n</div>
					</div>
					{paginatedRaterRows.map((item) => (
						<div className="data-row" key={item.id}>
							<div>{item.name}</div>
							<div>{item.role}</div>
							<div>{item.done ? "BÉ™li" : "Xeyr"}</div>
							<div>{item.submissions}</div>
						</div>
					))}
					{raterRows.length === 0 && (
						<div className="empty">MÉ™lumat yoxdur.</div>
					)}
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

			{comments.length > 0 && (
				<div className="card">
					<div className="section-header">
						<div>
							<h3>ÅžÉ™rhlÉ™r</h3>
							<p>Son yazÄ±lÄ± rÉ™ylÉ™r.</p>
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




