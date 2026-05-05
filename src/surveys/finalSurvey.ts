import type { QuestionDef } from './types'

const PANAS_ITEMS = [
  '感兴趣的', '苦恼的', '兴奋的', '烦乱的', '强壮的', '有罪恶感的', '害怕的', '热情的',
  '自豪的', '易怒的', '警觉的', '惭愧的', '受鼓舞的', '紧张的', '坚定的', '专注的',
  '坐立不安的', '积极的', '恐惧的', '敌意的',
]

const TAM_LO = '完全不同意'
const TAM_HI = '完全同意'

export const FINAL_SURVEY: QuestionDef[] = [
  { id: 'panas_post', type: 'panas_batch', items: PANAS_ITEMS },
  { id: 'pu1',  type: 'likert', points: 7, lo: TAM_LO, hi: TAM_HI, label: '我认为微笑输入能提高我的输入效率。' },
  { id: 'pu2',  type: 'likert', points: 7, lo: TAM_LO, hi: TAM_HI, label: '在双手不便的情况下，我认为这种方式非常有用。' },
  { id: 'pu3',  type: 'likert', points: 7, lo: TAM_LO, hi: TAM_HI, label: '我认为这种系统能让我更轻松地控制设备。' },
  { id: 'eou1', type: 'likert', points: 7, lo: TAM_LO, hi: TAM_HI, label: '我预期学习如何使用微笑输入会非常容易。' },
  { id: 'eou2', type: 'likert', points: 7, lo: TAM_LO, hi: TAM_HI, label: '我认为通过微笑来操作不会花费我太多精力。' },
  { id: 'eou3', type: 'likert', points: 7, lo: TAM_LO, hi: TAM_HI, label: '我预期这个系统的交互逻辑是清晰易懂的。' },
  {
    id: 'preference', type: 'rank', label: '请将三种输入方式从最喜欢（上）到最不喜欢（下）排序',
    items: [
      { value: 'dwell', label: '注视输入' },
      { value: 'blink', label: '眨眼输入' },
      { value: 'smile', label: '微笑输入' },
    ],
  },
]
