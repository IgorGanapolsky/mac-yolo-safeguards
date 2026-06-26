package com.iganapolsky.hermesmobile.glasses

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.xr.glimmer.Button
import androidx.xr.glimmer.Card
import androidx.xr.glimmer.GlimmerTheme
import androidx.xr.glimmer.ListItem
import androidx.xr.glimmer.Text
import androidx.xr.glimmer.VerticalList
import androidx.xr.glimmer.surface

@Composable
fun HermesGlassesApp(
    viewModel: HermesGlassesViewModel,
    onClose: () -> Unit,
) {
    GlimmerTheme {
        if (viewModel.isVisualUiSupported && viewModel.areVisualsOn) {
            HermesLeashGlimmerScreen(viewModel = viewModel, onClose = onClose)
        } else {
            HermesAudioFirstScreen(viewModel = viewModel, onClose = onClose)
        }
    }
}

@Composable
private fun HermesLeashGlimmerScreen(
    viewModel: HermesGlassesViewModel,
    onClose: () -> Unit,
) {
    Box(
        modifier = Modifier
            .surface()
            .fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Card(
            title = { Text("Hermes Leash") },
            action = {
                Button(onClick = onClose) { Text("Close") }
            },
        ) {
            Text(viewModel.sessionGreeting)
            if (viewModel.pendingApprovals.isEmpty()) {
                Text("No pending approvals")
                Button(onClick = { viewModel.injectDemoApproval() }) {
                    Text("Inject demo")
                }
            } else {
                VerticalList {
                    viewModel.pendingApprovals.forEach { approval ->
                        ListItem(
                            primaryLabel = { Text(approval.toolName) },
                            supportingLabel = { Text(approval.reason) },
                        )
                    }
                }
                val top = viewModel.pendingApprovals.first()
                Button(onClick = { viewModel.rejectTop() }) { Text("Reject") }
                Button(onClick = { viewModel.approveTop() }) { Text("Approve") }
                Text("Top: ${top.toolName}")
            }
        }
    }
}

@Composable
private fun HermesAudioFirstScreen(
    viewModel: HermesGlassesViewModel,
    onClose: () -> Unit,
) {
    Box(
        modifier = Modifier
            .surface()
            .fillMaxSize()
            .padding(16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Card(
            title = { Text("Hermes audio") },
            action = { Button(onClick = onClose) { Text("End session") } },
        ) {
            Text(viewModel.sessionGreeting)
            Text("Say approve or reject for the top pending tool call.")
            if (viewModel.pendingApprovals.isNotEmpty()) {
                Text(viewModel.pendingApprovals.first().toolName)
            }
            Button(onClick = { viewModel.approveTop() }) { Text("Approve") }
            Button(onClick = { viewModel.rejectTop() }) { Text("Reject") }
        }
    }
}
