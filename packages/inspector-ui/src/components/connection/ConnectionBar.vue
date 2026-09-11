<script setup lang="ts">
import { ref, watch } from "vue";
import type { ClientStatus, GameInfo } from "@just-inspector/client";

const props = defineProps<{
  status: ClientStatus;
  gameInfo: GameInfo | null;
  url: string;
  logVisible: boolean;
  /** Global setting: render machine field names as spaced UpperCamelCase. */
  prettyNames: boolean;
}>();

const emit = defineEmits<{
  connect: [url: string];
  disconnect: [];
  refresh: [];
  toggleLog: [];
  prettyNamesChange: [value: boolean];
}>();

const urlText = ref(props.url);
const settingsOpen = ref(false);

watch(
  () => props.url,
  (v) => {
    urlText.value = v;
  },
);

function onPrettyNamesChange(event: Event): void {
  emit("prettyNamesChange", (event.target as HTMLInputElement).checked);
}

const statusMeta: Record<ClientStatus, { label: string; cls: string }> = {
  disconnected: { label: "Disconnected", cls: "is-off" },
  connecting: { label: "Connecting…", cls: "is-connecting" },
  connected: { label: "Connected", cls: "is-on" },
};
</script>

<template>
  <div class="ji-conn">
    <span class="ji-conn__dot" :class="statusMeta[status].cls"></span>
    <span class="ji-conn__status">{{ statusMeta[status].label }}</span>
    <span v-if="gameInfo" class="ji-conn__game" :title="`${gameInfo.engine} ${gameInfo.engineVersion ?? ''}`">
      {{ gameInfo.gameName }} <span class="ji-conn__engine">({{ gameInfo.engine }})</span>
    </span>
    <span class="ji-conn__spacer"></span>
    <input
      v-model="urlText"
      class="ji-input ji-conn__url"
      type="text"
      placeholder="ws://127.0.0.1:8765"
      spellcheck="false"
      @keydown.enter="emit('connect', urlText)"
    />
    <template v-if="status !== 'connected'">
      <button class="ji-btn ji-btn--primary" :disabled="status === 'connecting'" @click="emit('connect', urlText)">
        {{ status === "connecting" ? "Connecting…" : "Connect" }}
      </button>
    </template>
    <template v-else>
      <button class="ji-btn" title="Refresh scene tree" @click="emit('refresh')">⟳</button>
      <button class="ji-btn ji-btn--danger" @click="emit('disconnect')">Disconnect</button>
    </template>
    <button
      class="ji-btn ji-conn__log"
      :class="{ 'is-active': logVisible }"
      title="Toggle protocol frame log"
      @click="emit('toggleLog')"
    >
      ⎙
    </button>
    <div class="ji-conn__settings">
      <button
        class="ji-btn ji-conn__log"
        :class="{ 'is-active': settingsOpen }"
        title="Inspector settings"
        @click="settingsOpen = !settingsOpen"
      >
        ⚙
      </button>
      <template v-if="settingsOpen">
        <div class="ji-conn__backdrop" @click="settingsOpen = false"></div>
        <div class="ji-conn__panel">
          <div class="ji-conn__panel-title">Settings</div>
          <label class="ji-conn__option">
            <input type="checkbox" :checked="prettyNames" @change="onPrettyNamesChange" />
            <span>PascalCase field names</span>
          </label>
          <div class="ji-conn__hint">
            Show <code>field_center</code> as “Field Center”. Explicit names sent by the game always win.
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ji-conn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--ji-bg-alt);
  border-bottom: 1px solid var(--ji-border);
  flex: none;
}

.ji-conn__dot {
  flex: none;
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.ji-conn__dot.is-off {
  background: var(--ji-text-dim);
}

.ji-conn__dot.is-connecting {
  background: var(--ji-warn);
  animation: ji-pulse 1s ease-in-out infinite;
}

.ji-conn__dot.is-on {
  background: var(--ji-ok);
}

@keyframes ji-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.ji-conn__status {
  font-size: 12px;
  color: var(--ji-text-dim);
  white-space: nowrap;
}

.ji-conn__game {
  font-size: 12px;
  color: var(--ji-text-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
}

.ji-conn__engine {
  color: var(--ji-accent);
}

.ji-conn__spacer {
  flex: 1;
}

.ji-conn__url {
  width: 240px;
  flex: none;
  font-family: var(--ji-mono);
  font-size: 12px;
}

.ji-conn__log.is-active {
  color: var(--ji-accent);
  border-color: var(--ji-accent);
}

/* --- settings popover -------------------------------------------------- */

.ji-conn__settings {
  position: relative;
  display: flex;
  flex: none;
}

.ji-conn__backdrop {
  position: fixed;
  inset: 0;
  z-index: 9;
}

.ji-conn__panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 10;
  width: 260px;
  padding: 8px 10px;
  background: var(--ji-bg-alt);
  border: 1px solid var(--ji-border);
  border-radius: var(--ji-radius);
  box-shadow: var(--ji-shadow);
}

.ji-conn__panel-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--ji-text-dim);
  margin-bottom: 6px;
}

.ji-conn__option {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--ji-text);
  cursor: pointer;
  user-select: none;
}

.ji-conn__hint {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--ji-text-dim);
}

.ji-conn__hint code {
  font-family: var(--ji-mono);
  font-size: 10px;
}
</style>
