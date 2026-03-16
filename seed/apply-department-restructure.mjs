import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env"), override: false });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_ID = process.env.VITE_ORG_ID || "default";
const TARGET_YEAR = 2026;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
	throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false },
});

const parseCsvLine = (line) => {
	const values = [];
	let current = "";
	let inQuotes = false;

	for (let index = 0; index < line.length; index += 1) {
		const char = line[index];
		if (char === "\"") {
			if (inQuotes && line[index + 1] === "\"") {
				current += "\"";
				index += 1;
				continue;
			}
			inQuotes = !inQuotes;
			continue;
		}
		if (char === "," && !inQuotes) {
			values.push(current);
			current = "";
			continue;
		}
		current += char;
	}

	values.push(current);
	return values.map((value) => value.trim());
};

const readCsv = (filePath) => {
	const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
	const lines = text.split(/\r?\n/).filter(Boolean);
	if (lines.length === 0) return [];
	const headers = parseCsvLine(lines[0]);
	return lines.slice(1).map((line) => {
		const values = parseCsvLine(line);
		return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
	});
};

const normalize = (value) =>
	String(value ?? "")
		.normalize("NFC")
		.replace(/\s+/g, " ")
		.trim();

const normalizeKey = (value) =>
	normalize(value)
		.toLowerCase()
		.replaceAll("\u018f", "e")
		.replaceAll("\u0259", "e")
		.replaceAll("\u0130", "i")
		.replaceAll("\u0131", "i")
		.replaceAll("\u00d6", "o")
		.replaceAll("\u00f6", "o")
		.replaceAll("\u00dc", "u")
		.replaceAll("\u00fc", "u")
		.replaceAll("\u015e", "s")
		.replaceAll("\u015f", "s")
		.replaceAll("\u00c7", "c")
		.replaceAll("\u00e7", "c")
		.replaceAll("\u011e", "g")
		.replaceAll("\u011f", "g")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");

const departmentHeadsPath = path.join(process.cwd(), "seed", "department-heads-review.csv");
const starsTeachersPath = path.join(
	process.cwd(),
	"seed",
	"stars-teacher-department-review.csv",
);

const departmentHeadRows = readCsv(departmentHeadsPath);
const starsTeacherRows = readCsv(starsTeachersPath);

const explicitHeadTeacherIds = {
	"kerimli fatime": "stars-teacher-fatime-kerimli-idnoy-qizi",
	"quliyeva nergiz": "nesimi-teacher-nergiz-quliyeva-agaqulu-qizi",
	"ismayilova konul": "nesimi-teacher-konul-ismayilova-muzeffer-qizi",
	"ceferova zohre": "nesimi-teacher-zohre-ceferova-esger-qizi",
	"mustafayeva zamile": "stars-teacher-zamile-mustafayeva-meherrem-qizi",
	"meherremova govher": "stars-teacher-govher-meherremova-selahaddin-qizi",
	"emirguneyev resad": "nesimi-teacher-resad-emirguneyev-seydulla-oglu",
	"bayramov gunduz": "nesimi-teacher-gunduz-bayramov-ibrahim-oglu",
	"rzayeva nigar": "abseron-teacher-nigar-rzayeva-arif-qizi",
	"eren kancilar xxx": "stars-teacher-eren-kancilar-xxx",
	"nermin selimova": "stars-teacher-nermin-selimova-pdf-source",
};

const explicitBranchWideRoles = [
	{ teacherId: "stars-teacher-fatime-kerimli-idnoy-qizi", branchName: "Stars Campusu" },
	{ teacherId: "stars-teacher-nermin-selimova-pdf-source", branchName: "Stars Campusu" },
];

const uniqueDepartmentNames = [
	...new Set(departmentHeadRows.map((row) => normalize(row.department_name))),
];

const loadTable = async (table, orderBy) => {
	let query = supabase.from(table).select("*").eq("org_id", ORG_ID);
	if (orderBy) query = query.order(orderBy, { ascending: true });
	const { data, error } = await query;
	if (error) throw error;
	return data ?? [];
};

const branches = await loadTable("branches", "name");
const teachers = await loadTable("teachers", "name");
const users = await loadTable("users", "display_name");
const departments = await loadTable("departments", "name");
const assignments = await loadTable("management_assignments", "year");

const activeBranches = branches.filter((row) => !row.deleted_at);
const activeTeachers = teachers.filter((row) => !row.deleted_at);
const activeUsers = users.filter((row) => !row.deleted_at);
const activeDepartments = departments.filter((row) => !row.deleted_at);
const activeAssignments = assignments.filter((row) => !row.deleted_at);

const branchByName = new Map(activeBranches.map((row) => [normalizeKey(row.name), row]));
const teacherById = new Map(activeTeachers.map((row) => [row.id, row]));
const userById = new Map(activeUsers.map((row) => [row.id, row]));

const departmentByBranchAndName = new Map(
	activeDepartments.map((row) => [`${row.branch_id}::${normalizeKey(row.name)}`, row]),
);

const ensureDepartment = async (branchId, name) => {
	const key = `${branchId}::${normalizeKey(name)}`;
	const existing = departmentByBranchAndName.get(key);
	if (existing) return existing;

	const id = crypto.randomUUID();
	const payload = {
		id,
		org_id: ORG_ID,
		branch_id: branchId,
		name: normalize(name),
		deleted_at: null,
		archived_at: null,
	};

	const { error } = await supabase.from("departments").insert(payload);
	if (error) throw error;
	departmentByBranchAndName.set(key, payload);
	return payload;
};

for (const branch of activeBranches) {
	for (const departmentName of uniqueDepartmentNames) {
		await ensureDepartment(branch.id, departmentName);
	}
}

const starsBranch = branchByName.get(normalizeKey("Stars Campusu"));
if (!starsBranch) {
	throw new Error("Stars Campusu branch not found.");
}

let updatedTeachers = 0;
for (const row of starsTeacherRows) {
	const teacherId = normalize(row.teacher_id);
	const proposedDepartment = normalize(row.proposed_department);
	if (!teacherId || !proposedDepartment) continue;
	const teacher = teacherById.get(teacherId);
	if (!teacher) continue;
	const department = await ensureDepartment(starsBranch.id, proposedDepartment);
	if (teacher.department_id === department.id) continue;
	const { error } = await supabase
		.from("teachers")
		.update({ department_id: department.id })
		.eq("org_id", ORG_ID)
		.eq("id", teacherId);
	if (error) throw error;
	teacher.department_id = department.id;
	updatedTeachers += 1;
}

const assignmentKey = (managerId, branchId, departmentId, year) =>
	`${managerId}::${branchId}::${departmentId ?? "ALL"}::${year}`;

const existingAssignmentKeys = new Set(
	activeAssignments.map((row) =>
		assignmentKey(row.manager_id, row.branch_id, row.department_id ?? null, row.year),
	),
);

const ensureManagementAssignment = async ({
	managerId,
	branchId,
	departmentId,
	year,
}) => {
	const key = assignmentKey(managerId, branchId, departmentId ?? null, year);
	if (existingAssignmentKeys.has(key)) return false;

	const payload = {
		id: crypto.randomUUID(),
		org_id: ORG_ID,
		manager_id: managerId,
		branch_id: branchId,
		department_id: departmentId ?? null,
		year,
		deleted_at: null,
		archived_at: null,
	};

	const { error } = await supabase.from("management_assignments").insert(payload);
	if (error) throw error;
	existingAssignmentKeys.add(key);
	return true;
};

let createdAssignments = 0;

for (const item of explicitBranchWideRoles) {
	const teacher = teacherById.get(item.teacherId);
	if (!teacher?.user_id) continue;
	const branch = branchByName.get(normalizeKey(item.branchName));
	if (!branch) continue;
	const created = await ensureManagementAssignment({
		managerId: teacher.user_id,
		branchId: branch.id,
		departmentId: null,
		year: TARGET_YEAR,
	});
	if (created) createdAssignments += 1;
}

for (const row of departmentHeadRows) {
	const teacherId = explicitHeadTeacherIds[normalizeKey(row.head_name)];
	if (!teacherId) continue;
	const teacher = teacherById.get(teacherId);
	if (!teacher?.user_id || !userById.get(teacher.user_id)) continue;

	for (const branch of activeBranches) {
		const department = departmentByBranchAndName.get(
			`${branch.id}::${normalizeKey(row.department_name)}`,
		);
		if (!department) continue;
		const created = await ensureManagementAssignment({
			managerId: teacher.user_id,
			branchId: branch.id,
			departmentId: department.id,
			year: TARGET_YEAR,
		});
		if (created) createdAssignments += 1;
	}
}

console.log(
	JSON.stringify(
		{
			branchesProcessed: activeBranches.length,
			departmentsEnsuredPerBranch: uniqueDepartmentNames.length,
			starsTeachersReviewed: starsTeacherRows.length,
			updatedTeachers,
			createdAssignments,
		},
		null,
		2,
	),
);
