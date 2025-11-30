/**
 * Example: Publishing to Realtime Channels from Route Handlers
 *
 * This shows how to emit realtime updates from regular API routes,
 * completely outside of Inngest functions.
 */

import { inngest } from "./inngest/client"; // Your Inngest client
import {
  publishToChannel,
  publishToChannelBatch,
  createChannelPublisher,
} from "@appwrite.io/inngest-realtime";

// ===========================================================================
// Example 1: Simple publish from a Next.js API route
// ===========================================================================

export async function POST(request: Request) {
  const { projectId, status } = await request.json();

  // Your business logic here...
  const result = await processWorkspace(projectId);

  // Push realtime update to all subscribers
  await publishToChannel(inngest, {
    channel: `project:${projectId}`,
    topic: "workspaceState",
    data: {
      status: "completed",
      result: result,
      timestamp: Date.now(),
    },
  });

  return Response.json({ success: true });
}

// ============================================================================
// Example 2: Publishing multiple topics at once
// ============================================================================

export async function updateProjectHandler(request: Request) {
  const { projectId, updates } = await request.json();

  // Apply updates...
  await applyUpdates(projectId, updates);

  // Notify multiple topics
  await publishToChannelBatch(inngest, {
    channel: `project:${projectId}`,
    messages: [
      { topic: "workspaceState", data: { status: "updated" } },
      { topic: "notifications", data: { message: "Project updated!" } },
      { topic: "activity", data: { action: "update", timestamp: Date.now() } },
    ],
  });

  return Response.json({ success: true });
}

// ============================================================================
// Example 3: Pre-bound publisher for convenience
// ============================================================================

// Create a publisher once
const publishToProject = (projectId: string) =>
  createChannelPublisher(inngest, `project:${projectId}`);

export async function someOtherHandler(request: Request) {
  const { projectId } = await request.json();

  // Get the publisher
  const publish = publishToProject(projectId);

  // Use it multiple times easily
  await publish("workspaceState", { status: "processing" });

  // ... do work ...

  await publish("workspaceState", { status: "completed" });
  await publish("notifications", { message: "All done!" });

  return Response.json({ success: true });
}

// ============================================================================
// Example 4: Express.js route handler
// ============================================================================

import type { Request as ExpressRequest, Response as ExpressResponse } from "express";

export async function expressUpdateHandler(
  req: ExpressRequest,
  res: ExpressResponse,
) {
  const { projectId, data } = req.body;

  try {
    // Process update
    const result = await updateProject(projectId, data);

    // Push to realtime
    await publishToChannel(inngest, {
      channel: `project:${projectId}`,
      topic: "workspaceState",
      data: result,
    });

    res.json({ success: true, result });
  } catch (error) {
    console.error("Failed to update project:", error);
    res.status(500).json({ error: "Update failed" });
  }
}

// ============================================================================
// Example 5: Webhook handler publishing to realtime
// ============================================================================

export async function webhookHandler(request: Request) {
  const webhook = await request.json();

  // Process webhook
  const { projectId, eventType, payload } = webhook;

  // Push webhook data to realtime subscribers
  await publishToChannel(inngest, {
    channel: `project:${projectId}`,
    topic: "webhooks",
    data: {
      eventType,
      payload,
      receivedAt: Date.now(),
    },
  });

  return Response.json({ received: true });
}

// ============================================================================
// Example 6: Background job publishing progress updates
// ============================================================================

async function processLargeFile(projectId: string, fileId: string) {
  const publish = createChannelPublisher(inngest, `project:${projectId}`);

  // Initial status
  await publish("fileProcessing", {
    fileId,
    status: "started",
    progress: 0,
  });

  // Process in chunks
  for (let i = 0; i < 10; i++) {
    await processChunk(i);

    // Realtime progress update
    await publish("fileProcessing", {
      fileId,
      status: "processing",
      progress: (i + 1) * 10,
    });
  }

  // Final status
  await publish("fileProcessing", {
    fileId,
    status: "completed",
    progress: 100,
  });
}

// ============================================================================
// Example 7: Error handling
// ============================================================================

export async function robustPublishExample(projectId: string) {
  try {
    await publishToChannel(inngest, {
      channel: `project:${projectId}`,
      topic: "workspaceState",
      data: { status: "active" },
    });
  } catch (error) {
    console.error("Failed to publish realtime update:", error);
    // Your app continues - realtime is optional/non-critical
  }
}

// ============================================================================
// Example 8: Streaming data
// ============================================================================

export async function streamHandler(request: Request) {
  const { projectId } = await request.json();

  // Create a readable stream
  const stream = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < 100; i++) {
        controller.enqueue(`Chunk ${i}\n`);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      controller.close();
    },
  });

  // Publish the stream to realtime
  await publishToChannel(inngest, {
    channel: `project:${projectId}`,
    topic: "streamingData",
    data: stream,
  });

  return Response.json({ success: true });
}

// ============================================================================
// Helper functions (for the examples above)
// ============================================================================

async function processWorkspace(projectId: string) {
  return { id: projectId, status: "completed" };
}

async function applyUpdates(projectId: string, updates: unknown) {
  console.log("Applying updates to", projectId, updates);
}

async function updateProject(projectId: string, data: unknown) {
  return { projectId, data, updatedAt: Date.now() };
}

async function processChunk(index: number) {
  await new Promise((resolve) => setTimeout(resolve, 100));
}

