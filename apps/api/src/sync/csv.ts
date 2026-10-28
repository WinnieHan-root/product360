/**
 * 严格 RFC4180 CSV 解析器。
 * 源表（尤其 voc 工单的 content 列）含逗号、换行与转义引号，不能用 split(',')。
 */
export interface CsvTable {
  header: string[];
  rows: string[][];
}

export function parseCsv(text: string): CsvTable {
  let source = text;
  if (source.charCodeAt(0) === 0xfeff) source = source.slice(1);

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    record.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    records.push(record);
    record = [];
  };

  while (i < source.length) {
    const char = source[i];

    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"' && field === "") {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      endField();
      i += 1;
      continue;
    }
    if (char === "\r") {
      if (source[i + 1] === "\n") i += 1;
      endRecord();
      i += 1;
      continue;
    }
    if (char === "\n") {
      endRecord();
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }

  if (field.length > 0 || record.length > 0) endRecord();

  const header = (records.shift() ?? []).map((item) => item.trim());
  // 丢弃完全空白的尾行
  const rows = records.filter((row) => row.some((cell) => cell.trim() !== ""));
  return { header, rows };
}

export function columnIndex(header: string[]): Map<string, number> {
  const map = new Map<string, number>();
  header.forEach((name, index) => {
    if (!map.has(name)) map.set(name, index);
  });
  return map;
}
