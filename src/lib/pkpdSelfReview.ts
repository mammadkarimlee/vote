const PKPD_SELF_REVIEW_META_PREFIX = "__PKPD_SELF_REVIEW_META__:";

const normalizeQuestionScores = (
	questionScores?: Record<string, number | null> | null,
) => {
	if (!questionScores || typeof questionScores !== "object") return null;

	const entries = Object.entries(questionScores)
		.map(([key, value]) => [
			key,
			value === null || value === undefined ? null : Number(value),
		] as const)
		.filter(([, value]) => value === null || !Number.isNaN(value));

	return entries.length > 0 ? Object.fromEntries(entries) : null;
};

export const parsePkpdSelfReviewNote = (rawNote: unknown) => {
	if (typeof rawNote !== "string" || rawNote.length === 0) {
		return {
			note: rawNote === null || rawNote === undefined ? null : String(rawNote),
			questionScores: null as Record<string, number | null> | null,
			editReason: null as string | null,
		};
	}

	if (!rawNote.startsWith(PKPD_SELF_REVIEW_META_PREFIX)) {
		return {
			note: rawNote,
			questionScores: null as Record<string, number | null> | null,
			editReason: null as string | null,
		};
	}

	try {
		const parsed = JSON.parse(rawNote.slice(PKPD_SELF_REVIEW_META_PREFIX.length)) as {
			note?: unknown;
			questionScores?: Record<string, number | null> | null;
			editReason?: unknown;
		};

		return {
			note: typeof parsed.note === "string" ? parsed.note : null,
			questionScores: normalizeQuestionScores(parsed.questionScores),
			editReason:
				typeof parsed.editReason === "string" ? parsed.editReason : null,
		};
	} catch {
		return {
			note: rawNote,
			questionScores: null as Record<string, number | null> | null,
			editReason: null as string | null,
		};
	}
};

export const buildPkpdSelfReviewNote = (
	note?: string | null,
	questionScores?: Record<string, number | null> | null,
	editReason?: string | null,
) => {
	const normalizedNote = note?.trim() || null;
	const normalizedScores = normalizeQuestionScores(questionScores);
	const normalizedEditReason = editReason?.trim() || null;

	if (!normalizedScores && !normalizedEditReason) {
		return normalizedNote;
	}

	return `${PKPD_SELF_REVIEW_META_PREFIX}${JSON.stringify({
		note: normalizedNote,
		questionScores: normalizedScores,
		editReason: normalizedEditReason,
	})}`;
};

export const isPkpdSelfReviewQuestionScoresError = (
	message?: string | null,
) => {
	const normalized = message?.toLowerCase() ?? "";
	return normalized.includes("question_scores");
};
