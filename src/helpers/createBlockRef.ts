// Generate a random ref for a block.
// It is a 6 character hexadecimal string.
export function createBlockRef(): string {
  return Math.random().toString(16).slice(2, 8);
}
