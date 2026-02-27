<script setup lang="ts">
import { ref, computed } from 'vue'
import ModalDialog from '../ModalDialog.vue'
import { useEngine } from '../../composables/useEngine'
import { RootCode, codeToString, parseCode } from '../../engine/config'

const { engine, toast, refreshStats } = useEngine()

const showModal = ref(false)
const editingRoot = ref<string | null>(null)
const form = ref({ root: '', code: '' })

const rootCodes = computed(() => {
  const list: { root: string; code: RootCode }[] = []
  for (const [root, code] of engine.rootCodes) {
    list.push({ root, code })
  }
  return list.sort((a, b) => a.root.localeCompare(b.root))
})

function openAddModal() {
  editingRoot.value = null
  form.value = { root: '', code: '' }
  showModal.value = true
}

function openEditModal(root: string) {
  editingRoot.value = root
  const code = engine.rootCodes.get(root)
  form.value = {
    root,
    code: code ? codeToString(code) : '',
  }
  showModal.value = true
}

function saveCode() {
  if (!form.value.root) {
    toast('请输入字根')
    return
  }
  if (!form.value.code) {
    toast('请输入编码')
    return
  }

  const parsed = parseCode(form.value.code)
  engine.rootCodes.set(form.value.root, { root: form.value.root, ...parsed })
  engine.roots.add(form.value.root)

  showModal.value = false
  refreshStats()
  toast(editingRoot.value ? '编码已更新' : '编码已添加')
}

function deleteCode(root: string) {
  engine.rootCodes.delete(root)
  engine.roots.delete(root)
  refreshStats()
  toast('编码已删除')
}

// 渲染编码（带颜色区分）
function renderCode(code: RootCode): { main: string; sub?: string; supplement?: string } {
  return {
    main: code.main,
    sub: code.sub,
    supplement: code.supplement,
  }
}
</script>

<template>
  <div class="panel">
    <div class="panel-head">🔤 字根编码管理</div>
    <div class="panel-body">
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button class="btn btn-success" @click="openAddModal">+ 添加编码</button>
        <span style="color:var(--text2);font-size:12px;line-height:32px">
          当前 {{ rootCodes.length }} 个字根
        </span>
      </div>

      <div v-if="rootCodes.length === 0" style="color:var(--text2);font-size:13px">
        暂无字根编码，点击「添加编码」定义字根及其编码
      </div>

      <div v-else class="code-list">
        <div v-for="item in rootCodes" :key="item.root" class="code-item">
          <div class="root-char">{{ item.root }}</div>
          <div class="root-code">
            <span class="main">{{ item.code.main }}</span>
            <span v-if="item.code.sub" class="sub">{{ item.code.sub }}</span>
            <span v-if="item.code.supplement" class="supplement">{{ item.code.supplement }}</span>
          </div>
          <div class="code-actions">
            <button class="btn btn-sm btn-outline" @click="openEditModal(item.root)">编辑</button>
            <button class="btn btn-sm btn-danger" @click="deleteCode(item.root)">删除</button>
          </div>
        </div>
      </div>

      <div style="margin-top:12px;font-size:12px;color:var(--text2)">
        <p style="margin:0 0 4px"><strong>编码格式说明：</strong></p>
        <p style="margin:0">第1字符 = 键位码 | 第2字符 = 小码（<span style="color:#2196F3">蓝色</span>）| 第3字符起 = 补码（<span style="color:#4CAF50">绿色</span>）</p>
      </div>
    </div>
  </div>

  <ModalDialog :visible="showModal" :title="editingRoot ? '编辑编码' : '添加编码'" @close="showModal = false">
    <div class="form-group">
      <label>字根</label>
      <input v-model="form.root" type="text" placeholder="如：一 或 {落字框}" :disabled="!!editingRoot" />
    </div>
    <div class="form-group">
      <label>编码</label>
      <input v-model="form.code" type="text" placeholder="如：fki (键位+小码+补码)" maxlength="10" />
      <small style="color:var(--text2)">
        示例：m=单编码 | lk=双编码 | fki=三编码
      </small>
    </div>
    <div v-if="form.code" style="margin-bottom:12px">
      <span>预览：</span>
      <span class="preview-code">
        <span class="main">{{ form.code[0] || '' }}</span>
        <span v-if="form.code.length > 1" class="sub">{{ form.code[1] }}</span>
        <span v-if="form.code.length > 2" class="supplement">{{ form.code.slice(2) }}</span>
      </span>
    </div>
    <template #actions>
      <button class="btn btn-outline" @click="showModal = false">取消</button>
      <button class="btn" @click="saveCode">保存</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.code-list { display: flex; flex-wrap: wrap; gap: 8px; }
.code-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
}
.root-char { font-size: 20px; min-width: 32px; text-align: center; }
.root-code {
  font-family: monospace;
  font-size: 16px;
  font-weight: 500;
  min-width: 40px;
}
.root-code .sub { color: #2196F3; }
.root-code .supplement { color: #4CAF50; }
.code-actions { display: flex; gap: 4px; }
.preview-code { font-family: monospace; font-size: 18px; font-weight: 500; }
.preview-code .sub { color: #2196F3; }
.preview-code .supplement { color: #4CAF50; }
.form-group { margin-bottom: 12px; }
.form-group label { display: block; font-size: 12px; color: var(--text2); margin-bottom: 4px; }
.form-group input { width: 100%; }
</style>