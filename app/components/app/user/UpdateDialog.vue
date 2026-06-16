<script setup lang="ts">
import type { output } from "zod";
import type {
  FormSubmitEvent,
  FormErrorEvent,
  FormErrorWithId,
} from "@nuxt/ui";
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

const { isLoading, updateUser } = useAdmin();
const toast = useAppToast();
const errorMessage = ref<FormErrorWithId[]>([]);

const modalValue = useVModel(props, "open", emits, {
  defaultValue: false,
});

const state = reactive<UpdateUserInput>({
  name: props.user?.name || "",
  email: props.user?.email || "",
  quotaBytes: Number(props.user?.quota?.quotaBytes) || 0,
  quotaRequests: Number(props.user?.quota?.quotaRequests) || 0,
  isActive: props.user?.isActive || true,
  emailVerified: props.user?.emailVerified || false,
});

type Schema = output<typeof updateUserSchema>;

const onSubmit = async (event: FormSubmitEvent<Schema>) => {
  if (!props.user) {
    toast.error("User not found");
    return;
  }
  try {
    await updateUser(props.user.id, state);
    emits("onSuccess");
    toast.success("User updated successfully");
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Unknown error");
  } finally {
    modalValue.value = false;
    isLoading.value = false;
    resetForm();
  }
};
function setError(event: FormErrorEvent) {
  errorMessage.value = event.errors;
}
function resetForm() {
  state.name = "";
  state.email = "";
  state.quotaBytes = 1024 * 1024 * 1024 * 10;
  state.quotaRequests = 1000;
  state.isActive = true;
  state.emailVerified = false;
}
</script>

<template>
  <UModal
    v-model:open="modalValue"
    :close="{
      color: 'error',
      variant: 'outline',
      class: 'rounded-full text-error',
    }"
    scrollable
  >
    <template #content>
      <div class="p-6 space-y-5">
        <div>
          <h3 class="font-semibold text-lg">Update User</h3>
          <p class="text-sm text-muted mt-0.5">
            Update a user information {{ props.user?.name }}
          </p>
        </div>
        <div v-if="errorMessage && errorMessage.length > 0" class="space-y-2">
          <UAlert
            v-for="error in errorMessage"
            :key="error.id"
            color="error"
            :title="error.name"
            :description="error.message"
            icon="material-symbols:warning-rounded"
          />
        </div>
        <UForm
          :schema="updateUserSchema"
          :state="state"
          class="p-6 space-y-5 w-full"
          @submit="onSubmit"
          @error="setError"
        >
          <UFormField label="Name" name="name">
            <UInput
              v-model="state.name"
              type="text"
              name="name"
              placeholder="Enter name"
              autocomplete="name"
              icon="material-symbols:text-fields"
              class="w-full"
              :disabled="isLoading"
            />
          </UFormField>
          <UFormField label="Quota Bytes" name="quotaBytes">
            <UInput
              v-model.number="state.quotaBytes"
              type="number"
              name="quotaBytes"
              placeholder="Enter quota bytes"
              autocomplete="on"
              icon="material-symbols:money"
              class="w-full"
              :disabled="isLoading"
            />
          </UFormField>
          <UFormField label="Quota Requests" name="quotaRequests">
            <UInput
              v-model.number="state.quotaRequests"
              type="number"
              name="quotaRequests"
              placeholder="Enter quota requests"
              autocomplete="on"
              icon="material-symbols:money"
              class="w-full"
              :disabled="isLoading"
            />
          </UFormField>
          <UFormField label="Active" name="isActive">
            <USwitch
              v-model="state.isActive"
              label="Status Active"
              description="Determine the Active Status of the User Account"
              unchecked-icon="i-lucide-x"
              checked-icon="i-lucide-check"
              :disabled="isLoading"
            />
          </UFormField>
          <UFormField label="Email Verified" name="emailVerified">
            <USwitch
              v-model="state.emailVerified"
              label="Status Email Verified"
              description="Determine the Email Verification Status of the User Account"
              unchecked-icon="i-lucide-x"
              checked-icon="i-lucide-check"
              :disabled="isLoading"
            />
          </UFormField>
          <div class="flex items-center justify-end gap-2">
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
              type="submit"
              color="primary"
              icon="material-symbols:add"
              size="md"
              class="text-white"
              :disabled="isLoading"
              :loading="isLoading"
            >
              {{ isLoading ? "Updating..." : "Update" }}
            </UButton>
          </div>
        </UForm>
      </div>
    </template>
  </UModal>
</template>
