from __future__ import annotations

import csv
import io
import re


def _try_float(v: str) -> float | None:
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def execute_condition(rows: list[dict], config: dict) -> tuple[list[dict], list[dict]]:
    field = str(config.get("field", ""))
    operator = str(config.get("operator", ""))
    value = str(config.get("value", ""))

    true_rows: list[dict] = []
    false_rows: list[dict] = []

    for row in rows:
        cell = str(row.get(field, ""))
        if not cell and field not in row:
            false_rows.append(row)
            continue

        result = False
        cell_num = _try_float(cell)
        val_num = _try_float(value)

        if operator in (">", "<", ">=", "<=") and cell_num is not None and val_num is not None:
            if operator == ">":
                result = cell_num > val_num
            elif operator == "<":
                result = cell_num < val_num
            elif operator == ">=":
                result = cell_num >= val_num
            elif operator == "<=":
                result = cell_num <= val_num
        elif operator == "==":
            result = cell == value
        elif operator == "!=":
            result = cell != value
        elif operator == "contains":
            result = value in cell
        elif operator == "startsWith":
            result = cell.startswith(value)

        (true_rows if result else false_rows).append(row)

    return true_rows, false_rows


def execute_validation(rows: list[dict], config: dict) -> tuple[list[dict], list[dict]]:
    required = [c.strip() for c in str(config.get("required_columns", "")).split(",") if c.strip()]
    valid: list[dict] = []
    invalid: list[dict] = []

    for row in rows:
        if all(row.get(col) for col in required):
            valid.append(row)
        else:
            invalid.append(row)

    return valid, invalid


def execute_deduplicate(rows: list[dict], config: dict) -> list[dict]:
    column = str(config.get("dedup_column", ""))
    keep = str(config.get("keep", "first"))

    if keep == "last":
        seen: dict[str, int] = {}
        for i, row in enumerate(rows):
            key = str(row.get(column, ""))
            seen[key] = i
        indices = sorted(seen.values())
        return [rows[i] for i in indices]
    else:
        seen_keys: set[str] = set()
        result: list[dict] = []
        for row in rows:
            key = str(row.get(column, ""))
            if key not in seen_keys:
                seen_keys.add(key)
                result.append(row)
        return result


def execute_normalize_phone(rows: list[dict], config: dict) -> list[dict]:
    column = str(config.get("phone_column", "phone"))
    country_code = str(config.get("country_code", "+977"))

    result: list[dict] = []
    for row in rows:
        new_row = dict(row)
        phone = re.sub(r"[\s\-]", "", str(new_row.get(column, "")))
        if phone and not phone.startswith("+"):
            phone = country_code + phone
        new_row[column] = phone
        result.append(new_row)
    return result


def execute_source(kind: str, config: dict) -> list[dict]:
    if kind == "source_numbers":
        numbers = [n.strip() for n in str(config.get("numbers", "")).split(",") if n.strip()]
        return [{"phone": n} for n in numbers]

    if kind == "source_google_contacts":
        return []  # placeholder

    # CSV-based sources (manual_table, csv, xlsx, url_csv, url_json)
    sample_csv = str(config.get("sample_csv", ""))
    if not sample_csv:
        return []

    reader = csv.reader(io.StringIO(sample_csv))
    parsed = list(reader)
    if not parsed:
        return []

    headers = [h.strip() for h in parsed[0]]
    rows: list[dict] = []
    for row_cells in parsed[1:]:
        row = {}
        for i, header in enumerate(headers):
            row[header] = row_cells[i].strip() if i < len(row_cells) else ""
        rows.append(row)
    return rows
