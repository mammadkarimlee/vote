import type { PkpdPortfolioDoc, TeacherCategory } from "./types";

const sumScores = (values: Array<number | null | undefined>) => {
	const numericValues = values.filter(
		(value): value is number => typeof value === "number" && !Number.isNaN(value),
	);
	return numericValues.length > 0
		? numericValues.reduce((sum, value) => sum + value, 0)
		: null;
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

export const getPkpdWeights = (category?: TeacherCategory) =>
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

export const getPkpdPortfolioLimits = (category?: TeacherCategory) => {
	if (category === "drama_gym" || category === "chess") {
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

export const computePkpdPortfolioScore = (
	portfolio?: PkpdPortfolioDoc | null,
	category?: TeacherCategory,
) => {
	if (!portfolio) return null;

	const limits = getPkpdPortfolioLimits(category);
	return (
		Math.min(portfolio.educationScore ?? 0, limits.education) +
		Math.min(portfolio.attendanceScore ?? 0, limits.attendance) +
		Math.min(portfolio.trainingScore ?? 0, limits.training) +
		Math.min(portfolio.olympiadScore ?? 0, limits.olympiad) +
		Math.min(portfolio.eventsScore ?? 0, limits.events)
	);
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
	const bonusScore =
		typeof parts.bonusScore === "number" && !Number.isNaN(parts.bonusScore)
			? parts.bonusScore
			: null;

	if (baseScore === null && bonusScore === null) return null;
	return (baseScore ?? 0) + (bonusScore ?? 0);
};

export const pkpdBucket = (score: number | null) => {
	if (score === null) return "-";
	if (score >= 90) return "Tələblərə tam cavab verən";
	if (score >= 80) return "Tələblərə cavab verən";
	if (score >= 60) return "Tələblərə əsasən cavab verən";
	if (score >= 50) return "İnkişaf etdirilməsi zəruri olan";
	if (score >= 30) return "İnkişafı aşağı olan";
	return "İnkişafı çox aşağı olan";
};
