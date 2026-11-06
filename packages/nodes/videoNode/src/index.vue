<template>
  <nodeSkeleton
    v-bind="nodeProps"
    :topVisible="node.selected"
    topWidth="max-content"
    :downloadUrl="exporting ? '' : previewUrl"
    :downloadName="outputFile?.url.split(/[\\/]/).at(-1)"
    :style="{ width: previewUrl && videoWidth ? `${videoWidth + 18}px` : undefined }"
    @fullscreen="player?.enterFullscreen()">
    <template #topActions>
      <el-button :icon="IconMusic" text :disabled="!outputFile || uploading || exporting || actions?.processing" @click.stop="actions?.open('extractAudio')">Trích xuất âm thanh</el-button>
      <el-button :icon="IconLayersSubtract" text :disabled="!outputFile || uploading || exporting || actions?.processing" @click.stop="actions?.open('separate')">Tách âm thanh và video</el-button>
      <el-button :icon="IconScissors" text :disabled="!outputFile || uploading || exporting || actions?.processing" @click.stop="actions?.open('trim')">Cắt đoạn video</el-button>
      <el-button :icon="IconMovie" text :loading="actions?.creatingAnalysis" :disabled="!outputFile || uploading || exporting || actions?.processing || actions?.creatingAnalysis" @click.stop="actions?.createFrameAnalysis()">Phân tích từng khung hình</el-button>
      <el-button
        :icon="IconTransfer"
        :loading="uploading"
        :disabled="exporting"
        text
        title="Thay video"
        aria-label="Thay video"
        @click.stop="fileInput?.click()">Thay video</el-button>
    </template>
    <template #topRightActions>
      <el-dropdown trigger="click" placement="bottom-end" :disabled="!player?.ready || player?.capturing || uploading || exporting" @command="player?.captureFrame($event)">
        <el-button :icon="IconPhotoScan" :loading="player?.capturing" :disabled="!player?.ready || player?.capturing || uploading || exporting" text title="Chụp khung hình video" aria-label="Chụp khung hình video" />
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="current" :icon="IconPhotoScan">Chụp khung hình hiện tại</el-dropdown-item>
            <el-dropdown-item command="first" :icon="IconPlayerSkipBack">Chụp khung hình đầu</el-dropdown-item>
            <el-dropdown-item command="last" :icon="IconPlayerSkipForward">Chụp khung hình cuối</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </template>
    <div class="videoContent nopan">
      <div v-if="exporting" class="exportLoading" role="status" aria-label="Đang xuất video">
        <el-progress type="circle" :percentage="exportProgress" :width="64" :strokeWidth="3" />
        <span>Đang xuất video</span>
      </div>
      <videoPlayer
        v-else-if="previewUrl"
        ref="player"
        :src="previewUrl"
        @loadedmetadata="resizeVideo" />
      <input ref="fileInput" class="fileInput" type="file" accept="video/*" aria-label="Chọn video" :disabled="uploading || exporting" @change="uploadVideo" />
      <el-button
        v-if="!exporting && !outputs.video"
        class="nodrag nopan"
        :icon="IconUpload"
        text
        :loading="uploading"
        title="Tải video lên"
        aria-label="Tải video lên"
        @dblclick.stop
        @click.stop="fileInput?.click()">Tải lên</el-button>
    </div>
  </nodeSkeleton>
  <videoActions ref="actions" :file="outputFile" :src="previewUrl" :disabled="uploading || exporting" />
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { IconVideo, IconUpload, IconTransfer, IconMusic, IconLayersSubtract, IconScissors, IconMovie, IconPhotoScan, IconPlayerSkipBack, IconPlayerSkipForward } from "@tabler/icons-vue";
import { ElButton, ElMessage, ElProgress, ElDropdown, ElDropdownMenu, ElDropdownItem } from "element-plus";
import { nodeSkeleton, nodeTools, useNode, z, type NodeHandle } from "@toonflow/nodes-scaffold/runtime";
import videoPlayer from "./components/videoPlayer.vue";
import videoActions from "./components/videoActions.vue";
import { getMediaMimeType } from "@toonflow/node-shared/mediaTypes";

defineOptions({
  inheritAttrs: false,
  icon: IconVideo,
  handles: [{ id: "video", type: "source", dataType: "VIDEO", label: "Video đầu ra" }] satisfies NodeHandle[],
});
const { node, nodeProps, outputs, nodeEvent, files, updateNodeInternals } = useNode({
  label: "Video",
});
const fileInput = ref<HTMLInputElement>();
const uploading = ref(false);
const player = ref<InstanceType<typeof videoPlayer>>();
const actions = ref<InstanceType<typeof videoActions>>();
const exportProgress = computed(() => (node.data as typeof node.data & { exportProgress?: number }).exportProgress);
const exporting = computed(() => typeof exportProgress.value === "number");
const videoWidth = ref(0);

const outputFile = computed(() => outputs.value.video?.dataType === "VIDEO" ? outputs.value.video.value : undefined);
const previewUrl = files.useFileUrl(
  outputFile,
  (error) => showError(error, "视频读取失败")
);

nodeEvent.on("save", (reason) => {
  if (uploading.value) throw new Error("视频处理中，请完成后再切换或刷新节点");
  if (reason === "reload" && exporting.value) throw new Error("视频正在导出，请完成后再刷新节点");
});
nodeEvent.on("delete", () => {
  if (uploading.value) throw new Error("视频上传中，请稍后删除节点");
  uploading.value = true;
  return files.removeNodeFiles().finally(() => {
    uploading.value = false;
  });
});

nodeTools.register({
  name: "setVideo",
  description: "选择工作区内已有的视频文件作为此节点的输出，path 使用工作区相对路径",
  parameters: z.strictObject({
    path: z.string().min(1).max(4096),
    mimeType: z.string().regex(/^video\/[a-zA-Z0-9.+-]+$/),
  }),
  async execute({ path, mimeType }, { signal }) {
    signal?.throwIfAborted();
    if (uploading.value || exporting.value) throw new Error("视频处理中，请稍后重试");
    uploading.value = true;
    try {
      const content = await files.getWorkspaceFiles().read(path);
      signal?.throwIfAborted();
      if (!content.byteLength || content.byteLength > 100 * 1024 * 1024) throw new Error("视频不能为空且不能超过 100 MB");
      outputs.value.video = { dataType: "VIDEO", value: { url: path, mimeType } };
      return outputs.value.video;
    } finally {
      uploading.value = false;
    }
  },
});

async function resizeVideo(event: Event) {
  const video = event.currentTarget as HTMLVideoElement;
  if (!video.videoWidth || !video.videoHeight) return;
  videoWidth.value = Math.max(180, (240 * video.videoWidth) / video.videoHeight);
  await nextTick();
  updateNodeInternals();
}

async function uploadVideo(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || uploading.value || exporting.value) return;
  const mimeType = getMediaMimeType(file);
  if (!mimeType.startsWith("video/")) return void ElMessage.error("请选择视频文件");
  if (!file.size || file.size > 100 * 1024 * 1024) return void ElMessage.error("视频不能为空且不能超过 100 MB");
  uploading.value = true;
  try {
    const url = await files.uploadFile(file);
    // ACT: 复制节点可能仍引用旧视频，替换输出不删除共享文件。
    outputs.value.video = { dataType: "VIDEO", value: { url, mimeType } };
  } catch (error) {
    showError(error, "视频替换失败");
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
.videoContent {
  .nodeSkeleton.resized & {
    height: 100%;
    min-height: 0;
    grid-template: minmax(0, 1fr) / minmax(0, 1fr);
    --nodeMediaHeight: 100%;

    .exportLoading { max-height: 100%; box-sizing: border-box; overflow: auto; }
  }

  position: relative;
  display: grid;
  place-items: center;
  min-height: 144px;
  overflow: hidden;
  border-radius: var(--el-border-radius-base);

  .exportLoading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 20px;
    color: var(--el-text-color-secondary);
  }

  .fileInput {
    display: none;
  }
}
</style>
