import { describe, expect, it } from "vitest";
import {
	computePkpdPortfolioScore,
	computePkpdTotalScore,
	getPkpdWeights,
	normalizePkpdScale,
	pkpdBucket,
} from "./pkpdScoring";

describe("normalizePkpdScale", () => {
	it("converts 10-point scale to 100-point scale", () => {
		expect(normalizePkpdScale(6.75, 1, 10)).toBe(67.5);
	});
});

describe("getPkpdWeights", () => {
	it("returns standard teacher weights", () => {
		expect(getPkpdWeights("standard")).toEqual({
			student: 15,
			management: 10,
			self: 10,
			biq: 15,
			exam: 30,
			portfolio: 20,
		});
	});

	it("returns special teacher weights", () => {
		expect(getPkpdWeights("drama_gym")).toEqual({
			student: 20,
			management: 10,
			self: 10,
			biq: 0,
			exam: 0,
			portfolio: 60,
		});
	});
});

describe("computePkpdPortfolioScore", () => {
	it("caps portfolio values by category limits", () => {
		expect(
			computePkpdPortfolioScore(
				{
					cycleId: "cycle",
					branchId: "branch",
					teacherId: "teacher",
					educationScore: 5,
					attendanceScore: 4,
					trainingScore: 7,
					olympiadScore: 8,
					eventsScore: 7,
				},
				"standard",
			),
		).toBe(20);
	});
});

describe("computePkpdTotalScore", () => {
	it("includes exam, portfolio, and bonus in the final score", () => {
		expect(
			computePkpdTotalScore({
				studentScore: 15,
				managementScore: 10,
				selfScore: 10,
				biqScore: 15,
				examScore: 30,
				portfolioScore: 20,
				bonusScore: 5,
			}),
		).toBe(105);
	});

	it("returns null when no score data exists", () => {
		expect(computePkpdTotalScore({})).toBeNull();
	});
});

describe("pkpdBucket", () => {
	it("maps scores to categories", () => {
		expect(pkpdBucket(92)).toBe("Tələblərə tam cavab verən");
		expect(pkpdBucket(55)).toBe("İnkişaf etdirilməsi zəruri olan");
	});
});
