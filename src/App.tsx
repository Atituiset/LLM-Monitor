import { useState, useEffect } from 'react';
import { 
  Activity, 
  Server, 
  Plus, 
  AlertCircle, 
  CheckCircle2, 
  Cpu, 
  Database, 
  TrendingUp,
  Brain,
  Search,
  Settings,
  ChevronRight,
  ShieldAlert,
  Terminal,
  Zap,
  Users,
  LogOut,
  Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { cn } from '@/src/lib/utils';
import { LLMInstance, MetricPoint, InstanceType } from './types/monitor';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';

// --- State Management ---
// Start with empty metrics to avoid interference with real data
const generateInitialMetrics = (): MetricPoint[] => [];

interface AuthUser {
  id: number;
  username: string;
  role: number;
}

// --- Main App Component ---
export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [instances, setInstances] = useState<LLMInstance[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricPoint[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'5M' | '1H'>('5M');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeView, setActiveView] = useState<'dashboard' | 'users'>('dashboard');
  const [externalUsers, setExternalUsers] = useState<any[]>([]);

  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');

  // AI Configuration State
  const [aiConfig, setAiConfig] = useState(() => {
    const saved = localStorage.getItem('llm_ai_config');
    return saved ? JSON.parse(saved) : {
      provider: 'gemini', // 'gemini' | 'openai'
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4o',
      headers: {} as Record<string, string>
    };
  });

  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);
  const [aiHeaderKey, setAiHeaderKey] = useState('');
  const [aiHeaderValue, setAiHeaderValue] = useState('');

  // Real-time alert logs
  const [logs, setLogs] = useState<{time: string, type: string, msg: string, icon: any, color: string}[]>([]);

  useEffect(() => {
    localStorage.setItem('llm_ai_config', JSON.stringify(aiConfig));
  }, [aiConfig]);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        fetchInstances();
      }
    } catch (err) {
      console.error("Auth check failed");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        fetchInstances();
      } else {
        const err = await res.json();
        setLoginError(err.error || 'Login failed');
      }
    } catch (err) {
      setLoginError('Server connection error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setInstances([]);
    setSelectedId(null);
  };

  // New Instance Form State
  const [newInst, setNewInst] = useState({ name: '', url: '', type: 'vLLM' as InstanceType, headers: {} as Record<string, string> });
  const [editInst, setEditInst] = useState<LLMInstance | null>(null);

  const [headerKey, setHeaderKey] = useState('');
  const [headerValue, setHeaderValue] = useState('');

  // Sync localStorage whenever instances change
  useEffect(() => {
    localStorage.setItem('llm_instances', JSON.stringify(instances));
  }, [instances]);

  // Load instances from DB on mount and merge
  useEffect(() => {
    if (user) {
      fetchInstances();
    }
  }, [user]);

  const fetchInstances = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/instances');
      if (res.ok) {
        const dbData = await res.json();
        if (dbData && dbData.length > 0) {
          setInstances(dbData);
          if (!selectedId) setSelectedId(dbData[0].id);
        }
      }
    } catch (err) {
      console.warn("Database sync unavailable, using local storage.");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setExternalUsers(data);
      }
    } catch (err) {
      console.error("Failed to fetch users from external database");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (activeView === 'users') {
      fetchUsers();
    }
  }, [activeView]);

  const handleAddInstance = async () => {
    if (!newInst.name || !newInst.url) return;
    
    // Auto-add current pending header if any
    let finalHeaders = { ...(newInst.headers || {}) };
    const k = headerKey.trim();
    const v = headerValue.trim();
    if (k && v) {
      finalHeaders[k] = v;
    }

    const item: LLMInstance = {
      id: Math.random().toString(36).substr(2, 9),
      name: newInst.name,
      url: newInst.url,
      type: newInst.type,
      status: 'healthy',
      headers: finalHeaders
    };
    
    setIsLoading(true);
    // Update Local State immediately
    const updated = [...instances, item];
    setInstances(updated);
    setSelectedId(item.id);
    
    // Reset Modal State
    setHeaderKey('');
    setHeaderValue('');
    setNewInst({ name: '', url: '', type: 'vLLM', headers: {} });
    setIsAddModalOpen(false);

    // Sync to DB
    try {
      const res = await fetch('/api/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      if (res.ok) {
        console.log("New instance registered in DB");
        fetchInstances(); // Full refresh to ensure DB sync
      }
    } catch (err) {
      console.warn("DB save failed, fallback to local storage.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateInstance = async () => {
    if (!editInst) return;
    
    // Auto-add current pending header if any
    let finalHeaders = { ...(editInst.headers || {}) };
    const k = headerKey.trim();
    const v = headerValue.trim();
    if (k && v) {
      finalHeaders[k] = v;
    }

    const updatedInst = { ...editInst, headers: finalHeaders };

    setIsLoading(true);
    // Update Local State immediately
    const updated = instances.map(inst => inst.id === updatedInst.id ? updatedInst : inst);
    setInstances(updated);
    
    // Reset Modal State
    setHeaderKey('');
    setHeaderValue('');
    setIsEditModalOpen(false);
    
    // Sync to DB
    try {
      const res = await fetch(`/api/instances/${updatedInst.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedInst)
      });
      if (res.ok) {
        console.log("Configuration updated in DB");
        fetchInstances(); // Full refresh
      } else {
        console.error("DB Update returned error:", res.status);
      }
    } catch (err) {
      console.warn("DB update failed, using local storage fallback.");
    } finally {
      setIsLoading(false);
      setEditInst(null);
    }
  };

  const startEditing = (inst: LLMInstance) => {
    setEditInst({ ...inst });
    setIsEditModalOpen(true);
  };

  const removeInstance = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Update Local State
    const filtered = instances.filter(i => i.id !== id);
    setInstances(filtered);
    if (selectedId === id) {
      setSelectedId(filtered.length > 0 ? filtered[0].id : null);
    }

    // Sync to DB
    try {
      await fetch(`/api/instances/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.warn("DB delete failed.");
    }
  };

  const [isChecking, setIsChecking] = useState(false);

  const checkConnectivity = async (inst: any) => {
    setIsChecking(true);
    try {
      // Include pending header if any
      let finalHeaders = { ...(inst.headers || {}) };
      const k = headerKey.trim();
      const v = headerValue.trim();
      if (k && v) {
        finalHeaders[k] = v;
      }
      
      console.log(`[Connectivity] Testing ${inst.url} with headers:`, JSON.stringify(finalHeaders));
      
      // Use health check proxy with POST
      const res = await fetch('/api/proxy/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: inst.url + '/health', headers: finalHeaders })
      });
      const data = await res.json();
      
      if (data.status === 'healthy') {
        alert("✅ Connected successfully!");
      } else {
        // Fallback check to /v1/models if /health fails
        const res2 = await fetch('/api/proxy/health', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: inst.url + '/v1/models', headers: finalHeaders })
        });
        const data2 = await res2.json();
        if (data2.status === 'healthy') {
          alert("✅ Connected successfully (via models endpoint)!");
        } else {
          alert(`❌ Connection failed: ${data.error || 'Unknown error'} (Code: ${data.code || 'N/A'})`);
        }
      }
    } catch (err: any) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setIsChecking(false);
    }
  };

  const selectedInstance = instances.find(i => i.id === selectedId);

  // --- Prometheus Parser Utility ---
  const parsePrometheus = (text: string) => {
    const results: Record<string, number> = {};
    const lines = text.split('\n');
    lines.forEach(line => {
      // Skip comments and empty lines
      if (line.startsWith('#') || !line.trim()) return;
      
      // Better split: Find the last space which separates the numeric value from the metric name+labels
      const lastSpaceIndex = line.lastIndexOf(' ');
      if (lastSpaceIndex === -1) return;
      
      const namePart = line.substring(0, lastSpaceIndex).trim();
      const valuePart = line.substring(lastSpaceIndex + 1).trim();
      
      // Extract numeric value
      const val = parseFloat(valuePart);
      if (isNaN(val)) return;

      // Extract base metric name (ignore labels)
      const name = namePart.split('{')[0];
      
      // If we have multiple entries for the same metric (different labels),
      // we sum them for keys like tokens_per_sec, or take the latest for status keys.
      if (results[name] !== undefined) {
         if (name.includes('tokens') || name.includes('num_requests')) {
           results[name] += val;
         } else {
           results[name] = val; // Overwrite with latest instance for single-gauge values
         }
      } else {
        results[name] = val;
      }
    });

    // Debug: Log all sglang keys if we seem to be getting nothing
    if (Object.keys(results).some(k => k.includes('sglang'))) {
      const sglangKeys = Object.keys(results).filter(k => k.includes('sglang'));
      if (sglangKeys.length > 0 && Math.random() > 0.8) {
        console.log('[Metrics Debug] Found SGLang keys:', sglangKeys.slice(0, 5));
      }
    }

    return results;
  };

  useEffect(() => {
    if (selectedId) {
      // Clear charts and logs when switching between real instances
      setMetrics([]); // Reset to empty context
      setLogs([]);
      setIsLoading(true);
      // Brief loading state for UI feedback
      setTimeout(() => setIsLoading(false), 300);
    }
  }, [selectedId]);

  // Periodic metrics update (Strictly Real Data)
  useEffect(() => {
    // Clear logs when switching instances
    setLogs([]);
    
    if (selectedInstance) {
      setLogs([{ 
        time: new Date().toTimeString().split(' ')[0], 
        type: 'System', 
        msg: `Connected to ${selectedInstance.name} metrics stream`, 
        icon: CheckCircle2, 
        color: 'text-emerald-500' 
      }]);
    }

    const interval = setInterval(async () => {
      if (!selectedInstance || selectedInstance.status !== 'healthy') return;

      try {
        const headers = selectedInstance.headers || {};
        const metricsUrl = `${selectedInstance.url.replace(/\/$/, '')}/metrics`;
        
        const res = await fetch('/api/proxy/metrics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: metricsUrl, headers })
        });
        
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errorMsg = errData.detail || errData.error || `HTTP ${res.status}`;
          throw new Error(errorMsg);
        }
        const text = await res.text();
        const parsed = parsePrometheus(text);

        // Debug help: Log available keys if we're hitting 0s (will show in browser console)
        if (Object.keys(parsed).length > 0 && !(window as any).__metrics_logged) {
          console.log("[Monitor] Detected Metric Keys:", Object.keys(parsed).filter(k => k.startsWith('sglang') || k.startsWith('vllm')));
          (window as any).__metrics_logged = true;
        }

        // Map and support both : and _ separators common in different vLLM/SGLang versions
        const getMetric = (keys: string[]) => {
          for (const key of keys) {
            // Try literal key
            if (parsed[key] !== undefined) return parsed[key];
            // Try underscore replacement if colon fails
            const altKey = key.replace(/:/g, '_');
            if (parsed[altKey] !== undefined) return parsed[altKey];
            // Try without prefix
            const noPrefix = key.split(':').pop() || '';
            if (parsed[noPrefix] !== undefined) return parsed[noPrefix];
          }
          return 0;
        };

        // Specialized Latency Calculation (Sum/Count average)
        const getAvgStats = () => {
          const ttftSum = getMetric(['sglang:time_to_first_token_seconds_sum']);
          const ttftCount = getMetric(['sglang:time_to_first_token_seconds_count']);
          const e2eSum = getMetric(['sglang:e2e_request_latency_seconds_sum']);
          const e2eCount = getMetric(['sglang:e2e_request_latency_seconds_count']);
          
          const ttft = ttftCount > 0 ? ttftSum / ttftCount : 0;
          const e2e = e2eCount > 0 ? e2eSum / e2eCount : 0;

          const stageSum = getMetric(['sglang:per_stage_req_latency_seconds_sum']);
          const stageCount = getMetric(['sglang:per_stage_req_latency_seconds_count']);
          
          // Use per_stage_req_latency as the primary real-time latency indicator for SGLang
          const currentLatency = stageCount > 0 ? (stageSum / stageCount) * 1000 : getMetric([
            'sglang:avg_request_latency_ms', 'sglang:avg_latency_ms', 
            'vllm:avg_request_latency_ms', 'vllm_avg_request_latency_ms'
          ]);

          return { ttft, e2e, currentLatency };
        };

        const stats = getAvgStats();

        // Improved mapping for SGLang and vLLM variations
        const tps = getMetric([
          'sglang:num_running_reqs', 'sglang:num_requests_running', 
          'sglang:num_running_requests', 'sglang:scheduler_running_requests',
          'vllm:num_requests_running', 'vllm_num_requests_running'
        ]);

        let tokensPerSec = getMetric([
          'sglang:gen_throughput', 'sglang:iteration_tokens_per_s', 
          'sglang:gen_tokens_per_s', 'sglang:generation_tokens_per_s', 
          'sglang:tokens_per_sec', 'sglang:tokens_per_sec_total', 
          'vllm:avg_generation_throughput_toks_per_s'
        ]);

        let latency = stats.e2e > 0 ? stats.e2e * 1000 : stats.currentLatency;
        
        // Final sanity check for latency scale (ensure ms)
        if (latency > 0 && latency < 5) latency *= 1000; 

        const totalRequests = getMetric([
          'sglang:num_requests_total', 'vllm:num_requests_total', 'sglang_num_requests_total'
        ]);

        const totalPromptTokens = getMetric([
          'sglang:prompt_tokens_total', 'vllm:prompt_tokens_total', 'sglang_prompt_tokens_total'
        ]);

        const totalGenTokens = getMetric([
          'sglang:generation_tokens_total', 'vllm:generation_tokens_total', 'sglang_generation_tokens_total'
        ]);

        const queueLength = getMetric([
          'sglang:num_queue_reqs', 'sglang:num_requests_waiting', 
          'vllm:num_requests_waiting', 'sglang:num_waiting_requests', 
          'sglang:num_waiting_reqs', 'sglang:scheduler_waiting_requests'
        ]);
        
        // KV Cache / GPU Cache
        let gpuUsageVal = getMetric([
          'sglang:token_usage', 'sglang:gpu_cache_usage', 
          'sglang:kv_cache_usage_percent', 'sglang:kv_cache_fill_rate', 
          'vllm:gpu_cache_usage_perc'
        ]);
        if (gpuUsageVal > 0 && gpuUsageVal <= 1) gpuUsageVal *= 100;
        
        const nginxActive = getMetric(['nginx_connections_active', 'nginx_vts_server_connections_active']);
        const nginxRequests = getMetric(['nginx_http_requests_total', 'nginx_vts_server_requests_total']);

        setMetrics(prev => {
          // Use counters to calculate tokensPerSec rate if direct gauge is missing
          let currentRate = tokensPerSec;
          if (currentRate === 0 && prev.length > 0) {
            const last = prev[prev.length - 1];
            // Support both Generation Throughput and Prompt Throughput
            const tokenDelta = totalGenTokens - (last.totalGenTokens || 0);
            const timeDelta = (Date.now() - last.timestamp) / 1000;
            
            if (timeDelta > 0.5) { 
              currentRate = Math.max(0, tokenDelta / timeDelta);
              // If generation is 0, include prompt tokens for "Total Throughput" feel
              if (currentRate === 0) {
                const pDelta = totalPromptTokens - (last.totalPromptTokens || 0);
                currentRate = Math.max(0, pDelta / timeDelta);
              }
            }
          }

          // Calculate RPM and TPM (Look back logic)
          let rpm = 0;
          let tpm = 0;
          
          if (prev.length > 0) {
            // Find a point from ~1 minute ago, or the oldest one
            const targetIndex = Math.max(0, prev.length - 12);
            const startPoint = prev[targetIndex];
            const elapsedMins = (Date.now() - startPoint.timestamp) / 60000;
            
            if (elapsedMins > 0.01) { // At least some time passed
              const reqDiff = totalRequests - (startPoint.totalRequests || 0);
              const promptDiff = totalPromptTokens - (startPoint.totalPromptTokens || 0);
              const genDiff = totalGenTokens - (startPoint.totalGenTokens || 0);
              
              // If we have enough history, use actual total diff, else extrapolate
              if (prev.length >= 12) {
                rpm = Math.max(0, reqDiff);
                tpm = Math.max(0, promptDiff + genDiff);
              } else {
                rpm = Math.max(0, reqDiff / elapsedMins);
                tpm = Math.max(0, (promptDiff + genDiff) / elapsedMins);
              }
            }
          }

          const nextPoint: MetricPoint = {
            timestamp: Date.now(),
            tps: tps,
            tokensPerSec: currentRate,
            latency: latency,
            queueLength: queueLength,
            gpuUsage: gpuUsageVal,
            kvCacheUsage: gpuUsageVal,
            totalRequests: totalRequests,
            totalPromptTokens: totalPromptTokens,
            totalGenTokens: totalGenTokens,
            avgTtft: stats.ttft,
            avgE2e: stats.e2e,
            rpm: rpm,
            tpm: tpm,
            nginxActive: nginxActive,
            nginxRequests: nginxRequests
          };

          // Generate alerts based on real-time data
          const now = new Date();
          const timeStr = now.toTimeString().split(' ')[0];
          const newAlerts: any[] = [];
          
          if (nextPoint.latency > 1500) {
            newAlerts.push({ time: timeStr, type: 'Warning', msg: `High latency detected: ${nextPoint.latency.toFixed(0)}ms`, icon: AlertCircle, color: 'text-amber-500' });
          }
          if (nextPoint.kvCacheUsage > 95) {
            newAlerts.push({ time: timeStr, type: 'Critical', msg: `KV Cache saturated: ${nextPoint.kvCacheUsage.toFixed(1)}%`, icon: ShieldAlert, color: 'text-rose-500' });
          }
          if (nextPoint.queueLength > 20) {
            newAlerts.push({ time: timeStr, type: 'Warning', msg: `Severe request queueing: ${nextPoint.queueLength} waiting`, icon: Activity, color: 'text-rose-400' });
          }

          if (newAlerts.length > 0) {
            setLogs(prev => [...newAlerts, ...prev].slice(0, 50));
          }

          // Keep enough history for 1 hour (720 points at 5s interval)
          const newMetrics = [...prev, nextPoint];
          const maxPoints = 720; 
          if (newMetrics.length > maxPoints) return newMetrics.slice(newMetrics.length - maxPoints);
          return newMetrics;
        });
      } catch (err) {
        console.error("Metrics collection error:", err);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedInstance]);

  const [isAiConfigTesting, setIsAiConfigTesting] = useState(false);
  const testAiConfig = async () => {
    setIsAiConfigTesting(true);
    try {
      if (aiConfig.provider === 'gemini') {
         // Simply check api key presence for now
         if (aiConfig.apiKey || process.env.GEMINI_API_KEY) {
           alert("✅ Gemini configuration looks valid.");
         } else {
           throw new Error("Missing Gemini API Key");
         }
      } else {
         const customHeaders = aiConfig.headers || {};
         // Use backend proxy to avoid CORS
         const res = await fetch('/api/proxy/ai', {
           method: 'POST',
           headers: {
             'Content-Type': 'application/json'
           },
           body: JSON.stringify({
             url: `${aiConfig.baseUrl}/chat/completions`,
             headers: {
               'Authorization': `Bearer ${aiConfig.apiKey}`,
               ...customHeaders
             },
             body: {
               model: aiConfig.model,
               messages: [{ role: 'user', content: 'hello' }],
               max_tokens: 5
             }
           })
         });
         
         if (res.ok) {
           alert("✅ AI Gateway Connection Successful!");
         } else {
           const err = await res.json().catch(() => ({}));
           throw new Error(err.error || err.detail || `HTTP ${res.status}`);
         }
      }
    } catch (err: any) {
      alert(`❌ AI Config Test Failed: ${err.message}`);
    } finally {
      setIsAiConfigTesting(false);
    }
  };

  const handleRunAIAnalysis = async () => {
    if (!selectedInstance || metrics.length === 0) return;
    setIsAnalyzing(true);
    setAiAnalysis(null);
    
    const avgLatency = metrics.reduce((acc, m) => acc + m.latency, 0) / (metrics.length || 1);
    const avgGPU = metrics.reduce((acc, m) => acc + m.gpuUsage, 0) / (metrics.length || 1);
    const prompt = `你是一个高性能计算和LLM运维专家。当前正在监控一个 ${selectedInstance.type} 实例: ${selectedInstance.name}。
    当前性能数据:
    - 延迟 (Latency): ${avgLatency.toFixed(2)}ms
    - GPU 使用率: ${avgGPU.toFixed(2)}%
    - 队列长度: ${metrics[metrics.length-1]?.queueLength ?? 0}
    - KV缓存使用率: ${(metrics[metrics.length-1]?.kvCacheUsage ?? 0).toFixed(2)}%

    请分析以上状态，给出简短、专业的优化建议或健康总结。使用 Markdown 格式。`;

    try {
      if (aiConfig.provider === 'gemini') {
        const apiKey = aiConfig.apiKey || process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("Missing Gemini API Key");
        
        const ai = new GoogleGenAI({ apiKey });
        const result = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt
        });
        setAiAnalysis(result.text || "无法生成分析。");
      } else {
        // Use backend proxy to avoid CORS
        const customHeaders = aiConfig.headers || {};
        const response = await fetch('/api/proxy/ai', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: `${aiConfig.baseUrl}/chat/completions`,
            headers: {
              'Authorization': `Bearer ${aiConfig.apiKey}`,
              ...customHeaders
            },
            body: {
              model: aiConfig.model,
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.7
            }
          })
        });
        
        const data = await response.json();
        if (data.choices && data.choices[0]) {
          setAiAnalysis(data.choices[0].message.content);
        } else {
          throw new Error(data.error || data.detail || "OpenAI API Error");
        }
      }
    } catch (err: any) {
      setAiAnalysis(`## 分析失败\n\n原因: ${err.message}\n\n请点击右上角设置图标检查 AI 引擎配置。`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const filteredMetrics = timeRange === '5M' 
    ? metrics.slice(-60) // Last 5 mins (at 5s interval)
    : metrics; // Full history (up to 1H)

  if (isAuthLoading) {
    return (
      <div className="h-screen bg-[#0A0A0B] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
          <p className="text-cyan-500 font-mono text-xs animate-pulse uppercase tracking-widest">Verifying Connection...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen bg-[#0A0A0B] flex items-center justify-center bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md p-8 bg-[#0F0F12] border border-slate-800 rounded-2xl shadow-2xl relative overflow-hidden"
        >
          {/* Background Decorative */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent" />
          
          <div className="flex flex-col items-center gap-4 mb-8">
            <div className="w-16 h-16 bg-cyan-600 rounded-2xl flex items-center justify-center shadow-xl shadow-cyan-900/40">
              <Lock className="text-white w-8 h-8" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-white mb-1">Infrastructure Hub</h1>
              <p className="text-sm text-slate-500 font-mono uppercase tracking-widest">Access Protected</p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Username</label>
              <input 
                type="text" 
                value={loginForm.username}
                onChange={e => setLoginForm(prev => ({...prev, username: e.target.value}))}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                placeholder="Enter identity"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Password</label>
              <input 
                type="password" 
                value={loginForm.password}
                onChange={e => setLoginForm(prev => ({...prev, password: e.target.value}))}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                placeholder="••••••••"
                required
              />
            </div>

            {loginError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-3 text-rose-400 text-xs">
                <AlertCircle size={14} />
                <span>{loginError}</span>
              </div>
            )}

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl shadow-lg shadow-cyan-900/40 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
            >
              {isLoading ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : "Sign In to Terminal"}
            </button>
          </form>

          <p className="mt-8 text-center text-[10px] text-slate-600 uppercase tracking-tighter">
            System Identity shared with New API Gateway
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0A0A0B] text-slate-300 font-sans selection:bg-cyan-500/30 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-72 border-r border-slate-800 flex flex-col bg-[#0F0F12]">
        <div className="p-6 border-bottom border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 bg-cyan-600 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-900/20">
            <Activity className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-white tracking-tight">LLM OPS</h1>
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest font-semibold">Monitor v1.0.4</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-1">
          <div className="px-3 mb-2 flex items-center justify-between text-[11px] font-mono text-slate-500 uppercase tracking-wider font-bold">
            <span>MAIN</span>
          </div>
          <button
            onClick={() => setActiveView('dashboard')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-all mb-2",
              activeView === 'dashboard' 
                ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" 
                : "text-slate-400 hover:bg-slate-800/30"
            )}
          >
            <Activity className="w-4 h-4" />
            <span className="text-sm font-medium">Dashboard</span>
          </button>

          {user?.role === 100 && (
            <button
              onClick={() => setActiveView('users')}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-all mb-4",
                activeView === 'users' 
                  ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" 
                  : "text-slate-400 hover:bg-slate-800/30"
              )}
            >
              <Users className="w-4 h-4" />
              <div className="flex-1 text-left">
                <span className="text-sm font-medium">Users</span>
                <p className="text-[9px] opacity-50 block leading-none">Shared DB (New API)</p>
              </div>
            </button>
          )}

          <div className="px-3 mb-4 mt-6 flex items-center justify-between text-[11px] font-mono text-slate-500 uppercase tracking-wider font-bold">
            <span>INSTANCES {isLoading && <span className="animate-pulse">...</span>}</span>
            {user?.role === 100 && (
              <button onClick={() => setIsAddModalOpen(true)} className="hover:text-cyan-400 transition-colors">
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
          
          {instances.map(instance => (
            <div key={instance.id} className="relative group">
              <button
                onClick={() => {
                  setSelectedId(instance.id);
                  setActiveView('dashboard');
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 rounded-md transition-all",
                  selectedId === instance.id 
                    ? "bg-slate-800/50 text-white border-l-2 border-cyan-500" 
                    : "hover:bg-slate-800/30 text-slate-400"
                )}
              >
                <Server className={cn("w-4 h-4", selectedId === instance.id ? "text-cyan-400" : "text-slate-500")} />
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium truncate">{instance.name}</p>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full animate-pulse",
                      instance.status === 'healthy' ? "bg-emerald-500" : "bg-rose-500"
                    )} />
                    <span className="text-[10px] font-mono opacity-50 uppercase tracking-tighter">{instance.type}</span>
                  </div>
                </div>
                <ChevronRight className={cn("w-4 h-4 opacity-0 transition-opacity", selectedId === instance.id && "opacity-100")} />
              </button>
              {user?.role === 100 && (
                <button 
                  onClick={(e) => removeInstance(instance.id, e)}
                  className="absolute right-8 top-1/2 -translate-y-1/2 p-1 text-slate-600 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800 bg-slate-900/20">
           <div className="flex items-center justify-between gap-3 text-slate-500 mb-4">
             <div className="flex items-center gap-2">
               <div className="w-6 h-6 rounded-full bg-cyan-600 flex items-center justify-center text-white text-[10px] font-bold">
                 {user?.username?.[0].toUpperCase()}
               </div>
               <span className="text-xs font-medium truncate max-w-[100px]">{user?.username}</span>
             </div>
             <button onClick={handleLogout} className="hover:text-rose-400 transition-colors">
                <LogOut className="w-4 h-4" />
             </button>
           </div>
           {user?.role === 100 && (
             <div className="flex items-center gap-3 text-slate-500 mb-4 cursor-pointer hover:text-cyan-400" onClick={() => setIsAiSettingsOpen(true)}>
               <Settings className="w-4 h-4" />
               <span className="text-xs font-medium">Settings</span>
             </div>
           )}
           <div className="p-3 bg-slate-800/20 rounded border border-slate-700/50">
             <div className="flex justify-between items-center mb-1">
               <span className="text-[10px] font-mono text-slate-500 uppercase">SYS LOAD</span>
               <span className="text-[10px] font-mono text-cyan-500">12.4%</span>
             </div>
             <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
               <div className="bg-cyan-500 h-full w-[12.4%]" />
             </div>
           </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden bg-grid-slate-900/[0.04]">
        {/* Header */}
        <header className="h-20 border-b border-slate-800 flex items-center justify-between px-8 bg-[#0A0A0B]/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-6">
            <h2 className="text-xl font-bold text-white tracking-tight">
              {selectedInstance ? selectedInstance.name : 'All Instances Overview'}
            </h2>
            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-2 text-slate-400">
                <Terminal className="w-3.5 h-3.5" />
                <span>{selectedInstance?.url}</span>
              </div>
              <div className={cn(
                "px-2 py-0.5 rounded border flex items-center gap-2",
                selectedInstance?.status === 'healthy' 
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                  : "bg-rose-500/10 border-rose-500/20 text-rose-400"
              )}>
                {selectedInstance?.status === 'healthy' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                <span className="uppercase tracking-widest text-[10px] font-bold">
                  {selectedInstance?.status === 'healthy' ? "Operational" : "Degraded"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
             {selectedInstance?.headers && Object.keys(selectedInstance.headers).length > 0 && (
               <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded text-[10px] font-bold text-indigo-400">
                 <ShieldAlert className="w-3 h-3" />
                 <span>AUTH HEADERS ACTIVE</span>
               </div>
             )}
             <button 
                onClick={() => selectedInstance && startEditing(selectedInstance)}
                className="px-3 py-2 bg-slate-900/50 border border-slate-800 hover:border-cyan-500/50 text-slate-400 hover:text-cyan-400 rounded-md transition-all flex items-center gap-2 text-sm"
             >
                <Settings className="w-4 h-4" />
                <span>Config</span>
             </button>
             <div className="relative group">
               <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
               <input 
                 type="text" 
                 placeholder="Search logs..." 
                 className="bg-slate-900/50 border border-slate-800 rounded-md pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all w-64"
               />
             </div>
             <button className="p-2 hover:bg-slate-800 rounded-md transition-colors text-slate-400 hover:text-white border border-transparent hover:border-slate-700">
                <Brain className="w-5 h-5" />
             </button>
          </div>
        </header>

        {/* Scrollable Dashboard area */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {activeView === 'users' ? (
            <div className="space-y-8 max-w-7xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-white mb-1">External User Management</h3>
                  <p className="text-sm text-slate-500">Managing identities shared from the New API PostgreSQL database.</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-emerald-400 text-xs font-bold flex items-center gap-2">
                    <Database size={14} />
                    <span>POSTGRES CONNECTED</span>
                  </div>
                  <button 
                    onClick={fetchUsers}
                    className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors text-slate-400"
                  >
                    <Activity size={18} />
                  </button>
                </div>
              </div>

              <div className="bg-[#141419] border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/50">
                      <th className="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest">ID</th>
                      <th className="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest">Username</th>
                      <th className="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest">Email</th>
                      <th className="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest">Role</th>
                      <th className="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest">Status</th>
                      <th className="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest">Quota</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 text-sm">
                    {externalUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-500 italic">
                          No users found in the external database table.
                        </td>
                      </tr>
                    ) : externalUsers.map((u: any) => (
                      <tr key={u.id} className="hover:bg-slate-800/20 transition-colors">
                        <td className="px-6 py-4 font-mono text-xs text-slate-500">{u.id}</td>
                        <td className="px-6 py-4 font-bold text-white">{u.username}</td>
                        <td className="px-6 py-4 text-slate-400">{u.email}</td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                            u.role === 'admin' ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" : "bg-slate-500/10 text-slate-500 border border-slate-500/20"
                          )}>
                            {u.role || 'user'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              u.status === 1 || u.status === 'active' ? "bg-emerald-500" : "bg-rose-500"
                            )} />
                            <span className="text-xs">{u.status === 1 || u.status === 'active' ? "Active" : "Disabled"}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-cyan-400">
                          {u.quota ? `${(u.quota / 1024).toFixed(2)}k` : 'Unlimited'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : !selectedInstance ? (
             <div className="h-full flex items-center justify-center flex-col gap-4 text-slate-500">
                <Activity className="w-16 h-16 opacity-20" />
                <p>Select an instance from the sidebar to view details</p>
             </div>
          ) : (
            <div className="space-y-8 max-w-7xl mx-auto">
              {/* Quick Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
                {[
                  { label: 'Concurrent Req', value: metrics.length > 0 ? Math.round(metrics[metrics.length-1].tps || 0) : 0, icon: Zap, color: 'text-amber-400', unit: 'active' },
                  { label: 'Throughput', value: metrics.length > 0 ? (metrics[metrics.length-1].tokensPerSec || 0).toFixed(1) : '0.0', icon: TrendingUp, color: 'text-cyan-400', unit: 'tok/s' },
                  { label: 'Latency', value: metrics.length > 0 ? Math.round(metrics[metrics.length-1].latency || 0) : 0, icon: Activity, color: 'text-emerald-400', unit: 'ms' },
                  { label: 'Queue Backlog', value: metrics.length > 0 ? Math.round(metrics[metrics.length-1].queueLength || 0) : 0, icon: List, color: metrics.length > 0 && metrics[metrics.length-1].queueLength! > 0 ? 'text-rose-400' : 'text-slate-400', unit: 'waiting' },
                  { label: 'KV Cache', value: metrics.length > 0 ? Math.round(metrics[metrics.length-1].kvCacheUsage || 0) : 0, icon: Database, color: 'text-indigo-400', unit: '%' },
                ].map((stat, i) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    key={stat.label} 
                    className="bg-[#141419] border border-slate-800 rounded-xl p-5 shadow-sm hover:border-slate-700 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className={cn("p-2 rounded-lg bg-slate-900 border border-slate-800", stat.color)}>
                        <stat.icon size={20} />
                      </div>
                      <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">{stat.label}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-white font-mono">{stat.value}</span>
                      <span className="text-xs text-slate-500 font-mono">{stat.unit}</span>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Historical & Performance Indicators */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[#141419]/60 border border-slate-800/50 rounded-xl p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded bg-slate-800 flex items-center justify-center text-slate-400">
                      <Activity size={20} />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-tighter text-slate-500 font-bold">Total Requests</p>
                      <p className="text-lg font-bold text-white font-mono">{metrics.length > 0 ? (metrics[metrics.length-1].totalRequests || 0) : 0}</p>
                    </div>
                  </div>
                </div>

                {metrics.length > 0 && metrics[metrics.length-1].nginxActive !== undefined && metrics[metrics.length-1].nginxActive! > 0 && (
                  <div className="bg-[#141419]/60 border border-slate-800/50 rounded-xl p-5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded bg-slate-800 flex items-center justify-center text-sky-400/50">
                        <Server size={20} />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-tighter text-slate-500 font-bold">Nginx Gateway</p>
                        <p className="text-lg font-bold text-white font-mono">
                          {metrics[metrics.length-1]?.nginxActive ?? 0} <span className="text-xs text-slate-500 font-normal">Active Conn</span>
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-[#141419]/60 border border-slate-800/50 rounded-xl p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded bg-slate-800 flex items-center justify-center text-indigo-400/50">
                      <Zap size={20} />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-tighter text-slate-500 font-bold">Token Usage (History)</p>
                      <div className="flex items-baseline gap-2">
                        <p className="text-lg font-bold text-white font-mono">
                          {metrics.length > 0 ? Math.round(((metrics[metrics.length-1].totalPromptTokens || 0) + (metrics[metrics.length-1].totalGenTokens || 0)) / 1000) : 0}k
                        </p>
                        <span className="text-[10px] text-slate-500 font-mono">
                          (In: {metrics.length > 0 ? Math.round((metrics[metrics.length-1].totalPromptTokens || 0) / 1000) : 0}k / Out: {metrics.length > 0 ? Math.round((metrics[metrics.length-1].totalGenTokens || 0) / 1000) : 0}k)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-[#141419]/60 border border-slate-800/50 rounded-xl p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded bg-slate-800 flex items-center justify-center text-cyan-400/50">
                      <Activity size={20} />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-tighter text-slate-500 font-bold">Performance (1M)</p>
                      <p className="text-lg font-bold text-white font-mono">
                        {metrics.length > 0 ? Math.round(metrics[metrics.length-1].rpm || 0) : 0} <span className="text-[10px] text-slate-500">RPM</span> / {metrics.length > 0 ? Math.round(metrics[metrics.length-1].tpm || 0) : 0} <span className="text-[10px] text-slate-500">TPM</span>
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-[#141419]/60 border border-slate-800/50 rounded-xl p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded bg-slate-800 flex items-center justify-center text-emerald-500/50">
                      <Zap size={20} />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-tighter text-slate-500 font-bold">Avg TTFT (Historical)</p>
                      <p className="text-lg font-bold text-white font-mono">{metrics.length > 0 ? (metrics[metrics.length-1].avgTtft || 0).toFixed(2) : '0.00'}s</p>
                    </div>
                  </div>
                </div>

                <div className="bg-[#141419]/60 border border-slate-800/50 rounded-xl p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded bg-slate-800 flex items-center justify-center text-cyan-500/50">
                      <Activity size={20} />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-tighter text-slate-500 font-bold">Avg E2E (Historical)</p>
                      <p className="text-lg font-bold text-white font-mono">{metrics.length > 0 ? (metrics[metrics.length-1].avgE2e || 0).toFixed(1) : '0.0'}s</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-[#141419] border border-slate-800 rounded-xl p-6 shadow-md">
                   <div className="flex items-center justify-between mb-8">
                     <h3 className="text-sm font-bold flex items-center gap-2">
                       <TrendingUp className="w-4 h-4 text-cyan-400" />
                       Throughput (Tokens/s)
                     </h3>
                     <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-md border border-slate-800 text-[10px] font-bold">
                       <button 
                         onClick={() => setTimeRange('5M')}
                         className={cn("px-2 py-1 rounded transition-colors", timeRange === '5M' ? "bg-slate-800 text-cyan-400" : "text-slate-500 hover:text-slate-300")}
                       >5M</button>
                       <button 
                         onClick={() => setTimeRange('1H')}
                         className={cn("px-2 py-1 rounded transition-colors", timeRange === '1H' ? "bg-slate-800 text-cyan-400" : "text-slate-500 hover:text-slate-300")}
                       >1H</button>
                     </div>
                   </div>
                   <div className="h-[280px]">
                     <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={filteredMetrics}>
                          <defs>
                            <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.1}/>
                              <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                          <XAxis dataKey="timestamp" hide />
                          <YAxis stroke="#475569" fontSize={10} axisLine={false} tickLine={false} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                            itemStyle={{ color: '#06b6d4' }}
                          />
                          <Area type="monotone" dataKey="tokensPerSec" stroke="#06b6d4" fillOpacity={1} fill="url(#colorTokens)" strokeWidth={2} />
                        </AreaChart>
                     </ResponsiveContainer>
                   </div>
                </div>

                <div className="bg-[#141419] border border-slate-800 rounded-xl p-6 shadow-md">
                   <div className="flex items-center justify-between mb-8">
                     <h3 className="text-sm font-bold flex items-center gap-2">
                       <Activity className="w-4 h-4 text-amber-400" />
                       Latency Heatmap
                     </h3>
                   </div>
                   <div className="h-[280px]">
                     <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={filteredMetrics}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                          <XAxis dataKey="timestamp" hide />
                          <YAxis stroke="#475569" fontSize={10} axisLine={false} tickLine={false} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                            itemStyle={{ color: '#fbbf24' }}
                          />
                          <Line type="stepAfter" dataKey="latency" stroke="#fbbf24" strokeWidth={2} dot={false} />
                        </LineChart>
                     </ResponsiveContainer>
                   </div>
                </div>
              </div>

              {/* AI Advisor Panel */}
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-2xl blur opacity-10 group-hover:opacity-20 transition duration-1000"></div>
                <div className="relative bg-[#141419] border border-slate-800 rounded-2xl p-8 shadow-2xl">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-indigo-500/10 rounded-lg">
                          <Brain className="text-indigo-400 w-6 h-6" />
                        </div>
                        <h2 className="text-xl font-bold text-white tracking-tight">AI Runtime Advisor</h2>
                        <button 
                          onClick={() => setIsAiSettingsOpen(!isAiSettingsOpen)}
                          className={cn("p-2 rounded-lg transition-colors border", isAiSettingsOpen ? "bg-cyan-500/10 border-cyan-500/50 text-cyan-400" : "bg-slate-800/50 border-slate-700 text-slate-500 hover:text-slate-300")}
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-slate-400 text-sm max-w-xl">
                        AI-powered performance analysis engine. Using <span className="text-cyan-500 font-mono font-bold uppercase">{aiConfig.provider}</span> ({aiConfig.model}).
                      </p>
                    </div>
                    <button 
                      onClick={handleRunAIAnalysis}
                      disabled={isAnalyzing}
                      className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-cyan-900/40 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50"
                    >
                      {isAnalyzing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Processing...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4" />
                          <span>Run Analysis</span>
                        </>
                      )}
                    </button>
                  </div>

                  {isAiSettingsOpen && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      className="mb-8 p-6 bg-slate-900/50 border border-slate-700/50 rounded-xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
                    >
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Provider</label>
                        <select 
                          value={aiConfig.provider}
                          onChange={e => setAiConfig({...aiConfig, provider: e.target.value})}
                          className="w-full bg-[#141419] border border-slate-700 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-cyan-500 outline-none"
                        >
                          <option value="gemini">Google Gemini</option>
                          <option value="openai">OpenAI Compatible</option>
                        </select>
                      </div>
                      <div className={cn(aiConfig.provider === 'gemini' && "opacity-50 pointer-events-none")}>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Base URL</label>
                        <input 
                          type="text" 
                          value={aiConfig.baseUrl}
                          onChange={e => setAiConfig({...aiConfig, baseUrl: e.target.value})}
                          className="w-full bg-[#141419] border border-slate-700 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-cyan-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">API Key</label>
                        <input 
                          type="password" 
                          placeholder={aiConfig.provider === 'gemini' ? 'Internal Key Used' : 'sk-...'}
                          value={aiConfig.apiKey}
                          onChange={e => setAiConfig({...aiConfig, apiKey: e.target.value})}
                          className="w-full bg-[#141419] border border-slate-700 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-cyan-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Model Name</label>
                        <input 
                          type="text" 
                          value={aiConfig.model}
                          onChange={e => setAiConfig({...aiConfig, model: e.target.value})}
                          className="w-full bg-[#141419] border border-slate-700 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-cyan-500 outline-none"
                        />
                      </div>

                      <div className="lg:col-span-4 mt-2 pt-4 border-t border-slate-800">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 block">AI Gateway Headers (e.g. for New API/Redirection)</label>
                        <div className="flex gap-2 mb-4">
                          <input 
                            type="text" 
                            placeholder="Header Key (e.g. X-Custom-Key)" 
                            value={aiHeaderKey}
                            onChange={e => setAiHeaderKey(e.target.value)}
                            className="flex-1 bg-[#141419] border border-slate-700 rounded-lg px-3 py-2 text-xs outline-none"
                          />
                          <input 
                            type="text" 
                            placeholder="Value" 
                            value={aiHeaderValue}
                            onChange={e => setAiHeaderValue(e.target.value)}
                            className="flex-1 bg-[#141419] border border-slate-700 rounded-lg px-3 py-2 text-xs outline-none"
                          />
                          <button 
                            onClick={() => {
                              if(aiHeaderKey && aiHeaderValue) {
                                setAiConfig(prev => ({...prev, headers: {...(prev.headers || {}), [aiHeaderKey]: aiHeaderValue}}));
                                setAiHeaderKey(''); setAiHeaderValue('');
                              }
                            }}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold"
                          >Add Header</button>
                        </div>
                        <div className="flex flex-wrap gap-2 mb-4">
                          {Object.entries(aiConfig.headers || {}).map(([k, v]) => (
                            <div key={k} className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg px-3 py-1.5 text-[10px] flex items-center gap-3">
                              <span className="text-indigo-400 font-mono font-bold">{k}:</span>
                              <span className="text-slate-400">{v as string}</span>
                              <button onClick={() => {
                                const next = {...(aiConfig.headers as Record<string, string>)};
                                delete next[k];
                                setAiConfig({...aiConfig, headers: next});
                              }} className="text-slate-600 hover:text-rose-500 font-bold text-sm">×</button>
                            </div>
                          ))}
                          {Object.keys(aiConfig.headers || {}).length === 0 && (
                            <span className="text-slate-600 italic text-[10px]">No custom headers defined.</span>
                          )}
                        </div>
                        <button 
                          onClick={testAiConfig}
                          disabled={isAiConfigTesting}
                          className="w-full py-2 bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 text-indigo-400 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2"
                        >
                          {isAiConfigTesting ? <div className="w-3 h-3 border-2 border-indigo-500 border-t-white rounded-full animate-spin" /> : <Activity className="w-3 h-3" />}
                          TEST AI GATEWAY CONFIGURATION
                        </button>
                      </div>
                    </motion.div>
                  )}

                  <AnimatePresence mode="wait">
                    {aiAnalysis ? (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-[#0F0F12] border border-slate-700/50 rounded-xl p-6 prose prose-invert prose-sm max-w-none prose-p:leading-relaxed"
                      >
                         <ReactMarkdown>{aiAnalysis}</ReactMarkdown>
                      </motion.div>
                    ) : !isAnalyzing && (
                      <div className="h-24 flex items-center justify-center border-2 border-dashed border-slate-800 rounded-xl text-slate-500 italic text-sm">
                        Click 'Run Analysis' to get architectural advice for {selectedInstance.name}
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Advanced System Info */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                 <div className="lg:col-span-2 bg-[#141419] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                    <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                       <h3 className="font-bold text-xs uppercase tracking-widest text-slate-400 flex items-center gap-2">
                         <ShieldAlert className="w-4 h-4 text-rose-500" />
                         Alert Logs & Notifications
                       </h3>
                       <button className="text-[10px] text-cyan-500 font-bold hover:underline">View All</button>
                    </div>
                    <div className="divide-y divide-slate-800">
                       {logs.length > 0 ? logs.map((log, i) => (
                         <div key={i} className="px-6 py-4 flex items-center gap-4 hover:bg-slate-800/20 transition-colors group">
                           <span className="text-[10px] font-mono text-slate-500">{log.time}</span>
                           <div className={cn("p-1 rounded-md bg-opacity-10", log.color.replace('text-', 'bg-'))}>
                             <log.icon className={cn("w-3.5 h-3.5", log.color)} />
                           </div>
                           <span className={cn("text-[10px] font-bold uppercase tracking-wider w-16", log.color)}>{log.type}</span>
                           <span className="text-sm text-slate-300 flex-1 truncate">{log.msg}</span>
                         </div>
                       )) : (
                         <div className="px-6 py-10 text-center text-slate-600 text-xs italic">
                           No alerts detected. Monitoring system active...
                         </div>
                       )}
                    </div>
                 </div>

                 <div className="bg-[#141419] border border-slate-800 rounded-xl p-6 shadow-sm">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                      <Cpu className="w-4 h-4" />
                      Runtime Stats
                    </h3>
                    <div className="space-y-6">
                       {[
                         { label: 'Uptime', value: 'Live Fetching' },
                         { label: 'Engine Type', value: selectedInstance.type },
                         { label: 'Active Requests', value: metrics.length > 0 ? Math.round((metrics[metrics.length-1]?.tps || 0) * 10) / 10 : 0 },
                         { label: 'Latency (Avg)', value: metrics.length > 0 ? `${Math.round(metrics[metrics.length-1]?.latency || 0)}ms` : '0ms' },
                         { label: 'Queue Status', value: (metrics.length > 0 && (metrics[metrics.length-1]?.queueLength ?? 0) > 0) ? `${metrics[metrics.length-1]?.queueLength} Waiting` : 'Idle' },
                       ].map(info => (
                         <div key={info.label} className="flex justify-between items-center pb-2 border-b border-slate-800/50 last:border-0 last:pb-0">
                           <span className="text-xs text-slate-500">{info.label}</span>
                           <span className="text-xs font-mono text-white">{info.value}</span>
                         </div>
                       ))}
                    </div>
                 </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Add Instance Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsAddModalOpen(false)}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md bg-[#141419] border border-slate-700 rounded-2xl p-8 relative shadow-2xl"
          >
            <h3 className="text-xl font-bold text-white mb-6">Add New LLM Cluster</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Instance Name</label>
                <input 
                  type="text" 
                  value={newInst.name}
                  onChange={e => setNewInst({...newInst, name: e.target.value})}
                  placeholder="e.g. Prod-vLLM-01" 
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Base URL / IP</label>
                <input 
                  type="text" 
                  value={newInst.url}
                  onChange={e => setNewInst({...newInst, url: e.target.value})}
                  placeholder="http://192.168.1.100:8000" 
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                />
                {(newInst.url.includes('localhost') || newInst.url.includes('127.0.0.1')) && (
                  <p className="mt-1.5 text-[10px] text-amber-500 font-bold flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" />
                    NOTE: 'localhost' won't work via proxy in cloud environment.
                  </p>
                )}
              </div>
              <div>
                 <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Engine Type</label>
                 <select 
                  value={newInst.type}
                  onChange={e => setNewInst({...newInst, type: e.target.value as InstanceType})}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                 >
                    <option value="vLLM">vLLM Engine</option>
                    <option value="SGLang">SGLang Engine</option>
                 </select>
              </div>
              
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block">Custom Headers</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Key" 
                    value={headerKey}
                    onChange={e => setHeaderKey(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs focus:outline-none" 
                  />
                  <input 
                    type="text" 
                    placeholder="Value" 
                    value={headerValue}
                    onChange={e => setHeaderValue(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs focus:outline-none" 
                  />
                  <button 
                    onClick={() => {
                      if(headerKey && headerValue) {
                        setNewInst(prev => ({...prev, headers: {...prev.headers, [headerKey]: headerValue}}));
                        setHeaderKey(''); setHeaderValue('');
                      }
                    }}
                    className="px-3 bg-slate-800 hover:bg-slate-700 rounded text-xs"
                  >Add</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(newInst.headers || {}).map(([k, v]) => (
                    <div key={k} className="bg-cyan-500/10 border border-cyan-500/30 rounded px-2 py-1 text-[10px] flex items-center gap-2">
                      <span className="text-cyan-400 font-bold">{k}:</span>
                      <span className="text-slate-400">{v}</span>
                      <button onClick={() => {
                        const next = {...newInst.headers};
                        delete next[k];
                        setNewInst({...newInst, headers: next});
                      }} className="text-slate-600 hover:text-rose-500">×</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex flex-col gap-3">
                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsAddModalOpen(false)}
                    className="flex-1 px-4 py-3 border border-slate-800 hover:bg-slate-800 text-slate-400 font-bold rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleAddInstance}
                    className="flex-1 px-4 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl shadow-lg shadow-cyan-900/20 transition-all font-mono"
                  >
                    REGISTER
                  </button>
                </div>
                <button 
                  onClick={() => checkConnectivity(newInst as any)}
                  disabled={isChecking}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg border border-slate-700 transition-all flex items-center justify-center gap-2"
                >
                  {isChecking ? <div className="w-3 h-3 border-2 border-slate-500 border-t-white rounded-full animate-spin" /> : <Activity className="w-3 h-3" />}
                  TEST CONNECTION WITH HEADERS
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Edit Instance Modal */}
      {isEditModalOpen && editInst && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsEditModalOpen(false)}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md bg-[#141419] border border-slate-700 rounded-2xl p-8 relative shadow-2xl"
          >
            <h3 className="text-xl font-bold text-white mb-6">Modify Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Instance Name</label>
                <input 
                  type="text" 
                  value={editInst.name}
                  onChange={e => setEditInst({...editInst, name: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Endpoint URL / IP</label>
                <input 
                  type="text" 
                  value={editInst.url}
                  onChange={e => setEditInst({...editInst, url: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
              <div>
                 <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Engine Architecture</label>
                 <select 
                  value={editInst.type}
                  onChange={e => setEditInst({...editInst, type: e.target.value as InstanceType})}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                 >
                    <option value="vLLM">vLLM Optimization</option>
                    <option value="SGLang">SGLang (RadixAttention)</option>
                 </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block">Custom Headers</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Key" 
                    value={headerKey}
                    onChange={e => setHeaderKey(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs focus:outline-none" 
                  />
                  <input 
                    type="text" 
                    placeholder="Value" 
                    value={headerValue}
                    onChange={e => setHeaderValue(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs focus:outline-none" 
                  />
                  <button 
                    onClick={() => {
                      if(headerKey && headerValue) {
                        setEditInst(prev => prev ? ({...prev, headers: {...(prev.headers || {}), [headerKey]: headerValue}}) : null);
                        setHeaderKey(''); setHeaderValue('');
                      }
                    }}
                    className="px-3 bg-slate-800 hover:bg-slate-700 rounded text-xs"
                  >Add</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(editInst.headers || {}).map(([k, v]) => (
                    <div key={k} className="bg-indigo-500/10 border border-indigo-500/30 rounded px-2 py-1 text-[10px] flex items-center gap-2">
                      <span className="text-indigo-400 font-bold">{k}:</span>
                      <span className="text-slate-400">{v}</span>
                      <button onClick={() => {
                        const next = {...(editInst.headers || {})};
                        delete next[k];
                        setEditInst({...editInst, headers: next});
                      }} className="text-slate-600 hover:text-rose-500">×</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex flex-col gap-3">
                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsEditModalOpen(false)}
                    className="flex-1 px-4 py-3 border border-slate-800 hover:bg-slate-800 text-slate-400 font-bold rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleUpdateInstance}
                    className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-900/20 transition-all font-mono"
                  >
                    SAVE CHANGES
                  </button>
                </div>
                <button 
                  onClick={() => checkConnectivity(editInst)}
                  disabled={isChecking}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg border border-slate-700 transition-all flex items-center justify-center gap-2"
                >
                  {isChecking ? <div className="w-3 h-3 border-2 border-slate-500 border-t-white rounded-full animate-spin" /> : <Activity className="w-3 h-3" />}
                  TEST CONNECTION WITH HEADERS
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Global CSS for scrollbar */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1e293b;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #334155;
        }
        .bg-grid-slate-900 {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='32' height='32' fill='none' stroke='rgb(15 23 42 / 0.3)'%3E%3Cpath d='M0 .5H31.5V32'/%3E%3C/svg%3E");
        }
      `}</style>
    </div>
  );
}
