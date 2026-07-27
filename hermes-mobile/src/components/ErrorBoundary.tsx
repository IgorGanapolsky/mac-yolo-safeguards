import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { colors } from '../theme/colors';
import { captureCrash } from '../services/crashReporting';
import { captureException } from '../services/telemetry';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  /** First frames of React componentStack for dogfood triage. */
  stackHint: string;
}

function stackHintFromComponentStack(componentStack?: string | null): string {
  if (!componentStack?.trim()) {
    return '';
  }
  return componentStack
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(' ← ');
}

export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, message: '', stackHint: '' };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const stackHint = stackHintFromComponentStack(errorInfo.componentStack);
    if (stackHint) {
      this.setState({ stackHint });
    }
    console.error('[hermes-mobile] Uncaught UI error:', error, errorInfo);
    // Persist to the crash queue (survives process death). trackProductEvent is
    // fire-and-forget and cannot complete when the app is dying — captureCrash
    // writes durably and flushes on the next launch.
    void captureCrash('ui_crash', error, {
      component_stack: errorInfo.componentStack?.slice(0, 500) ?? '',
    });
    // Also report to Sentry (no-op without a DSN) so UI crashes surface in the
    // same dashboard as native/JS crashes.
    captureException(error, {
      source: 'ui_error_boundary',
      component_stack: errorInfo.componentStack?.slice(0, 500) ?? '',
    });
  }

  private reset = () => this.setState({ hasError: false, message: '', stackHint: '' });

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>⚡</Text>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>The UI hit an unexpected error. Gateway state is unchanged.</Text>
        {this.state.message ? (
          <Text style={styles.detail} testID="error-boundary-message">
            {this.state.message}
          </Text>
        ) : null}
        {this.state.stackHint ? (
          <Text style={styles.stackHint} testID="error-boundary-stack-hint">
            {this.state.stackHint}
          </Text>
        ) : null}
        <TouchableOpacity style={styles.button} onPress={this.reset} activeOpacity={0.85}>
          <Text style={styles.buttonText}>TRY AGAIN</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundStart,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    marginBottom: 8,
  },
  message: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 12,
  },
  detail: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  stackHint: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 14,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 1,
  },
});
