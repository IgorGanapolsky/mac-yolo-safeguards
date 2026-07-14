export interface RelayHookEvent {
  tool_name?: string;
  hook_event_name?: string;
  session_id?: string;
  tool_input?: {
    command?: string;
    file_path?: string;
    content?: string;
  };
}

export interface ApprovalIntegrity {
  version: number;
  algorithm: 'sha256';
  digest: string;
  issued_at: string;
  expires_at: string;
  truncated: boolean;
  redacted: boolean;
  review_required_on_computer: boolean;
  display: {
    action_id: string;
    tool_name: string;
    destination?: string | null;
    command?: string | null;
    arguments?: string | null;
    affected_files?: string[];
    diff?: string | null;
  };
}

export interface EnqueuedEvent {
  id: string;
  device_id?: string;
  worker_id?: string;
  event: RelayHookEvent;
  enqueued_at?: number;
  status?: string;
  source?: string;
  reason?: string;
  approval_integrity?: ApprovalIntegrity;
}

export interface RelayWorker {
  id: string;
  label?: string;
  machine_id?: string;
  hostname?: string;
  project?: string;
  repo?: string;
  status?: string;
  last_seen_at?: number | string;
  capabilities?: string[];
}

export interface QueueResponse {
  events: EnqueuedEvent[];
  workers?: RelayWorker[];
  devices?: RelayWorker[];
  active_worker_id?: string;
  active_device_id?: string;
  tier?: string;
  activity_count?: number;
  total_spend?: number;
  quota?: number;
}

export interface PairCompleteResponse {
  mobile_token: string;
}

export interface HealthResponse {
  ok: boolean;
  version?: string;
}
