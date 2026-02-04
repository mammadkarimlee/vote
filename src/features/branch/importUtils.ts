import * as XLSX from 'xlsx'

export type ParsedRow = Record<string, string>

export const parseSpreadsheet = async (file: File): Promise<ParsedRow[]> => {
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<ParsedRow>(sheet, { defval: '' })
  return rows.map((row) => {
    const normalized: ParsedRow = {}
    Object.keys(row).forEach((key) => {
      normalized[key.trim()] = String(row[key]).trim()
    })
    return normalized
  })
}
