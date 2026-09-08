"""
DAG validation, topological sort, and sub-graph detection for workflows.
"""

import logging
from typing import Dict, List, Set, Tuple, Optional
from collections import defaultdict, deque

from src.workflow.models import WorkflowDefinition, WorkflowNode, WorkflowEdge, NodeType

logger = logging.getLogger("curlkit.workflow.dag")


class DAGValidationError(Exception):
    """Raised when workflow graph is invalid."""
    pass


class WorkflowDAG:
    """
    Builds and analyzes the directed acyclic graph for a workflow.
    """

    def __init__(self, workflow: WorkflowDefinition):
        self.workflow = workflow
        self.node_map: Dict[str, WorkflowNode] = {n.id: n for n in workflow.nodes}
        self.adjacency: Dict[str, List[str]] = defaultdict(list)      # node → [successors]
        self.reverse_adj: Dict[str, List[str]] = defaultdict(list)    # node → [predecessors]
        self.edge_map: Dict[Tuple[str, str], WorkflowEdge] = {}

        for edge in workflow.edges:
            self.adjacency[edge.source].append(edge.target)
            self.reverse_adj[edge.target].append(edge.source)
            self.edge_map[(edge.source, edge.target)] = edge

        # Ensure all nodes appear (even isolated ones)
        for node in workflow.nodes:
            if node.id not in self.adjacency:
                self.adjacency[node.id] = []

    def validate(self) -> List[str]:
        """
        Validate the workflow DAG. Returns list of warning messages.
        Raises DAGValidationError for fatal issues.
        """
        warnings = []

        if not self.workflow.nodes:
            raise DAGValidationError("Workflow has no nodes")

        # Check all edge endpoints reference existing nodes
        node_ids = set(self.node_map.keys())
        for edge in self.workflow.edges:
            if edge.source not in node_ids:
                raise DAGValidationError(f"Edge '{edge.id}' references unknown source node '{edge.source}'")
            if edge.target not in node_ids:
                raise DAGValidationError(f"Edge '{edge.id}' references unknown target node '{edge.target}'")

        # Cycle detection
        if self._has_cycle():
            raise DAGValidationError("Workflow contains a cycle — circular dependencies are not allowed")

        # Check for disconnected nodes (warning, not error)
        roots = self.find_roots()
        reachable = set()
        for root in roots:
            self._dfs_collect(root, reachable)
        unreachable = node_ids - reachable
        if unreachable:
            warnings.append(f"Disconnected nodes (not reachable from any root): {unreachable}")

        # Branch nodes should have at least one outgoing edge
        for node in self.workflow.nodes:
            if node.type == NodeType.BRANCH.value:
                if len(self.adjacency.get(node.id, [])) < 1:
                    warnings.append(f"Branch node '{node.id}' has no outgoing edges")

        return warnings

    def _has_cycle(self) -> bool:
        """Detect cycles using DFS with coloring (white/grey/black)."""
        WHITE, GREY, BLACK = 0, 1, 2
        color = {nid: WHITE for nid in self.node_map}

        def dfs(node_id: str) -> bool:
            color[node_id] = GREY
            for neighbor in self.adjacency.get(node_id, []):
                if color.get(neighbor) == GREY:
                    return True  # back edge → cycle
                if color.get(neighbor) == WHITE:
                    if dfs(neighbor):
                        return True
            color[node_id] = BLACK
            return False

        for nid in self.node_map:
            if color[nid] == WHITE:
                if dfs(nid):
                    return True
        return False

    def topological_sort(self) -> List[str]:
        """
        Kahn's algorithm — returns node IDs in execution order.
        Raises DAGValidationError if the graph has a cycle.
        """
        in_degree = {nid: 0 for nid in self.node_map}
        for nid, successors in self.adjacency.items():
            for s in successors:
                in_degree[s] = in_degree.get(s, 0) + 1

        queue = deque([nid for nid, deg in in_degree.items() if deg == 0])
        order = []

        while queue:
            node_id = queue.popleft()
            order.append(node_id)
            for successor in self.adjacency.get(node_id, []):
                in_degree[successor] -= 1
                if in_degree[successor] == 0:
                    queue.append(successor)

        if len(order) != len(self.node_map):
            raise DAGValidationError("Workflow contains a cycle — topological sort failed")

        return order

    def find_roots(self) -> List[str]:
        """Find all root nodes (nodes with no incoming edges)."""
        has_incoming = set()
        for edge in self.workflow.edges:
            has_incoming.add(edge.target)
        return [n.id for n in self.workflow.nodes if n.id not in has_incoming]

    def get_predecessors(self, node_id: str) -> List[str]:
        """Get all direct predecessor node IDs."""
        return self.reverse_adj.get(node_id, [])

    def get_successors(self, node_id: str) -> List[str]:
        """Get all direct successor node IDs."""
        return self.adjacency.get(node_id, [])

    def get_loop_subgraph(self, loop_node_id: str) -> Set[str]:
        """
        Find all nodes that are downstream of a Loop node and only
        reachable through that Loop node. These form the loop's body.
        """
        all_descendants = set()
        self._dfs_collect(loop_node_id, all_descendants)
        all_descendants.discard(loop_node_id)
        return all_descendants

    def get_branch_paths(self, branch_node_id: str) -> Dict[str, Set[str]]:
        """
        For a Branch node, find the node sets reachable from each output handle.
        Returns {"true": {node_ids...}, "false": {node_ids...}}.
        """
        paths: Dict[str, Set[str]] = {}
        for edge in self.workflow.edges:
            if edge.source == branch_node_id:
                handle = edge.source_handle
                descendants = set()
                self._dfs_collect(edge.target, descendants)
                paths[handle] = descendants
        return paths

    def get_edges_from(self, node_id: str) -> List[WorkflowEdge]:
        """Get all edges originating from a node."""
        return [e for e in self.workflow.edges if e.source == node_id]

    def get_edges_to(self, node_id: str) -> List[WorkflowEdge]:
        """Get all edges targeting a node."""
        return [e for e in self.workflow.edges if e.target == node_id]

    def _dfs_collect(self, start: str, visited: Set[str]):
        """Collect all nodes reachable from start via DFS."""
        stack = [start]
        while stack:
            node = stack.pop()
            if node in visited:
                continue
            visited.add(node)
            for successor in self.adjacency.get(node, []):
                if successor not in visited:
                    stack.append(successor)
