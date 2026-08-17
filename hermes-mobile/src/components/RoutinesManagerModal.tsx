import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from '../theme/colors';
import type { AutomationRoutine } from '../types/grokBot';

interface RoutinesManagerModalProps {
  visible: boolean;
  routines: AutomationRoutine[];
  onTriggerRoutine: (routineId: string) => void;
  onClose: () => void;
}

export const RoutinesManagerModal: React.FC<RoutinesManagerModalProps> = ({
  visible,
  routines,
  onTriggerRoutine,
  onClose,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.dismissArea} onPress={onClose} />
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>⏱️ Automated Outcome Routines</Text>
              <Text style={styles.subtitle}>
                Scheduled agent workflows & continuous monitors
              </Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {/* Routines List */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {routines.map((routine) => (
              <View key={routine.id} style={styles.routineCard}>
                <View style={styles.cardTop}>
                  <View style={styles.nameBlock}>
                    <Text style={styles.routineName}>{routine.name}</Text>
                    <View style={styles.cadenceRow}>
                      <Text style={styles.cadenceIcon}>◷</Text>
                      <Text style={styles.cadenceText}>
                        {routine.cadenceLabel}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    style={styles.runButton}
                    onPress={() => onTriggerRoutine(routine.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Run ${routine.name} now`}
                  >
                    <Text style={styles.runButtonText}>Run Now</Text>
                  </Pressable>
                </View>

                {routine.lastRunSummary && (
                  <View style={styles.summaryBox}>
                    <Text style={styles.summaryLabel}>
                      Last Run: {routine.lastRunAt || 'Recent'}
                    </Text>
                    <Text style={styles.summaryText}>
                      {routine.lastRunSummary}
                    </Text>
                  </View>
                )}

                <View style={styles.boundaryBox}>
                  <Text style={styles.boundaryText}>
                    🛡️ <Text style={styles.boundaryBold}>Stop Boundary:</Text>{' '}
                    {routine.hardStopBoundary}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  modalCard: {
    backgroundColor: '#131722',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    maxHeight: '82%',
    paddingBottom: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    paddingHorizontal: 16,
  },
  scrollContent: {
    paddingVertical: 14,
    gap: 12,
  },
  routineCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    padding: 14,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  nameBlock: {
    flex: 1,
  },
  routineName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  cadenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  cadenceIcon: {
    fontSize: 12,
    color: colors.accent,
  },
  cadenceText: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '500',
  },
  runButton: {
    backgroundColor: 'rgba(79, 70, 229, 0.2)',
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  runButtonText: {
    color: '#A5B4FC',
    fontSize: 12,
    fontWeight: '700',
  },
  summaryBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  summaryText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  boundaryBox: {
    marginTop: 8,
  },
  boundaryText: {
    fontSize: 11,
    color: '#FCA5A5',
    lineHeight: 15,
  },
  boundaryBold: {
    fontWeight: '700',
  },
});

export default RoutinesManagerModal;
