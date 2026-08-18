/**
 * Canonical method / event names and their param/result payloads.
 */

import type { GameInfo, NodeDetail, TreeNode } from "./schema";
import type { TaggedValue } from "./values";

export const Methods = {
  hello: "Inspector.hello",
  ping: "Inspector.ping",
  attach: "Inspector.attach",
  detach: "Inspector.detach",
  getTree: "Runtime.getTree",
  getNode: "Runtime.getNode",
  setValue: "Runtime.setValue",
} as const;

export const Events = {
  /** Server -> client right after a socket connects. */
  ready: "Inspector.ready",
  /** Scene structure changed; client should re-fetch the tree. */
  treeChanged: "Runtime.treeChanged",
  /** A node's property changed; client should re-fetch that node. */
  nodeChanged: "Runtime.nodeChanged",
} as const;

export type MethodName = (typeof Methods)[keyof typeof Methods];
export type EventName = (typeof Events)[keyof typeof Events];

/* --------------------------- params/results --------------------------- */

export interface InspectorHelloParams {
  clientName?: string;
  protocolVersion?: string;
}
export type InspectorHelloResult = GameInfo;

export type InspectorPingResult = { pong: "pong" };

export interface InspectorAttachParams {
  /** Free-form client label shown in the game's logs. */
  name?: string;
}
export interface InspectorAttachResult {
  sessionId: string;
}
export interface InspectorDetachResult {
  ok: true;
}

export interface RuntimeGetTreeResult {
  root: TreeNode;
}

export interface RuntimeGetNodeParams {
  nodeId: string;
}
export interface RuntimeGetNodeResult {
  node: NodeDetail;
}

export interface RuntimeSetValueParams {
  nodeId: string;
  /** Property machine name. Nested paths (e.g. "material.albedo") are allowed. */
  property: string;
  value: TaggedValue;
}
export interface RuntimeSetValueResult {
  ok: true;
  /** Normalized value echoed back by the game (authoritative). */
  value: TaggedValue;
}

/* ------------------------------- events -------------------------------- */

export interface InspectorReadyParams extends GameInfo {}

export interface RuntimeTreeChangedParams {
  reason?: string;
}

export interface RuntimeNodeChangedParams {
  nodeId: string;
  /** Set when a single property changed. */
  property?: string;
}
