# Godot integration

A complete, drop-in WebSocket inspector server lives in
[`examples/godot/addons/just_inspector`](../examples/godot/addons/just_inspector)
(`inspector_server.gd`, ~300 lines, Godot 4.x). It serves the whole scene tree,
all editor-visible properties, and supports writing values back.

## Install

1. Copy the `addons/just_inspector` folder into your project's `addons/` folder.
2. **Runtime inspection (recommended):** Project Settings → Autoload → add
   `addons/just_inspector/inspector_server.gd` as `InspectorServer`.
3. (Optional) Project Settings → Plugins → enable **Just Inspector** if you
   also want the `start_in_editor` option for inspecting from the editor.

The server listens on `ws://127.0.0.1:8765` (override via the `port` export or
the `JI_PORT` environment variable). Launch your game, open the inspector UI
and connect.

## What you get

- `Runtime.getTree` — full scene tree from `/root` (node ids are
  `instance_id`s, so they survive renames).
- `Runtime.getNode` — exported/editor-visible properties, auto-mapped:
  - `int`/`float`/`bool`/`String`/`StringName` → scalar values
  - `PROPERTY_HINT_RANGE` → `slider` with min/max/step hint
  - `PROPERTY_HINT_ENUM` → `enum` dropdown (labels included)
  - `Color` → `color`, `Vector2/3/4` → `vec2/3/4`
  - `Curve` resources → `curve` with tangent handles
  - `Resource` with a path → `asset`
  - arrays/dictionaries → `array`/`object`
  - read-only properties are flagged `readOnly`
- `Runtime.setValue` — writes back with type conversion (colors, vectors,
  curves are rebuilt as proper Godot values).

## Pushing live updates

The addon auto-notifies on scene-tree structure changes
(`node_added`/`node_removed` → `Runtime.treeChanged`) and after inspector
writes. To push value changes made by the game itself:

```gdscript
# anywhere in game code
InspectorServer.notify_node_changed($Player, "health")   # Runtime.nodeChanged
InspectorServer.notify_tree_changed()                    # Runtime.treeChanged
```

## Example

```gdscript
# demo.gd — a small scene script with inspectable properties
extends Node3D

@export var speed := 5.0          # slider (has range via inspector) or number
@export var health := 100:
    set(v):
        health = v
        if Engine.has_singleton("InspectorServer") or get_node_or_null("/root/InspectorServer"):
            # avoid circular reference: use the autoload name
            pass
@export_range(0.0, 1.0, 0.01) var volume := 0.8      # -> slider
@export var team: String = "red"                      # -> enum if it has hints
@export var tint := Color(1, 0.5, 0)                  # -> color picker
@export var curve := Curve.new()                      # -> curve editor
```

> `@export_range(min, max, step)` and `@export_enum("A", "B")` map to the
> slider / dropdown controls automatically.
