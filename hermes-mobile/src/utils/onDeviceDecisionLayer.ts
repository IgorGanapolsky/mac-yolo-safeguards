export type OnDeviceModel<Input, Output> = {
  id: string;
  version: number;
  predict: (input: Input) => Output;
};

export type ReachabilityTransport = 'usb' | 'tailscale' | 'wifi' | 'unknown';

export type ReachabilityCandidate = {
  id: string;
  transport: ReachabilityTransport;
  reachable: boolean;
  authenticated?: boolean;
  active?: boolean;
  latencyMs?: number;
};

export type ReachabilityPrediction = ReachabilityCandidate & {
  score: number;
  confidence: number;
  state: 'ready' | 'repair_auth' | 'dead';
};

const TRANSPORT_BASE_SCORE: Record<ReachabilityTransport, number> = {
  usb: 100,
  tailscale: 82,
  wifi: 70,
  unknown: 55,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scoreReachability(input: ReachabilityCandidate): ReachabilityPrediction {
  if (!input.reachable) {
    return { ...input, score: 0, confidence: 1, state: 'dead' };
  }

  const authFailed = input.authenticated === false;
  const latencyPenalty = Number.isFinite(input.latencyMs)
    ? clamp(Math.round((input.latencyMs ?? 0) / 100), 0, 18)
    : 0;
  const activeBonus = input.active ? 3 : 0;
  const rawScore = TRANSPORT_BASE_SCORE[input.transport] + activeBonus - latencyPenalty;
  const score = authFailed ? Math.min(rawScore, 34) : clamp(rawScore, 1, 100);

  return {
    ...input,
    score,
    confidence: input.authenticated === undefined ? 0.82 : 0.96,
    state: authFailed ? 'repair_auth' : 'ready',
  };
}

export const reachabilityModel: OnDeviceModel<ReachabilityCandidate, ReachabilityPrediction> = {
  id: 'hermes_reachability_rules',
  version: 1,
  predict: scoreReachability,
};

export function rankReachabilityRoutes(
  candidates: ReachabilityCandidate[],
): ReachabilityPrediction[] {
  return candidates
    .map((candidate) => reachabilityModel.predict(candidate))
    .sort((left, right) => right.score - left.score);
}

export type ConnectionCopy = {
  title: string;
  detail: string;
  tone: 'positive' | 'warning' | 'neutral';
};

export function connectionCopyFromPrediction(
  prediction: ReachabilityPrediction,
  computerLabel = 'your computer',
): ConnectionCopy {
  if (prediction.state === 'repair_auth') {
    return {
      title: `${computerLabel} needs to be paired again`,
      detail: 'The computer answered, but the saved connection key did not.',
      tone: 'warning',
    };
  }
  if (prediction.state === 'dead') {
    return {
      title: `Can\'t reach ${computerLabel}`,
      detail: `${computerLabel} is saved but not reachable right now. Find computers or pick another one.`,
      tone: 'warning',
    };
  }
  if (prediction.transport === 'usb') {
    return {
      title: `Connected directly to ${computerLabel}`,
      detail: 'Using this cable.',
      tone: 'positive',
    };
  }
  if (prediction.transport === 'tailscale') {
    return {
      title: `Connected to ${computerLabel}`,
      detail: 'Works away from home through Tailscale.',
      tone: 'positive',
    };
  }
  return {
    title: `Connected to ${computerLabel}`,
    detail: prediction.transport === 'wifi' ? 'Using Home Wi-Fi.' : 'Connection is ready.',
    tone: 'positive',
  };
}
