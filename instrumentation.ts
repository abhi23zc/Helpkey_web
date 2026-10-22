export async function register() {
  // Keep Node-only telemetry dependencies out of the Edge instrumentation graph.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNodeTelemetry } = await import("./instrumentation-node");
    await registerNodeTelemetry();
  }
}
