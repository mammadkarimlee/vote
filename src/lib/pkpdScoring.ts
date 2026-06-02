import type { PkpdPortfolioDoc, TeacherCategory } from "./types";

export type PkpdEvaluationType = "WITH_BIQ" | "WITHOUT_BIQ";

export const isEnteredPkpdScore = (
	value: number | null | undefined,
): value is number =>
	value !== null &&
	value !== undefined &&
	typeof value === "number" &&
	!Number.isNaN(value);

const sumScores = (values: Array<number | null | undefined>) => {
	const numericValues = values.filter(isEnteredPkpdScore);
	return numericValues.length > 0
		? numericValues.reduce((sum, value) => sum + value, 0)
		: null;
};

const clampEnteredScore = (value: number | null | undefined, max: number) => {
	if (value === null || value === undefined || Number.isNaN(value)) return null;
	return Math.min(Math.max(value, 0), max);
};

export const normalizePkpdScale = (
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

const withoutBiqWeights = {
	student: 20,
	management: 10,
	self: 10,
	biq: 0,
	exam: 0,
	portfolio: 60,
};

const withBiqWeights = {
	student: 15,
	management: 10,
	self: 10,
	biq: 15,
	exam: 30,
	portfolio: 20,
};

export const getPkpdWeights = (
	category?: TeacherCategory,
	isBiqTeacher?: boolean,
) =>
	isBiqTeacher === false
		? withoutBiqWeights
		: isBiqTeacher === true || category === "standard" || !category
			? withBiqWeights
			: withoutBiqWeights;

export const getPkpdPortfolioLimits = (
	category?: TeacherCategory,
	isBiqTeacher?: boolean,
) => {
	if (isBiqTeacher === false || category === "drama_gym" || category === "chess") {
		return {
			education: 3,
			attendance: 3,
			training: 9,
			olympiad: 20,
			events: 25,
		};
	}

	return { education: 3, attendance: 3, training: 4, olympiad: 4, events: 6 };
};

export const getPkpdEvaluationType = (
	category?: TeacherCategory,
	isBiqTeacher?: boolean,
): PkpdEvaluationType =>
	getPkpdWeights(category, isBiqTeacher).biq > 0
		? "WITH_BIQ"
		: "WITHOUT_BIQ";

export const getPkpdEvaluationTypeFromBiq = (
	isBiqTeacher: boolean,
): PkpdEvaluationType => (isBiqTeacher ? "WITH_BIQ" : "WITHOUT_BIQ");

export const getPkpdPortfolioMax = (
	category?: TeacherCategory,
	isBiqTeacher?: boolean,
) =>
	getPkpdEvaluationType(category, isBiqTeacher) === "WITH_BIQ" ? 20 : 60;

/* Legacy category-based helper remains for existing calculator defaults. */
export const getLegacyPkpdWeights = (category?: TeacherCategory) =>
	category === "standard" || !category
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

export const computePkpdPortfolioScore = (
	portfolio?: PkpdPortfolioDoc | null,
	category?: TeacherCategory,
	isBiqTeacher?: boolean,
) => {
	if (!portfolio) return null;

	const limits = getPkpdPortfolioLimits(category, isBiqTeacher);
	return sumScores([
		clampEnteredScore(portfolio.educationScore, limits.education),
		clampEnteredScore(portfolio.attendanceScore, limits.attendance),
		clampEnteredScore(portfolio.trainingScore, limits.training),
		clampEnteredScore(portfolio.olympiadScore, limits.olympiad),
		clampEnteredScore(portfolio.eventsScore, limits.events),
	]);
};

type PkpdScoreParts = {
	studentScore?: number | null;
	managementScore?: number | null;
	selfScore?: number | null;
	biqScore?: number | null;
	examScore?: number | null;
	portfolioScore?: number | null;
	bonusScore?: number | null;
};

const getExtraScore = (score?: number | null) =>
	isEnteredPkpdScore(score) ? score : null;

export const computePkpdCompletion = (
	evaluationType: PkpdEvaluationType,
	parts: PkpdScoreParts,
) => {
	const hasWithoutBiqExam =
		evaluationType === "WITHOUT_BIQ" && isEnteredPkpdScore(parts.examScore);
	const requiredScores =
		evaluationType === "WITH_BIQ"
			? [
					parts.biqScore,
					parts.studentScore,
					parts.selfScore,
					parts.managementScore,
					parts.examScore,
					parts.portfolioScore,
				]
			: [
					parts.studentScore,
					parts.selfScore,
					parts.managementScore,
					parts.portfolioScore,
					...(hasWithoutBiqExam ? [parts.examScore] : []),
				];
	const rawCurrentEnteredScore = requiredScores
		.filter(isEnteredPkpdScore)
		.reduce((sum, value) => sum + value, 0);
	const currentEnteredScore = hasWithoutBiqExam
		? (rawCurrentEnteredScore * 100) / 130
		: rawCurrentEnteredScore;
	const isComplete = requiredScores.every(isEnteredPkpdScore);

	return {
		isComplete,
		currentEnteredScore,
		baseTotalScore: isComplete ? currentEnteredScore : null,
	};
};

export const computePkpdBaseScore = (parts: PkpdScoreParts) =>
	sumScores([
		parts.studentScore,
		parts.managementScore,
		parts.selfScore,
		parts.biqScore,
		parts.examScore,
		parts.portfolioScore,
	]);

export const computePkpdTotalScore = (parts: PkpdScoreParts) => {
	const baseScore = computePkpdBaseScore(parts);
	const bonusScore = getExtraScore(parts.bonusScore);

	if (baseScore === null && bonusScore === null) return null;
	return (baseScore ?? 0) + (bonusScore ?? 0);
};

export const computePkpdScoreSummary = (parts: PkpdScoreParts) => {
	const baseTotalScore = computePkpdBaseScore(parts);
	const extraScore = getExtraScore(parts.bonusScore) ?? 0;
	const finalScoreWithExtra =
		baseTotalScore === null && extraScore === 0
			? null
			: (baseTotalScore ?? 0) + extraScore;

	return { baseTotalScore, extraScore, finalScoreWithExtra };
};

export const pkpdDecision = (baseTotalScore: number | null) => {
	if (baseTotalScore === null) return "-";
	return baseTotalScore >= 30
		? "Tutduğu vəzifəyə uyğundur"
		: "Tutduğu vəzifəyə uyğun deyil";
};

export const pkpdBucket = (score: number | null) => {
	if (score === null) return "-";
	if (score >= 90) return "Tələblərə tam cavab verən";
	if (score >= 80) return "Tələblərə cavab verən";
	if (score >= 60) return "Tələblərə əsasən cavab verən";
	if (score >= 50) return "İnkişaf etdirilməsi zəruri olan";
	if (score >= 30) return "İnkişafı aşağı olan";
	return "İnkişafı çox aşağı olan / tutduğu vəzifəyə uyğun deyil";
};
