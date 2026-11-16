<!--
  OfflineBanner.vue - 断网提示条（W3.4 弱网恢复前端面）
  功能 监听 navigator.onLine 与 online/offline 事件，断网时在页面顶部
        显示固定提示条，恢复后自动消失。不拦截用户操作（写操作失败
        保留输入由 request.ts 已有重试与 useTableApi 层处理）。
  调用方 MainLayout.vue（挂在页面顶部，el-main 之前）。
  入参 无。
  传给谁 ElAlert（info 类型，固定文案，不可关闭）。
  存什么 isOnline ref（仅本地 UI 状态）。
  存哪里 内存。
-->
<template>
  <el-alert
    v-if="!isOnline"
    :title="t('common.offlineBannerTitle')"
    :description="t('common.offlineBannerDescription')"
    type="warning"
    :closable="false"
    show-icon
    class="offline-banner"
  />
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n({ useScope: 'global' });

const isOnline = ref(navigator.onLine);

const handleOnline = () => {
  isOnline.value = true;
};
const handleOffline = () => {
  isOnline.value = false;
};

onMounted(() => {
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
});

onBeforeUnmount(() => {
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
});
</script>

<style scoped>
.offline-banner {
  border-radius: 0;
  margin: 0;
}
</style>
