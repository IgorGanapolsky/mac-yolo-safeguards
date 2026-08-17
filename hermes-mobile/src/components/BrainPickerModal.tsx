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
import type { BrainModel } from '../types/grokBot';
import { BRAIN_MODELS } from '../services/grokBotService';

interface BrainPickerModalProps {
  visible: boolean;
  activeModelId: string;
  onSelectModel: (model: BrainModel) => void;
  onClose: () => void;
}

export const BrainPickerModal: React.FC<BrainPickerModalProps> = ({
  visible,
  activeModelId,
  onSelectModel,
  onClose,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.dismissArea} onPress={onClose} />
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>🧠 Mixture of Experts</Text>
              <Text style={styles.subtitle}>
                Select brain & model router for this bot
              </Text>
            </View>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </View>

          {/* Model List */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {BRAIN_MODELS.map((model) => {
              const isActive = model.id === activeModelId;
              return (
                <Pressable
                  key={model.id}
                  style={[
                    styles.modelItem,
                    isActive && styles.modelItemActive,
                  ]}
                  onPress={() => {
                    onSelectModel(model);
                    onClose();
                  }}
                >
                  <View style={styles.modelHeader}>
                    <Text style={styles.modelName}>{model.name}</Text>
                    <View
                      style={[
                        styles.costBadge,
                        model.isZeroMarginalCost
                          ? styles.costBadgeFree
                          : styles.costBadgeCloud,
                      ]}
                    >
                      <Text
                        style={[
                          styles.costBadgeText,
                          model.isZeroMarginalCost
                            ? styles.costBadgeTextFree
                            : styles.costBadgeTextCloud,
                        ]}
                      >
                        {model.costPerMTokenLabel}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.modelDescription}>
                    {model.description}
                  </Text>

                  <View style={styles.specPillsRow}>
                    <View style={styles.specPill}>
                      <Text style={styles.specPillText}>
                        📦 {model.contextWindowLabel}
                      </Text>
                    </View>
                    <View style={styles.specPill}>
                      <Text style={styles.specPillText}>
                        ⚡ ~{model.speedTps} TPS
                      </Text>
                    </View>
                    {model.isZeroMarginalCost && (
                      <View style={[styles.specPill, styles.specPillHighlight]}>
                        <Text style={styles.specPillHighlightText}>
                          $0 Token Cap
                        </Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  dismissArea: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#131722',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    maxHeight: '80%',
    overflow: 'hidden',
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
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    paddingHorizontal: 16,
  },
  scrollContent: {
    paddingVertical: 14,
    gap: 10,
  },
  modelItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 12,
  },
  modelItemActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(79, 70, 229, 0.08)',
  },
  modelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  modelName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  costBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  costBadgeFree: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  costBadgeCloud: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
  },
  costBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  costBadgeTextFree: {
    color: '#34D399',
  },
  costBadgeTextCloud: {
    color: '#60A5FA',
  },
  modelDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 6,
    lineHeight: 16,
  },
  specPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  specPill: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  specPillText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  specPillHighlight: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  specPillHighlightText: {
    fontSize: 11,
    color: '#34D399',
    fontWeight: '600',
  },
});

export default BrainPickerModal;
