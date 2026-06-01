import { describe, expect, it } from "vitest";
import { buildRuleBasedPkpdFinalReview } from "./pkpdFinalReview";

describe("buildRuleBasedPkpdFinalReview", () => {
	it("keeps an incomplete evaluation provisional", () => {
		const result = buildRuleBasedPkpdFinalReview({
			isComplete: false,
			baseTotalScore: null,
			currentEnteredScore: 42.5,
			leadershipComplete: false,
			missingFields: ["Portfolio"],
			components: [],
		});

		expect(result.reviewText).toContain("hələ tamamlanmayıb");
		expect(result.reviewText).toContain("42.50 / 100");
		expect(result.reviewText).not.toContain("kateqoriyasına");
		expect(result.recommendationText).toContain("Portfolio");
		expect(result.recommendationText).toContain("Rəhbərlik səslərinin tamamlanması");
	});

	it("adds category and component insights for a final evaluation", () => {
		const result = buildRuleBasedPkpdFinalReview({
			isComplete: true,
			baseTotalScore: 91,
			currentEnteredScore: 91,
			leadershipComplete: true,
			missingFields: [],
			components: [
				{
					key: "leadershipEvaluationScore",
					label: "Rəhbərlik qiymətləndirməsi",
					value: 9,
					max: 10,
				},
				{
					key: "portfolioScore",
					label: "Portfolio",
					value: 8,
					max: 20,
				},
			],
		});

		expect(result.reviewText).toContain("Tələblərə tam cavab verən");
		expect(result.reviewText).toContain("Rəhbərlik qiymətləndirməsi");
		expect(result.recommendationText).toContain(
			"Portfolio fəaliyyəti üzrə inkişaf ehtiyacı",
		);
	});
});
