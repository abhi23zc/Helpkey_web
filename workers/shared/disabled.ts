/** Keep an intentionally disabled Compose service from entering a restart loop. */
export function disabledWorker(name: string) {
  console.info(JSON.stringify({ event: "worker.disabled", worker: name }));
  const timer = setInterval(() => {}, 86400000);
  const stop = () => { clearInterval(timer); process.exit(0); };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
}
