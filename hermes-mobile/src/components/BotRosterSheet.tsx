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
import type { BotPersona } from '../types/grokBot';
import { DEFAULT_BOT_PERSONAS } from '../services/grokBotService';

interface BotRosterSheetProps {
  visible: boolean;
  activePersonaId: string;
  onSelectPersona: (persona: BotPersona) => void;
  onClose: () => void;
}

export const BotRosterSheet: React.FC<BotRosterSheetProps> = ({
  visible,
  activePersonaId,
  onSelectPersona,
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
        <View style={styles.sheetContainer}>
          {/* Handle */}
          <View style={styles.handleContainer}>
            <View style={styles.dragHandle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Bot Roster</Text>
              <Text style={styles.subtitle}>
                Choose a specialized outcome-owned teammate
              </Text>
            </View>
            <Pressable
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </View>

          {/* Persona List */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {DEFAULT_BOT_PERSONAS.map((persona) => {
              const isActive = persona.id === activePersonaId;
              return (
                <Pressable
                  key={persona.id}
                  style={[
                    styles.personaCard,
                    isActive && styles.personaCardActive,
                  ]}
                  onPress={() => {
                    onSelectPersona(persona);
                    onClose();
                  }}
                >
                  <View style={styles.cardHeader}>
                    <View
                      style={[
                        styles.avatarCircle,
                        { backgroundColor: persona.avatarColor },
                      ]}
                    >
                      <View style={styles.avatarInner}>
                        <View style={styles.avatarEye} />
                        <View style={styles.avatarEye} />
                      </View>
                    </View>

                    <View style={styles.metaColumn}>
                      <View style={styles.nameRow}>
                        <Text style={styles.personaName}>{persona.name}</Text>
                        {isActive && (
                          <View style={styles.activeBadge}>
                            <Text style={styles.activeBadgeText}>ACTIVE</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.charterText} numberOfLines={2}>
                        {persona.systemCharter}
                      </Text>
                    </View>
                  </View>

                  {persona.memorySummary && (
                    <View style={styles.memoryBox}>
                      <Text style={styles.memoryLabel}>🧠 Context & Memory</Text>
                      <Text style={styles.memoryText} numberOfLines={2}>
                        {persona.memorySummary}
                      </Text>
                    </View>
                  )}

                  <View style={styles.cardFooter}>
                    <View style={styles.stopRulesRow}>
                      <Text style={styles.stopRuleTag}>
                        🛡️ {persona.hardStopRules[0]}
                      </Text>
                    </View>
                    <Text style={styles.activeTimeLabel}>
                      {persona.lastActiveLabel}
                    </Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: '#131722',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    maxHeight: '82%',
    paddingBottom: 28,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
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
    paddingTop: 12,
    paddingBottom: 20,
    gap: 12,
  },
  personaCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    padding: 14,
  },
  personaCardActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(79, 70, 229, 0.08)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: 22,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(12, 12, 14, 0.8)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  avatarEye: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#FFFFFF',
  },
  metaColumn: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  personaName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  activeBadge: {
    backgroundColor: 'rgba(79, 70, 229, 0.25)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  activeBadgeText: {
    color: '#A5B4FC',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  charterText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 16,
  },
  memoryBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: 8,
    padding: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  memoryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 2,
  },
  memoryText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 15,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
  },
  stopRulesRow: {
    flex: 1,
  },
  stopRuleTag: {
    fontSize: 11,
    color: '#FCA5A5',
    fontWeight: '500',
  },
  activeTimeLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginLeft: 8,
  },
});

export default BotRosterSheet;
