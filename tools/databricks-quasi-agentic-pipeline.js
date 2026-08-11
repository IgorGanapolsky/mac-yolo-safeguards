'use strict';

class DeterministicFallbackCircuitBreaker {
  static executeWithFallback(taskFn, fallbackRuleFn, timeoutMs = 3000) {
    const startTime = Date.now();
    try {
      const result = taskFn();
      if (!result || typeof result !== 'object' || !result.status) {
        throw new Error('LLM response failed strict schema contract');
      }
      return {
        source: 'agentic',
        result,
        latencyMs: Date.now() - startTime,
        fallbackTriggered: false,
      };
    } catch (err) {
      const fallbackResult = fallbackRuleFn(err);
      return {
        source: 'deterministic_fallback',
        result: fallbackResult,
        latencyMs: Date.now() - startTime,
        fallbackTriggered: true,
        error: err.message,
      };
    }
  }
}

class QuasiAgenticPipelineNode {
  constructor(nodeId, taskType, options = {}) {
    this.nodeId = nodeId;
    this.taskType = taskType;
    this.timeoutMs = options.timeoutMs || 3000;
  }

  processDataQualityAnomaly(record) {
    return DeterministicFallbackCircuitBreaker.executeWithFallback(
      () => {
        if (!record || !record.value) {
          throw new Error('Missing record value');
        }
        return {
          status: 'REMEDIATED',
          action: 'CAST_NUMERIC',
          confidence: 0.98,
          suggestedQuery: `SELECT CAST(${record.field} AS DOUBLE) FROM ${record.table}`,
        };
      },
      (err) => {
        return {
          status: 'ESCALATED',
          action: 'QUARANTINE_RECORD',
          confidence: 1.0,
          reason: `Fallback circuit breaker engaged: ${err.message}`,
        };
      },
      this.timeoutMs
    );
  }
}

class PipelineQualityLedger {
  constructor() {
    this.logs = [];
  }

  logExecution(entry) {
    const record = {
      timestamp: new Date().toISOString(),
      ...entry,
    };
    this.logs.push(record);
    return record;
  }

  getMetrics() {
    const total = this.logs.length;
    const fallbacks = this.logs.filter((l) => l.fallbackTriggered).length;
    const avgLatency = total > 0 ? this.logs.reduce((s, l) => s + l.latencyMs, 0) / total : 0;
    return {
      totalExecutions: total,
      fallbackRate: total > 0 ? (fallbacks / total) * 100 : 0,
      avgLatencyMs: Math.round(avgLatency),
    };
  }
}

module.exports = {
  DeterministicFallbackCircuitBreaker,
  QuasiAgenticPipelineNode,
  PipelineQualityLedger,
};
