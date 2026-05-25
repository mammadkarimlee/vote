import { describe, expect, it } from "vitest";
import {
	computeLeadershipVoteScore,
	eligibleLeadershipEvaluators,
	summarizeLeadershipVotes,
} from "./leadership";
import type { CampusLeadershipDoc, LeadershipEvaluationDoc } from "./types";

const leadership = (
	userId: string,
	role: CampusLeadershipDoc["role"],
	coverageType: CampusLeadershipDoc["coverageType"],
	overrides: Partial<CampusLeadershipDoc> = {},
): CampusLeadershipDoc => ({
	campusId: "campus-1",
	userId,
	role,
	coverageType,
	isActive: true,
	canEvaluateTeachers: true,
	...overrides,
});

it("calculates five leadership criteria including a valid zero", () => {
	expect(
		computeLeadershipVoteScore({
			disciplineScore: 0,
			teamworkScore: 2,
			communicationScore: 2,
			professionalDevelopmentScore: 1,
			platformUsageScore: 2,
		}),
	).toBe(7);
	expect(
		computeLeadershipVoteScore({
			disciplineScore: null,
			teamworkScore: 2,
			communicationScore: 2,
			professionalDevelopmentScore: 1,
			platformUsageScore: 2,
		}),
	).toBeNull();
});

describe("eligibleLeadershipEvaluators", () => {
	it("combines campus, grade, department and custom coverage without duplicates", () => {
		const entries = [
			{ id: "bm", data: leadership("u-bm", "BRANCH_MANAGER", "ALL_CAMPUS_TEACHERS") },
			{
				id: "grade",
				data: leadership("u-deputy", "DEPUTY_DIRECTOR", "GRADE_RANGE", {
					gradeFrom: 1,
					gradeTo: 4,
				}),
			},
			{
				id: "department",
				data: leadership("u-head", "DEPARTMENT_HEAD", "DEPARTMENT_BASED", {
					departmentId: "dep-a",
				}),
			},
			{
				id: "custom",
				data: leadership("u-deputy", "SUBJECT_DEPUTY", "CUSTOM_TEACHERS"),
			},
			{ id: "pending", data: leadership("u-pending", "CAMBRIDGE_DEPUTY", "PENDING") },
		];
		const result = eligibleLeadershipEvaluators(
			{
				id: "teacher-1",
				branchId: "campus-1",
				departmentId: "dep-a",
				departmentIds: ["dep-a"],
				gradeLevels: [3],
			},
			entries,
			{ customTeacherIdsByLeadership: { custom: ["teacher-1"] } },
		);
		expect(result.map((entry) => entry.data.userId)).toEqual([
			"u-bm",
			"u-deputy",
			"u-head",
		]);
	});

	it("lets the branch manager evaluate a deputy but blocks deputies from the branch manager", () => {
		const entries = [
			{ id: "bm", data: leadership("u-bm", "BRANCH_MANAGER", "ALL_CAMPUS_TEACHERS") },
			{
				id: "deputy",
				data: leadership("u-deputy", "DEPUTY_DIRECTOR", "ALL_CAMPUS_TEACHERS"),
			},
		];

		expect(
			eligibleLeadershipEvaluators(
				{ id: "manager-teacher", branchId: "campus-1", uid: "u-bm" },
				entries,
			),
		).toEqual([]);
		expect(
			eligibleLeadershipEvaluators(
				{ id: "deputy-teacher", branchId: "campus-1", uid: "u-deputy" },
				entries,
			).map((entry) => entry.data.userId),
		).toEqual(["u-bm"]);
	});

	it("protects a branch manager even when their teacher campus differs from the leadership campus", () => {
		const entries = [
			{
				id: "external-bm",
				data: leadership("u-bm", "BRANCH_MANAGER", "ALL_CAMPUS_TEACHERS", {
					campusId: "campus-2",
				}),
			},
			{
				id: "deputy",
				data: leadership("u-deputy", "DEPUTY_DIRECTOR", "ALL_CAMPUS_TEACHERS"),
			},
		];

		expect(
			eligibleLeadershipEvaluators(
				{ id: "manager-teacher", branchId: "campus-1", uid: "u-bm" },
				entries,
			),
		).toEqual([]);
	});
});

it("averages submitted eligible votes and only completes after all votes or override", () => {
	const vote = (evaluatorId: string, totalScore: number): LeadershipEvaluationDoc => ({
		cycleId: "cycle",
		teacherId: "teacher",
		evaluatorId,
		campusId: "campus-1",
		evaluatorRole: "DEPUTY_DIRECTOR",
		coverageType: "ALL_CAMPUS_TEACHERS",
		disciplineScore: 2,
		teamworkScore: 2,
		communicationScore: 2,
		professionalDevelopmentScore: 2,
		platformUsageScore: 1,
		totalScore,
		isSubmitted: true,
	});
	const partial = summarizeLeadershipVotes(["a", "b", "c"], [vote("a", 8), vote("b", 9)]);
	expect(partial.leadershipEvaluationScore).toBe(8.5);
	expect(partial.isComplete).toBe(false);
	expect(summarizeLeadershipVotes(["a", "b", "c"], [vote("a", 8)], true).isComplete).toBe(
		true,
	);
	expect(summarizeLeadershipVotes(["a"], []).leadershipEvaluationScore).toBeNull();
});
