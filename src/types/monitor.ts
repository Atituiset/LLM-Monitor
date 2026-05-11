export type InstanceType = "vLLM" | "SGLang";

export interface LLMInstance {
  id: string;
  name: string;
  url: string;
  type: InstanceType;
  status: "healthy" | "unhealthy" | "checking" | "unknown";
  metricsPort?: number;
  models?: string[];
  headers?: Record<string, string>;
}

export interface MetricPoint {
  timestamp: number;
  tps: number;
  tokensPerSec: number;
  latency: number;
  queueLength: number;
  gpuUsage: number;
  kvCacheUsage: number;
  // Historical / Detail Metrics
  totalRequests?: number;
  totalPromptTokens?: number;
  totalGenTokens?: number;
  avgTtft?: number;
  avgE2e?: number;
  rpm?: number;
  tpm?: number;
  // Nginx / Gateway Metrics
  nginxActive?: number;
  nginxRequests?: number;
}

export interface MonitorState {
  instances: LLMInstance[];
  selectedInstanceId: string | null;
}
