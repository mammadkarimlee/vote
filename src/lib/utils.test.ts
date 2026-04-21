import { describe, expect, it } from "vitest";
import { chunkArray, chunkValuesForInFilter, toNumber } from "./utils";

describe("chunkArray", () => {
	it("chunks arrays by size", () => {
		expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
	});
});

describe("chunkValuesForInFilter", () => {
	it("keeps encoded batches under the configured limit", () => {
		const values = [
			"a".repeat(120),
			"b".repeat(120),
			"c".repeat(120),
			"d".repeat(120),
		];

		const chunks = chunkValuesForInFilter(values, {
			maxItems: 10,
			maxEncodedLength: 250,
		});

		expect(chunks).toEqual([
			["a".repeat(120), "b".repeat(120)],
			["c".repeat(120), "d".repeat(120)],
		]);
	});

	it("respects the max item count", () => {
		expect(
			chunkValuesForInFilter(["a", "b", "c"], {
				maxItems: 2,
				maxEncodedLength: 100,
			}),
		).toEqual([["a", "b"], ["c"]]);
	});
});

describe("toNumber", () => {
	it("parses numeric strings", () => {
		expect(toNumber(" 42 ")).toBe(42);
	});

	it("returns null for non-numeric", () => {
		expect(toNumber("abc")).toBeNull();
	});
});
