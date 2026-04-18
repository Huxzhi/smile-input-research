"""
bridge.py — Tobii Eye Tracker 5 → WebSocket broadcaster
Broadcasts { x, y, ts } over ws://localhost:7070 at ~60Hz.

Usage:
  py bridge.py           # real hardware
  py bridge.py --mock    # simulate gaze with mouse position
"""
import asyncio
import json
import sys
import time
import threading
from websockets.asyncio.server import serve

PORT = 7070
clients: set = set()
latest_gaze = {"x": 0.5, "y": 0.5, "ts": 0}
_tobii_refs: dict = {}   # 防止 ctypes 对象被 GC 回收


async def handler(websocket):
    clients.add(websocket)
    try:
        await websocket.wait_closed()
    finally:
        clients.discard(websocket)


async def broadcast_loop():
    while True:
        if clients:
            msg = json.dumps(latest_gaze)
            await asyncio.gather(
                *[c.send(msg) for c in list(clients)],
                return_exceptions=True
            )
        await asyncio.sleep(1 / 60)


def start_tobii():
    import ctypes

    DLL_PATH = r"C:\Program Files\Tobii\Tobii EyeX\tobii_stream_engine.dll"

    # tobii_gaze_point_t — normalized gaze point (IS5 compatible)
    class _GazePoint(ctypes.Structure):
        _fields_ = [
            ("timestamp_us", ctypes.c_int64),
            ("validity",     ctypes.c_int),
            ("position_xy",  ctypes.c_float * 2),
        ]

    _DeviceUrlReceiver = ctypes.CFUNCTYPE(None, ctypes.c_char_p, ctypes.c_void_p)
    _GazePointCB       = ctypes.CFUNCTYPE(None, ctypes.POINTER(_GazePoint), ctypes.c_void_p)

    se = ctypes.CDLL(DLL_PATH)
    se.tobii_api_create.restype               = ctypes.c_int
    se.tobii_api_create.argtypes              = [ctypes.POINTER(ctypes.c_void_p), ctypes.c_void_p, ctypes.c_void_p]
    se.tobii_enumerate_local_device_urls.restype  = ctypes.c_int
    se.tobii_enumerate_local_device_urls.argtypes = [ctypes.c_void_p, _DeviceUrlReceiver, ctypes.c_void_p]
    se.tobii_device_create.restype            = ctypes.c_int
    se.tobii_device_create.argtypes           = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int, ctypes.POINTER(ctypes.c_void_p)]
    se.tobii_gaze_point_subscribe.restype      = ctypes.c_int
    se.tobii_gaze_point_subscribe.argtypes     = [ctypes.c_void_p, _GazePointCB, ctypes.c_void_p]
    se.tobii_gaze_point_unsubscribe.restype    = ctypes.c_int
    se.tobii_gaze_point_unsubscribe.argtypes   = [ctypes.c_void_p]
    se.tobii_wait_for_callbacks.restype       = ctypes.c_int
    se.tobii_wait_for_callbacks.argtypes      = [ctypes.c_int, ctypes.POINTER(ctypes.c_void_p)]
    se.tobii_device_process_callbacks.restype = ctypes.c_int
    se.tobii_device_process_callbacks.argtypes= [ctypes.c_void_p]

    api = ctypes.c_void_p()
    if se.tobii_api_create(ctypes.byref(api), None, None) != 0:
        print("[tobii] API 创建失败")
        sys.exit(1)

    print("[tobii] 正在搜索设备...")
    urls = []

    @_DeviceUrlReceiver
    def _url_cb(url, _):
        if url:
            urls.append(url.decode())

    se.tobii_enumerate_local_device_urls(api, _url_cb, None)
    if not urls:
        print("[tobii] 未找到设备，请用 --mock 模拟运行")
        sys.exit(1)

    print(f"[tobii] 已连接: {urls[0]}")
    device = ctypes.c_void_p()
    if se.tobii_device_create(api, urls[0].encode(), 1, ctypes.byref(device)) != 0:
        print("[tobii] 设备连接失败")
        sys.exit(1)

    _frame_count = [0]
    _no_eye_count = [0]
    _last_report = [time.time()]

    @_GazePointCB
    def _gaze_cb(gp_ptr, _):
        gp = gp_ptr.contents
        eye_open = (gp.validity == 1)
        x, y = gp.position_xy[0], gp.position_xy[1]

        _frame_count[0] += 1
        if eye_open and 0.0 <= x <= 1.0 and 0.0 <= y <= 1.0:
            latest_gaze.update({
                "x": round(x, 4), "y": round(y, 4),
                "eye_open": True,
                "ts": int(time.time() * 1000)
            })
        else:
            latest_gaze.update({
                "eye_open": False,
                "ts": int(time.time() * 1000)
            })
            _no_eye_count[0] += 1

        now = time.time()
        if now - _last_report[0] >= 1.0:
            total  = _frame_count[0]
            no_eye = _no_eye_count[0]
            status = "未检测到" if no_eye == total else "检测中"
            print(
                f"[tobii] {total:3d} 帧/s  有效 {total-no_eye:3d}  无眼 {no_eye:3d}  "
                f"{status}  gaze=({latest_gaze['x']:.3f}, {latest_gaze['y']:.3f})"
            )
            _frame_count[0] = 0
            _no_eye_count[0] = 0
            _last_report[0] = now

    rc = se.tobii_gaze_point_subscribe(device, _gaze_cb, None)
    if rc != 0:
        print(f"[tobii] 订阅失败 (error code: {rc})")
        sys.exit(1)

    device_arr = (ctypes.c_void_p * 1)(device)

    # 必须把 ctypes 对象存到模块级，防止函数返回后被 GC 回收
    # 否则 C 回调指针变悬空 → privileged instruction
    _tobii_refs["se"]         = se
    _tobii_refs["api"]        = api
    _tobii_refs["device"]     = device
    _tobii_refs["device_arr"] = device_arr
    _tobii_refs["gaze_cb"]    = _gaze_cb   # 防 GC，勿删

    def _poll_loop():
        _se  = _tobii_refs["se"]
        _dev = _tobii_refs["device"]
        _arr = _tobii_refs["device_arr"]
        TIMED_OUT = -6
        while True:
            rc = _se.tobii_wait_for_callbacks(1, _arr)
            if rc not in (0, TIMED_OUT):
                print(f"[tobii] 轮询错误: {rc}")
                break
            _se.tobii_device_process_callbacks(_dev)

    threading.Thread(target=_poll_loop, daemon=True).start()


def start_mock():
    """Update latest_gaze from mouse position (Windows via ctypes)."""
    try:
        import ctypes

        class POINT(ctypes.Structure):
            _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]

        def _win_mouse():
            while True:
                pt = POINT()
                ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
                sw = ctypes.windll.user32.GetSystemMetrics(0)
                sh = ctypes.windll.user32.GetSystemMetrics(1)
                latest_gaze.update({
                    "x": round(pt.x / sw, 4),
                    "y": round(pt.y / sh, 4),
                    "ts": int(time.time() * 1000)
                })
                time.sleep(1 / 60)

        threading.Thread(target=_win_mouse, daemon=True).start()
        print("Mock mode: tracking mouse position")
    except Exception as e:
        print(f"Mock mode: mouse tracking unavailable ({e}), using static center (0.5, 0.5)")


async def main():
    mock = "--mock" in sys.argv
    if mock:
        start_mock()
    else:
        start_tobii()

    print(f"WebSocket server on ws://localhost:{PORT}")
    async with serve(handler, "localhost", PORT):
        await broadcast_loop()


if __name__ == "__main__":
    asyncio.run(main())
