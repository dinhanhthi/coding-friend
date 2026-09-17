export async function runBatch(tasks, handlers = {}) {
  const results = [];
  for (const task of tasks) {
    const value = await handlers.runTask(task);
    results.push({ id: task.id, value, attempts: 1 });
  }
  return {
    results,
    lastValue:
      results.length > 0 ? results[results.length - 1].value : undefined,
  };
}
