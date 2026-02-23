import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(ROOT_DIR, ".env.local") });
dotenv.config({ path: path.join(ROOT_DIR, ".env"), override: false });

const ORG_ID = process.env.VITE_ORG_ID || "default";
const BRANCH_CODE = "XET";
const YEAR = Number(process.argv.includes("--year")
	? process.argv[process.argv.indexOf("--year") + 1]
	: "2026");
const DRY_RUN = process.argv.includes("--dry-run");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
	console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false },
});

const escapeSql = (value) => String(value ?? "").replace(/'/g, "''");

const latinize = (value) =>
	String(value || "")
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.replace(/[ıİ]/g, "i")
		.replace(/[əƏ]/g, "e")
		.toLowerCase();

const slugify = (value) =>
	latinize(value)
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/--+/g, "-");

const normalizeKey = (value) =>
	latinize(value)
		.replace(/\./g, " ")
		.replace(/[^a-z0-9+/ ]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();

const splitCell = (value) =>
	String(value || "")
		.split("/")
		.map((s) => s.trim())
		.filter(Boolean);

const cleanTeacherShort = (value) =>
	String(value || "")
		.replace(/\s*m\s*$/i, "")
		.replace(/\s+/g, " ")
		.trim();

const TEACHER_SHORT_ALIASES = new Map([
	["naila", "naile"],
]);

const normalizeTeacherShortKey = (value) => {
	const raw = latinize(value).replace(/[^a-z0-9]+/g, "");
	return TEACHER_SHORT_ALIASES.get(raw) || raw;
};

const GROUP_MAP = new Map([
	["8+9 sinif (A)", "8-9R-A"],
	["8+9 sinif (B)", "8-9R-B"],
	["10 sinif(1+4)", "10R-I+IV"],
	["10 sinif(2+3)", "10R-II+III"],
	["11 sinif (1)", "11A"],
	["11 sinif (2+3)", "11R"],
]);

const canonicalSubject = (rawSubject) => {
	const key = normalizeKey(rawSubject);

	if (key.includes("az dili")) return "Azərbaycan dili və ədəbiyyat";
	if (key.includes("rus dili")) return "Rus dili və ədəbiyyat";
	if (key === "edebiyyat") return "Rus dili və ədəbiyyat";
	if (key.includes("riyaz")) return "Riyaziyyat";
	if (key.includes("fizik")) return "Fizika";
	if (key.includes("ing") && key.includes("dili")) return "İngilis dili";
	if (key.includes("info") || key.includes("informat")) return "İnformatika";
	if (key.includes("kim")) return "Kimya";
	if (key.includes("tarix")) return "Tarix";
	if (key.includes("cograf")) return "Coğrafiya";

	return rawSubject.trim();
};

const findXetaiIniPath = () => {
	const files = fs.readdirSync(__dirname);
	const match = files.find((name) => {
		const key = latinize(name);
		return (
			key.endsWith(".ini") && key.includes("xetai") && key.includes("ders cedveli")
		);
	});
	if (!match) {
		throw new Error("Xətai ini file not found under seed/ directory.");
	}
	return path.join(__dirname, match);
};

const parseAssignmentsFromIni = (filePath) => {
	const text = fs.readFileSync(filePath, "utf8").replace(/\r/g, "");
	const rows = text.split("\n").map((line) => line.split("\t"));

	const dedup = new Map();
	const isClassLabel = (value) => /sinif/i.test(String(value || ""));
	const sides = [
		{ classCol: 1, startCol: 2 },
		{ classCol: 10, startCol: 11 },
	];

	for (let i = 0; i < rows.length - 1; i += 1) {
		const row = rows[i];
		const teacherRow = rows[i + 1] || [];

		for (const { classCol, startCol } of sides) {
			const rawGroup = String(row[classCol] || "").trim();
			if (!isClassLabel(rawGroup)) continue;

			const mappedGroup = GROUP_MAP.get(rawGroup);
			if (!mappedGroup) continue;

			for (let lesson = 0; lesson < 6; lesson += 1) {
				const subjectCell = String(row[startCol + lesson] || "").trim();
				const teacherCell = String(teacherRow[startCol + lesson] || "").trim();
				if (!subjectCell || !teacherCell) continue;

				const subjectParts = splitCell(subjectCell);
				const teacherParts = splitCell(teacherCell);
				const pairs = [];

				if (subjectParts.length === teacherParts.length) {
					for (let idx = 0; idx < subjectParts.length; idx += 1) {
						pairs.push([subjectParts[idx], teacherParts[idx]]);
					}
				} else if (subjectParts.length === 1) {
					for (const teacherPart of teacherParts) {
						pairs.push([subjectParts[0], teacherPart]);
					}
				} else if (teacherParts.length === 1) {
					for (const subjectPart of subjectParts) {
						pairs.push([subjectPart, teacherParts[0]]);
					}
				} else {
					const n = Math.min(subjectParts.length, teacherParts.length);
					for (let idx = 0; idx < n; idx += 1) {
						pairs.push([subjectParts[idx], teacherParts[idx]]);
					}
				}

				for (const [subjectRaw, teacherRaw] of pairs) {
					const subjectName = canonicalSubject(subjectRaw);
					const teacherShort = cleanTeacherShort(teacherRaw);
					const key = `${mappedGroup}|${subjectName}|${normalizeTeacherShortKey(
						teacherShort,
					)}`;
					dedup.set(key, {
						groupName: mappedGroup,
						subjectName,
						teacherShort,
					});
				}
			}
		}
	}

	return [...dedup.values()].sort((a, b) => {
		return (
			a.groupName.localeCompare(b.groupName, "az") ||
			a.subjectName.localeCompare(b.subjectName, "az") ||
			a.teacherShort.localeCompare(b.teacherShort, "az")
		);
	});
};

const tokenSetFromTeacherName = (name) => {
	const tokens = latinize(name)
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
	return new Set(tokens);
};

const ensure = (result, message) => {
	if (result.error) {
		throw new Error(`${message}: ${result.error.message}`);
	}
	return result.data;
};

const toCsvCell = (value) => {
	const text = String(value ?? "");
	if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
		return `"${text.replace(/"/g, "\"\"")}"`;
	}
	return text;
};

const generateSql = ({
	subjectNames,
	assignmentRows,
	year,
}) => {
	const subjectValues = subjectNames
		.map((name) => `  ('${escapeSql(name)}', '${escapeSql(slugify(name))}')`)
		.join(",\n");

	const assignmentValues = assignmentRows
		.map(
			(row) =>
				`  ('${escapeSql(row.teacherId)}', '${escapeSql(row.groupName)}', '${escapeSql(row.subjectName)}', ${year})`,
		)
		.join(",\n");

	return `-- Xətai Campusu: subjects + teaching assignments import
-- Generated at: ${new Date().toISOString()}
-- Source: seed/Xətai dərs cədvəli I gün II gün.ini

begin;

create temporary table tmp_xetai_subjects (
  name text not null,
  code text
) on commit drop;

insert into tmp_xetai_subjects (name, code)
values
${subjectValues};

create temporary table tmp_xetai_assignments (
  teacher_id text not null,
  group_name text not null,
  subject_name text not null,
  year integer not null
) on commit drop;

insert into tmp_xetai_assignments (teacher_id, group_name, subject_name, year)
values
${assignmentValues};

do $$
declare
  v_branch_id text;
  v_department_id text;
  v_missing_teachers integer;
  v_missing_groups integer;
  v_missing_subjects integer;
begin
  select b.id
    into v_branch_id
    from public.branches b
   where b.org_id = '${escapeSql(ORG_ID)}'
     and b.code = '${escapeSql(BRANCH_CODE)}'
   limit 1;

  if v_branch_id is null then
    raise exception 'Xətai branch (code ${escapeSql(BRANCH_CODE)}) not found.';
  end if;

  select d.id
    into v_department_id
    from public.departments d
   where d.org_id = '${escapeSql(ORG_ID)}'
     and d.branch_id = v_branch_id
     and d.name = 'Umumi'
   limit 1;

  if v_department_id is null then
    insert into public.departments (id, org_id, branch_id, name)
    values (gen_random_uuid()::text, '${escapeSql(ORG_ID)}', v_branch_id, 'Umumi')
    returning id into v_department_id;
  end if;

  insert into public.subjects (
    id,
    org_id,
    name,
    code,
    department_id,
    deleted_at,
    archived_at
  )
  select
    coalesce((
      select s.id
        from public.subjects s
       where s.org_id = '${escapeSql(ORG_ID)}'
         and s.department_id = v_department_id
         and lower(s.name) = lower(ts.name)
       limit 1
    ), gen_random_uuid()::text),
    '${escapeSql(ORG_ID)}',
    ts.name,
    nullif(ts.code, ''),
    v_department_id,
    null,
    null
  from tmp_xetai_subjects ts
  on conflict (org_id, department_id, name) do update
  set code = coalesce(excluded.code, public.subjects.code),
      deleted_at = null,
      archived_at = null;

  select count(*) into v_missing_teachers
    from tmp_xetai_assignments a
   where not exists (
     select 1
       from public.teachers t
      where t.id = a.teacher_id
        and t.org_id = '${escapeSql(ORG_ID)}'
        and t.deleted_at is null
   );

  select count(*) into v_missing_groups
    from tmp_xetai_assignments a
   where not exists (
     select 1
       from public.groups g
      where g.org_id = '${escapeSql(ORG_ID)}'
        and g.branch_id = v_branch_id
        and g.deleted_at is null
        and lower(g.name) = lower(a.group_name)
   );

  select count(*) into v_missing_subjects
    from tmp_xetai_assignments a
   where not exists (
     select 1
       from public.subjects s
      where s.org_id = '${escapeSql(ORG_ID)}'
        and s.department_id = v_department_id
        and s.deleted_at is null
        and lower(s.name) = lower(a.subject_name)
   );

  if v_missing_teachers > 0 or v_missing_groups > 0 or v_missing_subjects > 0 then
    raise exception
      'Import stopped. Missing -> teacher: %, group: %, subject: %',
      v_missing_teachers,
      v_missing_groups,
      v_missing_subjects;
  end if;

  insert into public.teaching_assignments (
    org_id,
    teacher_id,
    group_id,
    subject_id,
    branch_id,
    year,
    deleted_at,
    archived_at
  )
  select
    '${escapeSql(ORG_ID)}',
    a.teacher_id,
    g.id,
    s.id,
    v_branch_id,
    a.year,
    null,
    null
  from tmp_xetai_assignments a
  join public.groups g
    on g.org_id = '${escapeSql(ORG_ID)}'
   and g.branch_id = v_branch_id
   and g.deleted_at is null
   and lower(g.name) = lower(a.group_name)
  join public.subjects s
    on s.org_id = '${escapeSql(ORG_ID)}'
   and s.department_id = v_department_id
   and s.deleted_at is null
   and lower(s.name) = lower(a.subject_name)
  on conflict (org_id, teacher_id, group_id, subject_id, branch_id, year) do update
  set deleted_at = null,
      archived_at = null;
end $$;

commit;
`;
};

const main = async () => {
	const iniPath = findXetaiIniPath();
	const parsed = parseAssignmentsFromIni(iniPath);
	if (parsed.length === 0) {
		throw new Error("No assignments parsed from ini file.");
	}

	const branch = ensure(
		await supabase
			.from("branches")
			.select("id,name,code")
			.eq("org_id", ORG_ID)
			.eq("code", BRANCH_CODE)
			.maybeSingle(),
		"Load Xətai branch",
	);
	if (!branch) throw new Error("Xətai branch not found.");

	const teachers = ensure(
		await supabase
			.from("teachers")
			.select("id,name,branch_id,deleted_at")
			.eq("org_id", ORG_ID)
			.eq("branch_id", branch.id)
			.is("deleted_at", null),
		"Load Xətai teachers",
	);

	const teacherIndex = new Map();
	for (const teacher of teachers || []) {
		const tokens = tokenSetFromTeacherName(teacher.name);
		for (const token of tokens) {
			if (!teacherIndex.has(token)) teacherIndex.set(token, []);
			teacherIndex.get(token).push(teacher);
		}
	}

	const unresolvedTeachers = new Map();
	const ambiguousTeachers = new Map();
	const resolvedTeacherByShort = new Map();

	for (const assignment of parsed) {
		const shortKey = normalizeTeacherShortKey(assignment.teacherShort);
		if (resolvedTeacherByShort.has(shortKey)) continue;
		const candidates = teacherIndex.get(shortKey) || [];
		if (candidates.length === 0) {
			unresolvedTeachers.set(assignment.teacherShort, true);
			continue;
		}
		if (candidates.length > 1) {
			ambiguousTeachers.set(
				assignment.teacherShort,
				candidates.map((c) => `${c.id} (${c.name})`),
			);
			continue;
		}
		resolvedTeacherByShort.set(shortKey, candidates[0]);
	}

	if (unresolvedTeachers.size > 0 || ambiguousTeachers.size > 0) {
		if (unresolvedTeachers.size > 0) {
			console.error(
				"Unresolved teacher short names:",
				[...unresolvedTeachers.keys()].join(", "),
			);
		}
		if (ambiguousTeachers.size > 0) {
			for (const [shortName, candidates] of ambiguousTeachers.entries()) {
				console.error(`Ambiguous teacher "${shortName}": ${candidates.join(" | ")}`);
			}
		}
		throw new Error("Teacher mapping failed.");
	}

	const groupNames = [...new Set(parsed.map((a) => a.groupName))];
	const groups = ensure(
		await supabase
			.from("groups")
			.select("id,name")
			.eq("org_id", ORG_ID)
			.eq("branch_id", branch.id)
			.in("name", groupNames)
			.is("deleted_at", null),
		"Load Xətai groups",
	);
	const groupByName = new Map((groups || []).map((g) => [g.name, g]));
	const missingGroups = groupNames.filter((name) => !groupByName.has(name));
	if (missingGroups.length > 0) {
		throw new Error(`Missing groups in DB: ${missingGroups.join(", ")}`);
	}

	let department = ensure(
		await supabase
			.from("departments")
			.select("id,name")
			.eq("org_id", ORG_ID)
			.eq("branch_id", branch.id)
			.eq("name", "Umumi")
			.maybeSingle(),
		"Load Xətai Umumi department",
	);

	if (!department) {
		department = ensure(
			await supabase
				.from("departments")
				.insert({
					org_id: ORG_ID,
					branch_id: branch.id,
					name: "Umumi",
				})
				.select("id,name")
				.single(),
			"Create Xətai Umumi department",
		);
	}

	const subjectNames = [...new Set(parsed.map((a) => a.subjectName))].sort((a, b) =>
		a.localeCompare(b, "az"),
	);
	const existingSubjects = ensure(
		await supabase
			.from("subjects")
			.select("id,name")
			.eq("org_id", ORG_ID)
			.eq("department_id", department.id)
			.is("deleted_at", null),
		"Load Xətai subjects",
	);
	const subjectByNameKey = new Map(
		(existingSubjects || []).map((s) => [normalizeKey(s.name), s]),
	);

	const missingSubjectRows = subjectNames
		.filter((name) => !subjectByNameKey.has(normalizeKey(name)))
		.map((name) => ({
			id: randomUUID(),
			org_id: ORG_ID,
			name,
			code: slugify(name),
			department_id: department.id,
			deleted_at: null,
			archived_at: null,
		}));

	if (missingSubjectRows.length > 0 && !DRY_RUN) {
		ensure(
			await supabase.from("subjects").insert(missingSubjectRows),
			"Insert missing subjects",
		);
	}

	const allSubjects = ensure(
		await supabase
			.from("subjects")
			.select("id,name")
			.eq("org_id", ORG_ID)
			.eq("department_id", department.id)
			.is("deleted_at", null),
		"Reload subjects",
	);
	const subjectByCanonicalName = new Map(
		(allSubjects || []).map((s) => [normalizeKey(s.name), s]),
	);

	const assignmentRows = parsed.map((item) => {
		const teacher = resolvedTeacherByShort.get(
			normalizeTeacherShortKey(item.teacherShort),
		);
		const group = groupByName.get(item.groupName);
		let subject = subjectByCanonicalName.get(normalizeKey(item.subjectName));
		if (!subject && DRY_RUN) {
			subject = { id: `dry-${slugify(item.subjectName)}`, name: item.subjectName };
		}
		if (!teacher || !group || !subject) {
			throw new Error(
				`Failed to resolve row: ${item.teacherShort} | ${item.groupName} | ${item.subjectName}`,
			);
		}
		return {
			teacherId: teacher.id,
			teacherName: teacher.name,
			groupName: group.name,
			groupId: group.id,
			subjectName: subject.name,
			subjectId: subject.id,
			year: YEAR,
			branchId: branch.id,
		};
	});

	if (!DRY_RUN) {
		const upsertRows = assignmentRows.map((row) => ({
			org_id: ORG_ID,
			teacher_id: row.teacherId,
			group_id: row.groupId,
			subject_id: row.subjectId,
			branch_id: branch.id,
			year: YEAR,
			deleted_at: null,
			archived_at: null,
		}));
		ensure(
			await supabase
				.from("teaching_assignments")
				.upsert(upsertRows, {
					onConflict: "org_id,teacher_id,group_id,subject_id,branch_id,year",
				}),
			"Upsert teaching assignments",
		);
	}

	const csvPath = path.join(__dirname, "import-templates", "assignments-xetai-2026.csv");
	const csvHeader = [
		"teacherId",
		"teacherName",
		"groupName",
		"subjectName",
		"year",
		"branchId",
	];
	const csvLines = [
		csvHeader.map(toCsvCell).join(","),
		...assignmentRows.map((row) =>
			[
				row.teacherId,
				row.teacherName,
				row.groupName,
				row.subjectName,
				String(row.year),
				"",
			]
				.map(toCsvCell)
				.join(","),
		),
	];
	fs.writeFileSync(csvPath, `${csvLines.join("\n")}\n`, "utf8");

	const sqlPath = path.join(__dirname, "xetai-assignments-2026.seed.sql");
	const sql = generateSql({
		subjectNames: [...new Set(assignmentRows.map((a) => a.subjectName))].sort((a, b) =>
			a.localeCompare(b, "az"),
		),
		assignmentRows,
		year: YEAR,
	});
	fs.writeFileSync(sqlPath, sql, "utf8");

	console.log(`Parsed assignments: ${parsed.length}`);
	console.log(`Resolved assignments: ${assignmentRows.length}`);
	console.log(`Subjects (unique): ${subjectNames.length}`);
	console.log(`CSV generated: ${path.relative(ROOT_DIR, csvPath)}`);
	console.log(`SQL generated: ${path.relative(ROOT_DIR, sqlPath)}`);
	if (DRY_RUN) {
		console.log("Dry run only. DB changes were not applied.");
	} else {
		console.log("DB upsert completed for Xətai teaching assignments.");
	}
};

main().catch((error) => {
	console.error(error.message || error);
	process.exit(1);
});
