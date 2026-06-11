import { describe, expect, it } from "vitest";
import { isPkpdNonParticipant } from "./pkpdNonParticipants";

describe("isPkpdNonParticipant", () => {
	it("matches a listed employee by branch and full name", () => {
		expect(
			isPkpdNonParticipant(
				"Abşeron",
				"Natəvan Yelmarova Kamil Qızı",
			),
		).toBe(true);
	});

	it("matches the Qurtuluş branch alias and short UI name", () => {
		expect(isPkpdNonParticipant("Qurtuluş Campusu", "Natəvan Yelmarova")).toBe(
			true,
		);
	});

	it("does not match a listed name in another branch", () => {
		expect(isPkpdNonParticipant("Stars", "Natəvan Yelmarova")).toBe(false);
	});

	it("does not match employees outside the list", () => {
		expect(isPkpdNonParticipant("Abşeron", "Test Müəllim")).toBe(false);
	});
});

