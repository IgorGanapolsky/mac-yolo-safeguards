import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { colors } from '../theme/colors';
import { trackProductEvent } from '../services/productAnalytics';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[hermes-mobile] Uncaught UI error:', error, errorInfo);
    void trackProductEvent('ui_crash', {
      message: error.message,
      component_stack: errorInfo.componentStack?.slice(0, 500) ?? '',
    });
  }

  private reset = () => this.setState({ hasError: false, message: '' });

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>⚡</Text>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>The UI hit an unexpected error. Gateway state is unchanged.</Text>
        {this.state.message ? <Text style={styles.detail}>{this.state.message}</Text> : null}
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
    marginBottom: 24,
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
