<script setup lang="ts">
import type { SelectItem, DropdownMenuItem } from "@nuxt/ui";
import type { User, UserQuota, Role } from "@prisma/client";

definePageMeta({
  layout: "auth",
  middleware: ["auth", "admin"],
});
useSeoMeta({
  title: "Users",
  description: "Manage your users here.",
  robots: "noindex, nofollow",
});

type UserWithRoles = User & {
  quota: UserQuota;
  role: Role;
};

const {
  filters,
  users,
  user,
  meta,
  page,
  limit,
  isLoading,
  selected,
  error,
  // derived
  hasFilter,
  allSelected,
  // actions
  fetchUsers,
  toggleSelect,
  toggleAll,
  deleteUser,
  bulkDeleteUsers,
  cleanUpUsers,
  cleanUpProxies,
  cleanUpLogs,
  resetFilter,
} = useAdmin();
const toast = useToast();
const { warning } = useGlobalAlert();

const showDeleteModal = ref(false);
const showInviteModal = ref(false);
const showUpdateModal = ref(false);
const showDetailModal = ref(false);
const userToAction = ref<UserWithRoles | null>(null);

const stats = computed(() => {
  const all = users.value;
  const active = all.filter((c) => c.isActive).length;
  const expired = all.filter((c) => !c.isActive).length;
  return [
    {
      label: "Total Users",
      value: active,
      color: "indigo",
      icon: "ph:users-three-fill",
    },
    {
      label: "Active Users",
      value: active,
      color: "emerald",
      icon: "material-symbols:check-circle",
    },
    {
      label: "Inactive Users",
      value: expired,
      color: "amber",
      icon: "material-symbols:warning-rounded",
    },
  ];
});

async function executeDelete() {
  if (!userToAction.value) return;
  const ok = await deleteUser(userToAction.value.id);
  if (ok) {
    showDeleteModal.value = false;
    fetchUsers();
  }
}

const statusOptions: SelectItem[] = [
  { label: "All Status", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];
const roleOptions: SelectItem[] = [
  { label: "All Role", value: "all" },
  { label: "Super Admin", value: "superadmin" },
  { label: "Admin", value: "admin" },
  { label: "User", value: "user" },
];
const orderOptions: SelectItem[] = [
  { label: "All Order", value: "all" },
  { label: "ID", value: "id" },
  { label: "Latest", value: "createdAt" },
  { label: "Name", value: "name" },
  { label: "Email", value: "email" },
  { label: "Updated", value: "updatedAt" },
];

const dropdownItems = ref<DropdownMenuItem[]>([
  {
    label: "Clean Up Users",
    icon: "material-symbols:supervisor-account",
    onClick: cleanUpUsers,
  },
  {
    label: "Clean Up Proxies",
    icon: "streamline-plump:clean-broom-wipe",
    onClick: cleanUpProxies,
  },
  {
    label: "Clean Up Logs",
    icon: "hugeicons:clean",
    onClick: cleanUpLogs,
  },
]);
</script>

<template>
  <AppDashboardLayout id="users" title="Users">
    <template #content>
      <div class="min-h-screen p-6">
        <div class="mx-auto max-w-7xl space-y-6">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 class="text-xl font-semibold">Users</h1>
              <p class="text-sm text-muted">{{ meta.total }} user total</p>
            </div>
            <div class="flex items-center gap-2">
              <UButton
                v-if="hasFilter"
                icon="ic:sharp-clear"
                color="error"
                size="md"
                class="text-white"
                @click="resetFilter"
              >
                <span class="hidden md:block">Reset Filter</span>
              </UButton>
              <UDropdownMenu
                :items="dropdownItems"
                :ui="{
                  content: 'w-48 z-50',
                }"
              >
                <UButton
                  icon="i-lucide-menu"
                  color="neutral"
                  variant="outline"
                  size="md"
                />
              </UDropdownMenu>
              <UButton
                icon="material-symbols:refresh"
                color="neutral"
                variant="outline"
                size="md"
                :loading="isLoading"
                @click="fetchUsers"
              >
                <span class="hidden md:block">Refresh</span>
              </UButton>
              <UButton
                icon="ic:round-cleaning-services"
                color="warning"
                size="md"
                class="text-white"
                :loading="isLoading"
                @click="
                  () => {
                    warning(
                      'Warning!',
                      'Are you sure to clean up selected users?',
                    ).then((confirm) => {
                      if (confirm) {
                        cleanUpUsers();
                      }
                    });
                  }
                "
              >
                <span class="hidden md:block">Clean Up</span>
              </UButton>
              <UButton
                icon="i-heroicons-plus"
                color="primary"
                size="md"
                class="text-white"
                @click="showInviteModal = true"
              >
                <span class="hidden md:block">Invite User</span>
              </UButton>
            </div>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatsCard
              v-for="stat in stats"
              :key="stat.label"
              :label="stat.label"
              :value="stat.value"
              :icon="stat.icon"
              :color="stat.color as ColorVariant"
              format="compact"
              :loading="isLoading"
            />
          </div>

          <!-- Filters -->
          <UPageCard
            title="Filter & Search"
            description="Filter proxy by status, category, and protocol"
            :ui="{
              container:
                'shadow-md border border-info/20 dark:border-info/35 rounded-lg',
            }"
            class="mb-6 w-full shadow-sm"
          >
            <div class="grid grid-cols-1 gap-3 md:grid-cols-4">
              <UInput
                v-model="filters.search"
                icon="i-heroicons-magnifying-glass"
                placeholder="Cari user..."
              />
              <USelect
                v-model="filters.status"
                :items="statusOptions"
                class="w-full"
              />
              <USelect
                v-model="filters.role"
                :items="roleOptions"
                class="w-full"
              />
              <USelect
                v-model="filters.orderBy"
                :items="orderOptions"
                class="w-full"
              />
            </div>
          </UPageCard>

          <!-- Bulk action bar -->
          <div
            v-if="selected.size > 0"
            class="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm"
          >
            <span>{{ selected.size }} user terpilih</span>
            <div class="flex items-center gap-2">
              <UButton
                size="sm"
                color="error"
                variant="soft"
                icon="i-heroicons-trash"
                :loading="isLoading"
                @click="
                  () => {
                    warning(
                      'Warning!',
                      'Are you sure you want to delete the selected users?',
                    ).then((confirmed) => {
                      if (confirmed) {
                        bulkDeleteUsers();
                      }
                    });
                  }
                "
              >
                Hapus terpilih
              </UButton>
            </div>
          </div>

          <!-- Table -->
          <UPageCard
            spotlight
            spotlight-color="primary"
            :ui="{
              root: 'w-full',
              container:
                'shadow-md border border-primary/20 dark:border-primary/35 rounded-lg overflow-auto',
            }"
          >
            <div
              class="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800 shrink-0"
            >
              <table class="text-sm table-auto">
                <thead
                  class="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900/50 dark:text-neutral-400"
                >
                  <tr>
                    <th class="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        :checked="allSelected"
                        class="cursor-pointer"
                        @change="toggleAll"
                      />
                    </th>
                    <th class="px-4 py-3 font-medium">Name</th>
                    <th class="px-4 py-3 font-medium">Email</th>
                    <th class="px-4 py-3 font-medium">Role</th>
                    <th class="px-4 py-3 font-medium">Status</th>
                    <th class="px-4 py-3 font-medium">Quota Bytes</th>
                    <th class="px-4 py-3 font-medium">Quota Request</th>
                    <th class="px-4 py-3 font-medium">Used Byte</th>
                    <th class="px-4 py-3 font-medium">Used Request</th>
                    <th class="px-4 py-3 text-right font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody
                  class="divide-y divide-neutral-100 dark:divide-neutral-800"
                >
                  <tr v-if="isLoading">
                    <td colspan="9" class="px-4 py-10 text-center text-muted">
                      Memuat…
                    </td>
                  </tr>
                  <tr v-else-if="users.length === 0">
                    <td colspan="9" class="px-4 py-12 text-center text-muted">
                      Belum ada user. Klik
                      <span class="font-medium">Import User</span> untuk mulai.
                    </td>
                  </tr>
                  <tr
                    v-for="row in users"
                    v-else
                    :key="row.id"
                    class="hover:bg-neutral-50 dark:hover:bg-neutral-900/40"
                  >
                    <td class="px-4 py-3">
                      <input
                        type="checkbox"
                        :checked="selected.has(row.id)"
                        class="cursor-pointer"
                        @change="toggleSelect(row.id)"
                      />
                    </td>
                    <td
                      class="px-4 py-3 font-mono cursor-pointer"
                      @click="
                        () => {
                          userToAction = row;
                          showDetailModal = true;
                        }
                      "
                    >
                      {{ row.name }}
                    </td>
                    <td class="px-4 py-3">{{ row.email }}</td>
                    <td class="px-4 py-3">{{ row.role.name }}</td>
                    <td class="px-4 py-3">
                      <span
                        class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs"
                        :class="
                          row.isActive
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                            : 'border-red-500/30 bg-red-500/10 text-red-400'
                        "
                      >
                        {{ row.isActive ? "Active" : "Inactive" }}
                      </span>
                    </td>
                    <td class="px-4 py-3">{{ row.quota.quotaBytes || "0" }}</td>
                    <td class="px-4 py-3">
                      {{ row.quota.quotaRequests || "0" }}
                    </td>
                    <td class="px-4 py-3">{{ row.quota.usedBytes || "0" }}</td>
                    <td class="px-4 py-3">
                      {{ row.quota.usedRequests || "0" }}
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex justify-end gap-1">
                        <UButton
                          size="xs"
                          variant="outline"
                          icon="ic:outline-remove-red-eye"
                          title="Detail"
                          @click="
                            () => {
                              userToAction = row;
                              showDetailModal = true;
                            }
                          "
                        />
                        <UButton
                          size="xs"
                          color="secondary"
                          variant="soft"
                          icon="material-symbols:edit-square-outline"
                          title="Edit"
                          @click="
                            () => {
                              userToAction = row;
                              showUpdateModal = true;
                            }
                          "
                        />
                        <UButton
                          size="xs"
                          color="error"
                          variant="ghost"
                          icon="i-heroicons-trash"
                          title="Hapus"
                          @click="
                            () => {
                              userToAction = row;
                              showDeleteModal = true;
                            }
                          "
                        />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Pagination -->
            <div
              v-if="meta.totalPages > 1"
              class="flex items-center justify-between text-sm"
            >
              <span class="text-muted">
                Halaman {{ meta.page }} / {{ meta.totalPages }}
              </span>
              <div class="flex gap-2">
                <UButton
                  size="sm"
                  color="neutral"
                  variant="outline"
                  :disabled="page <= 1"
                  @click="page--"
                >
                  Sebelumnya
                </UButton>
                <UButton
                  size="sm"
                  color="neutral"
                  variant="outline"
                  :disabled="!meta.has_more"
                  @click="page++"
                >
                  Berikutnya
                </UButton>
              </div>
            </div>
          </UPageCard>
        </div>

        <AppUserInviteDialog
          v-model:open="showInviteModal"
          @on-success="fetchUsers"
          @on-close="showInviteModal = false"
        />

        <AppUserUpdateDialog
          v-if="userToAction"
          v-model:open="showUpdateModal"
          :user="userToAction"
          @on-success="
            () => {
              userToAction = null;
              fetchUsers();
            }
          "
          @on-close="
            () => {
              userToAction = null;
              showUpdateModal = false;
            }
          "
        />
        <AppUserDetail
          v-if="userToAction"
          v-model:open="showDetailModal"
          :user="userToAction"
          @on-success="
            () => {
              userToAction = null;
              fetchUsers();
            }
          "
          @on-close="
            () => {
              userToAction = null;
              showDetailModal = false;
            }
          "
        />

        <AlertDialog
          :open="showDeleteModal"
          type="warning"
          title="Delete User"
          message="Are you sure you want to delete this user? This action is not reversible. All information related to this user will be deleted permanently."
          is-action
          label-action="Delete user"
          label-close="Cancel"
          @onaction="executeDelete"
          @onclose="showDeleteModal = false"
        />
      </div>
    </template>
  </AppDashboardLayout>
</template>
