<template>
  <nodeSkeleton
    v-bind="nodeProps"
    :topVisible="node.selected"
    :bottomVisible="node.selected && actions?.mode === 'speed'"
    :bottomWidth="440"
    topWidth="max-content"
    :downloadUrl="previewUrl"
    :downloadName="outputFile?.url.split(/[\\/]/).at(-1)"
    :fullscreenVisible="false"
    style="width: 360px">
    <template #topActions>
      <el-button :icon="IconTextRecognition" :loading="transcribing" :disabled="!outputFile || uploading || actions?.processing" text title="Chuyển âm thanh thành văn bản" aria-label="Chuyển âm thanh thành văn bản" @click.stop="transcribe">Chuyển thành văn bản</el-button>
      <el-button v-if="transcribing" :icon="IconPlayerStop" text title="Hủy chuyển thành văn bản" aria-label="Hủy chuyển thành văn bản" @click.stop="cancelTranscription">Hủy</el-button>
      <el-button :icon="IconScissors" :disabled="!previewUrl || uploading || transcribing || actions?.processing" text title="Cắt âm thanh" aria-label="Cắt âm thanh" @click.stop="actions?.open('clip')">Cắt đoạn</el-button>
      <el-button :icon="IconGauge" :disabled="!previewUrl || uploading || transcribing || actions?.processing" text title="Đổi tốc độ âm thanh" aria-label="Đổi tốc độ âm thanh" @click.stop="actions?.open('speed')">Đổi tốc độ</el-button>
      <el-button
        :icon="IconTransfer"
        :loading="uploading"
        :disabled="transcribing || actions?.processing"
        text
        title="Thay âm thanh"
        aria-label="Thay âm thanh"
        @click.stop="fileInput?.click()">Thay âm thanh</el-button>
    </template>
    <div class="audioContent nopan">
      <audioPlayer
        v-if="previewUrl"
        ref="player"
        class="audioPreview"
        :src="previewUrl"
        :mimeType="outputFile?.mimeType"
        v-model:pcmOptions="pcmOptions"
        @loadedmetadata="updateNodeInternals" />
      <input ref="fileInput" class="fileInput" type="file" accept="audio/*" aria-label="Chọn âm thanh" :disabled="uploading || transcribing || actions?.processing" @change="uploadAudio" />
      <el-button
        v-if="!outputs.audio"
        class="uploadButton nodrag nopan"
        :icon="IconUpload"
        text
        :loading="uploading"
        title="Tải âm thanh lên"
        aria-label="Tải âm thanh lên"
        @dblclick.stop
        @click.stop="fileInput?.click()">Tải lên</el-button>
    </div>
    <template v-if="actions?.mode === 'speed'" #bottom><div ref="speedTarget" /></template>
  </nodeSkeleton>
  <audioActions ref="actions" v-model:pcmOptions="pcmOptions" :file="outputFile" :src="previewUrl" :target="speedTarget" :disabled="uploading || transcribing" @pause="player?.pause()" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IconMusic, IconUpload, IconTransfer, IconScissors, IconGauge, IconTextRecognition, IconPlayerStop } from "@tabler/icons-vue";
import { ElButton, ElMessage } from "element-plus";
import { nodeSkeleton, nodeTools, useNode, z, type NodeHandle } from "@toonflow/nodes-scaffold/runtime";
import { useAudioTranscription } from "@toonflow/node-shared/useAudioTranscription";
import { getMediaMimeType } from "@toonflow/node-shared/mediaTypes";
import type { PcmOptions } from "@toonflow/node-shared/pcmPreview";
import audioPlayer from "./components/audioPlayer.vue";
import audioActions from "./components/audioActions.vue";

defineOptions({
  inheritAttrs: false,
  icon: IconMusic,
  handles: [{ id: "audio", type: "source", dataType: "AUDIO", label: "Âm thanh đầu ra" }] satisfies NodeHandle[],
});
const { node, nodeProps, outputs, nodeEvent, files, updateNodeInternals } = useNode({
  label: "Âm thanh",
});
const fileInput = ref<HTMLInputElement>();
const uploading = ref(false);
const player = ref<InstanceType<typeof audioPlayer>>();
const actions = ref<InstanceType<typeof audioActions>>();
const speedTarget = ref<HTMLElement>();

const outputFile = computed(() => outputs.value.audio?.dataType === "AUDIO" ? outputs.value.audio.value : undefined);
const pcmOptions = ref<Partial<PcmOptions>>({});
watch(() => outputFile.value?.url, () => { pcmOptions.value = {}; }, { flush: "sync" });
const { processing: transcribing, transcribe, cancel: cancelTranscription, cancelAndWait: cancelTranscriptionAndWait } = useAudioTranscription(outputFile);
const previewUrl = files.useFileUrl(
  outputFile,
  (error) => showError(error, "音频读取失败")
);

nodeEvent.on("save", reason => {
  if (uploading.value) throw new Error("音频处理中，请完成后再切换或刷新节点");
  if (reason === "reload" && (actions.value?.processing || transcribing.value)) throw new Error("音频处理中，请完成或取消后再刷新节点");
});
nodeEvent.on("delete", async () => {
  if (uploading.value) throw new Error("音频上传中，请稍后删除节点");
  uploading.value = true;
  try {
    await Promise.all([actions.value?.cancelAndWait(), cancelTranscriptionAndWait()]);
    await files.removeNodeFiles();
  } finally {
    uploading.value = false;
  }
});

nodeTools.register({
  name: "setAudio",
  description: "选择工作区内已有的音频文件作为此节点的输出，path 使用工作区相对路径",
  parameters: z.strictObject({
    path: z.string().min(1).max(4096),
    mimeType: z.string().regex(/^audio\/[a-zA-Z0-9.+-]+$/),
  }),
  async execute({ path, mimeType }, { signal }) {
    signal?.throwIfAborted();
    if (uploading.value || transcribing.value || actions.value?.processing) throw new Error("音频处理中，请稍后重试");
    uploading.value = true;
    try {
      const content = await files.getWorkspaceFiles().read(path);
      signal?.throwIfAborted();
      if (!content.byteLength || content.byteLength > 100 * 1024 * 1024) throw new Error("音频不能为空且不能超过 100 MB");
      outputs.value.audio = { dataType: "AUDIO", value: { url: path, mimeType } };
      return outputs.value.audio;
    } finally {
      uploading.value = false;
    }
  },
});

async function uploadAudio(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || uploading.value || transcribing.value || actions.value?.processing) return;
  const mimeType = getMediaMimeType(file);
  if (!mimeType.startsWith("audio/")) return void ElMessage.error("请选择音频文件");
  if (!file.size || file.size > 100 * 1024 * 1024) return void ElMessage.error("音频不能为空且不能超过 100 MB");
  uploading.value = true;
  try {
    const url = await files.uploadFile(file);
    // ACT: 复制节点可能仍引用旧音频，替换输出不删除共享文件。
    outputs.value.audio = { dataType: "AUDIO", value: { url, mimeType } };
  } catch (error) {
    showError(error, "音频替换失败");
  } finally {
    uploading.value = false;
  }
}

function showError(error: unknown, fallback: string) {
  const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
  ElMessage.error(message || (error instanceof Error ? error.message : fallback));
}
</script>

<style scoped lang="scss">
.audioContent {
  position: relative;
  min-height: 144px;
  display: flex;
  align-items: center;
  justify-content: center;

  .nodeSkeleton.resized & {
    height: 100%;
    min-height: 0;
    align-items: flex-start;
  }

  .audioPreview {
    display: block;
    width: 100%;
    border-radius: var(--el-border-radius-base);
  }

  .fileInput {
    display: none;
  }

  .uploadButton {
    align-self: center;
  }
}
</style>
