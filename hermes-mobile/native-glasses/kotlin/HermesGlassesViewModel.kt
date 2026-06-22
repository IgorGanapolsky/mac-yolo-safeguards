package com.iganapolsky.hermesmobile.glasses

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch

/**
 * Single source of truth for glasses + phone (I/O checklist step 2/9).
 * Domain logic mirrors GatewayContext / hermesAgentTools.ts.
 */
class HermesGlassesViewModel(
    private val gatewayClient: HermesGatewayClient = HermesGatewayClient(),
) : ViewModel() {
    var pendingApprovals by mutableStateOf<List<PendingApproval>>(emptyList())
        private set
    var health by mutableStateOf(GatewayHealth())
        private set
    var sessionGreeting by mutableStateOf("")
        private set
    var isVisualUiSupported by mutableStateOf(false)
    var areVisualsOn by mutableStateOf(true)
    var micActive by mutableStateOf(false)

    fun onDisplayCapabilities(visualUi: Boolean, visualsOn: Boolean) {
        isVisualUiSupported = visualUi
        areVisualsOn = visualsOn
    }

    fun refresh() {
        viewModelScope.launch {
            health = gatewayClient.fetchHealth()
            sessionGreeting = buildGreeting()
        }
    }

    fun injectDemoApproval() {
        pendingApprovals = listOf(
            PendingApproval(
                actionId = "demo-glasses-${System.currentTimeMillis()}",
                toolName = "run_command",
                reason = "Demo ThumbGate block on AI glasses",
                command = "rm -rf /tmp/hermes-demo",
            ),
        ) + pendingApprovals
        sessionGreeting = buildGreeting()
    }

    fun approveTop() {
        if (pendingApprovals.isEmpty()) return
        pendingApprovals = pendingApprovals.drop(1)
        sessionGreeting = buildGreeting()
    }

    fun rejectTop() {
        if (pendingApprovals.isEmpty()) return
        pendingApprovals = pendingApprovals.drop(1)
        sessionGreeting = buildGreeting()
    }

    fun endSession(onEnd: () -> Unit) {
        micActive = false
        onEnd()
    }

    private fun buildGreeting(): String {
        val count = pendingApprovals.size
        val healthLabel = when (health.level) {
            HealthLevel.GREEN -> "Gateway healthy"
            HealthLevel.RED -> "Gateway blocked"
            HealthLevel.AMBER -> "Gateway warning"
            HealthLevel.UNKNOWN -> "Gateway unknown"
        }
        return if (count > 0) {
            "Hermes Mobile ready. $count pending approval${if (count == 1) "" else "s"}. $healthLabel."
        } else {
            "Hermes Mobile ready. No pending approvals. $healthLabel."
        }
    }
}
