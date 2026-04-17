/**
 * 键魂当量模型 v2.3 (Key-Soul Equivalence Model v2.3)
 *
 * 基于 key_soul_equiv_v2.3.py 的 TypeScript 移植版本。
 * 用于计算击键序列的时间成本（当量），作为输入法编码方案评估的核心指标。
 *
 * ═══════════════════════════════════════════════════════════════
 * v2.3 新增特性:
 *   1. 滚动手势运动折扣 (Roll Move Discount)
 *      - 滚动手势（同手相邻手指连续击键）是一个整体运动规划单元，
 *        后续手指的移动时间应大幅折扣。
 *      - 折扣公式:
 *        有效移动时间 = 原始Fitts时间 × 滚动移动折扣
 *        滚动移动折扣 = ROLL_MOVE_DISCOUNT + (1-ROLL_MOVE_DISCOUNT)×(1-decay)
 *        其中 decay = ROLL_ROW_DECAY ^ 行差
 *      - 同行滚动: 移动时间 × 0.40 (大幅折扣)
 *      - 跨1行滚动: 移动时间 × 0.70 (中等折扣)
 *      - 跨2行滚动: 移动时间 × 0.85 (较弱折扣)
 *
 *   2. 首键定位成本 (First Key Cost)
 *      - 序列的第一个键如果不在手指的 home 位置，需要先移动手指。
 *      - 成本 = Fitts(home → 首键) × FIRST_KEY_COST_RATIO(0.60)
 *
 * v2.2 保留特性:
 *   - 跨行滚动模型 — 同手相邻手指跨行击键也触发滚动奖励
 *     滚动奖励随行差衰减: base_bonus × ROLL_ROW_DECAY ^ row_diff
 *
 * v2.1 保留特性:
 *   - 连击递增惩罚模型 (Repeated Keystroke Escalation)
 *     连续按同一键时，惩罚随次数递增:
 *     penalty = min(BASE × finger_difficulty × 1.55^(count-2), MAX_PENALTY)
 *
 * v2 核心机制:
 *   - 肌腱联动位移模型 (Tendon Coupling Displacement)
 *     手指按键时，相邻手指通过肌腱联动产生Y轴位移偏移
 *
 * 其他特性 (v1延续):
 *   1.  键位物理坐标与距离
 *   2.  标准指法手指分配
 *   3.  同手/异手、同指/异指分类判断
 *   4.  每只手的手指状态追踪（含有效位置）
 *   5.  Fitts定律 (Shannon公式) 计算移动时间
 *   6.  手指耦合惩罚 / 灵活度系数 / 行跳跃惩罚
 *   7.  并行准备模型（含效率折扣与释放延迟）
 *   8.  同指跨排惩罚（大跨排 ≥2排, 小跨排 =1排）
 *   9.  分级小指干扰惩罚
 *   10. 手部伸展惩罚（同手两指跨不同行时的姿态扭曲）
 *   11. 滚动修正（同手相邻手指的内滚/外滚奖励，支持跨行）
 *   12. 序列总时间 ≥ max(左手子序列时间, 右手子序列时间)
 *
 * 输出单位: 毫秒 (ms)
 */

// ════════════════════════════════════════════════════════════════
// 数据结构
// ════════════════════════════════════════════════════════════════

/** 手指名称映射 */
const FINGER_NAMES: Record<number, string> = {
  0: '小指', 1: '无名指', 2: '中指', 3: '食指', 4: '拇指',
}

/** 分类名称映射 */
const CATEGORY_NAMES: Record<string, string> = {
  same_key: '同键连击',
  same_finger: '同指异键',
  same_hand: '同手异指',
  diff_hand: '异手交替',
}

/**
 * 逐键对的详细分解信息（debug 输出）
 */
export interface KeyPairDetail {
  /** 键对标签，如 "f→s" */
  label: string
  /** 分类名称 */
  category: string
  /** 手指路径描述，如 "左食指→左无名指" */
  fingerPath: string
  /** 神经延迟 (ms) */
  neural: number
  /** 原始移动时间 (ms)，未折扣 */
  rawMove: number
  /** 移动折扣描述（滚动折扣/并行准备），无折扣时为 null */
  moveDiscountDesc: string | null
  /** 最终移动时间 (ms) */
  move: number
  /** 耦合惩罚 (ms) */
  coupling: number
  /** 跨行惩罚 (ms) */
  rowJump: number
  /** 同指跨排惩罚 (ms) */
  sfJump: number
  /** 小指干扰惩罚 (ms) */
  pinky: number
  /** 伸展惩罚 (ms) */
  stretch: number
  /** 滚动奖励 (ms)，负值 */
  roll: number
  /** 连击惩罚 (ms) */
  repeat: number
  /** 连击次数（≥2 时显示） */
  repeatCount: number
  /** 联动偏移描述 */
  couplingDesc: string
  /** 该步间隔时间 (ms) */
  interval: number
}

/**
 * 整个序列的 debug 分解结果
 */
export interface SequenceDebugResult {
  /** 输入序列 */
  sequence: string
  /** 总时间 (ms) */
  totalTime: number
  /** 首键定位成本 (ms) */
  firstKeyCost: number
  /** 逐步累加总计 (ms) */
  stepwiseTotal: number
  /** 左手子序列下界 (ms) */
  leftHandTime: number
  /** 右手子序列下界 (ms) */
  rightHandTime: number
  /** 逐键对详细信息 */
  pairs: KeyPairDetail[]
}

/**
 * 单个键的物理信息
 */
interface KeyInfo {
  /** 键面字符（小写字母/符号/空格） */
  char: string
  /** 行号 — 0=数字行, 1=QWER行, 2=ASDF行(home row), 3=ZXCV行, 4=空格行 */
  row: number
  /** 在行中的列索引（0起，从左到右） */
  col: number
  /** 物理X坐标 (mm)，含行偏移 (stagger) */
  x: number
  /** 物理Y坐标 (mm)，行号 × 键距 */
  y: number
  /** 所属手 — 'L'(左手) 或 'R'(右手) */
  hand: 'L' | 'R'
  /** 手指编号 — 0=小指, 1=无名指, 2=中指, 3=食指, 4=拇指 */
  finger: number
}

/**
 * 单根手指的动态状态追踪
 */
interface FingerState {
  /** 有效X坐标 (mm)，不受联动影响 */
  effX: number
  /** 有效Y坐标 (mm)，受肌腱联动影响 */
  effY: number
  /** 该手指上次按过的键 */
  lastKey: KeyInfo | null
  /** 该手指上次按键后的释放时刻 (ms) */
  releaseTime: number
  /** 当前连击计数（同一键连续按下的次数） */
  repeatCount: number
}

/**
 * 手指标识键类型，格式为 "手:手指编号"，如 "L:2" 表示左手中指
 */
type FingerKey = `${'L' | 'R'}:${number}`

// ════════════════════════════════════════════════════════════════
// 键盘物理布局模型
// ════════════════════════════════════════════════════════════════

/**
 * QWERTY 键盘物理布局模型
 *
 * 负责管理键位的物理坐标、手指分配和 home 位置。
 * 使用 19.05mm 标准键距和行偏移(stagger)来计算每个键的精确位置。
 */
class KeyboardModel {
  /** 标准键距 (mm)，键与键中心之间的水平/垂直距离 */
  static readonly KEY_PITCH = 19.05

  /**
   * 每行的水平偏移量 (stagger)
   * QWERTY 键盘的每一行相对于上一行有 0.25 键距的偏移
   * 行0(数字行)无偏移，行1偏移0.25，行2偏移0.50，行3偏移0.75
   */
  static readonly ROW_OFFSETS: Record<number, number> = {
    0: 0,
    1: 0.25 * 19.05,
    2: 0.5 * 19.05,
    3: 0.75 * 19.05,
  }

  /**
   * 每个键的手指分配
   * finger: 0=小指, 1=无名指, 2=中指, 3=食指, 4=拇指
   * 标准指法中，食指负责两列（如 r/t, f/g），其余手指各一列
   */
  static readonly KEY_ASSIGNMENTS: Record<string, { hand: 'L' | 'R'; finger: number }> = {
    '1': { hand: 'L', finger: 0 },
    '2': { hand: 'L', finger: 1 },
    '3': { hand: 'L', finger: 2 },
    '4': { hand: 'L', finger: 3 },
    '5': { hand: 'L', finger: 3 },
    '6': { hand: 'R', finger: 3 },
    '7': { hand: 'R', finger: 3 },
    '8': { hand: 'R', finger: 2 },
    '9': { hand: 'R', finger: 1 },
    '0': { hand: 'R', finger: 0 },
    '-': { hand: 'R', finger: 0 },
    '=': { hand: 'R', finger: 0 },
    q: { hand: 'L', finger: 0 },
    w: { hand: 'L', finger: 1 },
    e: { hand: 'L', finger: 2 },
    r: { hand: 'L', finger: 3 },
    t: { hand: 'L', finger: 3 },
    y: { hand: 'R', finger: 3 },
    u: { hand: 'R', finger: 3 },
    i: { hand: 'R', finger: 2 },
    o: { hand: 'R', finger: 1 },
    p: { hand: 'R', finger: 0 },
    '[': { hand: 'R', finger: 0 },
    ']': { hand: 'R', finger: 0 },
    a: { hand: 'L', finger: 0 },
    s: { hand: 'L', finger: 1 },
    d: { hand: 'L', finger: 2 },
    f: { hand: 'L', finger: 3 },
    g: { hand: 'L', finger: 3 },
    h: { hand: 'R', finger: 3 },
    j: { hand: 'R', finger: 3 },
    k: { hand: 'R', finger: 2 },
    l: { hand: 'R', finger: 1 },
    ';': { hand: 'R', finger: 0 },
    "'": { hand: 'R', finger: 0 },
    z: { hand: 'L', finger: 0 },
    x: { hand: 'L', finger: 1 },
    c: { hand: 'L', finger: 2 },
    v: { hand: 'L', finger: 3 },
    b: { hand: 'L', finger: 3 },
    n: { hand: 'R', finger: 3 },
    m: { hand: 'R', finger: 3 },
    ',': { hand: 'R', finger: 2 },
    '.': { hand: 'R', finger: 1 },
    '/': { hand: 'R', finger: 0 },
    ' ': { hand: 'R', finger: 4 },
  }

  /** 每行包含的键（从左到右） */
  static readonly ROW_KEYS: Record<number, string[]> = {
    0: [...'1234567890-='],
    1: [...'qwertyuiop[]'],
    2: [..."asdfghjkl;'"],
    3: [...'zxcvbnm,./'],
  }

  /**
   * 每根手指的 home 键位置
   * home row 是手指自然放置的位置（ASDF/JKL;行）
   * 拇指的 home 位置是空格键
   */
  static readonly HOME_KEYS: Record<FingerKey, string> = {
    'L:0': 'a',
    'L:1': 's',
    'L:2': 'd',
    'L:3': 'f',
    'R:0': ';',
    'R:1': 'l',
    'R:2': 'k',
    'R:3': 'j',
    'R:4': ' ',
  }

  /** 所有键的信息表 */
  readonly keys: Record<string, KeyInfo> = {}

  constructor() {
    // 为每行每列的键计算物理坐标
    for (const [rowStr, chars] of Object.entries(KeyboardModel.ROW_KEYS)) {
      const row = Number(rowStr)
      for (const [col, ch] of chars.entries()) {
        const assignment = KeyboardModel.KEY_ASSIGNMENTS[ch]
        if (!assignment) continue
        this.keys[ch] = {
          char: ch,
          row,
          col,
          x: col * KeyboardModel.KEY_PITCH + KeyboardModel.ROW_OFFSETS[row],
          y: row * KeyboardModel.KEY_PITCH,
          hand: assignment.hand,
          finger: assignment.finger,
        }
      }
    }

    // 空格键特殊处理：位于第4行中间位置
    const spaceX = 5.25 * KeyboardModel.KEY_PITCH
    const spaceY = 4 * KeyboardModel.KEY_PITCH
    this.keys[' '] = {
      char: ' ',
      row: 4,
      col: 5,
      x: spaceX,
      y: spaceY,
      hand: 'R',
      finger: 4,
    }
  }

  /** 获取键信息，'_' 会映射为空格，字母自动转小写 */
  get(ch: string): KeyInfo | undefined {
    return this.keys[ch === '_' ? ' ' : ch.toLowerCase()]
  }

  /** 计算两个键之间的欧几里得距离 (mm) */
  dist(a: KeyInfo, b: KeyInfo): number {
    const dx = b.x - a.x
    const dy = b.y - a.y
    return Math.hypot(dx, dy)
  }

  /** 获取指定手指的 home 键位置 */
  homeOf(hand: 'L' | 'R', finger: number): KeyInfo | undefined {
    const home = KeyboardModel.HOME_KEYS[`${hand}:${finger}` as FingerKey]
    return home ? this.keys[home] : undefined
  }
}

// ════════════════════════════════════════════════════════════════
// 键魂打字模型 — 核心计算引擎
// ════════════════════════════════════════════════════════════════

/**
 * 键魂当量模型 v2.3 — 击键序列时间计算
 *
 * 核心思路：将击键序列分解为逐步的键对（前键→当前键），
 * 对每一步计算"间隔时间"（interval），累加得到总时间。
 * 最终取 max(逐步总时间, 左手子序列时间, 右手子序列时间)。
 */
class TypingModel {
  /** 键帽宽度 (mm)，用于 Fitts 定律的目标宽度 W */
  static readonly KEY_WIDTH = 14.0

  /**
   * 神经延迟基准 (ms) — 根据击键对的分类给出不同的基础耗时
   * - same_key:    同键连击（最慢，需要完整的松开-按下周期）
   * - same_finger: 同指异键（次慢，需要移动同一手指）
   * - same_hand:   同手异指（中等，手指可并行准备）
   * - diff_hand:   异手交替（最快，两手独立运动）
   */
  static readonly NEURAL = {
    same_key: 120.0,
    same_finger: 150.0,
    same_hand: 90.0,
    diff_hand: 55.0,
  }

  /**
   * Fitts 定律系数 b (ms/bit)
   * Shannon 公式: MT = b × log2(D/W + 1)
   * 其中 D=距离(mm), W=目标宽度(KEY_WIDTH)
   */
  static readonly FITTS_B = 55.0

  /**
   * 手指灵活度系数（值越大越慢）
   * 0=小指(最慢), 1=无名指, 2=中指(最快/基准), 3=食指, 4=拇指
   */
  static readonly FINGER_SPEED: Record<number, number> = {
    0: 1.5,
    1: 1.3,
    2: 1.0,
    3: 1.05,
    4: 1.15,
  }

  /**
   * 同手异指耦合惩罚 (ms)
   * 同一只手的两根手指连续击键时，由于手指间的神经和物理耦合
   * 产生的额外延迟。相邻手指耦合更强。
   */
  static readonly COUPLING: Record<string, number> = {
    '0:1': 15, '1:0': 15,
    '1:2': 10, '2:1': 10,
    '2:3': 5, '3:2': 5,
    '0:2': 8, '2:0': 8,
    '0:3': 3, '3:0': 3,
    '1:3': 3, '3:1': 3,
  }

  /**
   * 行跳跃基础惩罚 (ms)
   * 同手击键时，如果前后两键在不同行，需要额外的手部姿态调整时间
   */
  static readonly ROW_JUMP_BASE: Record<number, number> = {
    0: 0,
    1: 8,
    2: 20,
    3: 35,
  }

  /** 同指大跨排惩罚 (ms) — 同一手指跨越 ≥2 行 */
  static readonly SAME_FINGER_BIG_JUMP = 80.0
  /** 同指小跨排惩罚 (ms) — 同一手指跨越 1 行 */
  static readonly SAME_FINGER_SMALL_JUMP = 40.0

  /** 小指干扰基础惩罚 (ms) */
  static readonly PINKY_BASE = 8.0
  /** 小指干扰每行追加惩罚 (ms)，小指偏离 home row 越远干扰越大 */
  static readonly PINKY_PER_ROW = 20.0

  /** 手部伸展每行惩罚 (ms) — 同手两指跨不同行时的姿态扭曲 */
  static readonly STRETCH_PER_ROW = 20.0

  /** 内滚奖励 (ms)，负值表示减少时间 — 手指从小指侧向食指侧滚动 */
  static readonly ROLL_INWARD = -25.0
  /** 外滚奖励 (ms)，负值表示减少时间 — 手指从食指侧向小指侧滚动 */
  static readonly ROLL_OUTWARD = -15.0
  /**
   * 跨行滚动衰减系数 (v2.2)
   * 滚动奖励随行差指数衰减: bonus × ROLL_ROW_DECAY ^ row_diff
   * 同行 decay=1.0, 跨1行 decay=0.50, 跨2行 decay=0.25
   */
  static readonly ROLL_ROW_DECAY = 0.50
  /**
   * 滚动移动折扣系数 (v2.3)
   * 滚动手势中后续手指的 Fitts 移动时间折扣
   * 同行滚动时移动时间仅为原来的 40%
   */
  static readonly ROLL_MOVE_DISCOUNT = 0.40

  /**
   * 首键定位成本比例 (v2.3)
   * 第一个键如果不在 home 位置，Fitts 移动成本 × 此系数
   * 设为 0.60 是因为打字前手指已大致在键盘上方，不需要完整的移动
   */
  static readonly FIRST_KEY_COST_RATIO = 0.60

  /** 按键释放延迟 (ms) — 手指按下键后到释放所需时间 */
  static readonly RELEASE_DELAY = 40.0
  /**
   * 并行准备效率 — 异手击键时，非活跃手可以提前移动手指
   * 0.75 表示可用准备时间的 75% 可被有效利用
   */
  static readonly PARALLEL_EFFICIENCY = 0.75
  /** 最小间隔 (ms) — 无论计算结果多小，两次击键间至少需要这么长时间 */
  static readonly MINIMUM_INTERVAL = 45.0

  /**
   * 肌腱联动 Y 轴位移系数 (v2)
   * 当一根手指移动时，相邻手指通过共享的深屈肌腱(FDP)产生被动位移
   * 系数表示目标手指 Y 轴移动量传递给其他手指的比例
   * 例如 (0,1): 0.35 表示小指移动时，无名指的有效 Y 位置偏移 35%
   */
  static readonly TENDON_COUPLING_Y: Record<string, number> = {
    '0:1': 0.35, '1:0': 0.30,
    '1:2': 0.25, '2:1': 0.20,
    '2:3': 0.10, '3:2': 0.10,
    '0:2': 0.10, '2:0': 0.08,
    '0:3': 0.05, '3:0': 0.05,
    '1:3': 0.08, '3:1': 0.08,
  }

  /**
   * 连击递增惩罚基础值 (ms) (v2.1)
   * 同一键连续按下 ≥2 次时，从第3次起每次增加惩罚
   */
  static readonly REPEAT_BASE_PENALTY = 50.0
  /**
   * 连击递增系数 (v2.1)
   * 惩罚按指数增长: base × difficulty × factor^(count-2)
   */
  static readonly REPEAT_ESCALATION_FACTOR = 1.55
  /**
   * 每根手指的连击困难度系数 (v2.1)
   * 小指连击最困难(1.60)，中指最容易(1.00)
   */
  static readonly FINGER_REPEAT_DIFFICULTY: Record<number, number> = {
    0: 1.60, 1: 1.35, 2: 1.00, 3: 1.10, 4: 1.20,
  }
  /** 连击惩罚上限 (ms) (v2.1) */
  static readonly REPEAT_MAX_PENALTY = 250.0

  readonly kb = new KeyboardModel()

  // ────────────────────────────────────────
  // 基础计算函数
  // ────────────────────────────────────────

  /**
   * Fitts 定律计算移动时间 (Shannon 公式)
   * @param distMm - 移动距离 (mm)
   * @param finger - 手指编号，用于查询灵活度系数
   * @returns 移动时间 (ms)，距离 < 0.5mm 时返回 0
   */
  private fitts(distMm: number, finger: number): number {
    if (distMm < 0.5) return 0
    const idBits = Math.log2(distMm / TypingModel.KEY_WIDTH + 1)
    return TypingModel.FITTS_B * idBits * (TypingModel.FINGER_SPEED[finger] ?? 1)
  }

  /**
   * 分类两个连续击键的关系
   * @returns 'same_key' | 'same_finger' | 'same_hand' | 'diff_hand'
   */
  private classify(a: KeyInfo, b: KeyInfo): keyof typeof TypingModel.NEURAL {
    if (a.char === b.char) return 'same_key'
    if (a.hand !== b.hand) return 'diff_hand'
    if (a.finger === b.finger) return 'same_finger'
    return 'same_hand'
  }

  /**
   * 检测两个连续击键是否构成滚动手势 (v2.2+)
   *
   * 滚动条件:
   * 1. 同一只手
   * 2. 不同手指
   * 3. 相邻手指（手指编号差为1）
   *
   * @returns [是否滚动, 是否内滚, 行差, 衰减系数]
   */
  private detectRoll(a: KeyInfo, b: KeyInfo): [boolean, boolean, number, number] {
    if (a.hand !== b.hand) return [false, false, 0, 0]
    if (a.finger === b.finger) return [false, false, 0, 0]
    if (Math.abs(a.finger - b.finger) !== 1) return [false, false, 0, 0]
    const isInward = b.finger > a.finger
    const rowDiff = Math.abs(a.row - b.row)
    const decay = TypingModel.ROLL_ROW_DECAY ** rowDiff
    return [true, isInward, rowDiff, decay]
  }

  /**
   * 计算滚动奖励 (v2.2)
   * 支持跨行滚动，奖励随行差指数衰减
   * @returns 负值表示时间减少（奖励），0 表示无滚动
   */
  private roll(a: KeyInfo, b: KeyInfo): number {
    const [isRoll, isInward, , decay] = this.detectRoll(a, b)
    if (!isRoll) return 0
    const baseBonus = isInward ? TypingModel.ROLL_INWARD : TypingModel.ROLL_OUTWARD
    return baseBonus * decay
  }

  /**
   * 计算滚动移动折扣系数 (v2.3)
   *
   * 滚动手势中，后续手指已在"跟随"运动中，不需要独立启动移动。
   * 原因:
   *   - 运动预规划: 大脑将滚动编码为一个手势
   *   - 肌腱联动辅助: 相邻手指 FDP 肌腱联动
   *   - 动量传递: 前一手指的运动传递给相邻手指
   *   - 锚定效应: 前一手指按住键提供参考框架
   *
   * @returns 1.0 表示无折扣，< 1.0 表示有折扣
   */
  private rollMoveDiscount(a: KeyInfo, b: KeyInfo): number {
    const [isRoll, , , decay] = this.detectRoll(a, b)
    if (!isRoll) return 1.0
    return TypingModel.ROLL_MOVE_DISCOUNT + (1.0 - TypingModel.ROLL_MOVE_DISCOUNT) * (1.0 - decay)
  }

  /**
   * 同指跨排惩罚
   * @returns 跨 ≥2 排返回大跨排惩罚，跨 1 排返回小跨排惩罚
   */
  private sameFingerRowPenalty(a: KeyInfo, b: KeyInfo): number {
    const rowDiff = Math.abs(a.row - b.row)
    if (rowDiff >= 2) return TypingModel.SAME_FINGER_BIG_JUMP
    if (rowDiff === 1) return TypingModel.SAME_FINGER_SMALL_JUMP
    return 0
  }

  /**
   * 小指干扰惩罚
   * 当同手击键涉及小指时，由于小指的独立性较差，
   * 会对其他手指产生神经干扰。偏离 home row 越远干扰越大。
   */
  private pinkyInterference(a: KeyInfo, b: KeyInfo): number {
    const pinkyKey = a.finger === 0 ? a : b.finger === 0 ? b : null
    if (!pinkyKey) return 0
    return TypingModel.PINKY_BASE + TypingModel.PINKY_PER_ROW * Math.abs(pinkyKey.row - 2)
  }

  /**
   * 手部伸展惩罚
   * 同手两指跨不同行时，手掌需要扭曲来适应，造成额外负担
   */
  private stretchPenalty(a: KeyInfo, b: KeyInfo): number {
    return TypingModel.STRETCH_PER_ROW * Math.abs(a.row - b.row)
  }

  /**
   * 连击递增惩罚 (v2.1)
   * 同一键连续按下 ≥3 次时触发，惩罚随次数指数增长
   *
   * @param finger - 手指编号
   * @param repeatCount - 当前连击计数（第几次按同一键）
   * @returns 额外惩罚时间 (ms)，连击 < 2 次时返回 0
   */
  private repeatEscalationPenalty(finger: number, repeatCount: number): number {
    if (repeatCount < 2) return 0
    const difficulty = TypingModel.FINGER_REPEAT_DIFFICULTY[finger] ?? 1.0
    const exponent = repeatCount - 2
    const escalation = TypingModel.REPEAT_ESCALATION_FACTOR ** exponent
    const penalty = TypingModel.REPEAT_BASE_PENALTY * difficulty * escalation
    return Math.min(penalty, TypingModel.REPEAT_MAX_PENALTY)
  }

  // ────────────────────────────────────────
  // 手指状态管理
  // ────────────────────────────────────────

  /**
   * 初始化所有手指状态（双手）
   * 每根手指从其 home 键位置开始，释放时间和连击计数均为 0
   */
  private initAllFingerStates(): Map<FingerKey, FingerState> {
    const states = new Map<FingerKey, FingerState>()
    for (const key of Object.keys(KeyboardModel.HOME_KEYS) as FingerKey[]) {
      const home = this.kb.keys[KeyboardModel.HOME_KEYS[key]]
      if (!home) continue
      states.set(key, { effX: home.x, effY: home.y, lastKey: home, releaseTime: 0, repeatCount: 0 })
    }
    return states
  }

  /**
   * 初始化单手的手指状态
   * 用于计算单手子序列时间
   */
  private initHandFingerStates(hand: 'L' | 'R'): Map<number, FingerState> {
    const states = new Map<number, FingerState>()
    for (const key of Object.keys(KeyboardModel.HOME_KEYS) as FingerKey[]) {
      const [h, fingerStr] = key.split(':') as ['L' | 'R', string]
      if (h !== hand) continue
      const home = this.kb.keys[KeyboardModel.HOME_KEYS[key]]
      states.set(Number(fingerStr), { effX: home.x, effY: home.y, lastKey: home, releaseTime: 0, repeatCount: 0 })
    }
    return states
  }

  // ────────────────────────────────────────
  // 距离计算
  // ────────────────────────────────────────

  /**
   * 计算手指从有效位置到目标键的距离
   * "有效位置"考虑了肌腱联动导致的 Y 轴偏移
   */
  private effectiveDist(state: FingerState, target: KeyInfo): number {
    return Math.hypot(target.x - state.effX, target.y - state.effY)
  }

  /**
   * 计算手指从上一个按键到目标键的名义距离
   * 如果没有上一个按键记录，使用有效距离
   */
  private nominalDist(state: FingerState, target: KeyInfo): number {
    return state.lastKey ? this.kb.dist(state.lastKey, target) : this.effectiveDist(state, target)
  }

  // ────────────────────────────────────────
  // 肌腱联动
  // ────────────────────────────────────────

  /**
   * 应用肌腱联动位移（双手模式）
   *
   * 当一根手指按下目标键时，同手的其他手指通过共享肌腱
   * 产生 Y 轴方向的被动位移。这影响了后续击键的移动距离计算。
   *
   * @param actingFinger - 正在按键的手指
   * @param target - 目标键
   * @param hand - 所属手
   * @param states - 全局手指状态表
   */
  private applyTendonCoupling(
    actingFinger: number,
    target: KeyInfo,
    hand: 'L' | 'R',
    states: Map<FingerKey, FingerState>,
  ): void {
    for (let otherFinger = 0; otherFinger <= 4; otherFinger++) {
      if (otherFinger === actingFinger) continue
      const key = `${hand}:${otherFinger}` as FingerKey
      const state = states.get(key)
      const coupling = TypingModel.TENDON_COUPLING_Y[`${actingFinger}:${otherFinger}`]
      if (!state || !coupling) continue
      // 将目标键的 Y 位置按联动系数传递给其他手指
      state.effY += (target.y - state.effY) * coupling
    }
  }

  /**
   * 应用肌腱联动位移（单手模式）
   * 功能同上，但使用单手的手指状态表
   */
  private applyTendonCouplingHand(actingFinger: number, target: KeyInfo, states: Map<number, FingerState>): void {
    for (let otherFinger = 0; otherFinger <= 4; otherFinger++) {
      if (otherFinger === actingFinger) continue
      const state = states.get(otherFinger)
      const coupling = TypingModel.TENDON_COUPLING_Y[`${actingFinger}:${otherFinger}`]
      if (!state || !coupling) continue
      state.effY += (target.y - state.effY) * coupling
    }
  }

  // ────────────────────────────────────────
  // 首键定位成本 (v2.3)
  // ────────────────────────────────────────

  /**
   * 计算第一个键的定位成本 (v2.3)
   *
   * 如果序列的第一个键不在手指的 home 位置，
   * 需要先移动手指到目标位置。成本为 Fitts 移动时间 × 0.60。
   * 系数设为 0.60 是因为打字前手指已大致在键盘上方。
   *
   * @param key - 序列的第一个键
   * @returns 定位成本 (ms)
   */
  private firstKeyCost(key: KeyInfo): number {
    const home = this.kb.homeOf(key.hand, key.finger)
    if (!home) return 0
    const d = this.kb.dist(home, key)
    if (d < 0.5) return 0
    return this.fitts(d, key.finger) * TypingModel.FIRST_KEY_COST_RATIO
  }

  // ────────────────────────────────────────
  // 核心间隔计算
  // ────────────────────────────────────────

  /**
   * 计算两个连续击键之间的间隔时间
   *
   * 间隔时间 = max(MINIMUM_INTERVAL,
   *   神经延迟 + 移动时间 + 耦合惩罚 + 行跳跃 + 同指跨排
   *   + 小指干扰 + 伸展惩罚 + 滚动奖励 + 连击惩罚)
   *
   * @param prev - 前一个键
   * @param curr - 当前键
   * @param cat - 击键对分类
   * @param fingerStates - 手指状态表
   * @param curTime - 当前累计时间（用于并行准备计算）
   * @returns 间隔时间 (ms)
   */
  private computeInterval(
    prev: KeyInfo,
    curr: KeyInfo,
    cat: keyof typeof TypingModel.NEURAL,
    fingerStates: Map<FingerKey, FingerState>,
    curTime: number,
  ): number {
    const fk = `${curr.hand}:${curr.finger}` as FingerKey
    const tNeural = TypingModel.NEURAL[cat]

    // v2.3: 同手异指时计算滚动移动折扣
    const moveDiscount = cat === 'same_hand' ? this.rollMoveDiscount(prev, curr) : 1.0
    let tMove = 0

    if (cat === 'same_key') {
      // 同键连击：手指不移动
    } else if (cat === 'diff_hand') {
      // 异手交替：可利用并行准备时间
      const state = fingerStates.get(fk)
      let rawMove = 0
      if (state) {
        rawMove = this.fitts(this.effectiveDist(state, curr), curr.finger)
      } else {
        const home = this.kb.homeOf(curr.hand, curr.finger)
        rawMove = home ? this.fitts(this.kb.dist(home, curr), curr.finger) : 0
      }

      if (rawMove > 0) {
        // 利用对侧手击键期间的可用时间进行并行准备
        const earliest = state && state.releaseTime > 0 ? state.releaseTime : Math.max(0, curTime - 200)
        const available = Math.max(0, curTime - earliest)
        const effectivePrep = available * TypingModel.PARALLEL_EFFICIENCY
        tMove = Math.max(0, rawMove - effectivePrep)
      }
    } else if (cat === 'same_finger') {
      // 同指异键：必须等前一次击键完成才能移动
      const state = fingerStates.get(fk)
      if (state) {
        tMove = this.fitts(this.effectiveDist(state, curr), curr.finger)
      } else {
        const home = this.kb.homeOf(curr.hand, curr.finger)
        tMove = home ? this.fitts(this.kb.dist(home, curr), curr.finger) : 0
      }
    } else {
      // 同手异指：移动时间可能享受滚动折扣
      const state = fingerStates.get(fk)
      if (state) {
        tMove = this.fitts(this.effectiveDist(state, curr), curr.finger) * moveDiscount
      } else {
        const home = this.kb.homeOf(curr.hand, curr.finger)
        tMove = home ? this.fitts(this.kb.dist(home, curr), curr.finger) * moveDiscount : 0
      }
    }

    // 同手异指耦合惩罚
    const tCouple = cat === 'same_hand' ? (TypingModel.COUPLING[`${prev.finger}:${curr.finger}`] ?? 0) : 0
    // 行跳跃惩罚（同手或同指时生效）
    const rowDiff = Math.abs(prev.row - curr.row)
    const tRow = cat === 'same_hand' || cat === 'same_finger' ? (TypingModel.ROW_JUMP_BASE[rowDiff] ?? 40) : 0
    // 同指跨排额外惩罚
    const tSfJump = cat === 'same_finger' ? this.sameFingerRowPenalty(prev, curr) : 0
    // 小指干扰惩罚
    const tPinky = cat === 'same_hand' ? this.pinkyInterference(prev, curr) : 0
    // 手部伸展惩罚
    const tStretch = cat === 'same_hand' ? this.stretchPenalty(prev, curr) : 0
    // 滚动奖励（负值）
    const tRoll = cat === 'same_hand' ? this.roll(prev, curr) : 0

    // v2.1: 连击递增惩罚
    let tRepeat = 0
    if (cat === 'same_key') {
      const state = fingerStates.get(fk)
      const newRepeat = state ? state.repeatCount + 1 : 2
      tRepeat = this.repeatEscalationPenalty(curr.finger, newRepeat)
    }

    return Math.max(
      TypingModel.MINIMUM_INTERVAL,
      tNeural + tMove + tCouple + tRow + tSfJump + tPinky + tStretch + tRoll + tRepeat,
    )
  }

  // ────────────────────────────────────────
  // 单手子序列时间
  // ────────────────────────────────────────

  /**
   * 计算单手子序列的总时间
   *
   * 提取序列中属于同一只手的所有击键，忽略异手击键间隔，
   * 独立计算该手的时间。用于与逐步总时间取 max。
   *
   * @param handKeys - 该手的击键序列
   * @returns 单手总时间 (ms)
   */
  private computeSingleHandTime(handKeys: KeyInfo[]): number {
    // v2.3: 即使只有1个键，也可能有首键定位成本
    if (handKeys.length === 0) return 0
    if (handKeys.length === 1) return this.firstKeyCost(handKeys[0])
    if (handKeys.length < 2) return 0

    const hand = handKeys[0].hand
    const fingerStates = this.initHandFingerStates(hand)

    // v2.3: 首键定位成本
    let total = this.firstKeyCost(handKeys[0])

    const first = handKeys[0]
    const f0State = fingerStates.get(first.finger)
    if (f0State) {
      f0State.effX = first.x
      f0State.effY = first.y
      f0State.lastKey = first
      f0State.repeatCount = 1
    }
    this.applyTendonCouplingHand(first.finger, first, fingerStates)

    for (let i = 1; i < handKeys.length; i++) {
      const prev = handKeys[i - 1]
      const curr = handKeys[i]

      // 单手内只有三种分类
      const cat: 'same_key' | 'same_finger' | 'same_hand' =
        prev.char === curr.char ? 'same_key' : prev.finger === curr.finger ? 'same_finger' : 'same_hand'

      // 计算各项惩罚/奖励
      const tNeural = TypingModel.NEURAL[cat]
      const moveDiscount = cat === 'same_hand' ? this.rollMoveDiscount(prev, curr) : 1.0

      let tMove = 0
      if (cat === 'same_key') {
        // 同键连击不移动
      } else if (cat === 'same_finger') {
        const state = fingerStates.get(curr.finger)
        if (state) {
          tMove = this.fitts(this.effectiveDist(state, curr), curr.finger)
        } else {
          const home = this.kb.homeOf(hand, curr.finger)
          if (home) tMove = this.fitts(this.kb.dist(home, curr), curr.finger)
        }
      } else {
        // same_hand: 同手异指，享受滚动折扣
        const state = fingerStates.get(curr.finger)
        if (state) {
          tMove = this.fitts(this.effectiveDist(state, curr), curr.finger) * moveDiscount
        } else {
          const home = this.kb.homeOf(hand, curr.finger)
          if (home) tMove = this.fitts(this.kb.dist(home, curr), curr.finger) * moveDiscount
        }
      }

      const tCouple = cat === 'same_hand' ? (TypingModel.COUPLING[`${prev.finger}:${curr.finger}`] ?? 0) : 0
      const tRow = cat === 'same_hand' || cat === 'same_finger'
        ? (TypingModel.ROW_JUMP_BASE[Math.abs(prev.row - curr.row)] ?? 40) : 0
      const tSfJump = cat === 'same_finger' ? this.sameFingerRowPenalty(prev, curr) : 0
      const tPinky = cat === 'same_hand' ? this.pinkyInterference(prev, curr) : 0
      const tStretch = cat === 'same_hand' ? this.stretchPenalty(prev, curr) : 0
      const tRoll = cat === 'same_hand' ? this.roll(prev, curr) : 0

      // v2.1: 连击递增惩罚
      let tRepeat = 0
      if (cat === 'same_key') {
        const state = fingerStates.get(curr.finger)
        const newRepeat = state ? state.repeatCount + 1 : 2
        tRepeat = this.repeatEscalationPenalty(curr.finger, newRepeat)
      }

      const interval = Math.max(
        TypingModel.MINIMUM_INTERVAL,
        tNeural + tMove + tCouple + tRow + tSfJump + tPinky + tStretch + tRoll + tRepeat,
      )
      total += interval

      // 更新手指状态
      const cf = curr.finger
      if (cat === 'same_key') {
        const state = fingerStates.get(cf)
        if (state) {
          state.repeatCount += 1
          state.effX = curr.x
          state.effY = curr.y
          state.lastKey = curr
        } else {
          fingerStates.set(cf, { effX: curr.x, effY: curr.y, lastKey: curr, releaseTime: 0, repeatCount: 2 })
        }
      } else {
        const state = fingerStates.get(cf)
        if (state) {
          state.effX = curr.x
          state.effY = curr.y
          state.lastKey = curr
          state.repeatCount = 1
        } else {
          fingerStates.set(cf, { effX: curr.x, effY: curr.y, lastKey: curr, releaseTime: 0, repeatCount: 1 })
        }
      }

      this.applyTendonCouplingHand(cf, curr, fingerStates)
    }
    return total
  }

  // ────────────────────────────────────────
  // 公开接口
  // ────────────────────────────────────────

  /**
   * 计算击键序列的总时间（当量）
   *
   * 算法:
   * 1. 将输入字符串转换为 KeyInfo 序列
   * 2. 逐步计算每对相邻键的间隔时间，累加为 stepwiseTotal
   * 3. 分别提取左手/右手子序列，独立计算 leftTime/rightTime
   * 4. 返回 max(stepwiseTotal, leftTime, rightTime)
   *
   * 取 max 是因为双手必须各自完成自己的击键序列，
   * 总时间不可能短于任一只手的独立完成时间。
   *
   * @param keys - 击键序列字符串（如 "fjdk"）
   * @returns 总时间 (ms)，< 2 键返回 0，包含未知键返回 -1
   */
  sequenceTime(keys: string): number {
    if (keys.length < 2) return 0
    const infos: KeyInfo[] = []
    for (const ch of keys) {
      const key = this.kb.get(ch)
      if (!key) return -1
      infos.push(key)
    }

    // v2.3: 首键定位成本
    const firstKeyCost = this.firstKeyCost(infos[0])

    const fingerStates = this.initAllFingerStates()
    const first = infos[0]
    const firstKey = `${first.hand}:${first.finger}` as FingerKey

    // 初始化首键手指状态
    const firstState = fingerStates.get(firstKey)
    if (firstState) {
      firstState.effX = first.x
      firstState.effY = first.y
      firstState.lastKey = first
      firstState.releaseTime = firstKeyCost + TypingModel.RELEASE_DELAY
      firstState.repeatCount = 1
    } else {
      fingerStates.set(firstKey, {
        effX: first.x, effY: first.y, lastKey: first,
        releaseTime: firstKeyCost + TypingModel.RELEASE_DELAY, repeatCount: 1,
      })
    }
    this.applyTendonCoupling(first.finger, first, first.hand, fingerStates)

    // v2.3: 初始时间包含首键定位成本
    let curTime = firstKeyCost
    let stepwiseTotal = firstKeyCost

    // 逐步计算每对相邻键的间隔
    for (let i = 1; i < infos.length; i++) {
      const prev = infos[i - 1]
      const curr = infos[i]
      const cat = this.classify(prev, curr)
      const fk = `${curr.hand}:${curr.finger}` as FingerKey

      const interval = this.computeInterval(prev, curr, cat, fingerStates, curTime)
      curTime += interval
      stepwiseTotal += interval

      // 更新手指状态
      if (cat === 'same_key') {
        const state = fingerStates.get(fk)
        if (state) {
          state.repeatCount += 1
          state.releaseTime = curTime + TypingModel.RELEASE_DELAY
        } else {
          fingerStates.set(fk, {
            effX: curr.x, effY: curr.y, lastKey: curr,
            releaseTime: curTime + TypingModel.RELEASE_DELAY, repeatCount: 2,
          })
        }
      } else {
        const state = fingerStates.get(fk)
        if (state) {
          state.effX = curr.x
          state.effY = curr.y
          state.lastKey = curr
          state.releaseTime = curTime + TypingModel.RELEASE_DELAY
          state.repeatCount = 1
        } else {
          fingerStates.set(fk, {
            effX: curr.x, effY: curr.y, lastKey: curr,
            releaseTime: curTime + TypingModel.RELEASE_DELAY, repeatCount: 1,
          })
        }
      }
      this.applyTendonCoupling(curr.finger, curr, curr.hand, fingerStates)
    }

    // 取逐步总时间和左右手独立时间的最大值
    const leftTime = this.computeSingleHandTime(infos.filter((item) => item.hand === 'L'))
    const rightTime = this.computeSingleHandTime(infos.filter((item) => item.hand === 'R'))
    return Math.round(Math.max(stepwiseTotal, leftTime, rightTime) * 100) / 100
  }

  /**
   * 返回击键序列的逐键对详细分解信息（debug 模式）
   *
   * 与 sequenceTime 相同的计算流程，但记录每一步的各项分量。
   * 对应 Python 版 key_soul_equiv_v2.3.py --debug 的输出。
   *
   * @param keys - 击键序列字符串（如 "fssi"）
   * @returns 详细分解结果，< 2 键或包含未知键时返回 null
   */
  debugSequence(keys: string): SequenceDebugResult | null {
    if (keys.length < 2) return null
    const infos: KeyInfo[] = []
    for (const ch of keys) {
      const key = this.kb.get(ch)
      if (!key) return null
      infos.push(key)
    }

    const handLabel = (h: 'L' | 'R') => h === 'L' ? '左' : '右'
    const fingerLabel = (h: 'L' | 'R', f: number) => `${handLabel(h)}${FINGER_NAMES[f] ?? f}`

    // v2.3: 首键定位成本
    const firstKeyCostVal = this.firstKeyCost(infos[0])

    const fingerStates = this.initAllFingerStates()
    const first = infos[0]
    const firstKey = `${first.hand}:${first.finger}` as FingerKey

    const firstState = fingerStates.get(firstKey)
    if (firstState) {
      firstState.effX = first.x
      firstState.effY = first.y
      firstState.lastKey = first
      firstState.releaseTime = firstKeyCostVal + TypingModel.RELEASE_DELAY
      firstState.repeatCount = 1
    } else {
      fingerStates.set(firstKey, {
        effX: first.x, effY: first.y, lastKey: first,
        releaseTime: firstKeyCostVal + TypingModel.RELEASE_DELAY, repeatCount: 1,
      })
    }
    this.applyTendonCoupling(first.finger, first, first.hand, fingerStates)

    let curTime = firstKeyCostVal
    let stepwiseTotal = firstKeyCostVal
    const pairs: KeyPairDetail[] = []

    for (let i = 1; i < infos.length; i++) {
      const prev = infos[i - 1]
      const curr = infos[i]
      const cat = this.classify(prev, curr)
      const fk = `${curr.hand}:${curr.finger}` as FingerKey

      const tNeural = TypingModel.NEURAL[cat]

      // 各项分量
      const moveDiscount = cat === 'same_hand' ? this.rollMoveDiscount(prev, curr) : 1.0
      let tMove = 0
      let rawMove = 0
      let moveDiscountDesc: string | null = null

      if (cat === 'same_key') {
        // 同键连击不移动
      } else if (cat === 'diff_hand') {
        const state = fingerStates.get(fk)
        if (state) {
          rawMove = this.fitts(this.effectiveDist(state, curr), curr.finger)
        } else {
          const home = this.kb.homeOf(curr.hand, curr.finger)
          rawMove = home ? this.fitts(this.kb.dist(home, curr), curr.finger) : 0
        }
        if (rawMove > 0) {
          const earliest = state && state.releaseTime > 0 ? state.releaseTime : Math.max(0, curTime - 200)
          const available = Math.max(0, curTime - earliest)
          const effectivePrep = available * TypingModel.PARALLEL_EFFICIENCY
          tMove = Math.max(0, rawMove - effectivePrep)
          moveDiscountDesc = `并行准备=${effectivePrep.toFixed(1)}ms 可用=${available.toFixed(1)}ms`
        }
      } else if (cat === 'same_finger') {
        const state = fingerStates.get(fk)
        if (state) {
          rawMove = this.fitts(this.effectiveDist(state, curr), curr.finger)
        } else {
          const home = this.kb.homeOf(curr.hand, curr.finger)
          rawMove = home ? this.fitts(this.kb.dist(home, curr), curr.finger) : 0
        }
        tMove = rawMove
      } else {
        // same_hand
        const state = fingerStates.get(fk)
        if (state) {
          rawMove = this.fitts(this.effectiveDist(state, curr), curr.finger)
        } else {
          const home = this.kb.homeOf(curr.hand, curr.finger)
          rawMove = home ? this.fitts(this.kb.dist(home, curr), curr.finger) : 0
        }
        tMove = rawMove * moveDiscount
        if (moveDiscount < 1.0) {
          moveDiscountDesc = `滚动折扣×${moveDiscount.toFixed(2)}`
        }
      }

      const tCouple = cat === 'same_hand' ? (TypingModel.COUPLING[`${prev.finger}:${curr.finger}`] ?? 0) : 0
      const rowDiff = Math.abs(prev.row - curr.row)
      const tRow = cat === 'same_hand' || cat === 'same_finger' ? (TypingModel.ROW_JUMP_BASE[rowDiff] ?? 40) : 0
      const tSfJump = cat === 'same_finger' ? this.sameFingerRowPenalty(prev, curr) : 0
      const tPinky = cat === 'same_hand' ? this.pinkyInterference(prev, curr) : 0
      const tStretch = cat === 'same_hand' ? this.stretchPenalty(prev, curr) : 0
      const tRoll = cat === 'same_hand' ? this.roll(prev, curr) : 0

      let tRepeat = 0
      let repeatCount = 0
      if (cat === 'same_key') {
        const state = fingerStates.get(fk)
        repeatCount = state ? state.repeatCount + 1 : 2
        tRepeat = this.repeatEscalationPenalty(curr.finger, repeatCount)
      }

      const interval = Math.max(
        TypingModel.MINIMUM_INTERVAL,
        tNeural + tMove + tCouple + tRow + tSfJump + tPinky + tStretch + tRoll + tRepeat,
      )

      // 联动偏移描述
      const state = fingerStates.get(fk)
      const effDist = state ? this.effectiveDist(state, curr) : 0
      const nomDist = state ? this.nominalDist(state, curr) : 0
      const couplingOffset = effDist - nomDist
      let couplingDesc: string
      if (cat === 'same_key') {
        couplingDesc = `同键连击: ${fingerLabel(curr.hand, curr.finger)}保持在[${curr.char}]上`
      } else if (cat === 'diff_hand') {
        const homeKey = this.kb.homeOf(curr.hand, curr.finger)
        const fromChar = state?.lastKey?.char ?? homeKey?.char ?? '?'
        couplingDesc = `异手移动: ${fingerLabel(curr.hand, curr.finger)} [${fromChar}]→[${curr.char}]`
          + ` 有效距离=${effDist.toFixed(1)}mm`
          + ` 联动偏移=${couplingOffset >= 0 ? '+' : ''}${couplingOffset.toFixed(1)}mm`
      } else {
        const homeKey = this.kb.homeOf(curr.hand, curr.finger)
        const fromChar = state?.lastKey?.char ?? homeKey?.char ?? '?'
        couplingDesc = `同手移动: ${fingerLabel(curr.hand, curr.finger)} [${fromChar}]→[${curr.char}]`
          + ` 有效距离=${effDist.toFixed(1)}mm`
          + ` 名义距离=${nomDist.toFixed(1)}mm`
          + ` 联动偏移=${couplingOffset >= 0 ? '+' : ''}${couplingOffset.toFixed(1)}mm`
      }

      pairs.push({
        label: `${prev.char}→${curr.char}`,
        category: CATEGORY_NAMES[cat] ?? cat,
        fingerPath: `${fingerLabel(prev.hand, prev.finger)}→${fingerLabel(curr.hand, curr.finger)}`,
        neural: tNeural,
        rawMove: Math.round(rawMove * 100) / 100,
        moveDiscountDesc,
        move: Math.round(tMove * 100) / 100,
        coupling: tCouple,
        rowJump: tRow,
        sfJump: tSfJump,
        pinky: tPinky,
        stretch: tStretch,
        roll: Math.round(tRoll * 100) / 100,
        repeat: Math.round(tRepeat * 100) / 100,
        repeatCount,
        couplingDesc,
        interval: Math.round(interval * 100) / 100,
      })

      curTime += interval
      stepwiseTotal += interval

      // 更新手指状态（与 sequenceTime 相同）
      if (cat === 'same_key') {
        const st = fingerStates.get(fk)
        if (st) {
          st.repeatCount += 1
          st.releaseTime = curTime + TypingModel.RELEASE_DELAY
        } else {
          fingerStates.set(fk, {
            effX: curr.x, effY: curr.y, lastKey: curr,
            releaseTime: curTime + TypingModel.RELEASE_DELAY, repeatCount: 2,
          })
        }
      } else {
        const st = fingerStates.get(fk)
        if (st) {
          st.effX = curr.x
          st.effY = curr.y
          st.lastKey = curr
          st.releaseTime = curTime + TypingModel.RELEASE_DELAY
          st.repeatCount = 1
        } else {
          fingerStates.set(fk, {
            effX: curr.x, effY: curr.y, lastKey: curr,
            releaseTime: curTime + TypingModel.RELEASE_DELAY, repeatCount: 1,
          })
        }
      }
      this.applyTendonCoupling(curr.finger, curr, curr.hand, fingerStates)
    }

    const leftTime = this.computeSingleHandTime(infos.filter((item) => item.hand === 'L'))
    const rightTime = this.computeSingleHandTime(infos.filter((item) => item.hand === 'R'))
    const totalTime = Math.round(Math.max(stepwiseTotal, leftTime, rightTime) * 100) / 100

    return {
      sequence: keys,
      totalTime,
      firstKeyCost: Math.round(firstKeyCostVal * 100) / 100,
      stepwiseTotal: Math.round(stepwiseTotal * 100) / 100,
      leftHandTime: Math.round(leftTime * 100) / 100,
      rightHandTime: Math.round(rightTime * 100) / 100,
      pairs,
    }
  }
}

// 全局单例模型
const model = new TypingModel()

/**
 * 计算编码序列的键魂当量
 * @param code - 编码字符串（如 "fjdk"）
 * @returns 当量值 (ms)，< 2 键返回 0，包含未知键返回 -1
 */
export function calcKeySoulEquivalence(code: string): number {
  return model.sequenceTime(code)
}

/**
 * 获取编码序列的键魂当量逐键对详细分解
 * @param code - 编码字符串（如 "fssi"）
 * @returns 详细分解结果，< 2 键或包含未知键时返回 null
 */
export function debugKeySoulEquivalence(code: string): SequenceDebugResult | null {
  return model.debugSequence(code)
}

/**
 * 计算选重键的键魂当量（相对于前一个键）
 * @param prevKey - 编码的最后一个键
 * @param selectKey - 选重键
 * @returns 当量值 (ms)，空格选重返回 0
 */
export function calcKeySoulSelectKeyEquivalence(prevKey: string, selectKey: string): number {
  return selectKey === ' ' ? 0 : calcKeySoulEquivalence(`${prevKey}${selectKey}`)
}
