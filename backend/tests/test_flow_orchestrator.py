import uuid

import pytest

from app.models.flow_definition import FlowDefinition
from app.models.flow_run import FlowRun, FlowStepResult
from app.services.flow_orchestrator import run_flow


def _node(id, kind, config=None):
    return {"id": id, "data": {"kind": kind, "config": config or {}}}


def _edge(id, source, target, source_handle=None):
    e = {"id": id, "source": source, "target": target}
    if source_handle:
        e["sourceHandle"] = source_handle
    return e


def _make_flow(db, nodes, edges, status="active"):
    flow = FlowDefinition(
        user_id=uuid.uuid4(),
        name="Test",
        nodes=nodes,
        edges=edges,
        status=status,
    )
    db.add(flow)
    db.commit()
    return flow


def _make_run(db, flow, status="pending"):
    run = FlowRun(flow_id=flow.id, status=status, contact_rows=[])
    db.add(run)
    db.commit()
    return run


class TestLinearExecution:
    """trigger -> source(2 rows) -> sms -> end"""

    def test_completes_with_correct_step_count(self, db):
        flow = _make_flow(db, [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table", {"sample_csv": "name,phone\nRam,+977\nSita,+1"}),
            _node("sms1", "agent_sms", {"message": "Hi {{name}}"}),
            _node("e1", "end_success"),
        ], [
            _edge("e1", "t1", "s1"),
            _edge("e2", "s1", "sms1"),
            _edge("e3", "sms1", "e1"),
        ])
        run = _make_run(db, flow)

        run_flow(run.id, db)
        db.refresh(run)

        assert run.status == "completed"
        steps = db.query(FlowStepResult).filter_by(flow_run_id=run.id).all()
        assert len(steps) == 4  # trigger, source, sms, end

    def test_source_step_records_row_count(self, db):
        flow = _make_flow(db, [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table", {"sample_csv": "name,phone\nRam,+977\nSita,+1"}),
            _node("e1", "end_success"),
        ], [
            _edge("e1", "t1", "s1"),
            _edge("e2", "s1", "e1"),
        ])
        run = _make_run(db, flow)

        run_flow(run.id, db)

        source_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="s1").first()
        assert source_step.output_row_count == 2


class TestValidationBranching:
    """source -> validation(valid->sms, invalid->end_fail)"""

    def test_valid_rows_reach_sms_invalid_reach_end(self, db):
        flow = _make_flow(db, [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table", {"sample_csv": "name,phone\nRam,+977\nBad,"}),
            _node("v1", "validation", {"required_columns": "name,phone"}),
            _node("sms1", "agent_sms", {"message": "Hi"}),
            _node("f1", "end_failure"),
        ], [
            _edge("e1", "t1", "s1"),
            _edge("e2", "s1", "v1"),
            _edge("e3", "v1", "sms1", "valid"),
            _edge("e4", "v1", "f1", "invalid"),
        ])
        run = _make_run(db, flow)

        run_flow(run.id, db)
        db.refresh(run)

        v_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="v1").first()
        assert len(v_step.rows_true) == 1   # Ram has phone
        assert len(v_step.rows_false) == 1  # Bad has empty phone

        sms_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="sms1").first()
        assert sms_step.input_row_count == 1  # only valid rows

    def test_all_invalid_skips_sms(self, db):
        flow = _make_flow(db, [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table", {"sample_csv": "name,phone\nBad1,\nBad2,"}),
            _node("v1", "validation", {"required_columns": "name,phone"}),
            _node("sms1", "agent_sms", {"message": "Hi"}),
            _node("f1", "end_failure"),
        ], [
            _edge("e1", "t1", "s1"),
            _edge("e2", "s1", "v1"),
            _edge("e3", "v1", "sms1", "valid"),
            _edge("e4", "v1", "f1", "invalid"),
        ])
        run = _make_run(db, flow)

        run_flow(run.id, db)

        sms_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="sms1").first()
        assert sms_step.input_row_count == 0
        assert sms_step.status == "skipped"


class TestConditionBranching:
    """source -> condition(age>30) -> [sms(true), voice(false)] -> end"""

    def test_rows_split_by_condition(self, db):
        flow = _make_flow(db, [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table", {"sample_csv": "name,phone,age\nRam,+977,34\nSita,+1,28\nHari,+977,45"}),
            _node("c1", "condition", {"field": "age", "operator": ">", "value": "30"}),
            _node("sms1", "agent_sms", {"message": "Old"}),
            _node("v1", "agent_voice", {"script": "Young"}),
            _node("e1", "end_success"),
        ], [
            _edge("e1", "t1", "s1"),
            _edge("e2", "s1", "c1"),
            _edge("e3", "c1", "sms1", "true"),
            _edge("e4", "c1", "v1", "false"),
            _edge("e5", "sms1", "e1"),
            _edge("e6", "v1", "e1"),
        ])
        run = _make_run(db, flow)

        run_flow(run.id, db)

        sms_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="sms1").first()
        voice_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="v1").first()
        assert sms_step.input_row_count == 2   # Ram + Hari
        assert voice_step.input_row_count == 1  # Sita


class TestChainedFiltering:
    """source -> validation -> condition -> sms -> end"""

    def test_validation_then_condition(self, db):
        csv_data = "name,phone,age\nRam,+977,34\nBad,,28\nSita,+1,25\nHari,+977,45"
        flow = _make_flow(db, [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table", {"sample_csv": csv_data}),
            _node("v1", "validation", {"required_columns": "name,phone"}),
            _node("c1", "condition", {"field": "age", "operator": ">", "value": "30"}),
            _node("sms1", "agent_sms", {"message": "Hi"}),
            _node("sms2", "agent_sms", {"message": "Lo"}),
            _node("f1", "end_failure"),
            _node("e1", "end_success"),
        ], [
            _edge("e1", "t1", "s1"),
            _edge("e2", "s1", "v1"),
            _edge("e3", "v1", "c1", "valid"),
            _edge("e4", "v1", "f1", "invalid"),
            _edge("e5", "c1", "sms1", "true"),
            _edge("e6", "c1", "sms2", "false"),
            _edge("e7", "sms1", "e1"),
            _edge("e8", "sms2", "e1"),
        ])
        run = _make_run(db, flow)

        run_flow(run.id, db)

        # Bad is filtered by validation (no phone), 3 remain
        v_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="v1").first()
        assert len(v_step.rows_true) == 3

        # Of the 3 valid, Ram(34) and Hari(45) pass age>30, Sita(25) fails
        sms1_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="sms1").first()
        sms2_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="sms2").first()
        assert sms1_step.input_row_count == 2  # Ram + Hari
        assert sms2_step.input_row_count == 1  # Sita


class TestDeduplicateThenSms:
    """source -> deduplicate -> sms -> end (no double-messaging)"""

    def test_dedup_prevents_double_message(self, db):
        flow = _make_flow(db, [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table", {"sample_csv": "name,phone\nRam,+977\nSita,+1\nRam2,+977"}),
            _node("d1", "deduplicate", {"dedup_column": "phone", "keep": "first"}),
            _node("sms1", "agent_sms", {"message": "Hi"}),
            _node("e1", "end_success"),
        ], [
            _edge("e1", "t1", "s1"),
            _edge("e2", "s1", "d1"),
            _edge("e3", "d1", "sms1"),
            _edge("e4", "sms1", "e1"),
        ])
        run = _make_run(db, flow)

        run_flow(run.id, db)

        sms_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="sms1").first()
        assert sms_step.input_row_count == 2  # Ram + Sita (duplicate removed)


class TestNormalizeThenValidation:
    """source -> normalize -> validation -> sms (normalized phone passes validation)"""

    def test_normalize_helps_pass_validation(self, db):
        flow = _make_flow(db, [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table", {"sample_csv": "name,phone\nRam,9800000000"}),
            _node("n1", "normalize_phone", {"phone_column": "phone", "country_code": "+977", "format": "e164"}),
            _node("v1", "validation", {"required_columns": "name,phone"}),
            _node("sms1", "agent_sms", {"message": "Hi"}),
            _node("f1", "end_failure"),
        ], [
            _edge("e1", "t1", "s1"),
            _edge("e2", "s1", "n1"),
            _edge("e3", "n1", "v1"),
            _edge("e4", "v1", "sms1", "valid"),
            _edge("e5", "v1", "f1", "invalid"),
        ])
        run = _make_run(db, flow)

        run_flow(run.id, db)

        sms_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="sms1").first()
        assert sms_step.input_row_count == 1  # normalized phone passes


class TestCancellation:

    def test_cancel_stops_execution(self, db):
        flow = _make_flow(db, [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table", {"sample_csv": "name,phone\nRam,+977"}),
            _node("sms1", "agent_sms", {"message": "Hi"}),
            _node("e1", "end_success"),
        ], [
            _edge("e1", "t1", "s1"),
            _edge("e2", "s1", "sms1"),
            _edge("e3", "sms1", "e1"),
        ])
        run = _make_run(db, flow, status="cancelled")

        run_flow(run.id, db)
        db.refresh(run)

        assert run.status == "cancelled"
        steps = db.query(FlowStepResult).filter_by(flow_run_id=run.id).all()
        assert len(steps) == 0  # nothing executed


class TestRowCountIntegrity:
    """100 rows through a 50/50 condition -- no rows lost or duplicated"""

    def test_no_rows_lost_in_split(self, db):
        header = "name,phone,age"
        data_rows = [f"Person{i},+977{i:07d},{20 + i}" for i in range(100)]
        csv_data = header + "\n" + "\n".join(data_rows)

        flow = _make_flow(db, [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table", {"sample_csv": csv_data}),
            _node("c1", "condition", {"field": "age", "operator": ">=", "value": "70"}),
            _node("sms1", "agent_sms", {"message": "Old"}),
            _node("sms2", "agent_sms", {"message": "Young"}),
            _node("e1", "end_success"),
        ], [
            _edge("e1", "t1", "s1"),
            _edge("e2", "s1", "c1"),
            _edge("e3", "c1", "sms1", "true"),
            _edge("e4", "c1", "sms2", "false"),
            _edge("e5", "sms1", "e1"),
            _edge("e6", "sms2", "e1"),
        ])
        run = _make_run(db, flow)

        run_flow(run.id, db)

        c_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="c1").first()
        sms1_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="sms1").first()
        sms2_step = db.query(FlowStepResult).filter_by(flow_run_id=run.id, node_id="sms2").first()

        # ages 20..119, >= 70 means ages 70..119 = 50 true, ages 20..69 = 50 false
        assert sms1_step.input_row_count + sms2_step.input_row_count == 100
        assert sms1_step.input_row_count == 50
        assert sms2_step.input_row_count == 50
