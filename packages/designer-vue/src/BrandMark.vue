<script setup lang="ts">
/**
 * 顶栏 logo：品牌蓝圆角块 + 叠层图形，配字标。
 *
 * 只做标识，不带交互 —— 引擎 demo 左区就是 logo 图 + 场景名（标签，不是切换器）。
 * 与 React 版的 `BrandMark` 是同一份 path 数据（<rect> + 两个 <path>），
 * 尺寸由外部 class 控制（`Designer.module.css` 的 `.brandMark`）。
 */
withDefaults(defineProps<{ className?: string }>(), { className: undefined });
</script>

<template>
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    :class="className"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="lc-next-mark" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#3a8bff" />
        <stop offset="1" stop-color="#006cff" />
      </linearGradient>
    </defs>
    <rect width="24" height="24" rx="6" fill="url(#lc-next-mark)" />
    <path d="M12 5.4 18.6 9 12 12.6 5.4 9 12 5.4Z" fill="#fff" />
    <path
      d="M6.6 12.2 12 15.1l5.4-2.9"
      fill="none"
      stroke="#fff"
      stroke-width="1.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      opacity="0.75"
    />
  </svg>
</template>
