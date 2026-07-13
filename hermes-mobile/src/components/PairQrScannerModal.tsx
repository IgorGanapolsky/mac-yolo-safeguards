import React, { useCallback, useEffect, useRef } from 'react';
import { Modal, StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors } from '../theme/colors';
import type { SetupDeepLinkParams } from '../utils/setupDeepLink';
import { resolvePairQrPayload } from '../utils/pairQrResolve';
import MacPairingHelp from './MacPairingHelp';

type PairQrScannerModalProps = {
  visible: boolean;
  onClose: () => void;
  onScanned: (params: SetupDeepLinkParams) => Promise<void>;
  onInvalidScan?: () => void;
};

export default function PairQrScannerModal({
  visible,
  onClose,
  onScanned,
  onInvalidScan,
}: PairQrScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const handledRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      handledRef.current = false;
    }
  }, [visible]);

  useEffect(() => {
    if (visible && !permission?.granted) {
      requestPermission();
    }
  }, [visible, permission?.granted, requestPermission]);

  const handleBarcode = useCallback(
    async (result: { data: string }) => {
      if (handledRef.current) {
        return;
      }
      const setup = await resolvePairQrPayload(result.data);
      if (!setup) {
        onInvalidScan?.();
        return;
      }
      handledRef.current = true;
      try {
        await onScanned(setup);
        onClose();
      } catch {
        handledRef.current = false;
      }
    },
    [onClose, onScanned],
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <Text style={styles.title}>Scan QR from your computer</Text>
        <Text style={styles.subtitle}>
          Scan the QR on your Mac&apos;s Hermes Mobile pairing page (same home Wi‑Fi). No QR? Go back
          and tap Find computers.
        </Text>
        <MacPairingHelp variant="qr-pairing" compact testID="pair-qr-scanner-help" />

        {!permission ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : !permission.granted ? (
          <View style={styles.centered}>
            <Text style={styles.permissionText}>Camera access is required to scan the pairing QR.</Text>
            <TouchableOpacity style={styles.button} onPress={() => requestPermission()}>
              <Text style={styles.buttonText}>Allow camera</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleBarcode}
          />
        )}

        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundStart,
    paddingTop: 48,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: 16,
  },
  camera: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  loader: {
    marginTop: 48,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  permissionText: {
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
  closeButton: {
    alignSelf: 'center',
    paddingVertical: 12,
  },
  closeText: {
    color: colors.textMuted,
    fontWeight: '600',
  },
});
