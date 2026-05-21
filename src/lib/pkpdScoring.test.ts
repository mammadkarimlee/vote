import { describe, expect, it } from "vitest";
import {
	computePkpdPortfolioScore,
	computePkpdScoreSummary,
	computePkpdTotalScore,
	getPkpdWeights,
	normalizePkpdScale,
	pkpdDecision,
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

	it("uses BİQ status over category", () => {
		expect(getPkpdWeights("standard", false)).toEqual({
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

	it("uses 60-point portfolio limits for BİQ olmayan teachers", () => {
		expect(
			computePkpdPortfolioScore(
				{
					cycleId: "cycle",
					branchId: "branch",
					teacherId: "teacher",
					educationScore: 3,
					attendanceScore: 3,
					trainingScore: 9,
					olympiadScore: 20,
					eventsScore: 25,
				},
				"standard",
				false,
			),
		).toBe(60);
	});
	it("keeps missing portfolio fields distinct from entered zero", () => {
		expect(
			computePkpdPortfolioScore(
				{
					cycleId: "cycle",
					branchId: "branch",
					teacherId: "teacher",
					educationScore: 0,
					attendanceScore: null,
					trainingScore: null,
					olympiadScore: null,
					eventsScore: null,
				},
				"standard",
			),
		).toBe(0);

		expect(
			computePkpdPortfolioScore(
				{
					cycleId: "cycle",
					branchId: "branch",
					teacherId: "teacher",
					educationScore: null,
					attendanceScore: null,
					trainingScore: null,
					olympiadScore: null,
					eventsScore: null,
				},
				"standard",
			),
		).toBeNull();
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

describe("computePkpdScoreSummary", () => {
	it("keeps base score separate from extra score", () => {
		expect(
			computePkpdScoreSummary({
				studentScore: 17,
				managementScore: 7,
				selfScore: 8,
				portfolioScore: 42,
				bonusScore: 5,
			}),
		).toEqual({
			baseTotalScore: 74,
			extraScore: 5,
			finalScoreWithExtra: 79,
		});
	});
});

describe("pkpdBucket", () => {
	it("maps scores to categories", () => {
		expect(pkpdBucket(92)).toBe("Tələblərə tam cavab verən");
		expect(pkpdBucket(55)).toBe("İnkişaf etdirilməsi zəruri olan");
	});
});

describe("pkpdDecision", () => {
	it("uses base score for position decision", () => {
		expect(pkpdDecision(30)).toBe("Tutduğu vəzifəyə uyğundur");
		expect(pkpdDecision(29)).toBe("Tutduğu vəzifəyə uyğun deyil");
	});
});
