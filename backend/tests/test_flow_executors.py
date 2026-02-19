import pytest

from app.services.flow_executors import (
    execute_condition,
    execute_validation,
    execute_deduplicate,
    execute_normalize_phone,
    execute_source,
)


# --- Condition executor tests ---

class TestConditionExecutor:

    def test_numeric_greater_than_splits_correctly(self):
        rows = [
            {"name": "Ram", "age": "34"},
            {"name": "Sita", "age": "28"},
            {"name": "Hari", "age": "45"},
        ]
        config = {"field": "age", "operator": ">", "value": "30"}
        true_rows, false_rows = execute_condition(rows, config)
        assert len(true_rows) == 2  # Ram(34), Hari(45)
        assert len(false_rows) == 1  # Sita(28)
        assert {r["name"] for r in true_rows} == {"Ram", "Hari"}

    def test_string_equality(self):
        rows = [
            {"name": "Ram", "city": "Kathmandu"},
            {"name": "Sita", "city": "Pokhara"},
        ]
        config = {"field": "city", "operator": "==", "value": "Kathmandu"}
        true_rows, false_rows = execute_condition(rows, config)
        assert len(true_rows) == 1
        assert true_rows[0]["name"] == "Ram"

    def test_contains_operator(self):
        rows = [
            {"name": "Ram", "phone": "+9779800000000"},
            {"name": "Sita", "phone": "+1234567890"},
        ]
        config = {"field": "phone", "operator": "contains", "value": "+977"}
        true_rows, false_rows = execute_condition(rows, config)
        assert len(true_rows) == 1
        assert true_rows[0]["name"] == "Ram"

    def test_starts_with_operator(self):
        rows = [
            {"name": "Ram", "phone": "+9779800000000"},
            {"name": "Sita", "phone": "+1234567890"},
        ]
        config = {"field": "phone", "operator": "startsWith", "value": "+977"}
        true_rows, false_rows = execute_condition(rows, config)
        assert len(true_rows) == 1

    def test_missing_field_goes_to_false(self):
        rows = [{"name": "Ram"}, {"name": "Sita", "age": "30"}]
        config = {"field": "age", "operator": ">", "value": "25"}
        true_rows, false_rows = execute_condition(rows, config)
        assert len(false_rows) == 1  # Ram has no age
        assert false_rows[0]["name"] == "Ram"

    def test_all_operators(self):
        rows = [{"v": "10"}]
        assert execute_condition(rows, {"field": "v", "operator": "<", "value": "20"})[0] == rows
        assert execute_condition(rows, {"field": "v", "operator": ">=", "value": "10"})[0] == rows
        assert execute_condition(rows, {"field": "v", "operator": "<=", "value": "10"})[0] == rows
        assert execute_condition(rows, {"field": "v", "operator": "!=", "value": "5"})[0] == rows
        assert execute_condition(rows, {"field": "v", "operator": "==", "value": "10"})[0] == rows


# --- Validation executor tests ---

class TestValidationExecutor:

    def test_rows_with_all_required_columns_are_valid(self):
        rows = [{"name": "Ram", "phone": "+977"}, {"name": "Sita", "phone": "+977"}]
        config = {"required_columns": "name,phone"}
        valid, invalid = execute_validation(rows, config)
        assert len(valid) == 2
        assert len(invalid) == 0

    def test_rows_missing_required_column_are_invalid(self):
        rows = [
            {"name": "Ram", "phone": "+977"},
            {"name": "Sita"},  # missing phone
            {"phone": "+977"},  # missing name
        ]
        config = {"required_columns": "name,phone"}
        valid, invalid = execute_validation(rows, config)
        assert len(valid) == 1
        assert valid[0]["name"] == "Ram"
        assert len(invalid) == 2

    def test_empty_value_counts_as_missing(self):
        rows = [{"name": "Ram", "phone": ""}, {"name": "Sita", "phone": "+977"}]
        config = {"required_columns": "name,phone"}
        valid, invalid = execute_validation(rows, config)
        assert len(valid) == 1
        assert valid[0]["name"] == "Sita"


# --- Deduplicate executor tests ---

class TestDeduplicateExecutor:

    def test_dedup_by_phone_keep_first(self):
        rows = [
            {"name": "Ram", "phone": "+977"},
            {"name": "Sita", "phone": "+1"},
            {"name": "Ram2", "phone": "+977"},  # duplicate
        ]
        config = {"dedup_column": "phone", "keep": "first"}
        result = execute_deduplicate(rows, config)
        assert len(result) == 2
        assert result[0]["name"] == "Ram"  # first kept

    def test_dedup_by_phone_keep_last(self):
        rows = [
            {"name": "Ram", "phone": "+977"},
            {"name": "Sita", "phone": "+1"},
            {"name": "Ram2", "phone": "+977"},
        ]
        config = {"dedup_column": "phone", "keep": "last"}
        result = execute_deduplicate(rows, config)
        assert len(result) == 2
        assert result[1]["name"] == "Ram2"  # last kept

    def test_no_duplicates_passes_through(self):
        rows = [{"name": "Ram", "phone": "+1"}, {"name": "Sita", "phone": "+2"}]
        config = {"dedup_column": "phone", "keep": "first"}
        result = execute_deduplicate(rows, config)
        assert len(result) == 2


# --- Normalize phone executor tests ---

class TestNormalizePhoneExecutor:

    def test_adds_country_code(self):
        rows = [{"name": "Ram", "phone": "9800000000"}]
        config = {"phone_column": "phone", "country_code": "+977", "format": "e164"}
        result = execute_normalize_phone(rows, config)
        assert result[0]["phone"] == "+9779800000000"

    def test_already_has_country_code(self):
        rows = [{"name": "Ram", "phone": "+9779800000000"}]
        config = {"phone_column": "phone", "country_code": "+977", "format": "e164"}
        result = execute_normalize_phone(rows, config)
        assert result[0]["phone"] == "+9779800000000"

    def test_strips_spaces_and_dashes(self):
        rows = [{"name": "Ram", "phone": "980-000-0000"}]
        config = {"phone_column": "phone", "country_code": "+977", "format": "e164"}
        result = execute_normalize_phone(rows, config)
        assert result[0]["phone"] == "+9779800000000"


# --- Source executor tests ---

class TestSourceExecutor:

    def test_manual_table_parses_csv(self):
        config = {"sample_csv": "name,phone\nRam,+977\nSita,+1"}
        rows = execute_source("source_manual_table", config)
        assert len(rows) == 2
        assert rows[0] == {"name": "Ram", "phone": "+977"}
        assert rows[1] == {"name": "Sita", "phone": "+1"}

    def test_numbers_source(self):
        config = {"numbers": "+9779800000000,+9779811111111"}
        rows = execute_source("source_numbers", config)
        assert len(rows) == 2
        assert rows[0] == {"phone": "+9779800000000"}
        assert rows[1] == {"phone": "+9779811111111"}

    def test_empty_csv_returns_empty(self):
        config = {"sample_csv": ""}
        rows = execute_source("source_manual_table", config)
        assert rows == []
