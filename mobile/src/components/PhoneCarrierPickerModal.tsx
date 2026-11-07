import React from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { X, Smartphone, Check } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import { NO_PHONE_CARRIER_LABEL, PHONE_CARRIERS, findPhoneCarrier } from "../shared";
import { typography, spacing, MIN_TOUCH_TARGET } from "../theme/theme";

interface PhoneCarrierPickerModalProps {
  visible: boolean;
  onClose: () => void;
  /** Saved carrier value ("" when none is picked). */
  selectedCarrier: string;
  /** Called with the carrier id, or "" for none (Twilio). */
  onSelectCarrier: (carrierId: string) => void;
}

const OPTIONS: { id: string; label: string }[] = [
  { id: "", label: NO_PHONE_CARRIER_LABEL },
  ...PHONE_CARRIERS.map(({ id, label }) => ({ id, label })),
];

export const PhoneCarrierPickerModal: React.FC<PhoneCarrierPickerModalProps> = ({
  visible,
  onClose,
  selectedCarrier,
  onSelectCarrier,
}) => {
  const { theme } = useTheme();
  const selectedId = selectedCarrier ? findPhoneCarrier(selectedCarrier)?.id : "";

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.safeContainer}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
            ]}
          >
            <View style={[styles.header, { borderBottomColor: theme.cardBorder }]}>
              <View style={styles.headerLeft}>
                <View
                  style={[
                    styles.iconCircle,
                    { backgroundColor: theme.accentLight, borderColor: theme.accent },
                  ]}
                >
                  <Smartphone size={18} color={theme.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: theme.textPrimary }]}>Phone Carrier</Text>
                  <Text style={[styles.subtitle, { color: theme.textMuted }]}>
                    Texts go through your carrier, or Twilio if none is picked
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.scrollList} contentContainerStyle={{ paddingVertical: 8 }}>
              {OPTIONS.map((option) => {
                const isSelected = selectedId === option.id;
                return (
                  <TouchableOpacity
                    key={option.id || "none"}
                    style={[
                      styles.carrierItem,
                      {
                        backgroundColor: isSelected ? theme.accentLight : theme.inputBg,
                        borderColor: isSelected ? theme.accent : theme.inputBorder,
                      },
                    ]}
                    onPress={() => onSelectCarrier(option.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={option.label}
                  >
                    <Text
                      style={[
                        styles.carrierLabel,
                        { color: theme.textPrimary },
                        isSelected && { fontWeight: "700" },
                      ]}
                      numberOfLines={1}
                    >
                      {option.label}
                    </Text>
                    {isSelected && <Check size={18} color={theme.accent} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={[styles.footer, { borderTopColor: theme.cardBorder }]}>
              <TouchableOpacity
                style={[
                  styles.cancelBtn,
                  { backgroundColor: theme.inputBg, borderColor: theme.inputBorder },
                ]}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={[styles.cancelBtnText, { color: theme.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.md,
  },
  safeContainer: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "85%",
  },
  modalCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    maxHeight: "100%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: typography.md,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: typography.xs,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollList: {
    paddingHorizontal: spacing.md,
    maxHeight: 420,
  },
  carrierItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    minHeight: MIN_TOUCH_TARGET,
  },
  carrierLabel: {
    flex: 1,
    fontSize: typography.sm,
    fontWeight: "600",
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    alignItems: "flex-end",
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: typography.sm,
    fontWeight: "600",
  },
});
