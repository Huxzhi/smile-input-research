import type { QuestionDef } from './types'

const PANAS_ITEMS = [
  '感兴趣的', '苦恼的', '兴奋的', '烦乱的', '强壮的', '有罪恶感的', '害怕的', '热情的',
  '自豪的', '易怒的', '警觉的', '惭愧的', '受鼓舞的', '紧张的', '坚定的', '专注的',
  '坐立不安的', '积极的', '恐惧的', '敌意的',
]

export const PRE_SURVEY: QuestionDef[] = [
  {
    id: 'age', type: 'text', label: '年龄', placeholder: '请输入数字',
  },
  {
    id: 'gender', type: 'radio', label: '性别',
    options: [
      { value: 'male', label: '男' },
      { value: 'female', label: '女' },
      { value: 'other', label: '其他' },
      { value: 'prefer_not', label: '不愿透露' },
    ],
  },
  {
    id: 'eyeTracker', type: 'radio', label: '您是否使用过眼动仪设备？',
    options: [
      { value: 'never', label: '从未' },
      { value: 'rarely', label: '偶尔' },
      { value: 'often', label: '经常' },
    ],
  },
  {
    id: 'eyeCondition', type: 'radio', label: '您是否有眼部或面部肌肉疾病？',
    options: [
      { value: 'yes', label: '是' },
      { value: 'no', label: '否' },
    ],
  },
  {
    id: 'panas_pre', type: 'panas_batch', items: PANAS_ITEMS,
  },
]

export const PERSONAL_SURVEY: QuestionDef[] = PRE_SURVEY.filter(
  q => q.type !== 'panas_batch'
)

export const PANAS_PRE_SURVEY: QuestionDef[] = PRE_SURVEY.filter(
  q => q.type === 'panas_batch'
)
