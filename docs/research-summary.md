# 研究总结

## 系统能力

| 模块 | 功能 |
|------|------|
| 凝视采集 | Tobii Eye Tracker 5，归一化坐标，~60Hz 推送 |
| 表情检测 | MediaPipe Face Landmarker，浏览器端实时运行，输出微笑分数 / 眨眼分数 |
| 输入方式 | 注视停留（Dwell 800ms）/ 眨眼（Blink < 300ms）/ 微笑（Smile 持续 300ms） |
| 键盘布局 | QWERTY / OPTI（频率优化布局） |
| 实验控制 | 6 条件自动推进，Latin square 顺序平衡，条件间 60s 休息 |
| 情感评估 | 实验后 PANAS 问卷（20 题，PA / NA 分离计分） |
| 数据导出 | 三张 CSV：会话信息、逐键事件、问卷结果 |

---

## 研究问题

**微笑作为输入动作，是否会改变用户打字时的情感体验？**

| 项目 | 说明 |
|------|------|
| 实验设计 | 2（布局：QWERTY × OPTI）× 3（输入方式：停留 × 眨眼 × 微笑）组内设计 |
| 主要因变量 | PANAS 正向情感（PA）得分、负向情感（NA）得分 |
| 次要因变量 | 输入速度（WPM）、错误率 |
| 核心假设 | 微笑输入组 PA 得分显著高于停留 / 眨眼组，因为持续微笑的动作本身通过身体反馈影响情绪状态 |

---

## 创新点

| 创新 | 说明 |
|------|------|
| 情绪效价引入凝视输入 | 以往凝视打字研究仅关注效率（WPM、错误率、疲劳度），本研究首次将输入动作的情绪效价纳入考量 |
| 微笑作为触发机制 | 选择具有正向情绪效价的"微笑"动作，而非中性（停留）或负向（眨眼）动作 |
| 情感量化 | 通过 PANAS 量化情感差异，而非仅测效率指标 |
| 凝视位置锁定 | 微笑时面部移动导致凝视漂移的工程问题：凝视停留 200ms 后锁定目标键位置，确保实验可行性 |

---

## 依赖的前序研究

| 来源 | 贡献 |
|------|------|
| **Strack et al. (1988)**<br>"Inhibiting and facilitating conditions of the human smile" | 面部反馈效应经典实验（笔含嘴中影响漫画评分），提供核心假设的理论基础 |
| **James (1884) / Lange (1885)** | 情绪的外周理论：身体反应先于情绪感知，面部表情可反向激活情绪 |
| **Isokoski & Back (2002)**<br>"Two-key selection techniques for minimal manual interfaces" | OPTI 键盘布局，专为单指针 / 凝视输入优化，高频字母居中排布 |
| **MacKenzie & Soukoreff (2003)**<br>"Phrase sets for evaluating text entry techniques" | 标准短语集，保证与其他文本输入研究的可比性 |
| **Watson, Clark & Tellegen (1988)**<br>"Development and validation of brief measures of positive and negative affect: the PANAS scales" | PANAS 20 项情感量表，PA / NA 分离测量，信效度已充分验证 |
| **凝视输入 Dwell / Blink 相关文献** | 停留输入与眨眼输入作为 baseline；眨眼 < 300ms 为主动眨眼的判断阈值来自该领域实证数据 |
| **Tobii Eye Tracker 5 + tobii_research SDK** | 商业凝视追踪硬件，提供 display_area 归一化坐标系 |
| **MediaPipe Face Landmarker（Google, 2023）** | 浏览器端实时面部 blend shape 估计，提供 mouthSmileLeft / Right 和 eyeBlink 分量 |
