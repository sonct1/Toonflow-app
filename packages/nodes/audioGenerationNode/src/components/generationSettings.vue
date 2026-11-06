<template>
  <el-popover v-model:visible="settingsVisible" trigger="click" placement="top-start" width="min(380px, calc(100vw - 24px))" :disabled="disabled" :showArrow="false" :popperStyle="{ padding: '16px' }">
    <template #reference>
      <el-button class="settingsButton" text size="small" :disabled="disabled" :aria-expanded="settingsVisible" aria-label="Cài đặt tạo âm thanh">
        <icon-adjustments-horizontal :size="15" aria-hidden="true" />
        <span>{{ languageLabel }} · {{ sampleRate / 1000 }}k · {{ format }}</span>
        <component :is="settingsVisible ? IconChevronDown : IconChevronUp" :size="14" aria-hidden="true" />
      </el-button>
    </template>
    <div class="generationSettings nodrag nopan nowheel" @pointerdown.stop @mousedown.stop @dblclick.stop @keydown.stop @wheel.stop>
      <div class="settingsHeader">
        <icon-adjustments-horizontal :size="17" aria-hidden="true" />
        <span>Thông số âm thanh</span>
      </div>
      <div class="settingsFields">
        <div class="settingField">
          <span class="fieldLabel">Ngôn ngữ</span>
          <el-segmented v-model="language" :options="languageOptions" :disabled="disabled" block aria-label="Ngôn ngữ âm thanh" />
        </div>
        <div class="settingField">
          <span class="fieldLabel">Tần số lấy mẫu</span>
          <el-segmented v-model="sampleRate" :options="sampleRates" :disabled="disabled" block aria-label="Tần số lấy mẫu âm thanh" />
        </div>
        <div class="settingField">
          <span class="fieldLabel">Định dạng đầu ra</span>
          <el-segmented v-model="format" :options="formats" :disabled="disabled" block aria-label="Định dạng âm thanh đầu ra" />
        </div>
      </div>
      <div class="settingsSummary">{{ languageLabel }} · {{ sampleRate / 1000 }} kHz · {{ formatLabels[format] ?? format }}</div>
      <modelForm v-model="other" :rules="model?.rules" :disabled="disabled" />
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ElButton, ElPopover, ElSegmented } from "element-plus";
import { IconAdjustmentsHorizontal, IconChevronDown, IconChevronUp } from "@tabler/icons-vue";
import type { NodeMediaModel } from "@toonflow/nodes-scaffold/runtime";
import modelForm from "@toonflow/node-shared/modelForm";
import { languageOptions, sampleRateOptions, formatOptions } from "../audioSettings";

defineProps<{ model?: NodeMediaModel; disabled?: boolean }>();
const settingsVisible = ref(false);
const language = defineModel<string>("language", { required: true });
const sampleRate = defineModel<number>("sampleRate", { required: true });
const format = defineModel<string>("format", { required: true });
const other = defineModel<Record<string, unknown>>("other", { required: true });
const formatLabels: Record<string, string> = { wav: "WAV", mp3: "MP3", pcm: "PCM", ogg_opus: "Ogg Opus" };
const sampleRates = sampleRateOptions.map(value => ({ label: `${value / 1000}k`, value }));
const formats = formatOptions.map(value => ({ label: value === "ogg_opus" ? "Opus" : formatLabels[value], value }));
const languageLabel = computed(() => languageOptions.find(item => item.value === language.value)?.label ?? language.value);
</script>

<style scoped lang="scss">
.settingsButton {
  flex-shrink: 0;
  :deep(> span) { gap: 6px; }
}

.generationSettings {
  text-align: left;

  .settingsHeader {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 12px;
    margin-bottom: 14px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    color: var(--el-text-color-primary);
    font-size: 13px;
    font-weight: 600;
  }

  .settingsFields {
    display: flex;
    flex-direction: column;
    gap: 14px;

    .settingField {
      display: flex;
      align-items: center;
      gap: 12px;

      .fieldLabel {
        flex: 0 0 60px;
        color: var(--el-text-color-secondary);
        font-size: 12px;
      }

      .el-segmented {
        flex: 1;
        min-width: 0;
        --el-border-radius-base: 8px;
        --el-segmented-item-selected-bg-color: var(--el-fill-color-darker);
        --el-segmented-item-selected-color: var(--el-text-color-primary);

        :deep(.el-segmented__item) { min-width: 0; padding: 0 6px; }
        :deep(.el-segmented__item-label) { font-size: 12px; }
      }
    }
  }

  .settingsSummary {
    margin-top: 14px;
    color: var(--el-text-color-placeholder);
    font-size: 11px;
    line-height: 18px;
    text-align: right;
  }
}
</style>
