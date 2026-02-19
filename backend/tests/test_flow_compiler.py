import pytest

from app.services.flow_compiler import compile_flow, CompileError, ExecutionPlan, ExecutionStep


# --- Test helpers ---

def _node(id: str, kind: str, config: dict | None = None) -> dict:
    return {"id": id, "data": {"kind": kind, "config": config or {}}}


def _edge(id: str, source: str, target: str, source_handle: str | None = None) -> dict:
    e = {"id": id, "source": source, "target": target}
    if source_handle:
        e["sourceHandle"] = source_handle
    return e


# --- Layer 1: Compiler unit tests ---

class TestLinearFlow:
    """trigger -> source -> sms -> end"""

    def test_produces_correct_step_order(self):
        nodes = [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table", {"sample_csv": "name,phone\nRam,+977"}),
            _node("sms1", "agent_sms", {"message": "Hello {{name}}"}),
            _node("e1", "end_success"),
        ]
        edges = [
            _edge("e1", "t1", "s1"),
            _edge("e2", "s1", "sms1"),
            _edge("e3", "sms1", "e1"),
        ]
        plan = compile_flow(nodes, edges)

        assert isinstance(plan, ExecutionPlan)
        assert plan.trigger_node_id == "t1"
        assert plan.source_node_id == "s1"
        kinds = [s.node_kind for s in plan.steps]
        assert kinds == ["trigger_manual", "source_manual_table", "agent_sms", "end_success"]

    def test_step_outputs_link_correctly(self):
        nodes = [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table"),
            _node("e1", "end_success"),
        ]
        edges = [_edge("e1", "t1", "s1"), _edge("e2", "s1", "e1")]
        plan = compile_flow(nodes, edges)

        t_step = plan.steps[0]
        s_step = plan.steps[1]
        assert t_step.outputs == {"default": "s1"}
        assert s_step.inputs == {"default": "t1"}


class TestConditionBranch:
    """source -> condition -> [sms (true), voice (false)] -> end"""

    def test_condition_splits_to_two_targets(self):
        nodes = [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table"),
            _node("c1", "condition", {"field": "age", "operator": ">", "value": "30"}),
            _node("sms1", "agent_sms"),
            _node("v1", "agent_voice"),
            _node("e1", "end_success"),
        ]
        edges = [
            _edge("e1", "t1", "s1"),
            _edge("e2", "s1", "c1"),
            _edge("e3", "c1", "sms1", "true"),
            _edge("e4", "c1", "v1", "false"),
            _edge("e5", "sms1", "e1"),
            _edge("e6", "v1", "e1"),
        ]
        plan = compile_flow(nodes, edges)

        c_step = next(s for s in plan.steps if s.node_id == "c1")
        assert c_step.outputs == {"true": "sms1", "false": "v1"}
        assert "c1" in plan.branch_points
        assert set(plan.branch_points["c1"]) == {"sms1", "v1"}


class TestValidationBranch:
    """source -> validation -> [sms (valid), end_fail (invalid)]"""

    def test_validation_splits_valid_invalid(self):
        nodes = [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table"),
            _node("v1", "validation", {"required_columns": "name,phone"}),
            _node("sms1", "agent_sms"),
            _node("f1", "end_failure"),
        ]
        edges = [
            _edge("e1", "t1", "s1"),
            _edge("e2", "s1", "v1"),
            _edge("e3", "v1", "sms1", "valid"),
            _edge("e4", "v1", "f1", "invalid"),
        ]
        plan = compile_flow(nodes, edges)

        v_step = next(s for s in plan.steps if s.node_id == "v1")
        assert v_step.outputs == {"valid": "sms1", "invalid": "f1"}


class TestCompilerErrors:

    def test_rejects_no_trigger(self):
        nodes = [_node("s1", "source_manual_table"), _node("e1", "end_success")]
        edges = [_edge("e1", "s1", "e1")]
        with pytest.raises(CompileError, match="trigger"):
            compile_flow(nodes, edges)

    def test_rejects_orphan_node(self):
        nodes = [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table"),
            _node("e1", "end_success"),
            _node("orphan", "agent_sms"),  # not connected
        ]
        edges = [_edge("e1", "t1", "s1"), _edge("e2", "s1", "e1")]
        with pytest.raises(CompileError, match="unreachable"):
            compile_flow(nodes, edges)

    def test_rejects_no_end_node(self):
        nodes = [
            _node("t1", "trigger_manual"),
            _node("s1", "source_manual_table"),
            _node("sms1", "agent_sms"),
        ]
        edges = [_edge("e1", "t1", "s1"), _edge("e2", "s1", "sms1")]
        with pytest.raises(CompileError, match="end"):
            compile_flow(nodes, edges)

    def test_rejects_cycle(self):
        nodes = [
            _node("t1", "trigger_manual"),
            _node("a", "agent_sms"),
            _node("b", "agent_sms"),
            _node("e1", "end_success"),
        ]
        edges = [
            _edge("e1", "t1", "a"),
            _edge("e2", "a", "b"),
            _edge("e3", "b", "a"),  # cycle
            _edge("e4", "b", "e1"),
        ]
        with pytest.raises(CompileError, match="cycle"):
            compile_flow(nodes, edges)

    def test_rejects_dangling_edge_target(self):
        nodes = [_node("t1", "trigger_manual"), _node("e1", "end_success")]
        edges = [_edge("e1", "t1", "ghost")]
        with pytest.raises(CompileError, match="unknown"):
            compile_flow(nodes, edges)
