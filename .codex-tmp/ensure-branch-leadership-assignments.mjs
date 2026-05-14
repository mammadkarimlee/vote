import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const ORG_ID = process.env.VITE_ORG_ID || "default";
const YEAR = 2026;

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

const wantedAssignments = [
	{
		branchCode: "NES",
		managerId: "0d320f24-c535-4268-b514-4f5221a8fe1d",
		label: "Vəli Vəlizadə",
	},
	{
		branchCode: "NES",
		managerId: "7c3898b7-083e-424e-9def-3b3adbcc9359",
		label: "Ayşən Tariverdiyeva",
	},
	{
		branchCode: "NES",
		managerId: "9484e945-50f7-4be9-91b6-aaff1bf43175",
		label: "Nərgiz Quliyeva",
	},
	{
		branchCode: "QUR",
		managerId: "f5243c4f-dfb4-4ce3-8b38-1c3fc98de803",
		label: "Mətanət Hüseynova",
	},
	{
		branchCode: "QUR",
		managerId: "b17b9614-f501-4515-b089-6031cd76877c",
		label: "Nuridə Əsədova",
	},
	{
		branchCode: "QUR",
		managerId: "ae72ac19-4201-424b-9be3-3da20acf3d02",
		label: "Elmar Əliyev",
	},
	{
		branchCode: "QUR",
		managerId: "5bf1863f-fba6-4a7e-86aa-f34d7066b40b",
		label: "Aysel Rəhimli",
	},
	{
		branchCode: "AZA",
		managerId: "4334ea66-ac3f-4df2-bf14-a4a8db744ad3",
		label: "Zülfiyyə Sadıqova",
	},
	{
		branchCode: "XET",
		managerId: "cab7dcb7-4333-423e-a16f-627fb4640b17",
		label: "Ülkər Şərifova",
	},
];

const unresolved = [
	"Nəsimi: Alcan Haciyev Təşkilat oğlu user bazada tapılmadı",
	"Qurtuluş: Məmməd Məmmədli Əhməd oğlu user bazada tapılmadı",
	"Azadlıq: Yaşar Zeynalov İsax oğlu user bazada tapılmadı",
	"Xətai: Elmin Yaqubbəyli Vaqif oğlu user bazada tapılmadı",
	"Koroğlu: filial bazada tapılmadı",
];

const chunkArray = (items, size) => {
	const chunks = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
};

const main = async () => {
	const [branches, users, assignments] = await Promise.all([
		fetchAll("branches", (query) => query.is("deleted_at", null)),
		fetchAll("users", (query) => query.is("deleted_at", null)),
		fetchAll("management_assignments", (query) => query.is("deleted_at", null)),
	]);

	const branchByCode = new Map(branches.map((branch) => [branch.code, branch]));
	const userById = new Map(users.map((user) => [user.id, user]));
	const existingKeys = new Set(
		assignments
			.filter(
				(row) =>
					row.year === YEAR &&
					(row.department_id === null || row.department_id === undefined),
			)
			.map((row) => `${row.branch_id}:${row.manager_id}`),
	);

	const rowsToInsert = [];
	const skipped = [];

	for (const item of wantedAssignments) {
		const branch = branchByCode.get(item.branchCode);
		const user = userById.get(item.managerId);
		if (!branch) {
			skipped.push(`${item.label}: ${item.branchCode} filialı tapılmadı`);
			continue;
		}
		if (!user) {
			skipped.push(`${item.label}: user tapılmadı`);
			continue;
		}
		const key = `${branch.id}:${item.managerId}`;
		if (existingKeys.has(key)) {
			skipped.push(`${item.label}: artıq ${branch.name} üçün əlavə olunub`);
			continue;
		}
		rowsToInsert.push({
			org_id: ORG_ID,
			manager_id: item.managerId,
			branch_id: branch.id,
			department_id: null,
			year: YEAR,
		});
	}

	const backupDir = path.join(
		".codex-tmp",
		"branch-leadership-assignments",
		new Date().toISOString().replace(/[:.]/g, "-"),
	);
	await fs.mkdir(backupDir, { recursive: true });
	await fs.writeFile(
		path.join(backupDir, "management-assignments-before.json"),
		JSON.stringify({ branches, users, managementAssignments: assignments }, null, 2),
		"utf8",
	);

	console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
	console.log(`Backup: ${backupDir}`);
	console.log(`Rows to insert: ${rowsToInsert.length}`);
	for (const row of rowsToInsert) {
		const branch = branches.find((item) => item.id === row.branch_id);
		const user = users.find((item) => item.id === row.manager_id);
		console.log(
			`  + ${branch?.name || row.branch_id}: ${
				user?.display_name || user?.login || row.manager_id
			}`,
		);
	}
	for (const item of skipped) console.log(`  - skip: ${item}`);
	for (const item of unresolved) console.log(`  ! unresolved: ${item}`);

	if (!APPLY || rowsToInsert.length === 0) return;

	for (const chunk of chunkArray(rowsToInsert, 100)) {
		const { error } = await supabase.from("management_assignments").insert(chunk);
		if (error) throw new Error(`management_assignments insert: ${error.message}`);
	}

	console.log("Inserted.");
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
