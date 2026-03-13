import type { QuestionDoc } from "./types";

export const STUDENT_EVALUATION_CRITERIA = [
	"Savadı",
	"Davranışı",
	"Yumor hissi",
	"Dərsi izah etməsi",
] as const;

export const STUDENT_TEACHER_INSTRUCTION_QUESTION_ID =
	"student-teacher-instruction";
export const STUDENT_TEACHER_INSTRUCTION_CATEGORY =
	"student_teacher_instruction";

export const STUDENT_TEACHER_INSTRUCTION_LINES = [
	"Əziz balabilgələrimiz, xahiş edirik təlimatı diqqətlə oxuyasınız.",
	"® Sizə dərs deyən fənn müəllimlərini siyahıdan seçib, aşağıdakı meyarlara uyğun olaraq ortalama qiymət verin.",
	...STUDENT_EVALUATION_CRITERIA.map((criterion) => `- ${criterion}`),
] as const;

export const STUDENT_TEACHER_INSTRUCTION_TEXT =
	STUDENT_TEACHER_INSTRUCTION_LINES.join("\n");

export const buildStudentTeacherInstructionQuestionDoc = (): QuestionDoc => ({
	text: STUDENT_TEACHER_INSTRUCTION_TEXT,
	type: "text",
	required: false,
	category: STUDENT_TEACHER_INSTRUCTION_CATEGORY,
});

export const isStudentTeacherInstructionQuestion = (
	question: Pick<QuestionDoc, "category">,
) => question.category === STUDENT_TEACHER_INSTRUCTION_CATEGORY;

const normalizeInstructionText = (text: string) =>
	text
		.toLocaleLowerCase("az")
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[əƏ]/g, "e")
		.replace(/[ıİ]/g, "i")
		.replace(/[şŞ]/g, "s")
		.replace(/[çÇ]/g, "c")
		.replace(/[ğĞ]/g, "g")
		.replace(/[öÖ]/g, "o")
		.replace(/[üÜ]/g, "u")
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();

export const shouldRenderStudentTeacherInstructionBlock = (
	question: Pick<QuestionDoc, "category" | "text">,
) => {
	if (isStudentTeacherInstructionQuestion(question)) return true;

	const normalized = normalizeInstructionText(question.text ?? "");
	if (!normalized) return false;

	const hasIntro =
		normalized.includes("eziz balabilgelerimiz") ||
		normalized.includes("telimati diqqetle oxuyasiniz");
	const hasTeacherPrompt =
		normalized.includes("size ders deyen fenn muellimlerini") ||
		normalized.includes("ortalama qiymet verin");
	const criteriaMatchCount = STUDENT_EVALUATION_CRITERIA.reduce(
		(count, criterion) =>
			normalized.includes(normalizeInstructionText(criterion)) ? count + 1 : count,
		0,
	);

	return (hasIntro && hasTeacherPrompt) || criteriaMatchCount >= 3;
};

export const ensureStudentTeacherInstructionQuestionIds = (
	questionIds: string[],
) => [
	STUDENT_TEACHER_INSTRUCTION_QUESTION_ID,
	...questionIds.filter((id) => id !== STUDENT_TEACHER_INSTRUCTION_QUESTION_ID),
];
