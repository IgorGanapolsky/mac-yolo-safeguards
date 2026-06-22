package com.iganapolsky.hermesmobile.glasses

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.lifecycleScope
import androidx.xr.projected.ExperimentalProjectedApi
import androidx.xr.projected.ProjectedDisplayController
import androidx.xr.projected.ProjectedDeviceController
import androidx.xr.projected.capability.CAPABILITY_VISUAL_UI
import kotlinx.coroutines.launch

/**
 * Projected activity for AI glasses — Leash approval vertical slice.
 * @see https://www.youtube.com/watch?v=83CF7AhozJ8
 */
@OptIn(ExperimentalProjectedApi::class)
class HermesGlassesProjectedActivity : ComponentActivity() {
    private val viewModel: HermesGlassesViewModel by viewModels()
    private var displayController: ProjectedDisplayController? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onDestroy(owner: LifecycleOwner) {
                displayController?.close()
                displayController = null
            }
        })

        initializeProjected()
        viewModel.refresh()
        viewModel.injectDemoApproval()

        setContent {
            HermesGlassesApp(
                viewModel = viewModel,
                onClose = { finish() },
            )
        }
    }

    private fun initializeProjected() {
        lifecycleScope.launch {
            try {
                val device = ProjectedDeviceController.create(this@HermesGlassesProjectedActivity)
                val visualUi = device.capabilities.contains(CAPABILITY_VISUAL_UI)
                val controller = ProjectedDisplayController.create(this@HermesGlassesProjectedActivity)
                displayController = controller
                controller.addPresentationModeChangeListener { mode ->
                    val visualsOn = mode.toString().contains("visuals_on", ignoreCase = true)
                    viewModel.onDisplayCapabilities(visualUi, visualsOn)
                }
                viewModel.onDisplayCapabilities(visualUi, true)
            } catch (_: Exception) {
                viewModel.onDisplayCapabilities(isVisualUiSupported = false, visualsOn = false)
            }
        }
    }
}
