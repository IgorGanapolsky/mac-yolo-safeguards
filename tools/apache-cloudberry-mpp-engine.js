'use strict';

class PaxHybridStorage {
  constructor() {
    this.rows = [];
    this.columns = {};
  }

  insertRecord(record) {
    const rowId = this.rows.length;
    const rowDoc = { _rowId: rowId, ...record, _insertedAt: new Date().toISOString() };
    this.rows.push(rowDoc);

    for (const [col, val] of Object.entries(record)) {
      if (!this.columns[col]) this.columns[col] = [];
      this.columns[col].push(val);
    }
    return rowDoc;
  }

  getColumnSlice(columnName) {
    return this.columns[columnName] || [];
  }
}

class GporcaQueryOptimizer {
  static optimizeQuery(queryPlan) {
    const hasPartitionKey = Boolean(queryPlan.partitionKey);
    const pushDownAggregates = Boolean(queryPlan.aggregateField);

    return {
      originalPlan: queryPlan,
      partitionPruned: hasPartitionKey,
      aggregatePushedDown: pushDownAggregates,
      estimatedCost: pushDownAggregates ? 12.5 : 95.0,
      optimizedPlanType: 'GPORCA_DISTRIBUTED_PLAN',
    };
  }
}

class ApacheCloudberryMppEngine {
  constructor(nodeCount = 4) {
    this.nodeCount = nodeCount;
    this.storage = new PaxHybridStorage();
  }

  dispatchParallelWorkload(tasks) {
    const nodes = Array.from({ length: this.nodeCount }, (_, i) => ({
      nodeId: `cloudberry_segment_${i}`,
      processed: [],
    }));

    tasks.forEach((task, idx) => {
      const targetNode = nodes[idx % this.nodeCount];
      targetNode.processed.push(task);
      this.storage.insertRecord({ taskName: task.name, segmentId: targetNode.nodeId, status: 'SUCCESS' });
    });

    return {
      parallelExecution: true,
      segmentNodes: nodes,
      totalProcessed: tasks.length,
      paxStorageRowCount: this.storage.rows.length,
    };
  }
}

module.exports = {
  PaxHybridStorage,
  GporcaQueryOptimizer,
  ApacheCloudberryMppEngine,
};
