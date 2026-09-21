/**
 * Types and utilities for Course Assessment Marks (ISE / MSE / ESE)
 */

export type ExamType = 'ise' | 'mse' | 'ese'

export interface MarkRecord {
  id?: string
  student_uid: number
  course_id: string
  percentage: number
  exam_type: ExamType
  grade?: string
  created_at?: string
  profiles?: {
    full_name: string
    student_id: number
  }
}

export interface ParsedStudentMark {
  student_id: number
  marks: number
  max_marks: number
  percentage: number
  grade: string
}

export interface CsvParseResult {
  records: ParsedStudentMark[]
  errors: string[]
  totalRows: number
}

/**
 * Calculates standardized letter grade based on percentage
 */
export function calculateGrade(percentage: number): string {
  if (percentage >= 90) return 'O'
  if (percentage >= 80) return 'A+'
  if (percentage >= 70) return 'A'
  if (percentage >= 60) return 'B+'
  if (percentage >= 50) return 'B'
  if (percentage >= 40) return 'C'
  return 'F'
}

/**
 * Parses CSV text containing student IDs and marks.
 * Supports:
 * - student_id,marks
 * - student_id,marks,max_marks
 * - student_id,name,marks
 */
export function parseMarksCsv(text: string, defaultMaxMarks: number = 100): CsvParseResult {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const errors: string[] = []
  const records: ParsedStudentMark[] = []

  if (lines.length <= 1) {
    errors.push('CSV file is empty or missing data rows.')
    return { records, errors, totalRows: 0 }
  }

  // Parse header
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/['"]/g, ''))
  const uidIdx = header.indexOf('student_id') !== -1 
    ? header.indexOf('student_id') 
    : header.indexOf('studentid') !== -1 
    ? header.indexOf('studentid') 
    : header.indexOf('id')

  const marksIdx = header.indexOf('marks') !== -1 
    ? header.indexOf('marks') 
    : header.indexOf('score') !== -1 
    ? header.indexOf('score') 
    : header.indexOf('obtained_marks') !== -1 
    ? header.indexOf('obtained_marks') 
    : -1

  const maxMarksIdx = header.indexOf('max_marks') !== -1 
    ? header.indexOf('max_marks') 
    : header.indexOf('total_marks') !== -1 
    ? header.indexOf('total_marks') 
    : -1

  if (uidIdx === -1) {
    errors.push("Missing required 'student_id' column in header.")
  }
  if (marksIdx === -1) {
    errors.push("Missing required 'marks' (or 'score') column in header.")
  }

  if (errors.length > 0) {
    return { records, errors, totalRows: lines.length - 1 }
  }

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1
    const cols = lines[i].split(',').map((c) => c.trim().replace(/['"]/g, ''))
    
    if (cols.length <= Math.max(uidIdx, marksIdx)) {
      errors.push(`Row ${rowNum}: Incomplete columns.`)
      continue
    }

    const rawUid = cols[uidIdx]
    const rawMarks = cols[marksIdx]
    const rawMax = maxMarksIdx !== -1 && cols[maxMarksIdx] ? cols[maxMarksIdx] : ''

    const studentId = Number(rawUid)
    if (isNaN(studentId) || studentId <= 0) {
      errors.push(`Row ${rowNum}: Invalid student_id "${rawUid}". Must be a positive number.`)
      continue
    }

    const marks = Number(rawMarks)
    if (isNaN(marks) || marks < 0) {
      errors.push(`Row ${rowNum}: Invalid marks "${rawMarks}". Must be a non-negative number.`)
      continue
    }

    let maxMarks = defaultMaxMarks > 0 ? defaultMaxMarks : 100
    if (rawMax) {
      const parsedMax = Number(rawMax)
      if (!isNaN(parsedMax) && parsedMax > 0) {
        maxMarks = parsedMax
      }
    }

    if (marks > maxMarks) {
      errors.push(`Row ${rowNum}: Student ${studentId} marks (${marks}) exceed maximum marks (${maxMarks}).`)
      continue
    }

    const percentage = Math.round((marks / maxMarks) * 100 * 10) / 10
    const grade = calculateGrade(percentage)

    records.push({
      student_id: studentId,
      marks,
      max_marks: maxMarks,
      percentage,
      grade
    })
  }

  return {
    records,
    errors,
    totalRows: lines.length - 1
  }
}
