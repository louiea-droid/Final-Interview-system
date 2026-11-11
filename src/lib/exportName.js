/** The exported picture's name, by the local date: board-2026-11-10.png. */
export function exportFileName(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `board-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.png`;
}
