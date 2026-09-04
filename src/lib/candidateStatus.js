const STATUS_PILL_CLASSES = {
  Scheduled: 'candidate-status scheduled',
  Waiting: 'candidate-status waiting',
  'In Progress': 'candidate-status progress',
  Completed: 'candidate-status completed',
  Cancelled: 'candidate-status cancelled',
};

/*
 * CSS classes for the read-only status pill shown in the candidate
 * details modal and the Records directory rows.
 */
export function getStatusPillClass(status) {
  return STATUS_PILL_CLASSES[status] ?? 'candidate-status';
}
