import type { Inngest } from "inngest";
import type { Realtime } from "./types";

/**
 * Publish data to a realtime channel from outside an Inngest function.
 *
 * This can be used in route handlers, API endpoints, or anywhere else
 * to push realtime updates to subscribers.
 *
 * @example
 * ```typescript
 * // In a Next.js route handler
 * import { inngest } from "./inngest/client";
 * import { publishToChannel } from "@appwrite.io/inngest-realtime";
 *
 * export async function POST(request: Request) {
 *   const data = await request.json();
 *
 *   // Process your data...
 *   await processData(data);
 *
 *   // Push update to realtime subscribers
 *   await publishToChannel(inngest, {
 *     channel: `project:${data.projectId}`,
 *     topic: "workspaceState",
 *     data: {
 *       status: "completed",
 *       result: data
 *     }
 *   });
 *
 *   return Response.json({ success: true });
 * }
 * ```
 */
export async function publishToChannel<TData = unknown>(
  /**
   * Your Inngest client instance
   */
  client: Inngest.Any,

  /**
   * Publishing options
   */
  options: {
    /**
     * The channel to publish to (e.g., "project:123")
     */
    channel: string;

    /**
     * The topic to publish to (e.g., "workspaceState")
     */
    topic: string;

    /**
     * The data to publish
     */
    data: TData;

    /**
     * Optional run ID to associate with this publish
     */
    runId?: string;
  },
): Promise<void> {
  // Access the internal API (it's private but accessible via bracket notation)
  const api = client["inngestApi"] as {
    publish: (
      publishOptions: { channel: string; topics: string[]; runId?: string },
      data: unknown,
    ) => Promise<{ ok: boolean; error?: { error: string } }>;
  };

  if (!api) {
    throw new Error(
      "Inngest API not found. Make sure you're using a valid Inngest client instance.",
    );
  }

  const result = await api.publish(
    {
      channel: options.channel,
      topics: [options.topic],
      runId: options.runId,
    },
    options.data,
  );

  if (!result.ok) {
    throw new Error(
      `Failed to publish to channel: ${result.error?.error || "Unknown error"}`,
    );
  }
}

/**
 * Publish multiple messages to different topics at once.
 *
 * @example
 * ```typescript
 * await publishToChannelBatch(inngest, {
 *   channel: "project:123",
 *   messages: [
 *     { topic: "workspaceState", data: { status: "active" } },
 *     { topic: "notifications", data: { message: "Update complete" } }
 *   ]
 * });
 * ```
 */
export async function publishToChannelBatch(
  /**
   * Your Inngest client instance
   */
  client: Inngest.Any,

  /**
   * Batch publishing options
   */
  options: {
    /**
     * The channel to publish to
     */
    channel: string;

    /**
     * Array of messages to publish
     */
    messages: Array<{
      /**
       * The topic to publish to
       */
      topic: string;

      /**
       * The data to publish
       */
      data: unknown;
    }>;

    /**
     * Optional run ID to associate with all messages
     */
    runId?: string;
  },
): Promise<void> {
  // Publish all messages in parallel
  await Promise.all(
    options.messages.map((message) =>
      publishToChannel(client, {
        channel: options.channel,
        topic: message.topic,
        data: message.data,
        runId: options.runId,
      }),
    ),
  );
}

/**
 * Create a channel publisher - a convenience function that pre-binds the channel
 * so you don't have to specify it every time.
 *
 * @example
 * ```typescript
 * // Create a publisher for a specific channel
 * const publishToProject = createChannelPublisher(inngest, "project:123");
 *
 * // Use it in route handlers
 * await publishToProject("workspaceState", { status: "active" });
 * await publishToProject("notifications", { message: "Done!" });
 * ```
 */
export function createChannelPublisher(
  /**
   * Your Inngest client instance
   */
  client: Inngest.Any,

  /**
   * The channel to publish to
   */
  channel: string,

  /**
   * Optional run ID to associate with all publishes
   */
  runId?: string,
) {
  return async <TData = unknown>(topic: string, data: TData): Promise<void> => {
    await publishToChannel(client, {
      channel,
      topic,
      data,
      runId,
    });
  };
}

