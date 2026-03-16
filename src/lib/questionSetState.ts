const QUESTION_SET_OPEN_TOKEN = "__question_set_open__";
const QUESTION_SET_CLOSED_TOKEN = "__question_set_closed__";

const QUESTION_SET_STATE_TOKENS = new Set([
	QUESTION_SET_OPEN_TOKEN,
	QUESTION_SET_CLOSED_TOKEN,
]);

export const stripQuestionSetStateTokens = (questionIds?: string[] | null) =>
	(questionIds ?? []).filter((id) => !QUESTION_SET_STATE_TOKENS.has(id));

export const getQuestionSetOpenStateFromTokens = (
	questionIds?: string[] | null,
) => {
	if ((questionIds ?? []).includes(QUESTION_SET_OPEN_TOKEN)) {
		return true;
	}
	if ((questionIds ?? []).includes(QUESTION_SET_CLOSED_TOKEN)) {
		return false;
	}
	return undefined;
};

export const encodeQuestionSetStateTokens = (
	questionIds: string[],
	isOpen: boolean,
) => [
	...stripQuestionSetStateTokens(questionIds),
	isOpen ? QUESTION_SET_OPEN_TOKEN : QUESTION_SET_CLOSED_TOKEN,
];

export const decodeQuestionSetState = (
	questionIds?: string[] | null,
	isOpen?: boolean | null,
) => {
	const cleanedQuestionIds = stripQuestionSetStateTokens(questionIds);
	const tokenState = getQuestionSetOpenStateFromTokens(questionIds);

	return {
		questionIds: cleanedQuestionIds,
		isOpen:
			typeof isOpen === "boolean"
				? isOpen
				: tokenState ?? cleanedQuestionIds.length > 0,
	};
};

export const QUESTION_SET_OPEN_STATE_SQL = `
case
  when array_position(question_ids, '${QUESTION_SET_OPEN_TOKEN}') is not null then true
  when array_position(question_ids, '${QUESTION_SET_CLOSED_TOKEN}') is not null then false
  else true
end
`;
