import type { ColumnType } from "./builderTypes";

export type ColumnTypeMeta = {
  label: string;
  placeholder: string;
  hint: string;
  regex?: RegExp;
  commonPatterns?: string[];
};

export const COLUMN_TYPE_META: Record<ColumnType, ColumnTypeMeta> = {
  text: { label: "Text", placeholder: "Enter text value", hint: "Any text string" },
  number: { label: "Number", placeholder: "e.g. 42", hint: "Integer or decimal", regex: /^-?\d+(\.\d+)?$/ },
  phone: { label: "Phone", placeholder: "e.g. +9779800000000", hint: "+[country][number], 7-15 digits", regex: /^\+?\d{7,15}$/, commonPatterns: ["+977XXXXXXXXXX", "+1XXXXXXXXXX", "+44XXXXXXXXXX"] },
  email: { label: "Email", placeholder: "e.g. user@example.com", hint: "user@domain.com", regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  date: { label: "Date", placeholder: "e.g. 2026-01-15", hint: "YYYY-MM-DD format", regex: /^\d{4}-\d{2}-\d{2}$/, commonPatterns: ["today", "yesterday", "2026-01-15"] },
  boolean: { label: "Boolean", placeholder: "true or false", hint: "true / false" },
  url: { label: "URL", placeholder: "e.g. https://example.com", hint: "https://...", regex: /^https?:\/\/.+/ },
  array: { label: "Array", placeholder: "e.g. [1, 2, 3]", hint: "JSON array" },
  object: { label: "Object", placeholder: '{"key": "value"}', hint: "JSON object" },
  datetime: { label: "Date & Time", placeholder: "e.g. 2026-01-15T09:30", hint: "YYYY-MM-DDTHH:MM", regex: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/ },
  binary: { label: "Binary", placeholder: "Base64 encoded data", hint: "Base64 string" },
};

/** Format a date value as human-readable relative text */
export function formatDateHuman(value: string): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.round(diffMs / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays === -1) return "tomorrow";
  if (diffDays > 0 && diffDays < 30) return `${diffDays} days ago`;
  if (diffDays < 0 && diffDays > -30) return `in ${Math.abs(diffDays)} days`;
  if (diffDays > 0 && diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return d.toLocaleDateString();
}

/** Get a format hint for a value based on its column type */
export function getValueHint(value: string, type: ColumnType): string | null {
  if (!value) return null;
  if (type === "date" || type === "datetime") {
    const human = formatDateHuman(value);
    return human ? human : null;
  }
  if (type === "phone") {
    const cleaned = value.replace(/[\s\-()]/g, "");
    const digits = cleaned.replace(/^\+/, "").length;
    return digits > 0 ? `${digits} digits` : null;
  }
  if (type === "number") {
    const n = Number(value);
    if (!isNaN(n)) {
      if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
      if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    }
    return null;
  }
  return null;
}

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
