import type { PkpdPortfolioDoc, TeacherCategory } from "./types";

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
	if (category === "drama_gym") {
		return {
			education: 3,
			attendance: 3,
			training: 9,
			olympiad: 20,
			events: 25,
		};
	}

	if (category === "chess") {
		return {
			education: 3,
			attendance: 3,
			training: 9,
			olympiad: 30,
			events: 15,
		};
	}

	return { education: 3, attendance: 3, training: 5, olympiad: 4, events: 5 };
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

export const pkpdBucket = (score: number | null) => {
	if (score === null) return "-";
	if (score >= 90) return "Tələblərə tam cavab verən";
	if (score >= 80) return "Tələblərə cavab verən";
	if (score >= 60) return "Tələblərə əsasən cavab verən";
	if (score >= 50) return "İnkişaf etdirilməsi zəruri olan";
	if (score >= 30) return "İnkişafı aşağı olan";
	return "İnkişafı çox aşağı olan";
};
