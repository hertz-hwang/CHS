<script setup lang="ts">
import { ref, computed } from 'vue'
import ModalDialog from '../ModalDialog.vue'
import { useEngine } from '../../composables/useEngine'

const { engine, toast, refreshStats } = useEngine()

const showModal = ref(false)
const editingName = ref<string | null>(null)
const form = ref({ name: '', ids: '' })

const namedRoots = computed(() => {
  const list: { name: string; ids: string }[] = []
  for (const [name, ids] of engine.namedRoots) {
    list.push({ name, ids })
  }
  return list.sort((a, b) => a.name.localeCompare(b.name))
})

function openAddModal() {
  editingName.value = null
  form.value = { name: '', ids: '' }
  showModal.value = true
}

function openEditModal(name: string) {
  editingName.value = name
  form.value = {
    name,
    ids: engine.namedRoots.get(name) || '',
  }
  showModal.value = true
}

function saveNamedRoot() {
  if (!form.value.name) {
    toast('请输入名称')
    return
  }
  if (!form.value.ids) {
    toast('请输入 IDS 结构式')
    return
  }

  // 验证名称格式
  if (!form.value.name.startsWith('{') || !form.value.name.endsWith('}')) {
    toast('名称需用大括号包裹，如 {落字框}')
    return
  }

  engine.namedRoots.set(form.value.name, form.value.ids)
  engine.roots.add(form.value.name)

  showModal.value = false
  refreshStats()
  toast(editingName.value ? '命名字根已更新' : '命名字根已添加')
}

function deleteNamedRoot(name: string) {
  engine.namedRoots.delete(name)
  engine.roots.delete(name)
  refreshStats()
  toast('命名字根已删除')
}
</script>

<template>
  <div class="panel">
    <div class="panel-head">🏷️ 命名字根</div>
    <div class="panel-body">
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button class="btn btn-success" @click="openAddModal">+ 添加命名字根</button>
        <span style="color:var(--text2);font-size:12px;line-height:32px">
          当前 {{ namedRoots.length }} 个
        </span>
      </div>

      <div v-if="namedRoots.length === 0" style="color:var(--text2);font-size:13px">
        暂无命名字根，点击「添加命名字根」定义特殊部件
      </div>

      <div v-else class="named-root-list">
        <div v-for="item in namedRoots" :key="item.name" class="named-root-item">
          <div class="named-root-name">{{ item.name }}</div>
          <div class="named-root-ids">{{ item.ids }}</div>
          <div class="named-root-actions">
            <button class="btn btn-sm btn-outline" @click="openEditModal(item.name)">编辑</button>
            <button class="btn btn-sm btn-danger" @click="deleteNamedRoot(item.name)">删除</button>
          </div>
        </div>
      </div>

      <div style="margin-top:12px;font-size:12px;color:var(--text2)">
        <p style="margin:0 0 4px"><strong>说明：</strong></p>
        <p style="margin:0">命名字根是用大括号包裹的标识符，代表一个特定的 IDS 结构。</p>
        <p style="margin:4px 0 0">例如：{落字框} 代表 ⿱艹氵 这个结构</p>
      </div>
    </div>
  </div>

  <ModalDialog :visible="showModal" :title="editingName ? '编辑命名字根' : '添加命名字根'" @close="showModal = false">
    <div class="form-group">
      <label>名称</label>
      <input v-model="form.name" type="text" placeholder="如：{落字框}" :disabled="!!editingName" />
      <small style="color:var(--text2)">必须用大括号包裹</small>
    </div>
    <div class="form-group">
      <label>IDS 结构式</label>
      <input v-model="form.ids" type="text" placeholder="如：⿱艹氵" />
      <small style="color:var(--text2)">使用 IDS 结构符描述部件组合</small>
    </div>
    <template #actions>
      <button class="btn btn-outline" @click="showModal = false">取消</button>
      <button class="btn" @click="saveNamedRoot">保存</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.named-root-list { display: flex; flex-direction: column; gap: 8px; }
.named-root-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
}
.named-root-name { font-size: 16px; font-weight: 500; min-width: 100px; }
.named-root-ids {
  font-family: monospace;
  font-size: 14px;
  color: var(--text2);
  flex: 1;
}
.named-root-actions { display: flex; gap: 4px; }
.form-group { margin-bottom: 12px; }
.form-group label { display: block; font-size: 12px; color: var(--text2); margin-bottom: 4px; }
.form-group input { width: 100%; }
</style>