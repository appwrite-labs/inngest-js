import type { Realtime } from "./types";
import { subscribe } from "./subscribe";

export interface SubscriptionManagerOptions<
  TToken extends Realtime.Subscribe.Token,
> {
  /**
   * Initial token for the subscription. If not provided, you must provide refreshToken.
   */
  token?: TToken;

  /**
   * Function to fetch/refresh the subscription token.
   */
  refreshToken?: () => Promise<TToken>;

  /**
   * Optional topic filter. If provided, only messages from this topic will trigger onChange.
   */
  topic?: string;

  /**
   * Callback triggered when a new message arrives (optionally filtered by topic).
   */
  onChange: (
    message: Realtime.Subscribe.Token.InferMessage<TToken>,
    allMessages: Realtime.Subscribe.Token.InferMessage<TToken>[],
  ) => void;

  /**
   * Callback triggered when connection state changes.
   */
  onStateChange?: (state: SubscriptionState) => void;

  /**
   * Callback triggered when an error occurs.
   */
  onError?: (error: Error) => void;

  /**
   * Callback triggered when the subscription stops (either manually or due to error).
   */
  onStop?: () => void;

  /**
   * Whether to start the subscription immediately. Default: true
   */
  autoStart?: boolean;

  /**
   * Maximum number of messages to keep in memory. Default: 1000
   * Older messages will be removed when this limit is exceeded.
   */
  maxMessages?: number;
}

export enum SubscriptionState {
  Idle = "idle",
  Connecting = "connecting",
  Active = "active",
  Error = "error",
  Closed = "closed",
}

export class SubscriptionManager<
  TToken extends Realtime.Subscribe.Token = Realtime.Subscribe.Token,
> {
  private token: TToken | null = null;
  private refreshToken?: () => Promise<TToken>;
  private topic?: string;
  private onChange: (
    message: Realtime.Subscribe.Token.InferMessage<TToken>,
    allMessages: Realtime.Subscribe.Token.InferMessage<TToken>[],
  ) => void;
  private onStateChange?: (state: SubscriptionState) => void;
  private onError?: (error: Error) => void;
  private onStop?: () => void;
  private state: SubscriptionState = SubscriptionState.Idle;
  private messages: Realtime.Subscribe.Token.InferMessage<TToken>[] = [];
  private maxMessages: number;
  private subscription: Realtime.Subscribe.StreamSubscription | null = null;
  private reader: ReadableStreamDefaultReader<Realtime.Message> | null = null;
  private isRunning = false;

  constructor(options: SubscriptionManagerOptions<TToken>) {
    this.token = options.token || null;
    this.refreshToken = options.refreshToken;
    this.topic = options.topic;
    this.onChange = options.onChange;
    this.onStateChange = options.onStateChange;
    this.onError = options.onError;
    this.onStop = options.onStop;
    this.maxMessages = options.maxMessages || 1000;

    if (options.autoStart !== false) {
      this.start();
    }
  }

  /**
   * Start the subscription.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn("Subscription is already running");
      return;
    }

    this.isRunning = true;

    try {
      // Get token if not already available
      if (!this.token && this.refreshToken) {
        this.updateState(SubscriptionState.Connecting);
        this.token = await this.refreshToken();
      }

      if (!this.token) {
        throw new Error(
          "No token provided and no refreshToken function available",
        );
      }

      // Start subscription
      this.updateState(SubscriptionState.Connecting);
      this.subscription = await subscribe({ ...this.token });
      this.reader = this.subscription.getReader();
      this.updateState(SubscriptionState.Active);

      // Read messages
      await this.readLoop();
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  /**
   * Stop the subscription.
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader.releaseLock();
        this.reader = null;
      }

      if (this.subscription) {
        await this.subscription.cancel();
        this.subscription = null;
      }

      this.updateState(SubscriptionState.Closed);

      // Call onStop callback if provided
      if (this.onStop) {
        try {
          this.onStop();
        } catch (error) {
          console.error("Error in onStop callback:", error);
        }
      }
    } catch (error) {
      console.error("Error stopping subscription:", error);
    }
  }

  /**
   * Restart the subscription (useful after errors or token refresh).
   */
  async restart(): Promise<void> {
    await this.stop();
    this.messages = [];
    await this.start();
  }

  /**
   * Refresh the token and restart the subscription.
   */
  async refreshAndRestart(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error("No refreshToken function available");
    }

    try {
      this.token = await this.refreshToken();
      await this.restart();
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  /**
   * Get the current state of the subscription.
   */
  getState(): SubscriptionState {
    return this.state;
  }

  /**
   * Get all messages received so far.
   */
  getMessages(): Realtime.Subscribe.Token.InferMessage<TToken>[] {
    return [...this.messages];
  }

  /**
   * Get the latest message.
   */
  getLatestMessage():
    | Realtime.Subscribe.Token.InferMessage<TToken>
    | null {
    return this.messages[this.messages.length - 1] || null;
  }

  /**
   * Clear all stored messages.
   */
  clearMessages(): void {
    this.messages = [];
  }

  /**
   * Update the topic filter. Set to undefined to receive all messages.
   */
  setTopic(topic: string | undefined): void {
    this.topic = topic;
  }

  /**
   * Check if the subscription is currently running.
   */
  isActive(): boolean {
    return this.isRunning && this.state === SubscriptionState.Active;
  }

  private async readLoop(): Promise<void> {
    if (!this.reader) return;

    try {
      while (this.isRunning) {
        const { done, value } = await this.reader.read();

        if (done || !this.isRunning) {
          break;
        }

        // Filter by topic if specified
        if (this.topic && value.topic !== this.topic) {
          continue;
        }

        // Add to messages array
        this.messages.push(
          value as unknown as Realtime.Subscribe.Token.InferMessage<TToken>,
        );

        // Trim messages if exceeding max
        if (this.messages.length > this.maxMessages) {
          this.messages = this.messages.slice(-this.maxMessages);
        }

        // Trigger onChange callback
        try {
          this.onChange(
            value as unknown as Realtime.Subscribe.Token.InferMessage<TToken>,
            this.messages,
          );
        } catch (error) {
          console.error("Error in onChange callback:", error);
        }
      }

      // Stream closed cleanly
      if (this.isRunning) {
        this.updateState(SubscriptionState.Closed);
      }
    } catch (error) {
      if (this.isRunning) {
        this.handleError(error as Error);
      }
    }
  }

  private updateState(newState: SubscriptionState): void {
    this.state = newState;
    if (this.onStateChange) {
      try {
        this.onStateChange(newState);
      } catch (error) {
        console.error("Error in onStateChange callback:", error);
      }
    }
  }

  private handleError(error: Error): void {
    this.updateState(SubscriptionState.Error);
    if (this.onError) {
      try {
        this.onError(error);
      } catch (err) {
        console.error("Error in onError callback:", err);
      }
    }
  }
}

/**
 * Create a subscription manager instance.
 *
 * @example
 * ```typescript
 * const subscription = createSubscriptionManager({
 *   refreshToken: () => getToken(),
 *   topic: "workspaceState",
 *   onChange: (message) => {
 *     // Update Zustand store
 *     useStore.setState({ workspaceState: message.data });
 *   },
 *   onStateChange: (state) => {
 *     console.log("Connection state:", state);
 *   },
 * });
 *
 * // Later, when done:
 * await subscription.stop();
 * ```
 */
export function createSubscriptionManager<
  TToken extends Realtime.Subscribe.Token = Realtime.Subscribe.Token,
>(
  options: SubscriptionManagerOptions<TToken>,
): SubscriptionManager<TToken> {
  return new SubscriptionManager(options);
}

