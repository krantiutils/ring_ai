import type { ColumnType } from "./builderTypes";

export type ColumnTypeMeta = {
  label: string;
  placeholder: string;
};

export const COLUMN_TYPE_META: Record<ColumnType, ColumnTypeMeta> = {
  text: { label: "Text", placeholder: "Enter text value" },
  number: { label: "Number", placeholder: "e.g. 42" },
  phone: { label: "Phone", placeholder: "e.g. +1234567890" },
  email: { label: "Email", placeholder: "e.g. user@example.com" },
  date: { label: "Date", placeholder: "e.g. 2026-01-15" },
  boolean: { label: "Boolean", placeholder: "true or false" },
  url: { label: "URL", placeholder: "e.g. https://example.com" },
  array: { label: "Array", placeholder: "e.g. [1, 2, 3]" },
  object: { label: "Object", placeholder: 'e.g. {"key": "value"}' },
  datetime: { label: "Date & Time", placeholder: "e.g. 2026-01-15T09:30:00Z" },
  binary: { label: "Binary", placeholder: "Base64 encoded data" },
};

export function validateCellValue(
  value: string,
  type: ColumnType,
): { valid: boolean; message?: string } {
  if (value === "") return { valid: true };

  switch (type) {
    case "number": {
      const n = Number(value);
      if (Number.isNaN(n)) return { valid: false, message: "Must be a number" };
      return { valid: true };
    }
    case "phone": {
      const cleaned = value.replace(/[\s\-()]/g, "");
      if (!/^\+?\d{7,15}$/.test(cleaned))
        return { valid: false, message: "Invalid phone format" };
      return { valid: true };
    }
    case "email": {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
        return { valid: false, message: "Invalid email format" };
      return { valid: true };
    }
    case "date": {
      const d = new Date(value);
      if (Number.isNaN(d.getTime()))
        return { valid: false, message: "Invalid date" };
      return { valid: true };
    }
    case "datetime": {
      const dt = new Date(value);
      if (Number.isNaN(dt.getTime()))
        return { valid: false, message: "Invalid datetime" };
      return { valid: true };
    }
    case "boolean": {
      if (value !== "true" && value !== "false")
        return { valid: false, message: "Must be true or false" };
      return { valid: true };
    }
    case "url": {
      try {
        new URL(value);
        return { valid: true };
      } catch {
        return { valid: false, message: "Invalid URL" };
      }
    }
    case "array": {
      try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed))
          return { valid: false, message: "Must be a JSON array" };
        return { valid: true };
      } catch {
        return { valid: false, message: "Invalid JSON array" };
      }
    }
    case "object": {
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
          return { valid: false, message: "Must be a JSON object" };
        return { valid: true };
      } catch {
        return { valid: false, message: "Invalid JSON object" };
      }
    }
    case "text":
    case "binary":
      return { valid: true };
    default:
      return { valid: true };
  }
}
