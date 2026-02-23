import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_OUTPUT = path.join(__dirname, "branches-students.seed.sql");
const DEFAULT_INPUTS = [
  { file: "students-nesimi.xlsx", branch: "Nəsimi Campusu" },
  { file: "students-azadliq.xlsx", branch: "Azadlıq Campusu" },
  { file: "students-xetai.xlsx", branch: "Xətai Campusu" },
  { file: "students-qurtulus.xlsx", branch: "Qurtuluş Campusu" },
];

const args = process.argv.slice(2);
const getArg = (name, fallback = "") => {
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
};

const outputPath = path.resolve(process.cwd(), getArg("output", DEFAULT_OUTPUT));

const compactSpaces = (value) =>
  String(value ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const escapeSql = (value) => compactSpaces(value).replace(/'/g, "''");

const normalizeTr = (value) =>
  String(value || "")
    .replace(/[ıİ]/g, "i")
    .replace(/[şŞ]/g, "s")
    .replace(/[ğĞ]/g, "g")
    .replace(/[çÇ]/g, "c")
    .replace(/[öÖ]/g, "o")
    .replace(/[üÜ]/g, "u")
    .replace(/[əƏ]/g, "e");

const slugify = (value) =>
  normalizeTr(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");

const hasLetters = (value) => /[A-Za-zƏəĞğİıÖöŞşÜüÇç]/.test(String(value || ""));

const normCell = (value) =>
  normalizeTr(compactSpaces(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const looksLikeHeaderText = (value) => {
  const n = normCell(value);
  return (
    n.includes("soyad") ||
    n.includes("ata") ||
    n === "ad" ||
    n === "adi" ||
    n.includes("ad soyad")
  );
};

const normalizeGroupName = (rawSheetName) => {
  const raw = compactSpaces(rawSheetName).replace(/[–—]/g, "-");
  const norm = normalizeTr(raw).toLowerCase();
  if (!raw) return null;
  if (norm.includes("cedvel")) return null;

  let group = raw.replace(/\(([^)]+)\)/g, "-$1");
  group = group.replace(/qrup/gi, "");
  group = group.replace(/\s+/g, "");
  group = group.replace(/[^0-9A-Za-z+\-]/g, "");
  group = group.replace(/-+/g, "-");
  group = group.replace(/^-+|-+$/g, "");
  if (!group) return null;
  return group.toUpperCase();
};

const classLevelFromGroup = (groupName) => {
  const match = String(groupName || "").match(/^(\d+(?:-\d+)?)/);
  return match ? match[1] : null;
};

const normalizeClassCell = (value) => {
  const raw = compactSpaces(value).toUpperCase();
  if (!raw) return "";

  if (/^\d+(?:-\d+)?$/.test(raw)) return raw;
  if (raw === "VIII") return "8";
  if (raw === "IX") return "9";
  if (raw === "X") return "10";
  if (raw === "XI") return "11";

  const match = raw.match(/^(\d+(?:-\d+)?)/);
  if (match) return match[1];
  return "";
};

const findHeaderWithSplitName = (rows) => {
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const normalized = row.map(normCell);

    const idxSurname = normalized.findIndex((c) => c.includes("soyad"));
    if (idxSurname < 0) continue;

    const idxName = normalized.findIndex(
      (c, idx) =>
        idx !== idxSurname &&
        !c.includes("ata") &&
        (c === "ad" || c === "adi" || c.includes(" ad") || c.startsWith("ad ")),
    );
    if (idxName < 0) continue;

    const idxFather = normalized.findIndex((c) => c.includes("ata"));
    const idxClass = normalized.findIndex((c) => c.includes("sinif"));

    return { headerRow: i, idxSurname, idxName, idxFather, idxClass };
  }
  return null;
};

const findHeaderWithFullName = (rows) => {
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const normalized = row.map(normCell);

    const idxFullName = normalized.findIndex(
      (c) =>
        (c.includes("ad") && c.includes("soyad")) ||
        c.includes("ad soyad ata") ||
        c.includes("ad soyad"),
    );
    if (idxFullName < 0) continue;

    const idxClass = normalized.findIndex((c) => c.includes("sinif"));
    return { headerRow: i, idxFullName, idxClass };
  }
  return null;
};

const parseStudentsFromSheet = (rows) => {
  const cleanedRows = rows.map((row) => row.map((cell) => compactSpaces(cell)));

  const splitHeader = findHeaderWithSplitName(cleanedRows);
  if (splitHeader) {
    const out = [];
    let emptyStreak = 0;
    for (let i = splitHeader.headerRow + 1; i < cleanedRows.length; i += 1) {
      const row = cleanedRows[i];
      const surname = row[splitHeader.idxSurname] || "";
      const firstName = row[splitHeader.idxName] || "";
      const father = splitHeader.idxFather >= 0 ? row[splitHeader.idxFather] || "" : "";
      const classCell = splitHeader.idxClass >= 0 ? row[splitHeader.idxClass] || "" : "";

      if (!surname && !firstName && !father) {
        emptyStreak += 1;
        if (emptyStreak >= 6 && out.length > 0) break;
        continue;
      }
      emptyStreak = 0;

      if (looksLikeHeaderText(surname) || looksLikeHeaderText(firstName)) continue;
      if (!hasLetters(`${surname} ${firstName}`)) continue;

      const fullName = compactSpaces([surname, firstName, father].filter(Boolean).join(" "));
      if (!fullName) continue;

      out.push({
        fullName,
        classLevel: normalizeClassCell(classCell),
      });
    }
    if (out.length > 0) return out;
  }

  const fullNameHeader = findHeaderWithFullName(cleanedRows);
  if (fullNameHeader) {
    const out = [];
    let emptyStreak = 0;
    for (let i = fullNameHeader.headerRow + 1; i < cleanedRows.length; i += 1) {
      const row = cleanedRows[i];
      const fullName = row[fullNameHeader.idxFullName] || "";
      const classCell = fullNameHeader.idxClass >= 0 ? row[fullNameHeader.idxClass] || "" : "";

      if (!fullName) {
        emptyStreak += 1;
        if (emptyStreak >= 6 && out.length > 0) break;
        continue;
      }
      emptyStreak = 0;

      if (looksLikeHeaderText(fullName)) continue;
      if (!hasLetters(fullName)) continue;

      out.push({
        fullName: compactSpaces(fullName),
        classLevel: normalizeClassCell(classCell),
      });
    }
    return out;
  }

  return [];
};

const branchRows = [];
const groupRows = [];
const studentRows = [];

const usedStudentIds = new Set();
const seenStudentInGroup = new Set();

for (const source of DEFAULT_INPUTS) {
  const inputPath = path.resolve(__dirname, source.file);
  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const branchName = source.branch;
  const branchCode = (slugify(branchName).slice(0, 3) || "BRN").toUpperCase();
  branchRows.push({ branchName, branchCode });

  const wb = XLSX.readFile(inputPath, { defval: "" });
  for (const sheetName of wb.SheetNames) {
    const groupName = normalizeGroupName(sheetName);
    if (!groupName) continue;

    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: "",
    });
    if (!rows.length) continue;

    const parsedStudents = parseStudentsFromSheet(rows);
    if (!parsedStudents.length) continue;

    const groupClass = classLevelFromGroup(groupName);
    const groupLevel = groupClass || "0";
    groupRows.push({
      branchName,
      groupName,
      classLevel: groupLevel,
    });

    const branchSlug = slugify(branchName) || "branch";
    const groupSlug = slugify(groupName) || "group";

    for (const parsed of parsedStudents) {
      const studentName = compactSpaces(parsed.fullName);
      if (!studentName || !hasLetters(studentName)) continue;

      const dedupeKey = `${branchName}||${groupName}||${studentName}`;
      if (seenStudentInGroup.has(dedupeKey)) continue;
      seenStudentInGroup.add(dedupeKey);

      const classLevel = parsed.classLevel || groupLevel;
      const nameSlug = slugify(studentName) || "student";
      let studentId = `${branchSlug}-student-${groupSlug}-${nameSlug}`;

      if (usedStudentIds.has(studentId)) {
        let suffix = 2;
        while (usedStudentIds.has(`${studentId}-${suffix}`)) suffix += 1;
        studentId = `${studentId}-${suffix}`;
      }
      usedStudentIds.add(studentId);

      studentRows.push({
        studentId,
        studentName,
        classLevel,
        groupName,
        branchName,
      });
    }
  }
}

const uniqueBranches = Array.from(new Map(branchRows.map((b) => [b.branchName, b])).values());
const uniqueGroups = Array.from(
  new Map(groupRows.map((g) => [`${g.branchName}||${g.groupName}`, g])).values(),
);

const header = `-- Multi-branch students seed generated from workbook set
-- Generated at: ${new Date().toISOString()}
-- Sources:
--   ${DEFAULT_INPUTS.map((s) => s.file).join("\n--   ")}

begin;

insert into public.orgs (id, name)
values ('default', 'Default Org')
on conflict (id) do nothing;
`;

const branchSeed = `
create temporary table tmp_import_branches (
  branch_name text primary key,
  branch_code text
) on commit drop;

insert into tmp_import_branches (branch_name, branch_code)
values
${uniqueBranches
  .map((b) => `  ('${escapeSql(b.branchName)}', '${escapeSql(b.branchCode)}')`)
  .join(",\n")};

insert into public.branches (id, org_id, name, code, deleted_at, archived_at)
select
  coalesce((
    select br.id
    from public.branches br
    where br.org_id = 'default' and br.name = b.branch_name
    limit 1
  ), gen_random_uuid()::text),
  'default',
  b.branch_name,
  b.branch_code,
  null,
  null
from tmp_import_branches b
on conflict (org_id, name) do update
set code = excluded.code,
    deleted_at = null,
    archived_at = null;
`;

const groupSeed = `
create temporary table tmp_import_groups (
  branch_name text not null,
  group_name text not null,
  class_level text not null,
  primary key (branch_name, group_name)
) on commit drop;

insert into tmp_import_groups (branch_name, group_name, class_level)
values
${uniqueGroups
  .map(
    (g) =>
      `  ('${escapeSql(g.branchName)}', '${escapeSql(g.groupName)}', '${escapeSql(g.classLevel)}')`,
  )
  .join(",\n")};

insert into public.groups (
  id,
  org_id,
  branch_id,
  class_level,
  name,
  deleted_at,
  archived_at
)
select
  coalesce((
    select gr.id
    from public.groups gr
    where gr.org_id = 'default'
      and gr.branch_id = br.id
      and gr.name = g.group_name
    limit 1
  ), gen_random_uuid()::text),
  'default',
  br.id,
  g.class_level,
  g.group_name,
  null,
  null
from tmp_import_groups g
join public.branches br
  on br.org_id = 'default'
 and br.name = g.branch_name
on conflict (org_id, branch_id, name) do update
set class_level = excluded.class_level,
    deleted_at = null,
    archived_at = null;
`;

const studentSeed = `
create temporary table tmp_import_students (
  student_id text primary key,
  student_name text not null,
  class_level text not null,
  group_name text not null,
  branch_name text not null
) on commit drop;

insert into tmp_import_students (student_id, student_name, class_level, group_name, branch_name)
values
${studentRows
  .map(
    (s) =>
      `  ('${escapeSql(s.studentId)}', '${escapeSql(s.studentName)}', '${escapeSql(
        s.classLevel,
      )}', '${escapeSql(s.groupName)}', '${escapeSql(s.branchName)}')`,
  )
  .join(",\n")};

insert into public.students (
  id,
  org_id,
  name,
  branch_id,
  group_id,
  class_level,
  deleted_at,
  archived_at
)
select
  s.student_id,
  'default',
  s.student_name,
  br.id,
  gr.id,
  s.class_level,
  null,
  null
from tmp_import_students s
join public.branches br
  on br.org_id = 'default'
 and br.name = s.branch_name
join public.groups gr
  on gr.org_id = 'default'
 and gr.branch_id = br.id
 and gr.name = s.group_name
on conflict (id) do update
set name = excluded.name,
    branch_id = excluded.branch_id,
    group_id = excluded.group_id,
    class_level = excluded.class_level,
    deleted_at = null,
    archived_at = null;
`;

const footer = `
commit;
`;

const sql = `${header}${branchSeed}${groupSeed}${studentSeed}${footer}`;
fs.writeFileSync(outputPath, sql, "utf8");

const groupCountsByBranch = uniqueGroups.reduce((acc, g) => {
  acc[g.branchName] = (acc[g.branchName] || 0) + 1;
  return acc;
}, {});

const studentCountsByBranch = studentRows.reduce((acc, s) => {
  acc[s.branchName] = (acc[s.branchName] || 0) + 1;
  return acc;
}, {});

console.log(`Generated: ${outputPath}`);
console.log(`Branches: ${uniqueBranches.length}`);
console.log(`Groups: ${uniqueGroups.length}`);
console.log(`Students: ${studentRows.length}`);
console.log("Group counts by branch:", groupCountsByBranch);
console.log("Student counts by branch:", studentCountsByBranch);
