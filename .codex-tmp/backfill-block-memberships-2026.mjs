import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const ORG_ID = process.env.VITE_ORG_ID || "default";
const YEAR = 2026;
const TARGET_BRANCH_CODES = new Set(["QUR", "AZA", "XET"]);
const BLOCK_CLASS_LEVELS = new Set(["9", "10", "11"]);

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey =
	process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
	throw new Error("Supabase environment variables are missing");
}

const supabase = createClient(supabaseUrl, supabaseKey);

const fetchAll = async (table, queryFn = (query) => query) => {
	const rows = [];
	let from = 0;
	while (true) {
		let query = supabase
			.from(table)
			.select("*")
			.eq("org_id", ORG_ID)
			.range(from, from + 999);
		query = queryFn(query);
		const { data, error } = await query;
		if (error) throw new Error(`${table}: ${error.message}`);
		rows.push(...(data || []));
		if (!data || data.length < 1000) break;
		from += 1000;
	}
	return rows;
};

const classLevel = (value) => String(value ?? "").replace(/[^0-9]/g, "");

const insertBatched = async (rows) => {
	for (let index = 0; index < rows.length; index += 500) {
		const chunk = rows.slice(index, index + 500);
		const { error } = await supabase
			.from("student_group_memberships")
			.upsert(chunk, {
				onConflict: "org_id,branch_id,student_id,group_id,year,membership_type",
				ignoreDuplicates: true,
			});
		if (error) throw new Error(`student_group_memberships: ${error.message}`);
	}
};

const main = async () => {
	const [branches, groups, students, existingMemberships] = await Promise.all([
		fetchAll("branches", (query) => query.is("deleted_at", null)),
		fetchAll("groups", (query) => query.is("deleted_at", null)),
		fetchAll("students", (query) => query.is("deleted_at", null)),
		fetchAll("student_group_memberships", (query) =>
			query.eq("year", YEAR).is("deleted_at", null),
		),
	]);

	const targetBranches = branches.filter((branch) =>
		TARGET_BRANCH_CODES.has(branch.code),
	);
	const targetBranchIds = new Set(targetBranches.map((branch) => branch.id));
	const groupById = new Map(groups.map((group) => [group.id, group]));
	const branchById = new Map(branches.map((branch) => [branch.id, branch]));
	const existingKeys = new Set(
		existingMemberships.map(
			(row) =>
				`${row.org_id}|${row.branch_id}|${row.student_id}|${row.group_id}|${row.year}|${row.membership_type}`,
		),
	);

	const rowsToInsert = [];
	const byBranch = new Map();

	for (const student of students) {
		if (!targetBranchIds.has(student.branch_id)) continue;
		const group = groupById.get(student.group_id);
		if (!group) continue;
		const level = classLevel(group.class_level || student.class_level);
		if (!BLOCK_CLASS_LEVELS.has(level)) continue;

		const row = {
			org_id: ORG_ID,
			branch_id: student.branch_id,
			student_id: student.id,
			user_id: student.user_id ?? null,
			group_id: student.group_id,
			year: YEAR,
			membership_type: "block",
		};
		const key = `${row.org_id}|${row.branch_id}|${row.student_id}|${row.group_id}|${row.year}|${row.membership_type}`;
		if (existingKeys.has(key)) continue;
		rowsToInsert.push(row);

		const branchName = branchById.get(student.branch_id)?.name ?? student.branch_id;
		const current = byBranch.get(branchName) ?? {
			branchCode: branchById.get(student.branch_id)?.code ?? null,
			rows: 0,
			groups: new Set(),
		};
		current.rows += 1;
		current.groups.add(group.name);
		byBranch.set(branchName, current);
	}

	console.log(
		JSON.stringify(
			{
				mode: APPLY ? "apply" : "dry-run",
				year: YEAR,
				targetBranches: targetBranches.map((branch) => ({
					name: branch.name,
					code: branch.code,
				})),
				existingMemberships: existingMemberships.length,
				rowsToInsert: rowsToInsert.length,
				byBranch: Object.fromEntries(
					[...byBranch.entries()].map(([branch, value]) => [
						branch,
						{
							code: value.branchCode,
							rows: value.rows,
							groups: [...value.groups].sort((a, b) => a.localeCompare(b, "az")),
						},
					]),
				),
			},
			null,
			2,
		),
	);

	if (APPLY && rowsToInsert.length > 0) {
		await insertBatched(rowsToInsert);
		console.log(`Inserted ${rowsToInsert.length} student group memberships`);
	}
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
