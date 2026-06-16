<script setup lang="ts">
definePageMeta({
  layout: "auth",
  middleware: "auth",
});
useSeoMeta({
  title: "Campaigns",
  description: "Manage your campaigns here.",
  robots: "noindex, nofollow",
});
</script>

<template>
  <AppDashboardLayout id="campaigns" title="Campaigns">
    <template #content>
      <div class="min-h-screen p-6">
        <div class="mx-auto max-w-7xl space-y-6"></div>
      </div>
    </template>
  </AppDashboardLayout>
</template>
