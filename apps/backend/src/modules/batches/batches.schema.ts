import { CsvError, parse } from "csv-parse/sync";
import { z } from "zod";

export const EXPECTED_CSV_HEADERS = [
  "candidateRef",
  "fullName",
  "phone",
  "attendancePercent",
  "marksPercent",
  "practicalPercent",
] as const;

export const importBatchQuerySchema = z.object({
  courseId: z.string().uuid("courseId must be a valid UUID"),
});

export const batchIdParamsSchema = z.object({
  batchId: z.string().uuid("batchId must be a valid UUID"),
});

export interface CsvValidationError {
  row: number;
  field: string;
  message: string;
}

export interface ParsedCsvCandidateRow {
  row: number;
  candidateRef: string;
  fullName: string;
  phone: string;
  attendancePercent: number;
  marksPercent: number;
  practicalPercent: number | null;
}

const NUMERIC_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)$/;

function parseScoreField(
  raw: string,
  row: number,
  field: string,
  required: boolean,
  errors: CsvValidationError[]
): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") {
    if (required) {
      errors.push({
        row,
        field,
        message: `${field} is required`,
      });
    }
    return null;
  }

  if (!NUMERIC_PATTERN.test(trimmed)) {
    errors.push({
      row,
      field,
      message: `${field} must be a valid number`,
    });
    return null;
  }

  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    errors.push({
      row,
      field,
      message: `${field} must be between 0 and 100`,
    });
    return null;
  }

  return value;
}

export function parseAndValidateBatchCsv(csvText: string): {
  errors: CsvValidationError[];
  rows: ParsedCsvCandidateRow[];
} {
  if (typeof csvText !== "string" || csvText.trim() === "") {
    return {
      errors: [{ row: 1, field: "csv", message: "CSV body must not be empty" }],
      rows: [],
    };
  }

  let rawRecords: string[][];
  try {
    rawRecords = parse(csvText, {
      bom: true,
      skip_empty_lines: false,
      relax_column_count: false,
    }) as string[][];
  } catch (err) {
    if (err instanceof CsvError) {
      return {
        errors: [
          {
            row: typeof err.lines === "number" ? err.lines : 1,
            field: "csv",
            message: err.message,
          },
        ],
        rows: [],
      };
    }
    return {
      errors: [{ row: 1, field: "csv", message: "Malformed CSV input" }],
      rows: [],
    };
  }

  if (rawRecords.length === 0) {
    return {
      errors: [{ row: 1, field: "csv", message: "CSV body must not be empty" }],
      rows: [],
    };
  }

  const errors: CsvValidationError[] = [];
  const headerRow = rawRecords[0];

  const headersMatch =
    headerRow.length === EXPECTED_CSV_HEADERS.length &&
    EXPECTED_CSV_HEADERS.every((expected, idx) => headerRow[idx]?.trim() === expected);

  if (!headersMatch) {
    errors.push({
      row: 1,
      field: "headers",
      message: `CSV headers must be exactly: ${EXPECTED_CSV_HEADERS.join(",")}`,
    });
    return { errors, rows: [] };
  }

  if (rawRecords.length < 2) {
    errors.push({
      row: 2,
      field: "csv",
      message: "CSV must contain at least one candidate row",
    });
    return { errors, rows: [] };
  }

  const parsedRows: ParsedCsvCandidateRow[] = [];
  const seenRefs = new Map<string, number>();

  for (let i = 1; i < rawRecords.length; i++) {
    const rowNumber = i + 1;
    const record = rawRecords[i];

    if (record.length !== EXPECTED_CSV_HEADERS.length) {
      errors.push({
        row: rowNumber,
        field: "row",
        message: `Expected ${EXPECTED_CSV_HEADERS.length} columns`,
      });
      continue;
    }

    if (record.every((cell) => cell.trim() === "")) {
      errors.push({
        row: rowNumber,
        field: "row",
        message: "Empty row is not allowed",
      });
      continue;
    }

    const candidateRef = record[0].trim();
    const fullName = record[1].trim();
    const phone = record[2].trim();
    const attendanceRaw = record[3];
    const marksRaw = record[4];
    const practicalRaw = record[5];

    if (!candidateRef) {
      errors.push({
        row: rowNumber,
        field: "candidateRef",
        message: "candidateRef is required",
      });
    } else if (candidateRef.length > 100) {
      errors.push({
        row: rowNumber,
        field: "candidateRef",
        message: "candidateRef must be at most 100 characters",
      });
    } else if (seenRefs.has(candidateRef)) {
      errors.push({
        row: rowNumber,
        field: "candidateRef",
        message: `Duplicate candidateRef '${candidateRef}' (first seen at row ${seenRefs.get(candidateRef)})`,
      });
    } else {
      seenRefs.set(candidateRef, rowNumber);
    }

    if (!fullName) {
      errors.push({
        row: rowNumber,
        field: "fullName",
        message: "fullName is required",
      });
    } else if (fullName.length > 150) {
      errors.push({
        row: rowNumber,
        field: "fullName",
        message: "fullName must be at most 150 characters",
      });
    }

    if (!phone) {
      errors.push({
        row: rowNumber,
        field: "phone",
        message: "phone is required",
      });
    } else if (phone.length > 30) {
      errors.push({
        row: rowNumber,
        field: "phone",
        message: "phone must be at most 30 characters",
      });
    }

    const attendancePercent = parseScoreField(
      attendanceRaw,
      rowNumber,
      "attendancePercent",
      true,
      errors
    );
    const marksPercent = parseScoreField(
      marksRaw,
      rowNumber,
      "marksPercent",
      true,
      errors
    );
    const practicalPercent = parseScoreField(
      practicalRaw,
      rowNumber,
      "practicalPercent",
      false,
      errors
    );

    if (attendancePercent !== null && marksPercent !== null) {
      parsedRows.push({
        row: rowNumber,
        candidateRef,
        fullName,
        phone,
        attendancePercent,
        marksPercent,
        practicalPercent,
      });
    }
  }

  if (errors.length > 0) {
    return { errors, rows: [] };
  }

  return { errors: [], rows: parsedRows };
}
