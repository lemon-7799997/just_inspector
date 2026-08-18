import {
  asset,
  array,
  bool,
  color,
  curve,
  enumValue,
  float,
  int,
  nullValue,
  object,
  str,
  vec2,
  vec3,
  PROTOCOL_VERSION,
  type ControlKind,
  type GameInfo,
  type NodeDetail,
  type PropertyDescriptor,
  type PropertyHint,
  type TaggedValue,
  type TreeNode,
} from "@just-inspector/protocol";

export interface MockProp {
  value: TaggedValue;
  control?: ControlKind;
  hint?: PropertyHint;
  readOnly?: boolean;
}

export interface MockNode {
  id: string;
  name: string;
  kind: string;
  path: string;
  props: Record<string, MockProp>;
  children: MockNode[];
}

export interface MockChange {
  nodeId: string;
  property: string;
}

const rnd = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/* ------------------------------ helpers ------------------------------ */

function curveProp(
  mode: "bezier" | "linear",
  points: Array<[number, number]>,
  hint?: PropertyHint,
): MockProp {
  return {
    value: curve(
      points.map(([x, y]) => ({ x, y, lx: -0.25, ly: 0, rx: 0.25, ry: 0 })),
      mode,
    ),
    hint,
  };
}

/* ------------------------------ the tree ------------------------------ */

function makeEnemy(index: number): MockNode {
  const id = `enemy:${index}`;
  return {
    id,
    name: `Enemy${index}`,
    kind: "Sprite2D",
    path: `/root/World/Enemies/${id}`,
    props: {
      position: { value: vec2(rnd(-8, 8), rnd(-4, 4)) },
      speed: { value: float(rnd(0.5, 4)), control: "slider", hint: { min: 0, max: 10, step: 0.1 } },
      health: { value: int(Math.floor(rnd(10, 100))), control: "slider", hint: { min: 0, max: 100, step: 1 } },
      color: { value: color(rnd(0, 1), rnd(0, 1), rnd(0, 1)) },
      behavior: {
        value: enumValue("patrol", [
          { value: "idle", label: "Idle" },
          { value: "patrol", label: "Patrol" },
          { value: "chase", label: "Chase" },
          { value: "attack", label: "Attack" },
        ]),
      },
      "onFire": { value: bool(Math.random() > 0.7) },
    },
    children: [],
  };
}

function makeGame(): { root: MockNode; nextEnemyId: { n: number } } {
  const enemies = Array.from({ length: 3 }, (_, i) => makeEnemy(i));
  const nextEnemyId = { n: enemies.length };

  const root: MockNode = {
    id: "scene:root",
    name: "MainScene",
    kind: "Node3D",
    path: "/root/MainScene",
    props: {
      sceneName: { value: str("main_level"), readOnly: true },
      description: { value: str("Level 1 — factory interior") },
    },
    children: [
      {
        id: "world",
        name: "World",
        kind: "Node3D",
        path: "/root/MainScene/World",
        props: {
          gravity: { value: float(9.81), control: "slider", hint: { min: 0, max: 30, step: 0.01 } },
          timeScale: { value: float(1), control: "slider", hint: { min: 0, max: 4, step: 0.01 } },
        },
        children: [
          {
            id: "player",
            name: "Player",
            kind: "CharacterBody3D",
            path: "/root/MainScene/World/Player",
            props: {
              nickname: { value: str("Aria") },
              health: { value: int(80), control: "slider", hint: { min: 0, max: 100, step: 1 } },
              maxHealth: { value: int(100), hint: { min: 1, max: 1000 } },
              isAlive: { value: bool(true) },
              speed: { value: float(5.2), control: "slider", hint: { min: 0, max: 20, step: 0.1 } },
              jumpForce: { value: float(12), hint: { min: 0, max: 50, step: 0.5 } },
              position: { value: vec3(1.5, 0.2, -3) },
              rotation: { value: vec3(0, 1.2, 0) },
              scale: { value: vec3(1, 1, 1) },
              team: {
                value: enumValue("red", [
                  { value: "red", label: "Red" },
                  { value: "blue", label: "Blue" },
                  { value: "green", label: "Green" },
                  { value: "spectator", label: "Spectator" },
                ]),
              },
              primaryColor: { value: color(0.85, 0.25, 0.25) },
              attackCurve: curveProp("bezier", [
                [0, 0],
                [0.25, 0.9],
                [0.7, 0.5],
                [1, 0.1],
              ]),
              tags: { value: array([str("player"), str("controllable")], "string") },
              model: { value: asset("scene", "res://characters/player.tscn") },
              metadata: {
                value: object({
                  spawnPoint: vec3(0, 0, 0),
                  tier: int(2),
                  unlockable: bool(false),
                }),
              },
            },
            children: [],
          },
          {
            id: "camera",
            name: "Camera",
            kind: "Camera3D",
            path: "/root/MainScene/World/Camera",
            props: {
              fov: { value: float(70), control: "slider", hint: { min: 10, max: 120, step: 1 } },
              nearPlane: { value: float(0.1), hint: { min: 0.001, max: 10 } },
              farPlane: { value: float(1000) },
              backgroundColor: { value: color(0.12, 0.14, 0.2) },
              isOrthographic: { value: bool(false) },
              clearMode: {
                value: enumValue("Sky", [
                  { value: "Sky" },
                  { value: "Color" },
                  { value: "Depth" },
                  { value: "Never" },
                ]),
              },
              exposure: { value: float(1), control: "slider", hint: { min: 0.1, max: 4, step: 0.05 } },
            },
            children: [],
          },
          {
            id: "enemies",
            name: "Enemies",
            kind: "Node3D",
            path: "/root/MainScene/World/Enemies",
            props: { spawnInterval: { value: float(3), control: "slider", hint: { min: 0.5, max: 10, step: 0.1 } } },
            children: enemies,
          },
          {
            id: "light",
            name: "Sun",
            kind: "DirectionalLight3D",
            path: "/root/MainScene/World/Sun",
            props: {
              intensity: { value: float(1), control: "slider", hint: { min: 0, max: 10, step: 0.05 } },
              color: { value: color(1, 0.95, 0.8) },
              shadowsEnabled: { value: bool(true) },
            },
            children: [],
          },
        ],
      },
      {
        id: "ui",
        name: "UI",
        kind: "CanvasLayer",
        path: "/root/MainScene/UI",
        props: {},
        children: [
          {
            id: "settings",
            name: "SettingsPanel",
            kind: "PanelContainer",
            path: "/root/MainScene/UI/SettingsPanel",
            props: {
              masterVolume: { value: float(0.8), control: "slider", hint: { min: 0, max: 1, step: 0.01 } },
              musicVolume: { value: float(0.6), control: "slider", hint: { min: 0, max: 1, step: 0.01 } },
              fullscreen: { value: bool(false) },
              vsync: { value: bool(true) },
              resolution: {
                value: enumValue("1920x1080", [
                  { value: "1280x720" },
                  { value: "1920x1080" },
                  { value: "2560x1440" },
                  { value: "3840x2160" },
                ]),
              },
              language: {
                value: enumValue("en", [
                  { value: "en", label: "English" },
                  { value: "zh", label: "中文" },
                  { value: "ja", label: "日本語" },
                ]),
              },
              gamma: { value: float(1), control: "slider", hint: { min: 0.5, max: 2, step: 0.01 } },
              subtitleScale: { value: float(1.0), hint: { min: 0.5, max: 2.5, step: 0.05 } },
              vignette: curveProp("linear", [
                [0, 0],
                [1, 1],
              ]),
              controlHint: { value: str("Press Escape to toggle"), readOnly: true },
            },
            children: [],
          },
        ],
      },
      {
        id: "game",
        name: "GameState",
        kind: "Node",
        path: "/root/MainScene/GameState",
        props: {
          debugDraw: { value: bool(false) },
          levelName: { value: str("factory_01") },
          seed: { value: int(1337) },
          unlockedLevels: { value: array([str("factory_01"), str("sewer_02")], "string") },
          bestTime: { value: nullValue(), hint: { placeholder: "not set" } },
        },
        children: [],
      },
    ],
  };

  return { root, nextEnemyId };
}

export class MockGame {
  readonly info: GameInfo = {
    gameName: "Mock Arena",
    engine: "mock",
    engineVersion: "0.1.0",
    protocolVersion: PROTOCOL_VERSION,
    capabilities: ["live-values", "curves", "arrays", "objects"],
  };

  private rootNode: MockNode;
  private nextEnemyId: { n: number };

  constructor() {
    const { root, nextEnemyId } = makeGame();
    this.rootNode = root;
    this.nextEnemyId = nextEnemyId;
  }

  getTree(): TreeNode {
    return this.toTreeNode(this.rootNode);
  }

  getNode(nodeId: string): NodeDetail | null {
    const node = this.find(nodeId);
    if (!node) return null;
    return {
      id: node.id,
      name: node.name,
      kind: node.kind,
      path: node.path,
      properties: Object.entries(node.props).map(([name, p]) => this.toProperty(name, p)),
    };
  }

  setValue(
    nodeId: string,
    property: string,
    value: TaggedValue,
  ): { value: TaggedValue } | { error: { code: number; message: string } } {
    const node = this.find(nodeId);
    if (!node) return { error: { code: 4100, message: `Unknown node: ${nodeId}` } };
    const prop = node.props[property];
    if (!prop) return { error: { code: 4102, message: `Unknown property: ${nodeId}.${property}` } };
    if (prop.readOnly) return { error: { code: 4101, message: `Property is read-only: ${property}` } };
    if (prop.value.type !== value.type) {
      return {
        error: {
          code: 4102,
          message: `Type mismatch for '${property}': expected ${prop.value.type}, got ${value.type}`,
        },
      };
    }
    prop.value = value;
    return { value };
  }

  /** Simulate the game mutating values on its own; returns what changed. */
  tick(): MockChange | null {
    const candidates = this.collectNodes().filter((n) => Object.keys(n.props).length > 0);
    if (candidates.length === 0) return null;
    const node = pick(candidates);
    const names = Object.keys(node.props).filter((n) => !node.props[n].readOnly);
    if (names.length === 0) return null;
    const property = pick(names);
    const prop = node.props[property];
    const v = prop.value;
    const next = this.randomNeighbour(v);
    if (!next) return null;
    prop.value = next;
    return { nodeId: node.id, property };
  }

  /** Add or remove an enemy to simulate scene-structure changes. Returns true if structure changed. */
  toggleEnemy(): boolean {
    const enemies = this.find("enemies");
    if (!enemies) return false;
    if (enemies.children.length >= 6 || (enemies.children.length > 0 && Math.random() > 0.5)) {
      enemies.children.pop();
      return true;
    }
    enemies.children.push(makeEnemy(this.nextEnemyId.n++));
    return true;
  }

  /* ------------------------------ internals ------------------------------ */

  private randomNeighbour(v: TaggedValue): TaggedValue | null {
    switch (v.type) {
      case "float":
        return float(+(v.value + rnd(-0.15, 0.15)).toFixed(3));
      case "int":
        return int(Math.max(0, v.value + Math.round(rnd(-5, 5))));
      case "bool":
        return bool(Math.random() > 0.85 ? !v.value : v.value);
      case "string":
        return str(v.value);
      case "vec2":
        return vec2(+(v.x + rnd(-0.2, 0.2)).toFixed(2), +(v.y + rnd(-0.2, 0.2)).toFixed(2));
      case "vec3":
        return vec3(
          +(v.x + rnd(-0.1, 0.1)).toFixed(2),
          +(v.y + rnd(-0.1, 0.1)).toFixed(2),
          +(v.z + rnd(-0.1, 0.1)).toFixed(2),
        );
      case "enum": {
        const others = v.options.filter((o) => String(o.value) !== String(v.value));
        if (others.length === 0) return null;
        return enumValue(pick(others).value, v.options);
      }
      case "color":
        return color(
          +(Math.min(1, Math.max(0, v.r + rnd(-0.08, 0.08)))).toFixed(3),
          +(Math.min(1, Math.max(0, v.g + rnd(-0.08, 0.08)))).toFixed(3),
          +(Math.min(1, Math.max(0, v.b + rnd(-0.08, 0.08)))).toFixed(3),
          v.a,
        );
      default:
        return null;
    }
  }

  private toTreeNode(node: MockNode): TreeNode {
    return {
      id: node.id,
      name: node.name,
      kind: node.kind,
      children: node.children.map((c) => this.toTreeNode(c)),
    };
  }

  private toProperty(name: string, p: MockProp): PropertyDescriptor {
    const d: PropertyDescriptor = { name, value: p.value };
    if (p.control) d.control = p.control;
    if (p.hint) d.hint = p.hint;
    if (p.readOnly) d.readOnly = true;
    return d;
  }

  private find(nodeId: string): MockNode | null {
    const stack: MockNode[] = [this.rootNode];
    while (stack.length) {
      const n = stack.pop() as MockNode;
      if (n.id === nodeId) return n;
      for (const c of n.children) stack.push(c);
    }
    return null;
  }

  private collectNodes(): MockNode[] {
    const out: MockNode[] = [];
    const stack: MockNode[] = [this.rootNode];
    while (stack.length) {
      const n = stack.pop() as MockNode;
      out.push(n);
      for (const c of n.children) stack.push(c);
    }
    return out;
  }
}
