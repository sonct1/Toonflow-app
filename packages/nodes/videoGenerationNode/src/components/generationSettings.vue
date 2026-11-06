<template>
  <el-popover v-model:visible="settingsVisible" trigger="click" placement="top-start" width="min(340px, calc(100vw - 24px))" :disabled="disabled" :showArrow="false" :popperStyle="{ padding: '14px' }">
    <template #reference>
      <el-button class="settingsButton" text size="small" :disabled="disabled" :aria-expanded="settingsVisible" aria-label="Cài đặt tạo video">
        <span class="ratioShape" :style="ratioStyle(ratio)" aria-hidden="true" />
        <span>{{ [ratio, resolution, duration ? `${duration} giây` : ''].filter(Boolean).join(' · ') }}</span>
        <component :is="settingsVisible ? IconChevronDown : IconChevronUp" :size="14" aria-hidden="true" />
      </el-button>
    </template>
    <div class="generationSettings nodrag nopan nowheel" @pointerdown.stop @mousedown.stop @dblclick.stop @keydown.stop @wheel.stop>
      <div v-if="modes.length" class="sectionLabel">Chế độ tạo</div>
      <el-select v-if="modes.length" v-model="mode" :disabled="disabled" :teleported="false" aria-label="Chế độ tạo video">
        <el-option v-for="item in modes" :key="item.value" :value="item.value" :label="item.label" />
      </el-select>
      <div v-if="durations.length || resolutions.length" class="outputOptions">
        <div v-if="durations.length" class="outputField">
          <div class="sectionLabel">Thời lượng</div>
          <el-select v-model="duration" :disabled="disabled" :teleported="false" aria-label="Thời lượng video">
            <el-option v-for="item in durations" :key="item" :value="item" :label="`${item} giây`" />
          </el-select>
        </div>
        <div v-if="resolutions.length" class="outputField">
          <div class="sectionLabel">Độ phân giải</div>
          <el-select v-model="resolution" :disabled="disabled" :teleported="false" aria-label="Độ phân giải video">
            <el-option v-for="item in resolutions" :key="item" :value="item" :label="item" />
          </el-select>
        </div>
      </div>
      <div class="sectionLabel">Tỷ lệ khung hình</div>
      <div class="ratioOptions" role="group" aria-label="Tỷ lệ video">
        <el-button v-for="item in ratios" :key="item" class="ratioButton" :disabled="disabled" :aria-label="`Tỷ lệ ${item}`" :aria-pressed="ratio === item" @click="ratio = item">
          <span class="ratioContent">
            <span class="ratioShape" :style="ratioStyle(item)" aria-hidden="true" />
            <span>{{ item }}</span>
          </span>
        </el-button>
      </div>
      <div v-if="model?.audio === 'optional'" class="audioOption">
        <span class="sectionLabel">Tạo âm thanh</span>
        <el-switch v-model="generateAudio" :disabled="disabled" aria-label="Tạo âm thanh" />
      </div>
      <modelForm v-model="other" :rules="model?.rules" :disabled="disabled" />
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ElButton, ElPopover, ElSelect, ElOption, ElSwitch } from "element-plus";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-vue";
import type { NodeMediaModel } from "@toonflow/nodes-scaffold/runtime";
import modelForm from "@toonflow/node-shared/modelForm";

const props = defineProps<{ model?: NodeMediaModel; disabled?: boolean; ratios: string[] }>();
const settingsVisible = ref(false);
const duration = defineModel<number | undefined>("duration", { required: true });
const resolution = defineModel<string>("resolution", { required: true });
const ratio = defineModel<string>("ratio", { required: true });
const mode = defineModel<string>("mode", { required: true });
const generateAudio = defineModel<boolean>("generateAudio", { required: true });
const other = defineModel<Record<string, unknown>>("other", { required: true });
const modeLabels: Record<string, string> = {
  text: "Văn bản thành video", singleImage: "Tham chiếu một ảnh", startEndRequired: "Bắt buộc khung hình đầu và cuối", endFrameOptional: "Khung hình cuối tùy chọn", startFrameOptional: "Khung hình đầu tùy chọn",
};
const modes = computed(() => (props.model?.mode ?? []).map(item => ({
  value: JSON.stringify(item),
  label: Array.isArray(item) ? "Tham chiếu kết hợp" : modeLabels[item] ?? item,
})));
const mappings = computed(() => props.model?.durationResolutionMap ?? []);
const durations = computed(() => [...new Set(mappings.value.flatMap(item => item.duration))].sort((a, b) => a - b));
const resolutions = computed(() => resolutionsFor(duration.value));

function resolutionsFor(value: number | undefined) {
  return [...new Set(mappings.value.filter(item => value !== undefined && item.duration.includes(value)).flatMap(item => item.resolution))];
}

function ratioStyle(value: string) {
  const [width = 1, height = 1] = value.split(":").map(Number);
  return { width: `${16 * Math.min(width / height, 1)}px`, height: `${16 * Math.min(height / width, 1)}px` };
}
</script>

<style scoped lang="scss">
.ratioShape {
  display: inline-block;
  flex-shrink: 0;
  border: 1px solid currentColor;
  border-radius: 2px;
  box-sizing: border-box;
}

.settingsButton {
  flex-shrink: 0;
  :deep(> span) { gap: 6px; }
}

.generationSettings {
  text-align: left;

  .sectionLabel {
    margin-bottom: 8px;
    color: var(--el-text-color-secondary);
    font-size: 12px;
    font-weight: 500;
  }

  > .el-select { margin-bottom: 14px; }

  .outputOptions {
    display: flex;
    gap: 12px;
    margin-bottom: 14px;
    .outputField { flex: 1; min-width: 0; }
  }

  .ratioOptions {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;

    .ratioButton {
      height: 60px;
      margin: 0;
      padding: 8px 4px;
      color: var(--el-text-color-secondary);
      --el-button-bg-color: var(--el-fill-color-light);
      --el-button-hover-bg-color: var(--el-fill-color);
      --el-button-hover-text-color: var(--el-text-color-primary);
      --el-button-hover-border-color: var(--el-border-color-darker);

      &[aria-pressed="true"] {
        color: var(--el-text-color-primary);
        border-color: var(--el-text-color-regular);
        background: var(--el-fill-color);
      }

      .ratioContent {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        font-size: 12px;
      }
    }
  }

  .audioOption {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 14px;
    .sectionLabel { margin: 0; }
  }
}
</style>
