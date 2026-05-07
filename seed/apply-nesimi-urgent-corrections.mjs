import crypto from "node:crypto";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env", override: false });

const ORG_ID = process.env.VITE_ORG_ID || "default";
const YEAR = 2026;
const BRANCH_CODE = "NES";

const APPLY = process.argv.includes("--apply");
const REGENERATE_TASKS = process.argv.includes("--regenerate-tasks");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
	throw new Error("Missing SUPABASE_URL / VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false },
});

const T = {
	afetKazimova: "nesimi-teacher-afet-kazimova-zakir-qizi",
	aydanKerimli: "nesimi-teacher-aydan-kerimli-etibar-qizi",
	aynurIsgenderova: "nesimi-teacher-aynur-isgenderova-mehemmed-qizi",
	aytenQasimova: "nesimi-teacher-ayten-qasimova-qasim-qizi",
	balabekEliyev: "nesimi-teacher-balabek-eliyev-ruslan-oglu",
	esmerMehdiyeva: "nesimi-teacher-esmer-mehdiyeva-alim-qizi",
	fatimeEliyeva: "nesimi-teacher-fatime-eliyeva-elsen-qizi",
	fatimeHesenli: "nesimi-teacher-fatime-hesenli-vekil-qizi",
	gunayEhmedzade: "nesimi-teacher-gunay-ehmed-zade-silduz-qizi",
	gunayNagiyeva: "nesimi-teacher-gunay-nagiyeva-namikovna",
	gunelAbbasova: "nesimi-teacher-gunel-abbasova-ziyeddin-qizi",
	ilaheEhmedova: "nesimi-teacher-ilahe-ehmedova-firuz-qizi",
	iradeMemmedova: "nesimi-teacher-irade-memmedova-mayil-qizi",
	kemaleEsgerova: "nesimi-teacher-kemale-esgerova-agabey",
	laleBayramova: "nesimi-teacher-lale-bayramova-elsad-qizi",
	leylaEliyeva: "nesimi-teacher-leyla-eliyeva-elnur-qizi",
	leylaRzayeva: "nesimi-teacher-leyla-rzayeva-arif-qizi",
	leylaYusifli: "nesimi-teacher-leyla-yusifli-huseyn-qizi",
	mehribanAgazade: "nesimi-teacher-mehriban-agazade-cingiz-qizi",
	naciyeElizade: "nesimi-teacher-naciye-elizade-mahir-qizi",
	naileHesenova: "nesimi-teacher-naile-hesenova-nadir-qizi",
	namiqQuliyev: "nesimi-teacher-namiq-quliyev-teyyar-oglu",
	nerminCabbarli: "nesimi-teacher-nermin-cabbarli-huseyn-qizi",
	nerminMemmedli: "nesimi-teacher-nermin-memmedli-natiq-qizi",
	nesrinCavadova: "nesimi-teacher-nesrin-cavadova-resadet-qizi",
	raisaSiraliyeva: "nesimi-teacher-raisa-siraliyeva-maksudovna",
	rovsenEliyev: "nesimi-teacher-rovsen-eliyev-isfendiyar-oglu",
	rufetMedetov: "nesimi-teacher-rufet-medetov-memmed-huseyn-oglu",
	ruziyyeRehimova: "nesimi-teacher-ruziyye-rehimova-fezayil-qizi",
	sahibeFerzeliyeva: "nesimi-teacher-sahibe-ferzeliyeva",
	sahinRehimov: "nesimi-teacher-sahin-rehimov-elcin-oglu",
	seadetMemmedova: "nesimi-teacher-seadet-memmedova-balayar-qizi",
	sevincEsedova: "nesimi-teacher-sevinc-esedova-rufet-qizi",
	sevincKerimova: "nesimi-teacher-sevinc-kerimova",
	sukufeHuseynli: "nesimi-teacher-sukufe-huseynli-arif-qizi",
	turkanQuliyeva: "nesimi-teacher-turkan-quliyeva-seyur-qizi",
	ulfetMustafayeva: "nesimi-teacher-ulfet-mustafayeva-efser-qizi",
	ulkerMuradova: "nesimi-teacher-ulker-muradova-namiq-qizi",
	ulviyyeNesirli: "nesimi-teacher-ulviyye-nesirli-eli-qizi",
	vasifHuseynov: "nesimi-teacher-vasif-huseynov-ramazan-oglu",
	vefaAliszade: "nesimi-teacher-vefa-aliszade-telman-qizi",
	vuqarAgayev: "nesimi-teacher-vuqar-agayev-gulbala-oglu",
	zekiyyeMemmedova: "nesimi-teacher-zekiyye-memmedova-nazim-qizi",
	zhalaShukurova: "nesimi-teacher-zhala-shukurova-xxx",
	zohreCeferova: "nesimi-teacher-zohre-ceferova-esger-qizi",
};

const setCorrections = [
	["5 A1", "Rus dili", [T.gunayEhmedzade]],
	["5 A1", "Tedqiqat", [T.seadetMemmedova]],
	["5 A1", "Tesviri i", [T.ilaheEhmedova]],
	["5 A1", "Ritorika", [T.zekiyyeMemmedova]],
	["5 A1", "Lang. Arts", [T.naciyeElizade]],
	["5 A1", "Grammar", [T.naciyeElizade]],
	["5 A1", "Texno./STEAM", [T.leylaEliyeva]],
	["5 A1", "Science", [T.kemaleEsgerova]],
	["5 A1", "Azerb tarixi", [T.iradeMemmedova]],
	["5 A1", "Azerb. dili", [T.nerminMemmedli]],
	["5 A1", "Edebiyyat", [T.nerminMemmedli]],
	["5 A1", "Ferdi inkisaf", [T.zekiyyeMemmedova]],
	["5 A1", "Mutalie saati", [T.zekiyyeMemmedova]],
	["5 A1", "Mentiq", [T.rovsenEliyev]],
	["5 A1", "Tebiet", [T.seadetMemmedova]],

	["5 R1", "Rus dili", [T.fatimeEliyeva]],
	["5 R1", "Edebiyyat", [T.fatimeEliyeva]],
	["5 R1", "Ritorika", [T.fatimeEliyeva]],
	["5 R1", "Mentiq", [T.aydanKerimli]],
	["5 R1", "Lang. Arts", [T.zhalaShukurova]],
	["5 R1", "Grammar", [T.zhalaShukurova]],
	["5 R1", "Science", [T.vasifHuseynov]],
	["5 R1", "Tedqiqat", [T.kemaleEsgerova]],
	["5 R1", "Sahmat", [T.sahinRehimov]],
	["5 R1", "Ferdi inkisaf", [T.gunayNagiyeva]],
	["5 R1", "Tesviri i", [T.ilaheEhmedova]],
	["5 R1", "Azerb tarixi", [T.sukufeHuseynli]],
	["5 R1", "Azerb. dili", [T.naileHesenova]],
	["5 R1", "Texno./STEAM", [T.vefaAliszade]],
	["5 R1", "Fiziki t", [T.namiqQuliyev]],
	["5 R1", "Mutalie saati", [T.gunayNagiyeva]],

	["5 R2", "Tebiet", [T.esmerMehdiyeva]],
	["5 R2", "Texno./STEAM", [T.vefaAliszade]],
	["5 R2", "Sahmat", [T.sahinRehimov]],
	["5 R2", "Tesviri i", [T.ilaheEhmedova]],

	["6 A1", "Riyaziyyat", [T.rovsenEliyev]],
	["6 A1", "Azerb tarixi", [T.iradeMemmedova]],
	["6 A1", "Ümumi tarix", [T.iradeMemmedova]],
	["6 A1", "Sahmat", [T.sahinRehimov]],
	["6 A1", "Texno./STEAM", [T.leylaEliyeva]],

	["6 A4", "Lang. Arts", [T.nesrinCavadova]],
	["6 A4", "Grammar", [T.nesrinCavadova]],
	["6 A4", "Tebiet", [T.seadetMemmedova]],
	["6 A4", "Cografiya", [T.ulkerMuradova]],
	["6 A4", "Texno./STEAM", [T.leylaEliyeva]],
	["6 A4", "Info / Süni int", [T.mehribanAgazade]],

	["6 R1", "Fiziki t", [T.namiqQuliyev]],
	["6 R1", "Rus dili", [T.zohreCeferova]],
	["6 R1", "Azerb. dili", [T.naileHesenova]],
	["6 R1", "Azerb tarixi", [T.sukufeHuseynli]],
	["6 R1", "Ümumi tarix", [T.sukufeHuseynli]],
	["6 R1", "Texno./STEAM", [T.vefaAliszade]],
	["6 R1", "Science", [T.ulfetMustafayeva]],
	["6 R1", "Tedqiqat", [T.kemaleEsgerova]],
	["6 R1", "Riyaziyyat", [T.rufetMedetov]],

	// The user repeated "6 R1", but the listed teachers match existing 6 R3 data.
	["6 R3", "Riyaziyyat", [T.vuqarAgayev]],
	["6 R3", "Rus dili", [T.gunayEhmedzade]],
	["6 R3", "Edebiyyat", [T.zohreCeferova]],
	["6 R3", "Cografiya", [T.raisaSiraliyeva]],
	["6 R3", "Info / Süni int", [T.balabekEliyev]],
	["6 R3", "Azerb tarixi", [T.sukufeHuseynli]],
	["6 R3", "Ümumi tarix", [T.sukufeHuseynli]],

	["7 A1", "Riyaziyyat", [T.rovsenEliyev]],
	["7 A1", "Ümumi tarix", [T.iradeMemmedova]],
	["7 A1", "Edebiyyat", [T.nerminMemmedli]],
	["7 A1", "Ferdi inkisaf", [T.ulkerMuradova]],
	["7 A1", "Ritorika", [T.zekiyyeMemmedova]],
	["7 A1", "Texno./STEAM", [T.leylaEliyeva]],

	["7 R1", "Fiziki t", [T.namiqQuliyev]],

	["8 A1", "Edebiyyat", [T.aytenQasimova]],
	["8 A1", "Info / Süni int", [T.mehribanAgazade]],
	["8 A1", "Texno./STEAM", [T.leylaEliyeva]],
	["8 A1", "Lang. Arts", [T.nerminCabbarli]],
	["8 A1", "Grammar", [T.nerminCabbarli]],
	["8 A1", "Ferdi inkisaf", [T.leylaEliyeva]],

	["8 A3", "Azerb. dili", [T.fatimeHesenli]],
	["8 A3", "Grammar", [T.nesrinCavadova]],
	["8 A3", "Edebiyyat", [T.fatimeHesenli]],
	["8 A3", "Kimya", [T.turkanQuliyeva]],
	["8 A3", "Fizika", [T.laleBayramova]],
	["8 A3", "Cografiya", [T.ulkerMuradova]],
	["8 A3", "Biologiya", [T.gunelAbbasova]],
	["8 A3", "Tedqiqat", [T.ulviyyeNesirli]],
	["8 A3", "Rus dili", [T.fatimeEliyeva]],
	["8 A3", "Lang. Arts", [T.nesrinCavadova]],
	["8 A3", "Biznes", [T.raisaSiraliyeva]],
	["8 A3", "Fiziki t", [T.namiqQuliyev]],
	["8 A3", "Texno./STEAM", [T.leylaEliyeva]],

	["8 R2", "Lang. Arts", [T.leylaYusifli]],
	["8 R2", "Grammar", [T.leylaYusifli]],
	["8 R2", "Science", [T.sahibeFerzeliyeva]],
	["8 R2", "Fizika", [T.sahibeFerzeliyeva]],
	["8 R2", "Kimya", [T.sevincKerimova]],
	["8 R2", "Azerb. dili", [T.naileHesenova]],
	["8 R2", "Azerb. tarixi", [T.sukufeHuseynli]],
	["8 R2", "Ümumi tarix", [T.sukufeHuseynli]],
	["8 R2", "Fiziki t", [T.namiqQuliyev]],
	["8 R2", "Cografiya", [T.raisaSiraliyeva]],
];

const removeTeachersFromGroups = [
	["6 A4", T.balabekEliyev],
	["6 A4", T.leylaRzayeva],
	["6 A4", T.naileHesenova],
	["6 A4", T.raisaSiraliyeva],
	["6 A4", T.ruziyyeRehimova],
	["6 A4", T.rufetMedetov],
	["6 A4", T.sukufeHuseynli],
	["8 A1", T.fatimeHesenli],
	["8 A1", T.sukufeHuseynli],
	["8 R1", T.leylaYusifli],
];

const teacherRenames = [
	{
		id: T.zhalaShukurova,
		name: "Jalə Şükürova",
		firstName: "Jalə",
		lastName: "Şükürova",
	},
	{
		id: T.aynurIsgenderova,
		name: "Aynur Əmirgünayeva Məhəmməd Qızı",
		firstName: "Aynur",
		lastName: "Əmirgünayeva Məhəmməd Qızı",
	},
];

const studentsToArchive = [
	{
		group: "6 R3",
		name: "Abbaszadə Vaqif Mübariz",
	},
];

const charMap = {
	"Ə": "e",
	"ə": "e",
	"İ": "i",
	I: "i",
	"ı": "i",
	"Ş": "s",
	"ş": "s",
	"Ç": "c",
	"ç": "c",
	"Ğ": "g",
	"ğ": "g",
	"Ö": "o",
	"ö": "o",
	"Ü": "u",
	"ü": "u",
};

const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const transliterate = (value) =>
	Array.from(String(value ?? ""))
		.map((char) => charMap[char] ?? char)
		.join("");
const normalizeKey = (value) =>
	transliterate(compact(value))
		.normalize("NFKD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
const normalizeGroup = (value) => normalizeKey(value).replace(/\s+/g, "");

const fetchAll = async (table, select = "*", order = "id") => {
	const rows = [];
	for (let from = 0; ; from += 1000) {
		const { data, error } = await supabase
			.from(table)
			.select(select)
			.eq("org_id", ORG_ID)
			.order(order)
			.range(from, from + 999);
		if (error) throw new Error(`${table}: ${error.message}`);
		rows.push(...(data ?? []));
		if (!data || data.length < 1000) break;
	}
	return rows;
};

const byId = (rows) => new Map(rows.map((row) => [row.id, row]));
const indexBy = (rows, keyFn) => {
	const map = new Map();
	for (const row of rows) {
		const key = keyFn(row);
		if (!map.has(key)) map.set(key, []);
		map.get(key).push(row);
	}
	return map;
};

const ensureSubject = async ({ subjects, subjectsByKey, name }) => {
	const key = normalizeKey(name);
	const existing = subjectsByKey.get(key)?.[0];
	if (existing) return existing;
	const subject = {
		id: `nesimi-ta-subject-${normalizeKey(name).replace(/\s+/g, "-")}-${crypto
			.randomUUID()
			.slice(0, 8)}`,
		org_id: ORG_ID,
		name,
		code: null,
	};
	if (APPLY) {
		const { error } = await supabase.from("subjects").insert(subject);
		if (error) throw new Error(`Subject create failed (${name}): ${error.message}`);
	}
	subjects.push(subject);
	subjectsByKey.set(key, [subject]);
	return subject;
};

const ensureSevincKerimova = async ({ branch, teachers, departments }) => {
	const existing = teachers.find((teacher) => teacher.id === T.sevincKerimova);
	if (existing) return existing;

	const chemistryDepartment =
		departments.find(
			(department) =>
				department.branch_id === branch.id &&
				normalizeKey(department.name) === normalizeKey("Kimya kafedrası"),
		) ??
		departments.find(
			(department) =>
				department.branch_id === branch.id &&
				normalizeKey(department.name) === normalizeKey("Ümumi"),
		);

	if (!chemistryDepartment) {
		throw new Error("Department not found for Sevinc Kərimova.");
	}

	const teacher = {
		id: T.sevincKerimova,
		org_id: ORG_ID,
		name: "Sevinc Kərimova",
		first_name: "Sevinc",
		last_name: "Kərimova",
		department_id: chemistryDepartment.id,
		branch_id: branch.id,
		branch_ids: [branch.id],
		teacher_category: "standard",
		user_id: null,
		login: null,
	};

	if (APPLY) {
		const { error } = await supabase.from("teachers").insert(teacher);
		if (error) throw new Error(`Teacher create failed (Sevinc Kərimova): ${error.message}`);
	}
	teachers.push(teacher);
	return teacher;
};

const getOne = (map, key, label) => {
	const rows = map.get(key) ?? [];
	if (rows.length !== 1) {
		throw new Error(`${label} resolve failed for "${key}" (${rows.length} matches).`);
	}
	return rows[0];
};

const loadState = async () => {
	const [branches, groups, subjects, teachers, departments, assignments, students, users, tasks, submissions] =
		await Promise.all([
			fetchAll("branches", "id,name,code"),
			fetchAll("groups", "id,name,branch_id,class_level"),
			fetchAll("subjects", "id,name,code"),
			fetchAll("teachers", "id,name,first_name,last_name,branch_id,branch_ids,department_id,user_id,login,teacher_category"),
			fetchAll("departments", "id,name,branch_id"),
			fetchAll("teaching_assignments", "id,teacher_id,group_id,subject_id,branch_id,year"),
			fetchAll("students", "id,name,branch_id,group_id,class_level,user_id,login,deleted_at"),
			fetchAll("users", "id,role,branch_id,display_name,login,deleted_at"),
			fetchAll("tasks", "id,cycle_id,branch_id,rater_id,rater_role,target_type,target_id,target_name,group_id,subject_id,group_name,subject_name,status"),
			fetchAll("submissions", "task_id,branch_id,cycle_id", "task_id"),
		]);

	const branch = branches.find((item) => item.code === BRANCH_CODE);
	if (!branch) throw new Error(`Branch not found by code: ${BRANCH_CODE}`);

	await ensureSevincKerimova({ branch, teachers, departments });

	return {
		branch,
		groups,
		subjects,
		teachers,
		departments,
		assignments,
		students,
		users,
		tasks,
		submissions,
	};
};

const applyRename = async ({ teacher, rename, usersById, planned }) => {
	if (
		teacher.name === rename.name &&
		teacher.first_name === rename.firstName &&
		teacher.last_name === rename.lastName
	) {
		return;
	}
	planned.teacherRenames.push({ from: teacher.name, to: rename.name });
	if (!APPLY) return;
	const { error } = await supabase
		.from("teachers")
		.update({
			name: rename.name,
			first_name: rename.firstName,
			last_name: rename.lastName,
		})
		.eq("org_id", ORG_ID)
		.eq("id", teacher.id);
	if (error) throw new Error(`Teacher rename failed (${teacher.id}): ${error.message}`);
	teacher.name = rename.name;
	teacher.first_name = rename.firstName;
	teacher.last_name = rename.lastName;

	if (teacher.user_id && usersById.has(teacher.user_id)) {
		const { error: userError } = await supabase
			.from("users")
			.update({ display_name: rename.name })
			.eq("org_id", ORG_ID)
			.eq("id", teacher.user_id);
		if (userError) throw new Error(`User rename failed (${teacher.user_id}): ${userError.message}`);
	}
};

const deleteAssignment = async ({ assignment, planned }) => {
	planned.deletedAssignments.push(assignment.id);
	if (!APPLY) return;
	const { error } = await supabase
		.from("teaching_assignments")
		.delete()
		.eq("org_id", ORG_ID)
		.eq("id", assignment.id);
	if (error) throw new Error(`Assignment delete failed (${assignment.id}): ${error.message}`);
};

const insertAssignment = async ({ teacherId, groupId, subjectId, branchId, planned }) => {
	planned.insertedAssignments.push({ teacherId, groupId, subjectId });
	if (!APPLY) return;
	const { error } = await supabase.from("teaching_assignments").insert({
		org_id: ORG_ID,
		teacher_id: teacherId,
		group_id: groupId,
		subject_id: subjectId,
		branch_id: branchId,
		year: YEAR,
	});
	if (error) throw new Error(`Assignment insert failed: ${error.message}`);
};

const applyScheduleCorrections = async (state) => {
	const { branch, groups, subjects, teachers, assignments, students, users } = state;
	const groupsByName = indexBy(
		groups.filter((group) => group.branch_id === branch.id),
		(group) => normalizeGroup(group.name),
	);
	const subjectsByKey = indexBy(subjects, (subject) => normalizeKey(subject.name));
	const teachersById = byId(teachers);
	const usersById = byId(users);
	const planned = {
		teacherRenames: [],
		deletedAssignments: [],
		insertedAssignments: [],
		archivedStudents: [],
	};

	for (const teacherId of Object.values(T)) {
		if (!teachersById.has(teacherId)) {
			throw new Error(`Teacher not found: ${teacherId}`);
		}
	}

	for (const [groupName, subjectName, teacherIds] of setCorrections) {
		for (const teacherId of teacherIds) {
			if (!teacherId || !teachersById.has(teacherId)) {
				throw new Error(
					`Correction has invalid teacher id: ${groupName} / ${subjectName} / ${teacherId}`,
				);
			}
		}
	}

	for (const [groupName, teacherId] of removeTeachersFromGroups) {
		if (!teacherId || !teachersById.has(teacherId)) {
			throw new Error(`Removal has invalid teacher id: ${groupName} / ${teacherId}`);
		}
	}

	for (const rename of teacherRenames) {
		await applyRename({
			teacher: teachersById.get(rename.id),
			rename,
			usersById,
			planned,
		});
	}

	const activeAssignments = assignments.filter(
		(assignment) => assignment.branch_id === branch.id && assignment.year === YEAR,
	);

	for (const [groupName, teacherId] of removeTeachersFromGroups) {
		const group = getOne(groupsByName, normalizeGroup(groupName), "Group");
		const rows = activeAssignments.filter(
			(assignment) => assignment.group_id === group.id && assignment.teacher_id === teacherId,
		);
		for (const assignment of rows) {
			await deleteAssignment({ assignment, planned });
			const idx = activeAssignments.findIndex((item) => item.id === assignment.id);
			if (idx >= 0) activeAssignments.splice(idx, 1);
		}
	}

	for (const [groupName, subjectName, teacherIds] of setCorrections) {
		const group = getOne(groupsByName, normalizeGroup(groupName), "Group");
		const subject = await ensureSubject({ subjects, subjectsByKey, name: subjectName });
		const desired = new Set(teacherIds);
		const rows = activeAssignments.filter(
			(assignment) => assignment.group_id === group.id && assignment.subject_id === subject.id,
		);

		for (const assignment of rows) {
			if (!desired.has(assignment.teacher_id)) {
				await deleteAssignment({ assignment, planned });
				const idx = activeAssignments.findIndex((item) => item.id === assignment.id);
				if (idx >= 0) activeAssignments.splice(idx, 1);
			}
		}

		const remaining = new Set(
			activeAssignments
				.filter(
					(assignment) =>
						assignment.group_id === group.id && assignment.subject_id === subject.id,
				)
				.map((assignment) => assignment.teacher_id),
		);
		for (const teacherId of teacherIds) {
			if (!remaining.has(teacherId)) {
				await insertAssignment({
					teacherId,
					groupId: group.id,
					subjectId: subject.id,
					branchId: branch.id,
					planned,
				});
				activeAssignments.push({
					id: `planned-${planned.insertedAssignments.length}`,
					teacher_id: teacherId,
					group_id: group.id,
					subject_id: subject.id,
					branch_id: branch.id,
					year: YEAR,
				});
			}
		}
	}

	for (const item of studentsToArchive) {
		const group = getOne(groupsByName, normalizeGroup(item.group), "Group");
		const matchingStudents = students.filter(
			(student) =>
				student.branch_id === branch.id &&
				student.group_id === group.id &&
				normalizeKey(student.name) === normalizeKey(item.name),
		);
		const matches = matchingStudents.filter((student) => !student.deleted_at);
		if (matches.length === 0 && matchingStudents.some((student) => student.deleted_at)) {
			continue;
		}
		if (matches.length !== 1) {
			throw new Error(`Student archive resolve failed: ${item.group} / ${item.name} (${matches.length} matches).`);
		}
		const student = matches[0];
		planned.archivedStudents.push({ id: student.id, name: student.name, group: item.group });
		if (APPLY) {
			const now = new Date().toISOString();
			const { error } = await supabase
				.from("students")
				.update({ deleted_at: now })
				.eq("org_id", ORG_ID)
				.eq("id", student.id);
			if (error) throw new Error(`Student archive failed (${student.id}): ${error.message}`);
			if (student.user_id) {
				const { error: userError } = await supabase
					.from("users")
					.update({ deleted_at: now })
					.eq("org_id", ORG_ID)
					.eq("id", student.user_id);
				if (userError) throw new Error(`Student user archive failed (${student.user_id}): ${userError.message}`);
			}
		}
	}

	return planned;
};

const buildTaskId = ({ cycleId, raterUid, targetType, targetId, groupId = null, subjectId = null }) =>
	[cycleId, raterUid, targetType, targetId, groupId ?? "all", subjectId ?? "all"].join("_");

const regenerateTasks = async (state) => {
	const { branch } = state;
	const [cycles, groups, subjects, teachers, students, users, assignments, submissions, tasks] =
		await Promise.all([
			fetchAll("survey_cycles", "id,branch_ids,year,status"),
			fetchAll("groups", "id,name,branch_id,class_level"),
			fetchAll("subjects", "id,name,code"),
			fetchAll("teachers", "id,name,branch_id,branch_ids,user_id,login"),
			fetchAll("students", "id,name,branch_id,group_id,user_id,login,deleted_at"),
			fetchAll("users", "id,role,branch_id,display_name,login,deleted_at"),
			fetchAll("teaching_assignments", "id,teacher_id,group_id,subject_id,branch_id,year"),
			fetchAll("submissions", "task_id,branch_id,cycle_id", "task_id"),
			fetchAll("tasks", "id,branch_id,cycle_id"),
		]);

	const cycle = cycles.find(
		(item) =>
			item.status === "OPEN" &&
			Array.isArray(item.branch_ids) &&
			item.branch_ids.includes(branch.id),
	);
	if (!cycle) throw new Error("Open Nəsimi cycle not found.");

	const existingSubmissions = submissions.filter(
		(submission) => submission.branch_id === branch.id && submission.cycle_id === cycle.id,
	);
	if (existingSubmissions.length > 0) {
		throw new Error(`Refusing to regenerate tasks: ${existingSubmissions.length} Nəsimi submissions exist.`);
	}

	const scopedGroups = groups.filter((group) => group.branch_id === branch.id);
	const scopedStudents = students.filter((student) => student.branch_id === branch.id && !student.deleted_at);
	const scopedTeachers = teachers.filter(
		(teacher) => teacher.branch_id === branch.id || (teacher.branch_ids ?? []).includes(branch.id),
	);
	const scopedUsers = users.filter((user) => user.branch_id === branch.id && !user.deleted_at);
	const scopedAssignments = assignments.filter(
		(assignment) => assignment.branch_id === branch.id && assignment.year === YEAR,
	);

	const groupById = byId(scopedGroups);
	const subjectById = byId(subjects);
	const teacherById = byId(scopedTeachers);
	const teacherIdByUserId = new Map();
	for (const teacher of scopedTeachers) {
		if (teacher.user_id) teacherIdByUserId.set(teacher.user_id, teacher.id);
		teacherIdByUserId.set(teacher.id, teacher.id);
	}

	const rows = [];
	const scheduled = new Set();
	const studentUsers = scopedUsers.filter((user) => user.role === "student");

	for (const user of studentUsers) {
		const student = scopedStudents.find(
			(item) => item.id === user.id || item.user_id === user.id,
		);
		if (!student) continue;

		const grouped = new Map();
		for (const assignment of scopedAssignments.filter(
			(item) => item.group_id === student.group_id,
		)) {
			const key = `${assignment.teacher_id}_${assignment.group_id}`;
			const subjectName = subjectById.get(assignment.subject_id)?.name ?? assignment.subject_id;
			const existing = grouped.get(key);
			if (!existing) {
				grouped.set(key, {
					teacherId: assignment.teacher_id,
					groupId: assignment.group_id,
					subjectNames: [subjectName],
				});
				continue;
			}
			if (!existing.subjectNames.includes(subjectName)) existing.subjectNames.push(subjectName);
		}

		for (const entry of grouped.values()) {
			const taskId = buildTaskId({
				cycleId: cycle.id,
				raterUid: user.id,
				targetType: "teacher",
				targetId: entry.teacherId,
				groupId: entry.groupId,
			});
			if (scheduled.has(taskId)) continue;
			scheduled.add(taskId);
			rows.push({
				id: taskId,
				org_id: ORG_ID,
				cycle_id: cycle.id,
				rater_id: user.id,
				rater_role: "student",
				target_type: "teacher",
				target_id: entry.teacherId,
				target_name: teacherById.get(entry.teacherId)?.name ?? null,
				branch_id: branch.id,
				group_id: entry.groupId,
				subject_id: null,
				group_name: groupById.get(entry.groupId)?.name ?? null,
				subject_name: entry.subjectNames.join(", "),
				status: "OPEN",
			});
		}
	}

	const teacherUsers = scopedUsers.filter((user) => user.role === "teacher");
	for (const user of teacherUsers) {
		const teacherId = teacherIdByUserId.get(user.id);
		if (!teacherId) continue;
		const teacher = teacherById.get(teacherId);
		const taskId = buildTaskId({
			cycleId: cycle.id,
			raterUid: user.id,
			targetType: "teacher",
			targetId: teacherId,
		});
		if (scheduled.has(taskId)) continue;
		scheduled.add(taskId);
		rows.push({
			id: taskId,
			org_id: ORG_ID,
			cycle_id: cycle.id,
			rater_id: user.id,
			rater_role: "teacher",
			target_type: "teacher",
			target_id: teacherId,
			target_name: teacher?.name ?? user.display_name ?? user.login ?? null,
			branch_id: branch.id,
			group_id: null,
			subject_id: null,
			group_name: null,
			subject_name: null,
			status: "OPEN",
		});
	}

	const existingTasks = tasks.filter(
		(task) => task.branch_id === branch.id && task.cycle_id === cycle.id,
	);
	if (!APPLY) {
		return {
			cycleId: cycle.id,
			existingTasks: existingTasks.length,
			newTasks: rows.length,
		};
	}

	const { error: deleteError } = await supabase
		.from("tasks")
		.delete()
		.eq("org_id", ORG_ID)
		.eq("branch_id", branch.id)
		.eq("cycle_id", cycle.id);
	if (deleteError) throw new Error(`Task delete failed: ${deleteError.message}`);

	for (let index = 0; index < rows.length; index += 500) {
		const chunk = rows.slice(index, index + 500);
		const { error } = await supabase.from("tasks").insert(chunk);
		if (error) throw new Error(`Task insert failed: ${error.message}`);
	}

	return {
		cycleId: cycle.id,
		deletedTasks: existingTasks.length,
		insertedTasks: rows.length,
	};
};

const state = await loadState();
const planned = await applyScheduleCorrections(state);
const taskPlan = REGENERATE_TASKS ? await regenerateTasks(state) : null;

console.log(
	JSON.stringify(
		{
			mode: APPLY ? "apply" : "validate",
			branch: state.branch,
			corrections: {
				setAssignments: setCorrections.length,
				removeTeacherGroupPairs: removeTeachersFromGroups.length,
				teacherRenames: planned.teacherRenames,
				deletedAssignments: planned.deletedAssignments.length,
				insertedAssignments: planned.insertedAssignments.length,
				archivedStudents: planned.archivedStudents,
			},
			taskPlan,
			next: APPLY
				? "Applied. Provision missing teacher logins, then re-run with --apply --regenerate-tasks if tasks were not regenerated."
				: "Validation passed. Re-run with --apply to write changes.",
		},
		null,
		2,
	),
);
