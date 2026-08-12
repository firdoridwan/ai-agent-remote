import { StatusBar } from "expo-status-bar";
import { useRef } from "react";
import {
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useBridge, type LogKind } from "./src/useBridge";
import type {
  AgentLifecycle,
  ApprovalStatus,
  ConnectionState,
} from "./src/protocol";

const CONNECTION_COLOR: Record<ConnectionState, string> = {
  CONNECTED: "#1a7f4b",
  CONNECTING: "#a06a00",
  DISCONNECTED: "#9b2226",
};

const AGENT_COLOR: Record<AgentLifecycle, string> = {
  IDLE: "#5a6169",
  WORKING: "#1d4ed8",
  WAITING_APPROVAL: "#a06a00",
};

const APPROVAL_COLOR: Record<ApprovalStatus, string> = {
  NONE: "#5a6169",
  PENDING: "#a06a00",
  APPROVED: "#1a7f4b",
  DENIED: "#9b2226",
};

const LOG_COLOR: Record<LogKind, string> = {
  agent: "#111418",
  error: "#9b2226",
  system: "#5a6169",
};

export default function App() {
  const bridge = useBridge();
  const logRef = useRef<ScrollView>(null);

  const connected = bridge.connectionState === "CONNECTED";
  const approval = bridge.agentState?.approval;
  const approvalPending = approval?.status === "PENDING";

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Text style={styles.title}>AI Agent Remote</Text>
        <View
          style={[
            styles.pill,
            { backgroundColor: CONNECTION_COLOR[bridge.connectionState] },
          ]}
        >
          <Text style={styles.pillText}>{bridge.connectionState}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Bridge</Text>
        <Text style={styles.url}>{bridge.url}</Text>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={connected ? bridge.disconnect : bridge.connect}
        >
          <Text style={styles.buttonText}>
            {connected ? "Disconnect" : "Connect"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Agent state</Text>
        {bridge.agentState ? (
          <View style={styles.stateRow}>
            <View
              style={[
                styles.pill,
                { backgroundColor: AGENT_COLOR[bridge.agentState.agentState] },
              ]}
            >
              <Text style={styles.pillText}>
                {bridge.agentState.agentState}
              </Text>
            </View>
            <View
              style={[
                styles.pill,
                { backgroundColor: APPROVAL_COLOR[approval?.status ?? "NONE"] },
              ]}
            >
              <Text style={styles.pillText}>{approval?.status ?? "NONE"}</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.muted}>Belum ada snapshot dari bridge.</Text>
        )}
      </View>

      {approvalPending ? (
        <View style={[styles.card, styles.approvalCard]}>
          <Text style={styles.label}>Approval</Text>
          <Text style={styles.approvalStatus}>Pending</Text>
          {approval?.message ? (
            <Text style={styles.approvalText}>{approval.message}</Text>
          ) : null}
          <Text style={styles.muted}>
            Read-only. Jawab approval lewat test client di laptop.
          </Text>
        </View>
      ) : null}

      <Text style={styles.label}>Log</Text>
      <ScrollView
        ref={logRef}
        style={styles.log}
        onContentSizeChange={() =>
          logRef.current?.scrollToEnd({ animated: true })
        }
      >
        {bridge.log.map((entry) => (
          <Text
            key={entry.key}
            style={[styles.logLine, { color: LOG_COLOR[entry.kind] }]}
          >
            {entry.kind === "agent" ? "🤖 " : ""}
            {entry.text}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f5f6f7",
    paddingHorizontal: 16,
    paddingTop: (RNStatusBar.currentHeight ?? 24) + 12,
    paddingBottom: 16,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111418",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  approvalCard: {
    borderWidth: 2,
    borderColor: "#a06a00",
  },
  approvalStatus: {
    fontSize: 18,
    fontWeight: "700",
    color: "#a06a00",
  },
  approvalText: {
    fontSize: 16,
    color: "#111418",
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#5a6169",
    textTransform: "uppercase",
  },
  muted: {
    color: "#5a6169",
    fontSize: 13,
  },
  url: {
    fontSize: 15,
    color: "#111418",
  },
  stateRow: {
    flexDirection: "row",
    gap: 8,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  button: {
    backgroundColor: "#111418",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  pressed: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  log: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 12,
  },
  logLine: {
    fontSize: 13,
    marginBottom: 6,
  },
});
