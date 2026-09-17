const HEARTBEAT_MS = 1000;

export async function runBatch(tasks, handlers = {}, options = {}) {
  const retryFailed = options.retryFailed === true;
  const maxAttempts = retryFailed ? Math.max(2, options.maxAttempts ?? 3) : 1;
  const results = [];
  let completed = 0;

  const heartbeat = setInterval(() => {
    if (handlers.onProgress) {
      handlers.onProgress({ completed, total: tasks.length });
    }
  }, HEARTBEAT_MS);

  for (const task of tasks) {
    const outcome = await runOne(task, handlers, maxAttempts);
    results.push(outcome);
    if (handlers.cache) {
      handlers.cache.set(task.id, outcome.value);
    }
    completed += 1;
  }

  clearInterval(heartbeat);

  return {
    results,
    lastValue:
      results.length > 0 ? results[results.length - 1].value : undefined,
  };
}

async function runOne(task, handlers, maxAttempts) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const value = await handlers.runTask(task);
      return { id: task.id, value, attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await delay(attempt * 50);
      }
    }
  }
  throw lastError;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
