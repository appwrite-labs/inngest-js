/**
 * Example: Using SubscriptionManager with Zustand
 *
 * This example shows how to use the SubscriptionManager to subscribe to
 * realtime updates and update a Zustand store without causing React re-renders.
 */

import { create } from "zustand";
import {
  createSubscriptionManager,
  type SubscriptionManager,
  SubscriptionState,
} from "@appwrite.io/inngest-realtime";

// Define your workspace state type
interface WorkspaceState {
  status: string;
  lastUpdated: number;
  // ... other workspace properties
}

// Define your Zustand store
interface ProjectStore {
  workspaceState: WorkspaceState | null;
  realtimeConnectionState: SubscriptionState;
  realtimeError: Error | null;
  messageCount: number;

  // Actions
  updateWorkspaceState: (state: WorkspaceState) => void;
  setRealtimeState: (state: SubscriptionState) => void;
  setRealtimeError: (error: Error | null) => void;
  incrementMessageCount: () => void;
}

export const useProjectStore = create<ProjectStore>((set) => ({
  workspaceState: null,
  realtimeConnectionState: SubscriptionState.Idle,
  realtimeError: null,
  messageCount: 0,

  updateWorkspaceState: (state) => set({ workspaceState: state }),
  setRealtimeState: (state) => set({ realtimeConnectionState: state }),
  setRealtimeError: (error) => set({ realtimeError: error }),
  incrementMessageCount: () =>
    set((state) => ({ messageCount: state.messageCount + 1 })),
}));

// Token refresh function (replace with your actual implementation)
async function refreshProjectToken(projectId: string) {
  const response = await fetch(`/api/projects/${projectId}/realtime-token`);
  const json = await response.json();
  return json.token; // { channel, topics, key }
}

// Create subscription manager instance (at top level or in a singleton)
let subscriptionInstance: SubscriptionManager | null = null;

export function initializeProjectRealtime(projectId: string) {
  // Clean up existing subscription if any
  if (subscriptionInstance) {
    subscriptionInstance.stop();
  }

  // Create new subscription
  subscriptionInstance = createSubscriptionManager({
    refreshToken: () => refreshProjectToken(projectId),
    topic: "workspaceState", // Only listen to this specific topic

    // This is where the magic happens - update Zustand directly!
    onChange: (message, allMessages) => {
      console.log("Received workspace state update:", message);

      // Update Zustand store - NO REACT RE-RENDERS from the subscription hook!
      useProjectStore.getState().updateWorkspaceState(message.data);
      useProjectStore.getState().incrementMessageCount();
    },

    onStateChange: (state) => {
      console.log("Realtime connection state:", state);
      useProjectStore.getState().setRealtimeState(state);
    },

    onError: (error) => {
      console.error("Realtime subscription error:", error);
      useProjectStore.getState().setRealtimeError(error);
    },

    onStop: () => {
      console.log("Realtime subscription stopped - cleaning up");
      // Clean up your store state if needed
      useProjectStore.getState().setRealtimeState(SubscriptionState.Closed);
      useProjectStore.getState().setRealtimeError(null);
    },

    autoStart: true, // Start immediately
    maxMessages: 100, // Keep last 100 messages in memory
  });

  return subscriptionInstance;
}

export function stopProjectRealtime() {
  if (subscriptionInstance) {
    subscriptionInstance.stop();
    subscriptionInstance = null;
  }
}

export function getProjectRealtimeInstance() {
  return subscriptionInstance;
}

// ============================================================================
// Usage in your React app:
// ============================================================================

/**
 * In your app initialization (e.g., _app.tsx or layout.tsx):
 *
 * ```typescript
 * import { useEffect } from 'react';
 * import { initializeProjectRealtime, stopProjectRealtime } from './realtime';
 *
 * function MyApp({ projectId }) {
 *   useEffect(() => {
 *     // Initialize realtime subscription
 *     const subscription = initializeProjectRealtime(projectId);
 *
 *     // Cleanup on unmount
 *     return () => {
 *       stopProjectRealtime();
 *     };
 *   }, [projectId]);
 *
 *   return <YourApp />;
 * }
 * ```
 */

/**
 * In your components, just use Zustand selectors:
 *
 * ```typescript
 * import { useProjectStore } from './store';
 *
 * function WorkspaceStatus() {
 *   // This component ONLY re-renders when workspaceState changes
 *   // NOT when other realtime messages arrive!
 *   const workspaceState = useProjectStore((state) => state.workspaceState);
 *   const connectionState = useProjectStore((state) => state.realtimeConnectionState);
 *
 *   return (
 *     <div>
 *       <p>Status: {workspaceState?.status}</p>
 *       <p>Connection: {connectionState}</p>
 *     </div>
 *   );
 * }
 * ```
 */

/**
 * Multiple topic subscriptions:
 *
 * ```typescript
 * // Subscribe to multiple topics with separate managers
 * const workspaceSubscription = createSubscriptionManager({
 *   refreshToken: () => getToken(),
 *   topic: "workspaceState",
 *   onChange: (msg) => updateStore.setState({ workspace: msg.data }),
 * });
 *
 * const notificationsSubscription = createSubscriptionManager({
 *   refreshToken: () => getToken(),
 *   topic: "notifications",
 *   onChange: (msg) => updateStore.setState({ notifications: msg.data }),
 * });
 * ```
 */

/**
 * Programmatic control:
 *
 * ```typescript
 * const subscription = getProjectRealtimeInstance();
 *
 * // Check if active
 * if (subscription?.isActive()) {
 *   console.log("Connected!");
 * }
 *
 * // Get all messages
 * const messages = subscription?.getMessages();
 *
 * // Get latest message
 * const latest = subscription?.getLatestMessage();
 *
 * // Restart connection
 * await subscription?.restart();
 *
 * // Refresh token and restart
 * await subscription?.refreshAndRestart();
 *
 * // Change topic filter on the fly
 * subscription?.setTopic("differentTopic");
 *
 * // Clear message history
 * subscription?.clearMessages();
 * ```
 */

