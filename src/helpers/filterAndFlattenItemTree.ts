import { TASKS_TO_MIGRATE } from "../consts";
import { ListItemNode } from "../types";

function hasOpenTask(node: ListItemNode): boolean {
  return node.task !== undefined && TASKS_TO_MIGRATE.includes(node.task);
}

export function filterAndFlattenItemTree(
  nodes: ListItemNode[]
): ListItemNode[] {
  const filteredNodes: ListItemNode[] = [];

  function filterBranch(node: ListItemNode): boolean {
    if (hasOpenTask(node)) {
      return true;
    }

    if (node.children) {
      const openTaskChildren = node.children.filter(filterBranch);
      if (openTaskChildren.length > 0) {
        node.children = openTaskChildren;
        return true;
      }
    }

    return false;
  }

  nodes.forEach((node) => {
    if (filterBranch(node)) {
      filteredNodes.push(node);
    }
  });

  const flattenedNodes: ListItemNode[] = [];

  function flatten(node: ListItemNode): void {
    flattenedNodes.push(node);
    if (node.children) {
      node.children.forEach(flatten);
    }
  }

  filteredNodes.forEach(flatten);
  flattenedNodes.sort((a, b) => a.id - b.id);

  return flattenedNodes;
}
