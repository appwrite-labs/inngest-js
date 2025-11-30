/**
 * Simple example: Using SubscriptionManager without React/Zustand
 */

import {
  createSubscriptionManager,
  SubscriptionState,
} from "@appwrite.io/inngest-realtime";

// Token refresh function
async function getMyToken() {
  const response = await fetch("/api/realtime-token");
  const json = await response.json();
  return json.token; // { channel, topics, key }
}

// Create the subscription
const subscription = createSubscriptionManager({
  // Fetch token automatically
  refreshToken: getMyToken,

  // Optional: Only listen to specific topic
  topic: "workspaceState",

  // Called whenever a new message arrives
  onChange: (message, allMessages) => {
    console.log("New message:", message);
    console.log("Total messages received:", allMessages.length);

    // Do whatever you want with the message:
    // - Update Zustand: useStore.setState({ data: message.data })
    // - Update Redux: dispatch(updateData(message.data))
    // - Update Jotai: set(dataAtom, message.data)
    // - Call an API: fetch('/api/update', { body: message.data })
    // - Anything else!
  },

  // Optional: Track connection state
  onStateChange: (state) => {
    console.log("Connection state:", state);
    if (state === SubscriptionState.Active) {
      console.log("✅ Connected and ready!");
    }
  },

  // Optional: Handle errors
  onError: (error) => {
    console.error("Subscription error:", error);
  },

  // Optional: Called when subscription stops
  onStop: () => {
    console.log("Subscription stopped - cleanup time!");
    // Clear state, reset flags, etc.
  },

  // Optional: Start immediately (default: true)
  autoStart: true,

  // Optional: Max messages to keep in memory (default: 1000)
  maxMessages: 100,
});

// Later, when you're done:
// await subscription.stop();

// Programmatic control:
console.log("Is active?", subscription.isActive());
console.log("Current state:", subscription.getState());
console.log("All messages:", subscription.getMessages());
console.log("Latest message:", subscription.getLatestMessage());

// Restart if needed
// await subscription.restart();

// Refresh token and restart
// await subscription.refreshAndRestart();

// Change topic on the fly
// subscription.setTopic("differentTopic");

// Clear message history
// subscription.clearMessages();

