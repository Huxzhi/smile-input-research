# Tobii Bridge — 技术文档

`bridge.py` 是一个运行在 **Windows** 上的 Python 脚本，将 Tobii Eye Tracker 5 的注视数据通过 WebSocket 广播给浏览器端实验应用。

---

## 架构概览

```
Tobii Eye Tracker 5
       │  USB
       ▼
  tobii_research SDK          ← Windows 原生驱动，只能在 Windows 上运行
       │  gaze_callback（~60Hz）
       ▼
  latest_gaze dict            ← 共享内存（线程安全：dict 原子写）
       │
  broadcast_loop（asyncio）
       │  JSON over WebSocket
       ▼
  ws://localhost:7070
       │
  Windows 浏览器 → GazeLayer.ts
```

Mock 模式下，`tobii_research` 替换为 `ctypes` 读取 Windows 鼠标坐标，其余路径完全相同。

---

## 协议说明

### 连接

```
ws://localhost:7070
```

服务器只监听 `localhost`，不对外网暴露。

### 消息格式

服务器单向推送，客户端无需发送任何消息。

**每帧推送一条 JSON 文本帧：**

```json
{ "x": 0.4823, "y": 0.3107, "ts": 1744389600123 }
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `x` | `float` [0.0, 1.0] | 归一化水平坐标，0 = 屏幕左边缘，1 = 右边缘 |
| `y` | `float` [0.0, 1.0] | 归一化垂直坐标，0 = 屏幕上边缘，1 = 下边缘 |
| `ts` | `int` ms | Unix 时间戳（毫秒），`time.time() * 1000` |

坐标为 **左右眼均值**，基于 Tobii 的 `display_area` 归一化坐标系（与屏幕分辨率无关）。

### 推送频率

- 目标：**60 Hz**（`asyncio.sleep(1/60)`）
- Tobii SDK 回调频率取决于硬件（Eye Tracker 5 标称 33 Hz），但 broadcast_loop 独立运行，以 60 Hz 节拍推送 `latest_gaze` 的最新值（可能重复推送同一帧）

### 多客户端

支持多个 WebSocket 客户端同时连接，每帧广播给所有已连接客户端。

---

## 客户端接入（GazeLayer.ts）

浏览器端通过 `GazeLayer` 类接入：

```ts
const layer = new GazeLayer('ws://localhost:7070')
layer.connect()

const unsub = layer.onGaze((point) => {
  // point.x, point.y: 归一化坐标
  // point.ts: 时间戳
  const px = layer.toPixel(point, window.innerWidth, window.innerHeight)
  // px.x, px.y: 像素坐标
})

// 组件卸载时
unsub()
layer.disconnect()
```

`toPixel` 实现：`{ x: Math.round(x * screenW), y: Math.round(y * screenH) }`

---

## 数据源：tobii_research SDK

```python
tracker.subscribe_to(
    tr.EYETRACKER_GAZE_DATA,
    gaze_callback,
    as_dictionary=True
)
```

回调字段（使用的部分）：

| 字段 | 说明 |
|------|------|
| `left_gaze_point_on_display_area` | 左眼注视点，`(x, y)` 归一化 |
| `right_gaze_point_on_display_area` | 右眼注视点，`(x, y)` 归一化 |

均值计算：
```python
x = (left[0] + right[0]) / 2
y = (left[1] + right[1]) / 2
```

> **注意**：当某只眼睛追踪失败时，SDK 返回 `(nan, nan)`。当前实现不做 NaN 检查，均值会传播 NaN 给客户端。如需鲁棒性，可改为：
> ```python
> valid = [(ex, ey) for ex, ey in [left, right] if not (ex != ex)]
> if valid:
>     x = sum(p[0] for p in valid) / len(valid)
> ```

---

## Mock 模式

```bash
python bridge.py --mock
```

使用 `ctypes` 读取 Windows 鼠标光标位置，模拟注视坐标：

```python
ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
sw = ctypes.windll.user32.GetSystemMetrics(0)  # 屏幕宽度（像素）
sh = ctypes.windll.user32.GetSystemMetrics(1)  # 屏幕高度（像素）
x = round(pt.x / sw, 4)
y = round(pt.y / sh, 4)
```

在独立 daemon 线程中以 60 Hz 轮询，写入同一个 `latest_gaze` dict。WebSocket broadcast_loop 无需感知数据来源。

---

## 安装与运行

**依赖**（Windows Python 3.8+）：

```bash
pip install tobii_research websockets
```

**运行（真实设备）：**

```bash
python bridge.py
```

输出示例：
```
Connected: Tobii Eye Tracker 5
WebSocket server on ws://localhost:7070
```

**运行（Mock）：**

```bash
python bridge.py --mock
```

输出示例：
```
Mock mode: tracking mouse position
WebSocket server on ws://localhost:7070
```

---

## 与浏览器的网络关系（WSL2 环境）

```
Windows
├── bridge.py  →  ws://localhost:7070
└── Chrome     →  连接 ws://localhost:7070  ✓（同一 localhost）

WSL2
└── pnpm dev --host  →  http://172.x.x.x:5173
                         ↑ Chrome 通过 WSL2 IP 访问
```

浏览器和 bridge 同在 Windows，`ws://localhost:7070` 直接可达，无需跨 WSL2 网络。

---

## 已知限制

| 限制 | 说明 |
|------|------|
| Windows 专属 | `tobii_research` SDK 仅支持 Windows，Mock 模式的 `ctypes.windll` 也是 Windows API |
| 无断线重连 | 服务器重启后客户端需手动重连（`GazeLayer.connect()` 重新调用） |
| NaN 传播 | 单眼追踪丢失时均值为 NaN，客户端需自行过滤 |
| 无认证 | 任何本地进程均可连接，仅适用于实验室受控环境 |
