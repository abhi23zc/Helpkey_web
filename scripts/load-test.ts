import autocannon from "autocannon";
const url = process.env.LOAD_TEST_URL ?? "http://127.0.0.1:3000/api/home";
const result = await autocannon({ url, connections: Number(process.env.LOAD_TEST_CONNECTIONS ?? 20), duration: Number(process.env.LOAD_TEST_DURATION ?? 30), pipelining: 1 });
console.log(autocannon.printResult(result));
// autocannon exposes p90 and p97.5; gate on p97.5 so the required p95 target
// cannot pass by interpolation while the higher percentile is already slow.
if (result.latency.p97_5 > Number(process.env.LOAD_TEST_P95_MS ?? 1000) || result.errors > 0 || result.timeouts > 0) process.exitCode = 1;
