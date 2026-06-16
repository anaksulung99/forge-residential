<script setup lang="ts">
definePageMeta({ layout: "default" });

const { t, locale, messages } = useI18n();
const localePath = useLocalePath();

useSeoMeta({
  title: "Docs — Forget Proxy",
  description: "Learn about Forget Proxy — a tool to forget your proxy.",
  ogTitle: "Docs — Forget Proxy",
  ogDescription: "Learn about Forget Proxy — a tool to forget your proxy.",
});
</script>

<template>
  <div>
    <h1>Docs</h1>
  </div>
</template>
