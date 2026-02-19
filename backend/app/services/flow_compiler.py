from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field


class CompileError(Exception):
    pass


@dataclass
class ExecutionStep:
    node_id: str
    node_kind: str
    config: dict
    inputs: dict[str, str] = field(default_factory=dict)   # handle -> source_node_id
    outputs: dict[str, str] = field(default_factory=dict)  # handle -> target_node_id


@dataclass
class ExecutionPlan:
    steps: list[ExecutionStep]
    trigger_node_id: str
    source_node_id: str
    branch_points: dict[str, list[str]]  # node_id -> [target_ids]


_BRANCHING_KINDS = {"condition", "validation"}
_SOURCE_KINDS = {
    "source_manual_table", "source_csv", "source_xlsx",
    "source_url_json", "source_url_csv", "source_numbers",
    "source_google_contacts", "source_file",
}


def compile_flow(nodes: list[dict], edges: list[dict]) -> ExecutionPlan:
    node_map: dict[str, dict] = {}
    for n in nodes:
        node_map[n["id"]] = n

    # Find trigger
    triggers = [n for n in nodes if n["data"]["kind"].startswith("trigger_")]
    if not triggers:
        raise CompileError("Flow must contain at least one trigger node.")
    trigger = triggers[0]

    # Find end nodes
    ends = [n for n in nodes if n["data"]["kind"] in ("end_success", "end_failure")]
    if not ends:
        raise CompileError("Flow must contain at least one end node.")

    # Build adjacency: source_id -> [(target_id, source_handle)]
    adj: dict[str, list[tuple[str, str | None]]] = defaultdict(list)
    # Build reverse adjacency: target_id -> [(source_id, source_handle)]
    rev_adj: dict[str, list[tuple[str, str | None]]] = defaultdict(list)

    for e in edges:
        src = e["source"]
        tgt = e["target"]
        handle = e.get("sourceHandle")
        adj[src].append((tgt, handle))
        rev_adj[tgt].append((src, handle))

    # BFS from trigger to find reachable nodes
    reachable: set[str] = set()
    queue: deque[str] = deque([trigger["id"]])
    while queue:
        nid = queue.popleft()
        if nid in reachable:
            continue
        reachable.add(nid)
        for tgt, _ in adj.get(nid, []):
            queue.append(tgt)

    # Check for orphans
    unreachable = set(node_map.keys()) - reachable
    if unreachable:
        names = ", ".join(unreachable)
        raise CompileError(f"Nodes are unreachable from trigger: {names}")

    # Topological sort (Kahn's algorithm)
    in_degree: dict[str, int] = {nid: 0 for nid in reachable}
    for nid in reachable:
        for tgt, _ in adj.get(nid, []):
            if tgt in reachable:
                in_degree[tgt] = in_degree.get(tgt, 0) + 1

    topo_queue: deque[str] = deque(nid for nid, deg in in_degree.items() if deg == 0)
    sorted_ids: list[str] = []
    while topo_queue:
        nid = topo_queue.popleft()
        sorted_ids.append(nid)
        for tgt, _ in adj.get(nid, []):
            if tgt in reachable:
                in_degree[tgt] -= 1
                if in_degree[tgt] == 0:
                    topo_queue.append(tgt)

    # Build steps
    steps: list[ExecutionStep] = []
    branch_points: dict[str, list[str]] = {}

    for nid in sorted_ids:
        n = node_map[nid]
        kind = n["data"]["kind"]
        config = n["data"].get("config", {})

        # Resolve outputs
        outputs: dict[str, str] = {}
        targets = adj.get(nid, [])
        if kind in _BRANCHING_KINDS:
            for tgt, handle in targets:
                if handle:
                    outputs[handle] = tgt
                else:
                    outputs.setdefault("default", tgt)
            if len(targets) > 1:
                branch_points[nid] = [tgt for tgt, _ in targets]
        else:
            if len(targets) == 1:
                outputs["default"] = targets[0][0]
            elif len(targets) > 1:
                for i, (tgt, handle) in enumerate(targets):
                    outputs[handle or f"path_{i}"] = tgt

        # Resolve inputs
        inputs: dict[str, str] = {}
        sources = rev_adj.get(nid, [])
        if len(sources) == 1:
            inputs["default"] = sources[0][0]
        elif len(sources) > 1:
            for src, handle in sources:
                inputs[handle or "default"] = src

        steps.append(ExecutionStep(
            node_id=nid,
            node_kind=kind,
            config=config,
            inputs=inputs,
            outputs=outputs,
        ))

    # Find source node
    source_node_id = ""
    for s in steps:
        if s.node_kind in _SOURCE_KINDS:
            source_node_id = s.node_id
            break

    return ExecutionPlan(
        steps=steps,
        trigger_node_id=trigger["id"],
        source_node_id=source_node_id,
        branch_points=branch_points,
    )
