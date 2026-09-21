export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  const [{ NodeSDK }, { OTLPTraceExporter }] = await Promise.all([
    import("@opentelemetry/sdk-node"),
    import("@opentelemetry/exporter-trace-otlp-http"),
  ]);
  const globalKey = "__helpkeyOpenTelemetry" as const;
  const state = globalThis as typeof globalThis & { [globalKey]?: InstanceType<typeof NodeSDK> };
  if (state[globalKey]) return;
  const sdk = new NodeSDK({ traceExporter: new OTLPTraceExporter({ url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, "")}/v1/traces` }), serviceName: process.env.OTEL_SERVICE_NAME ?? "helpkey-web" });
  sdk.start();
  state[globalKey] = sdk;
}
