# Just Inspector — Godot 4 inspector server (WebSocket).
#
# Two ways to use:
#
# 1. As an autoload (recommended for runtime inspection):
#    Project Settings -> Autoload -> add this script as `InspectorServer`.
#    The server starts in _ready() on port 8765 (override with the
#    `port` exported var or the JI_PORT environment variable).
#
# 2. As an addon plugin (editor inspection):
#    Copy this folder to your project's `addons/` and enable the plugin in
#    Project Settings -> Plugins. The server only starts when the game runs
#    (not while editing) unless you flip `start_in_editor`.
#
# The game can push change notifications at any time:
#     InspectorServer.notify_node_changed(node)   # -> Runtime.nodeChanged
#     InspectorServer.notify_tree_changed()       # -> Runtime.treeChanged
# (Scene-tree add/remove signals are wired automatically.)
#
# Protocol: see docs/protocol.md. All frames are JSON text messages.

extends Node

const PROTOCOL_VERSION := "1.0"

## WebSocket listen port.
@export var port := 8765
## Start the server while the editor is open (needs the addon enabled).
@export var start_in_editor := false

var _server: WebSocketMultiplayerPeer
var _enabled := false
var _peers := {}  # id -> { info: Dictionary }
var _tree_dirty := false

func _ready() -> void:
	if Engine.is_editor_hint() and not start_in_editor:
		return
	var p := int(OS.get_environment("JI_PORT")) if OS.get_environment("JI_PORT") != "" else port
	_start(p)

func _exit_tree() -> void:
	_stop()

func _start(p: int) -> void:
	_server = WebSocketMultiplayerPeer.new()
	var err := _server.create_server(p)
	if err != OK:
		push_error("Just Inspector: failed to listen on port %d (%s)" % [p, error_string(err)])
		return
	_enabled = true
	_server.auto_accept_connections = true
	get_tree().node_added.connect(_on_node_added)
	get_tree().node_removed.connect(_on_node_removed)
	print("Just Inspector: listening on ws://127.0.0.1:%d" % p)

func _stop() -> void:
	if not _enabled:
		return
	_enabled = false
	_server.close()
	_server = null

func is_enabled() -> bool:
	return _enabled

# ---------------------------------------------------------------------------
# Frame pump
# ---------------------------------------------------------------------------

func _process(_delta: float) -> void:
	if not _enabled:
		return
	_server.poll()
	for id in _server.get_peers():
		_peers[id] = _peers.get(id, {})
		while _server.get_available_packet_count() > 0:
			var bytes: PackedByteArray = _server.get_packet()
			_on_message(id, bytes.get_string_from_utf8())
	if _tree_dirty:
		_tree_dirty = false
		_broadcast({"method": "Runtime.treeChanged", "params": {"reason": "structure"}})

# ---------------------------------------------------------------------------
# Public notification API (call from game code)
# ---------------------------------------------------------------------------

func notify_node_changed(node: Node, property := "") -> void:
	_broadcast({"method": "Runtime.nodeChanged", "params": {"nodeId": str(node.get_instance_id()), "property": property}})

func notify_tree_changed() -> void:
	_tree_dirty = true

# ---------------------------------------------------------------------------
# Connection handling
# ---------------------------------------------------------------------------

func _on_message(id: int, text: String) -> void:
	# Greet each new peer once with the game identity (Inspector.ready).
	var peer := _peers.get(id, {})
	if not peer.has("greeted"):
		_peers[id] = {"greeted": true}
		_send(id, {"method": "Inspector.ready", "params": _game_info()})
	var frame = _try_parse(text)
	if frame == null or not frame.has("method") or not frame.has("id"):
		_send(id, {"id": -1, "error": {"code": -32700, "message": "Parse error: expected a command frame"}})
		return
	var cmd: Dictionary = frame
	var method: String = cmd["method"]
	var params: Dictionary = cmd.get("params", {})
	match method:
		"Inspector.hello":
			_send(id, {"id": cmd.id, "result": _game_info()})
		"Inspector.ping":
			_send(id, {"id": cmd.id, "result": {"pong": "pong"}})
		"Inspector.attach":
			_send(id, {"id": cmd.id, "result": {"sessionId": "godot-%d" % id}})
		"Inspector.detach":
			_send(id, {"id": cmd.id, "result": {"ok": true}})
		"Runtime.getTree":
			_send(id, {"id": cmd.id, "result": {"root": _tree_json(get_tree().root)}})
		"Runtime.getNode":
			var node := _find_node(str(params.get("nodeId", "")))
			if node == null:
				_send(id, {"id": cmd.id, "error": {"code": 4100, "message": "Unknown node: %s" % params.get("nodeId", "")}})
			else:
				_send(id, {"id": cmd.id, "result": {"node": _node_json(node)}})
		"Runtime.setValue":
			var node := _find_node(str(params.get("nodeId", "")))
			var property := str(params.get("property", ""))
			if node == null:
				_send(id, {"id": cmd.id, "error": {"code": 4100, "message": "Unknown node"}})
			elif not node.get("property_list") or not _apply_value(node, property, params.get("value", {})):
				_send(id, {"id": cmd.id, "error": {"code": 4102, "message": "Cannot set %s" % property}})
			else:
				var value := _value_json(node.get(property))
				_send(id, {"id": cmd.id, "result": {"ok": true, "value": value}})
				notify_node_changed(node, property)
		_:
			_send(id, {"id": cmd.id, "error": {"code": -32601, "message": "Method not found: %s" % method}})

func _game_info() -> Dictionary:
	var engine_version := Engine.get_version_info()
	return {
		"gameName": ProjectSettings.get_setting("application/config/name", "Godot Game"),
		"engine": "godot",
		"engineVersion": str(engine_version.get("major", 0)) + "." + str(engine_version.get("minor", 0)),
		"protocolVersion": PROTOCOL_VERSION,
		"capabilities": ["live-values", "curves"],
	}

func _find_node(node_id: String) -> Node:
	if node_id.is_valid_int():
		var inst_id := int(node_id)
		for node in _all_nodes():
			if node.get_instance_id() == inst_id:
				return node
	return null

func _all_nodes() -> Array:
	var out: Array = []
	var stack: Array = [get_tree().root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		out.append(n)
		for child in n.get_children():
			stack.append(child)
	return out

# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------

func _tree_json(node: Node) -> Dictionary:
	var children: Array = []
	for child in node.get_children():
		children.append(_tree_json(child))
	return {
		"id": str(node.get_instance_id()),
		"name": node.name,
		"kind": node.get_class(),
		"children": children,
	}

func _node_json(node: Node) -> Dictionary:
	var props: Array = []
	for entry in node.get_property_list():
		var name: String = entry.get("name", "")
		var usage: int = entry.get("usage", 0)
		if name == "" or name.begins_with("_"):
			continue
		if usage & PROPERTY_USAGE_GROUP or usage & PROPERTY_USAGE_SUBGROUP or usage & PROPERTY_USAGE_CATEGORY:
			continue
		if not usage & PROPERTY_USAGE_EDITOR:
			continue
		var value = node.get(name)
		var serialized := _value_json(value, entry)
		if serialized.is_empty():
			continue
		var descriptor := {"name": name, "value": serialized}
		if usage & PROPERTY_USAGE_READ_ONLY:
			descriptor["readOnly"] = true
		var hint := _hint_json(entry)
		if not hint.is_empty():
			descriptor["hint"] = hint
		var type := entry.get("type", TYPE_NIL)
		var control := _control_for(type, entry)
		if control != "":
			descriptor["control"] = control
		props.append(descriptor)
	return {
		"id": str(node.get_instance_id()),
		"name": node.name,
		"kind": node.get_class(),
		"path": str(node.get_path()),
		"properties": props,
	}

func _control_for(type: int, entry: Dictionary) -> String:
	var hint: int = entry.get("hint", PROPERTY_HINT_NONE)
	match type:
		TYPE_VECTOR2, TYPE_VECTOR3, TYPE_VECTOR4:
			return "vector"
		TYPE_COLOR:
			return "color"
		TYPE_OBJECT:
			return ""
		_:
			match hint:
				PROPERTY_HINT_ENUM:
					return "dropdown"
				PROPERTY_HINT_RANGE:
					return "slider"
				PROPERTY_HINT_MULTILINE_TEXT:
					return "text"
				_:
					return ""

func _hint_json(entry: Dictionary) -> Dictionary:
	var hint: int = entry.get("hint", PROPERTY_HINT_NONE)
	var hint_string := str(entry.get("hint_string", ""))
	var out := {}
	match hint:
		PROPERTY_HINT_RANGE:
			var parts := hint_string.split(",")
			if parts.size() >= 2:
				out["min"] = float(parts[0])
				out["max"] = float(parts[1])
			if parts.size() >= 3:
				out["step"] = float(parts[2])
		PROPERTY_HINT_ENUM:
			var options: Array = []
			for opt in hint_string.split(","):
				var pieces := opt.split(":")
				if pieces.size() >= 2:
					options.append({"value": int(pieces[0]), "label": pieces[1]})
				else:
					options.append({"value": opt, "label": opt})
			if not options.is_empty():
				out["options"] = options
		PROPERTY_HINT_MULTILINE_TEXT:
			out["multiline"] = true
	return out

func _value_json(value, entry := {}) -> Dictionary:
	match typeof(value):
		TYPE_NIL:
			return {"type": "null"}
		TYPE_BOOL:
			return {"type": "bool", "value": value}
		TYPE_INT:
			var hint: int = entry.get("hint", PROPERTY_HINT_NONE) if not entry.is_empty() else PROPERTY_HINT_NONE
			if hint == PROPERTY_HINT_ENUM:
				return _enum_value_json(value, str(entry.get("hint_string", "")))
			return {"type": "int", "value": value}
		TYPE_FLOAT:
			return {"type": "float", "value": value}
		TYPE_STRING, TYPE_STRING_NAME:
			return {"type": "string", "value": str(value)}
		TYPE_COLOR:
			return {"type": "color", "r": value.r, "g": value.g, "b": value.b, "a": value.a}
		TYPE_VECTOR2:
			return {"type": "vec2", "x": value.x, "y": value.y}
		TYPE_VECTOR3:
			return {"type": "vec3", "x": value.x, "y": value.y, "z": value.z}
		TYPE_VECTOR4:
			return {"type": "vec4", "x": value.x, "y": value.y, "z": value.z, "w": value.w}
		TYPE_OBJECT:
			if value is Curve:
				return _curve_value_json(value)
			if value is Resource and value.resource_path != "":
				return {"type": "asset", "kind": value.get_class(), "path": value.resource_path}
			return {}
		TYPE_ARRAY, TYPE_PACKED_BYTE_ARRAY, TYPE_PACKED_INT32_ARRAY, TYPE_PACKED_FLOAT32_ARRAY:
			var items: Array = []
			for item in value:
				var iv := _value_json(item)
				if iv.is_empty():
					iv = {"type": "null"}
				items.append(iv)
			return {"type": "array", "items": items}
		TYPE_DICTIONARY:
			var fields := {}
			for key in value.keys():
				var fv := _value_json(value[key])
				if not fv.is_empty():
					fields[str(key)] = fv
			return {"type": "object", "fields": fields}
	return {}

func _enum_value_json(value, hint_string: String) -> Dictionary:
	var options: Array = []
	for opt in hint_string.split(","):
		var pieces := opt.split(":")
		if pieces.size() >= 2:
			options.append({"value": int(pieces[0]), "label": pieces[1]})
		else:
			options.append({"value": opt, "label": opt})
	return {"type": "enum", "value": value, "options": options}

func _curve_value_json(curve: Curve) -> Dictionary:
	var points: Array = []
	for i in curve.point_count:
		points.append({
			"x": curve.get_point_offset(i),
			"y": curve.get_point_value(i),
			"lx": curve.get_point_left_tangent(i).x,
			"ly": curve.get_point_left_tangent(i).y,
			"rx": curve.get_point_right_tangent(i).x,
			"ry": curve.get_point_right_tangent(i).y,
		})
	return {"type": "curve", "mode": "bezier", "points": points}

# ---------------------------------------------------------------------------
# setValue support
# ---------------------------------------------------------------------------

func _apply_value(node: Node, property: String, value: Dictionary) -> bool:
	if not property in node:
		return false
	var current = node.get(property)
	var converted = _from_value(value, typeof(current))
	if converted == null and value.get("type", "") != "null":
		return false
	node.set(property, converted)
	return true

func _from_value(value: Dictionary, target_type: int):
	match str(value.get("type", "")):
		"null":
			return null
		"bool":
			return bool(value.get("value", false))
		"int":
			return int(value.get("value", 0))
		"float":
			return float(value.get("value", 0.0))
		"string":
			return str(value.get("value", ""))
		"color":
			return Color(float(value.get("r", 0)), float(value.get("g", 0)), float(value.get("b", 0)), float(value.get("a", 1)))
		"vec2":
			return Vector2(float(value.get("x", 0)), float(value.get("y", 0)))
		"vec3":
			return Vector3(float(value.get("x", 0)), float(value.get("y", 0)), float(value.get("z", 0)))
		"vec4":
			return Vector4(float(value.get("x", 0)), float(value.get("y", 0)), float(value.get("z", 0)), float(value.get("w", 0)))
		"enum":
			if target_type == TYPE_INT:
				return int(value.get("value", 0))
			return str(value.get("value", ""))
		"curve":
			if target_type == TYPE_OBJECT:
				var curve := Curve.new()
				curve.point_count = 0
				for p in value.get("points", []):
					var idx := curve.add_point(Vector2(float(p.get("x", 0)), float(p.get("y", 0))))
					curve.set_point_left_tangent(idx, Vector2(float(p.get("lx", 0)), float(p.get("ly", 0))))
					curve.set_point_right_tangent(idx, Vector2(float(p.get("rx", 0)), float(p.get("ry", 0))))
				return curve
			return null
	return null

# ---------------------------------------------------------------------------
# Wiring & helpers
# ---------------------------------------------------------------------------

func _on_node_added(_node: Node) -> void:
	notify_tree_changed()

func _on_node_removed(_node: Node) -> void:
	notify_tree_changed()

func _send(id: int, frame: Dictionary) -> void:
	if not _enabled or not id in _server.get_peers():
		return
	_server.set_target_peer(id)
	_server.send_packet(JSON.stringify(frame).to_utf8_buffer())

func _broadcast(frame: Dictionary) -> void:
	if not _enabled:
		return
	var text := JSON.stringify(frame).to_utf8_buffer()
	_server.set_target_peer(0)  # 0 = broadcast to all peers
	_server.send_packet(text)

func _try_parse(text: String):
	var parsed = JSON.parse_string(text)
	return parsed if parsed is Dictionary else null
