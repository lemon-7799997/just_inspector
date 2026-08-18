<script setup lang="ts">
import { ref, watch } from "vue";
import type { ClientStatus, GameInfo } from "@just-inspector/client";

const props = defineProps<{
  status: ClientStatus;
  gameInfo: GameInfo | null;
  url: string;
  logVisible: boolean;
}>();

const emit = defineEmits<{
  connect: [url: string];
  disconnect: [];
  refresh: [];
  toggleLog: [];
}>();

const urlText = ref(props.url);

watch(
  () => props.url,
  (v) => {
    urlText.value = v;
  },
);

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
</style>
