<template>
  <view>
    <text>{{ APP_NAME }}</text>
    <text>{{ t('app.environment') }}{{ runtimeConfig.envName }}</text>
    <text>{{ t('app.terminalSource') }}{{ runtimeConfig.terminalSource }}</text>
  </view>
</template>

<script setup lang="ts">
import { APP_NAME } from '../../app'
import { runtimeConfig } from '../../shared/config/runtime'
import { t } from '../../shared/i18n'
</script>
