import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(".env.local") });

const APPLY = process.argv.includes("--apply");
const ORG_ID = process.env.VITE_ORG_ID || "default";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INPUT_PATH = path.resolve(".codex-tmp/pkpd-final-import/parsed-input.json");
const PREPARED_PATH = path.resolve(".codex-tmp/pkpd-final-import/prepared-class-results.json");
const SUMMARY_PATH = path.resolve(".codex-tmp/pkpd-final-import/import-summary.json");

if (!SUPABASE_URL || !SUPABASE_KEY) {
	throw new Error("Missing Supabase URL or service role key in .env.local");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false },
});

const parsed = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));

const charMap = new Map(
	Object.entries({
		"\u018f": "e",
		"\u0259": "e",
		"\u0131": "i",
		"\u0130": "i",
		I: "i",
		i: "i",
		"\u00f6": "o",
		"\u00d6": "o",
		"\u00fc": "u",
		"\u00dc": "u",
		"\u015f": "s",
		"\u015e": "s",
		"\u00e7": "c",
		"\u00c7": "c",
		"\u011f": "g",
		"\u011e": "g",
	}),
);

const normalize = (value) =>
	String(value ?? "")
		.split("")
		.map((char) => charMap.get(char) ?? char)
		.join("")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(/\s+/g, " ");

const firstTwo = (value) => normalize(value).split(" ").slice(0, 2).join(" ");
const round2 = (value) =>
	Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const fetchAll = async (table, select = "*") => {
	const rows = [];
	let from = 0;
	const pageSize = 1000;
	while (true) {
		let query = supabase
			.from(table)
			.select(select)
			.eq("org_id", ORG_ID)
			.range(from, from + pageSize - 1);
		if (!["branches", "survey_cycles"].includes(table)) {
			query = query.order("id", { ascending: true });
		}
		const { data, error } = await query;
		if (error) throw error;
		rows.push(...(data ?? []));
		if ((data ?? []).length < pageSize) break;
		from += pageSize;
	}
	return rows;
};

const chunkArray = (items, size) => {
	const chunks = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
};

const [
	branches,
	cycles,
	groups,
	students,
	memberships,
	assignments,
	subjects,
	existingClassResults,
] = await Promise.all([
	fetchAll("branches", "id,name,code"),
	fetchAll("survey_cycles", "id,year,status,branch_ids,created_at"),
	fetchAll("groups", "id,name,branch_id,class_level"),
	fetchAll("students", "id,name,branch_id,group_id,deleted_at"),
	fetchAll(
		"student_group_memberships",
		"id,student_id,group_id,year,membership_type,branch_id,deleted_at",
	),
	fetchAll(
		"teaching_assignments",
		"id,teacher_id,branch_id,group_id,subject_id,year,deleted_at",
	),
	fetchAll("subjects", "id,name"),
	fetchAll("biq_class_results", "id,branch_id,cycle_id,group_id,subject_id,score"),
]);

const branchByCode = Object.fromEntries(branches.map((branch) => [branch.code, branch]));
const qurtulusBranch = branchByCode.QUR;
const azadliqBranch = branchByCode.AZA;
const qurtulusCycle = cycles.find((cycle) =>
	(cycle.branch_ids ?? []).includes(qurtulusBranch.id),
);
const azadliqCycle = cycles.find((cycle) =>
	(cycle.branch_ids ?? []).includes(azadliqBranch.id),
);

if (!qurtulusBranch || !azadliqBranch || !qurtulusCycle || !azadliqCycle) {
	throw new Error("Could not resolve Qurtulus/Azadliq branch or cycle");
}

const qurtulusActiveYear = Number(qurtulusCycle.year);
const azadliqActiveYear = Number(azadliqCycle.year);

const groupById = Object.fromEntries(groups.map((group) => [group.id, group]));
const subjectById = Object.fromEntries(subjects.map((subject) => [subject.id, subject]));
const groupByBranchName = new Map(
	groups.map((group) => [`${group.branch_id}|${group.name}`, group]),
);

const subjectByGroupNorm = new Map();
for (const assignment of assignments) {
	const group = groupById[assignment.group_id];
	const subject = subjectById[assignment.subject_id];
	if (!group || !subject) continue;

	const key = `${assignment.branch_id}|${assignment.year}|${assignment.group_id}`;
	if (!subjectByGroupNorm.has(key)) subjectByGroupNorm.set(key, new Map());
	const subjectsByName = subjectByGroupNorm.get(key);
	const subjectKey = normalize(subject.name);
	if (!subjectsByName.has(subjectKey)) subjectsByName.set(subjectKey, []);
	if (!subjectsByName.get(subjectKey).some((item) => item.id === subject.id)) {
		subjectsByName.get(subjectKey).push(subject);
	}
}

const findSubjects = (branchId, assignmentYear, groupId, aliases) => {
	const subjectsByName = subjectByGroupNorm.get(
		`${branchId}|${assignmentYear}|${groupId}`,
	);
	if (!subjectsByName) return [];

	const found = [];
	for (const alias of aliases) {
		for (const subject of subjectsByName.get(alias) ?? []) {
			if (!found.some((item) => item.id === subject.id)) found.push(subject);
		}
	}
	return found;
};

const studentsByBranch = new Map();
for (const student of students) {
	if (!studentsByBranch.has(student.branch_id)) {
		studentsByBranch.set(student.branch_id, []);
	}
	studentsByBranch.get(student.branch_id).push(student);
}

const matchStudent = (branchId, fileName, preferredGroupName = null) => {
	const fileNorm = normalize(fileName);
	const candidates = (studentsByBranch.get(branchId) ?? []).filter((student) => {
		const groupName = groupById[student.group_id]?.name ?? "";
		if (
			preferredGroupName &&
			groupName !== preferredGroupName &&
			!groupName.startsWith(preferredGroupName)
		) {
			return false;
		}
		const studentNorm = normalize(student.name);
		return (
			studentNorm === fileNorm ||
			studentNorm.startsWith(`${fileNorm} `) ||
			fileNorm.startsWith(`${studentNorm} `) ||
			firstTwo(student.name) === firstTwo(fileName)
		);
	});

	candidates.sort(
		(a, b) => Number(Boolean(a.deleted_at)) - Number(Boolean(b.deleted_at)),
	);
	return candidates[0] ?? null;
};

const membershipsForStudent = (studentId, year) =>
	memberships
		.filter(
			(membership) =>
				membership.student_id === studentId &&
				Number(membership.year) === Number(year) &&
				!membership.deleted_at,
		)
		.map((membership) => membership.group_id);

const qurtulusAliases = (label) => {
	const key = normalize(label);
	if (key === "tedris dili") return ["azerb dili", "azerbaycan dili"];
	if (key === "edebiyyat") return ["edebiyyat"];
	if (key.startsWith("xarici dil")) return ["grammar", "ingilis dili"];
	if (key.startsWith("ikinci xarici")) return ["rus dili", "alman dili"];
	if (key === "riyaziyyat") return ["riyaziyyat"];
	if (key === "informatika") return ["informatika", "info kimya", "info si"];
	if (key === "azerbaycan tarixi" || key === "umumi tarix") {
		return ["tarix", "azerb t", "umumi t"];
	}
	if (key === "fizika") return ["fizika", "fizik t"];
	if (key === "kimya") return ["kimya", "info kimya"];
	if (key === "biologiya") return ["biologiya"];
	if (key === "cografiya") return ["cografiya"];
	return [];
};

const azadliqAliases = (label, groupName) => {
	const key = normalize(label);
	const isRussianGroup = /^11r/i.test(groupName);
	if (key === "tedris dili" || key === "edebiyyat") {
		return [
			isRussianGroup ? "rus dili ve edebiyyat" : "azerbaycan dili ve edebiyyat",
		];
	}
	if (key === "az dili dovlet dili kimi") return [];
	if (key === "ingilis dili") return ["ingilis dili"];
	if (key === "riyaziyyat") return ["riyaziyyat"];
	if (key === "informatika") return ["informatika"];
	if (key === "az tarixi" || key === "umumi tarix") return ["tarix"];
	if (key === "fizika") return ["fizika"];
	if (key === "kimya") return ["kimya"];
	if (key === "biologiya") return ["biologiya"];
	if (key === "cografiya") return ["cografiya"];
	return [];
};

const bucket = new Map();
const skips = [];

const addValue = (meta, value) => {
	const key = `${meta.branch_id}|${meta.cycle_id}|${meta.group_id}|${meta.subject_id}`;
	if (!bucket.has(key)) {
		bucket.set(key, { ...meta, values: [], sources: new Set() });
	}
	bucket.get(key).values.push(Number(value));
	bucket.get(key).sources.add(meta.source);
};

for (const row of parsed.qurt_ready_rows) {
	if (row.sheet !== "biq_sinif_fenn") continue;
	if (row.branch_id !== qurtulusBranch.id) continue;
	addValue(
		{
			org_id: ORG_ID,
			branch_id: qurtulusBranch.id,
			cycle_id: qurtulusCycle.id,
			group_id: row.group_id,
			subject_id: row.subject_id,
			group_name: row.group_name,
			subject_name: row.subject_name,
			source: row.source,
		},
		row.score,
	);
}

for (const student of parsed.qurt_docx_students) {
	const baseGroupName = student.class_level === "11" ? "11A3" : "9A3";
	const baseGroup = groupByBranchName.get(`${qurtulusBranch.id}|${baseGroupName}`);
	const matchedStudent = matchStudent(
		qurtulusBranch.id,
		student.student_name,
		baseGroupName,
	);
	const candidateGroupIds = new Set([baseGroup?.id].filter(Boolean));
	if (matchedStudent) {
		for (const groupId of membershipsForStudent(matchedStudent.id, qurtulusActiveYear)) {
			candidateGroupIds.add(groupId);
		}
	}

	for (const score of student.scores) {
		const aliases = qurtulusAliases(score.subject_label);
		if (aliases.length === 0) {
			skips.push({ source: student.source, reason: "subject_ignored" });
			continue;
		}

		let foundTarget = false;
		for (const groupId of candidateGroupIds) {
			const group = groupById[groupId];
			const subjectsFound = findSubjects(
				qurtulusBranch.id,
				qurtulusActiveYear,
				groupId,
				aliases,
			);
			for (const subject of subjectsFound) {
				addValue(
					{
						org_id: ORG_ID,
						branch_id: qurtulusBranch.id,
						cycle_id: qurtulusCycle.id,
						group_id: groupId,
						subject_id: subject.id,
						group_name: group.name,
						subject_name: subject.name,
						source: student.source,
					},
					score.score,
				);
				foundTarget = true;
			}
		}
		if (!foundTarget) {
			skips.push({
				source: student.source,
				reason: "no_assignment_target",
				student: student.student_name,
				label: score.subject_label,
			});
		}
	}
}

for (const student of parsed.azad_students) {
	let group = null;
	if (student.sheet === "11R") {
		const matchedStudent = matchStudent(azadliqBranch.id, student.student_name);
		group = matchedStudent ? groupById[matchedStudent.group_id] : null;
	} else {
		group = groupByBranchName.get(`${azadliqBranch.id}|${student.sheet}`);
	}

	if (!group) {
		skips.push({ source: student.source, reason: "azad_group_missing" });
		continue;
	}

	for (const score of student.scores) {
		const aliases = azadliqAliases(score.subject_label, group.name);
		if (aliases.length === 0) {
			skips.push({ source: student.source, reason: "subject_ignored" });
			continue;
		}

		const subjectsFound = findSubjects(
			azadliqBranch.id,
			azadliqActiveYear,
			group.id,
			aliases,
		);
		if (subjectsFound.length === 0) {
			skips.push({
				source: student.source,
				reason: "no_assignment_target",
				group: group.name,
				label: score.subject_label,
			});
			continue;
		}

		for (const subject of subjectsFound) {
			addValue(
				{
					org_id: ORG_ID,
					branch_id: azadliqBranch.id,
					cycle_id: azadliqCycle.id,
					group_id: group.id,
					subject_id: subject.id,
					group_name: group.name,
					subject_name: subject.name,
					source: student.source,
				},
				score.score,
			);
		}
	}
}

const prepared = Array.from(bucket.values())
	.map((row) => ({
		org_id: row.org_id,
		branch_id: row.branch_id,
		cycle_id: row.cycle_id,
		group_id: row.group_id,
		subject_id: row.subject_id,
		score: round2(row.values.reduce((sum, value) => sum + value, 0) / row.values.length),
		group_name: row.group_name,
		subject_name: row.subject_name,
		source: Array.from(row.sources).join("; "),
		sample_size: row.values.length,
	}))
	.sort((a, b) =>
		`${a.branch_id}|${a.group_name}|${a.subject_name}`.localeCompare(
			`${b.branch_id}|${b.group_name}|${b.subject_name}`,
			"az",
			{ numeric: true },
		),
	);

const existingByKey = new Map(
	existingClassResults.map((row) => [
		`${row.branch_id}|${row.cycle_id}|${row.group_id}|${row.subject_id}`,
		row,
	]),
);

let inserts = 0;
let updates = 0;
let unchanged = 0;
for (const row of prepared) {
	const existing = existingByKey.get(
		`${row.branch_id}|${row.cycle_id}|${row.group_id}|${row.subject_id}`,
	);
	if (!existing) inserts += 1;
	else if (Math.abs(Number(existing.score) - Number(row.score)) < 0.005) {
		unchanged += 1;
	} else {
		updates += 1;
	}
}

const importRows = prepared.map(
	({ org_id, branch_id, cycle_id, group_id, subject_id, score }) => ({
		org_id,
		branch_id,
		cycle_id,
		group_id,
		subject_id,
		score,
	}),
);

if (APPLY) {
	for (const chunk of chunkArray(importRows, 200)) {
		const { error } = await supabase.from("biq_class_results").upsert(chunk, {
			onConflict: "org_id,branch_id,cycle_id,group_id,subject_id",
		});
		if (error) throw error;
	}
}

const branchCodeById = Object.fromEntries(branches.map((branch) => [branch.id, branch.code]));
const sourceCounts = {};
const branchCounts = {};
for (const row of prepared) {
	branchCounts[branchCodeById[row.branch_id] ?? row.branch_id] =
		(branchCounts[branchCodeById[row.branch_id] ?? row.branch_id] ?? 0) + 1;
	for (const source of row.source.split("; ")) {
		sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;
	}
}

const skipCounts = {};
for (const skip of skips) {
	skipCounts[skip.reason] = (skipCounts[skip.reason] ?? 0) + 1;
}

const summary = {
	mode: APPLY ? "apply" : "dry-run",
	qurtulusCycle: {
		id: qurtulusCycle.id,
		year: qurtulusCycle.year,
		status: qurtulusCycle.status,
	},
	azadliqCycle: {
		id: azadliqCycle.id,
		year: azadliqCycle.year,
		status: azadliqCycle.status,
		assignmentYearUsed: azadliqActiveYear,
		warning: null,
	},
	preparedRows: prepared.length,
	inserts,
	updates,
	unchanged,
	byBranch: branchCounts,
	bySource: sourceCounts,
	skipSummary: skipCounts,
	qurtulusDocxRows: prepared
		.filter(
			(row) =>
				row.branch_id === qurtulusBranch.id &&
				!row.source.includes("biq_full_ready"),
		)
		.map((row) => ({
			group: row.group_name,
			subject: row.subject_name,
			score: row.score,
			n: row.sample_size,
		})),
};

fs.writeFileSync(PREPARED_PATH, JSON.stringify(prepared, null, 2));
fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
