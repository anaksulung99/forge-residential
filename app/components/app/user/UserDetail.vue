<script setup lang="ts">
import type { User, Role, UserQuota } from "@prisma/client";

interface UserWithRoles extends User {
  role: Role;
  quota: UserQuota | null;
}

const emits = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "onSuccess"): void;
  (e: "onClose"): void;
}>();

const props = withDefaults(
  defineProps<{
    open?: boolean;
    user?: UserWithRoles | null;
  }>(),
  {
    open: false,
    user: null,
  },
);

const { isLoading, assignRole, setActiveStatus } = useAdmin();

const toast = useAppToast();

const modalValue = useVModel(props, "open", emits, {
  defaultValue: false,
});

async function handleBlockUser() {
  if (!props.user) {
    return;
  }
  await setActiveStatus(props.user.id, {
    status: props.user.isActive ? "inactive" : "active",
  });
  emits("onSuccess");
  emits("onClose");
}
async function handlePromoteUser() {
  if (!props.user) {
    return;
  }
  await assignRole(props.user.id, {
    role: props.user.role.name === "admin" ? "user" : "admin",
  });
  emits("onSuccess");
  emits("onClose");
}
</script>

<template>
  <UModal
    v-model:open="modalValue"
    :close="{
      variant: 'outline',
      size: 'sm',
    }"
    title="User Detail"
    :description="`Detail for ${props.user?.name}`"
    scrollable
    :ui="{
      body: 'w-full max-w-lg mx-auto',
    }"
  >
    <template #body>
      <UPageCard
        orientation="horizontal"
        spotlight
        spotlight-color="primary"
        :ui="{
          root: 'overflow-hidden overflow-x-auto shadow-md w-full',
          container:
            'shadow-md border border-secondary/20 dark:border-secondary/35 rounded-lg transition-all group w-full ',
        }"
      >
        <div class="space-y-4 w-full p-4">
          <UPageFeature
            title="Name"
            :description="props.user?.name || 'N/A'"
            icon="material-symbols:contact-emergency"
            :ui="{
              description: 'truncate w-full max-w-xs',
            }"
          />
          <UPageFeature
            title="Email"
            :description="props.user?.email || 'N/A'"
            icon="material-symbols:mail"
            :ui="{
              description: 'truncate w-full max-w-xs',
            }"
          />
          <UPageFeature
            title="Role"
            :description="props.user?.role.name || 'N/A'"
            icon="material-symbols:group"
            :ui="{
              description: 'truncate w-full max-w-xs',
            }"
          />
          <UPageFeature
            title="Join At"
            :description="
              props.user?.createdAt
                ? new Date(props.user?.createdAt)?.toLocaleString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })
                : 'N/A'
            "
            icon="ic:round-calendar-month"
            :ui="{
              description: 'line-clamp-1 w-full whitespace-nowrap',
            }"
          />
          <UPageFeature
            title="API Key"
            :description="props.user?.apiKey || 'N/A'"
            icon="material-symbols:vpn-key"
            :ui="{
              description: 'truncate w-full max-w-xs',
            }"
          />
          <UPageFeature
            title="Quota Bytes"
            :description="props.user?.quota?.quotaBytes?.toString() || 'N/A'"
            icon="material-symbols:data-usage"
            :ui="{
              description: 'truncate w-full max-w-xs',
            }"
          />
          <UPageFeature
            title="Quota Requests"
            :description="props.user?.quota?.quotaRequests?.toString() || 'N/A'"
            icon="lucide:git-pull-request"
            :ui="{
              description: 'truncate w-full max-w-xs',
            }"
          />
          <UPageFeature
            title="Status"
            :description="props.user?.isActive ? 'Active' : 'Blocked'"
            icon="material-symbols:info"
            :ui="{
              description: `truncate w-full max-w-xs ${props.user?.isActive ? 'text-success' : 'text-error'}`,
            }"
          />
        </div>
      </UPageCard>
    </template>
    <template #footer>
      <div class="flex items-center justify-end gap-2 w-full">
        <UButton
          type="button"
          label="Close"
          color="neutral"
          variant="outline"
          icon="material-symbols:close"
          size="md"
          :disabled="isLoading"
          @click="modalValue = false"
        />

        <UButton
          type="button"
          :color="props.user?.isActive ? 'error' : 'primary'"
          :icon="
            props.user?.isActive
              ? 'material-symbols:block-outline'
              : 'material-symbols:check-circle-outline'
          "
          size="md"
          class="text-white"
          :disabled="isLoading"
          :loading="isLoading"
          @click="handleBlockUser"
        >
          {{
            isLoading
              ? "Updating..."
              : `${props.user?.isActive ? "Block" : "Activate"}`
          }}
        </UButton>

        <UButton
          type="button"
          :color="props.user?.role.name === 'user' ? 'primary' : 'warning'"
          :icon="
            props.user?.role.name === 'user'
              ? 'material-symbols:rocket-launch'
              : 'material-symbols:arrow-left'
          "
          size="md"
          class="text-white"
          :disabled="isLoading"
          :loading="isLoading"
          @click="handlePromoteUser"
        >
          {{
            isLoading
              ? "Updating..."
              : `${props.user?.role.name === "user" ? "Promote" : "Demote"}`
          }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
