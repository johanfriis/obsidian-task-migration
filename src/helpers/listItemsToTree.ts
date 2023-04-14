import { ListItem, ListItemNode } from "../types";

export function listItemsToTree(listItems: ListItem[]): ListItemNode[] {
  const nodeMap = new Map<number, ListItemNode>();

  listItems.forEach((item) => {
    const node: ListItemNode = {
      ...item,
      children: [],
      id: item.position.start.line,
    };
    nodeMap.set(node.id, node);
  });

  const tree: ListItemNode[] = [];

  nodeMap.forEach((node, id) => {
    if (node.parent !== -4) {
      const parent = nodeMap.get(node.parent);
      if (parent) {
        parent.children?.push(node);
      }
    } else {
      const baseNode = nodeMap.get(id);
      if (baseNode) {
        tree.push(baseNode);
      }
    }
  });

  return tree;
}
