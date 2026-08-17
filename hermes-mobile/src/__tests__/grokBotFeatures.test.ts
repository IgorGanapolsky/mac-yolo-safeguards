import {
  DEFAULT_BOT_PERSONAS,
  BRAIN_MODELS,
  DEFAULT_ROUTINES,
  evaluateToolSafety,
  getDefaultComputerState,
  getDefaultTokenTelemetry,
  getSelectedBotPersona,
  setSelectedBotPersonaId,
  getSelectedBrainModel,
  setSelectedBrainModelId,
  getAutomatedRoutines,
  saveAutomatedRoutines,
} from '../services/grokBotService';

describe('Grok Bot Architecture & Smart Features', () => {
  describe('Bot Personas & Named Charters', () => {
    it('defines all canonical outcome-owned bot personas', () => {
      const ids = DEFAULT_BOT_PERSONAS.map((b) => b.id);
      expect(ids).toContain('chief-of-staff');
      expect(ids).toContain('qa-tester');
      expect(ids).toContain('ship-pr');
      expect(ids).toContain('inbox-zero');
      expect(ids).toContain('bug-triage');
      expect(ids).toContain('expense-ops');
    });

    it('each persona has explicit hard-stop boundaries', () => {
      for (const persona of DEFAULT_BOT_PERSONAS) {
        expect(persona.name.length).toBeGreaterThan(0);
        expect(persona.systemCharter.length).toBeGreaterThan(10);
        expect(persona.hardStopRules.length).toBeGreaterThan(0);
        expect(persona.avatarColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });

    it('persists and retrieves selected bot persona', async () => {
      await setSelectedBotPersonaId('qa-tester');
      const selected = await getSelectedBotPersona();
      expect(selected.id).toBe('qa-tester');
      expect(selected.name).toBe('QA Tester');
    });
  });

  describe('Mixture of Experts (MoE) Brain Router', () => {
    it('includes zero-marginal cost and local models', () => {
      const zeroCostModels = BRAIN_MODELS.filter((m) => m.isZeroMarginalCost);
      expect(zeroCostModels.length).toBeGreaterThanOrEqual(2);
      expect(zeroCostModels.some((m) => m.id === 'ollama-local')).toBe(true);
      expect(zeroCostModels.some((m) => m.id === 'zai-glm53')).toBe(true);
    });

    it('includes flagship and budget optimized models', () => {
      const modelIds = BRAIN_MODELS.map((m) => m.id);
      expect(modelIds).toContain('qwen38-max');
      expect(modelIds).toContain('deepseek-v4');
      expect(modelIds).toContain('grok-46');
      expect(modelIds).toContain('claude-37');
    });

    it('persists and retrieves selected brain model', async () => {
      await setSelectedBrainModelId('zai-glm53');
      const selected = await getSelectedBrainModel();
      expect(selected.id).toBe('zai-glm53');
      expect(selected.isZeroMarginalCost).toBe(true);
    });
  });

  describe('Intelligent LLM-as-a-Judge Risk Evaluation', () => {
    it('evaluates safe read-only operations as low risk and allow_auto', () => {
      const assessment = evaluateToolSafety('run_command', 'git status');
      expect(assessment.riskTier).toBe('low');
      expect(assessment.riskScore).toBeLessThan(30);
      expect(assessment.suggestedAction).toBe('allow_auto');
      expect(assessment.invariantsViolated.length).toBe(0);
    });

    it('interdicts destructive force pushes with high risk and human gate', () => {
      const assessment = evaluateToolSafety('run_command', 'git push origin main --force');
      expect(assessment.riskTier).toBe('high');
      expect(assessment.riskScore).toBeGreaterThanOrEqual(75);
      expect(assessment.suggestedAction).toBe('require_human_gate');
      expect(assessment.invariantsViolated).toContain(
        'Destructive branch overwrite forbidden without review'
      );
    });

    it('interdicts data deletion operations', () => {
      const assessment = evaluateToolSafety('run_command', 'rm -rf /some/important/dir');
      expect(assessment.riskTier).toBe('high');
      expect(assessment.invariantsViolated).toContain(
        'Potential irreversible data deletion detected'
      );
    });

    it('gates financial disbursements and spend actions', () => {
      const assessment = evaluateToolSafety('run_command', 'stripe charges create --amount 500');
      expect(assessment.riskTier).toBe('high');
      expect(assessment.invariantsViolated).toContain(
        'Financial disbursement requires human approval'
      );
    });
  });

  describe('Live Computer State & Routines', () => {
    it('provides valid default computer session state', () => {
      const computer = getDefaultComputerState();
      expect(computer.isActive).toBe(true);
      expect(computer.isUserInControl).toBe(false);
      expect(computer.recentLogs.length).toBeGreaterThan(0);
    });

    it('provides valid token telemetry and noise reduction stats', () => {
      const telemetry = getDefaultTokenTelemetry();
      expect(telemetry.ttftMs).toBeLessThanOrEqual(10);
      expect(telemetry.noiseReductionPercent).toBeGreaterThan(80);
      expect(telemetry.monthlyCeilingUsd).toBe(10.0);
      expect(telemetry.monthlySpendUsd).toBeLessThanOrEqual(telemetry.monthlyCeilingUsd);
    });

    it('manages automated outcome routines', async () => {
      const routines = await getAutomatedRoutines();
      expect(routines.length).toBeGreaterThanOrEqual(3);
      expect(routines[0].hardStopBoundary.length).toBeGreaterThan(0);

      const modified = [...routines, {
        id: 'custom-test-routine',
        name: 'Custom Test Routine',
        personaId: 'ship-pr',
        cadenceLabel: 'On Push',
        scheduleType: 'event' as const,
        status: 'active' as const,
        hardStopBoundary: 'Stop on test failure',
      }];
      await saveAutomatedRoutines(modified);
      const reloaded = await getAutomatedRoutines();
      expect(reloaded.some((r) => r.id === 'custom-test-routine')).toBe(true);
    });
  });
});
