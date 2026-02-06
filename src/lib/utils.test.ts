import { describe, expect, it } from "vitest";
import { chunkArray, toNumber } from "./utils";

describe("chunkArray", () => {
	it("chunks arrays by size", () => {
		expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
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
