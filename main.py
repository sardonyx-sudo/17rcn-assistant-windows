# -*- coding: utf-8 -*-
"""
main.py - 扶輪公益網 AI 助手 (Rotary Charity Network Suite)
Windows 專屬桌面正式版核心程式 (基於 pywebview + Microsoft Edge WebView2)
"""

import os
import sys
import time
import signal
import threading
import webview

# 引入核心模組
from core.config_manager import ConfigManager
from core.gas_client import GasClient
from core.injector import build_goods_injection_script

# 全域視窗與狀態參照
window_assistant = None
window_rcn = None
config_mgr = None
gas_client = None
current_locked_row = None  # 當前由本機鎖定中之列號 (支援換筆自動釋放)
prefetch_thread_running = False  # 單線程背景預載守衛旗標

class ApiBridge:
    """提供給工作台 (視窗 A) 前端 JavaScript 呼叫的完整 Python API"""

    def get_config(self):
        """取得偏好設定"""
        return config_mgr.config

    def save_config(self, new_cfg):
        """儲存偏好設定"""
        success = config_mgr.save(new_cfg)
        return {"success": success}

    def get_queue_data(self, force=False):
        """自 Google Apps Script 讀取最新物資佇列"""
        gas_url = config_mgr.get("gas_url")
        if not gas_url:
            return {"success": False, "error": "請先至「偏好設定」輸入 Google Apps Script 網址"}
        res = gas_client.get_queue(gas_url)
        if res.get("success") and res.get("items"):
            # 檢查是否啟用背景智慧預載 (預設 True)
            if config_mgr.get("preload_photos", True):
                self._trigger_background_prefetch(gas_url, res.get("items"))
        return res

    def _trigger_background_prefetch(self, gas_url, items):
        """啟動單線程守護背景任務，預載佇列前 2 筆物資照片"""
        global prefetch_thread_running
        if prefetch_thread_running:
            return

        def _worker():
            global prefetch_thread_running
            prefetch_thread_running = True
            try:
                if config_mgr.get("preload_photos", True):
                    gas_client.prefetch_queue_photos(gas_url, items, max_items=2)
            except Exception as e:
                print(f"[ApiBridge] 背景預載過程異常: {e}")
            finally:
                prefetch_thread_running = False

        t = threading.Thread(target=_worker, daemon=True, name="PhotoPrefetchWorker")
        t.start()

    def upload_goods(self, item_data):
        """
        上傳物資採集資料 (相片 Base64、地址、備註、志工姓名)
        """
        gas_url = config_mgr.get("gas_url")
        if not gas_url:
            return {"success": False, "error": "請先至「偏好設定」輸入 Google Apps Script 網址"}

        photos = item_data.get("photos", [])
        address = item_data.get("address", "")
        note = item_data.get("note", "")
        uploader = item_data.get("uploader", "") or config_mgr.get("uploader_name", "")

        return gas_client.upload_item(gas_url, photos, address, note, uploader)

    def get_photo_base64(self, file_id, download_url=None):
        """為前端縮圖提供 Python 本機快取或 GAS 代理下載 (雙層快取 + 雙軌保險)"""
        gas_url = config_mgr.get("gas_url")
        if not file_id and not download_url:
            return {"success": False, "error": "缺少照片識別碼或下載網址"}
        try:
            prepared = gas_client.prepare_photos_base64(gas_url, [{"fileId": file_id, "downloadUrl": download_url}])
            if prepared and prepared[0].get("base64"):
                return {
                    "success": True,
                    "mimeType": prepared[0].get("mimeType", "image/jpeg"),
                    "base64": prepared[0]["base64"]
                }
            return {"success": False, "error": "無法取得照片資料"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def prepare_and_inject_goods(self, item):
        """
        一鍵刊登流水線：
        1. 換筆自動解鎖前一筆
        2. 向後端搶鎖當前列
        3. 檢查視窗 B 是否在刊登頁，若否則自動導航至 goods_add.php
        4. 背景預載相片 Base64 (含快取)
        5. 注入表單資料、KindEditor 與 DataTransfer 相片
        """
        global current_locked_row, window_rcn
        gas_url = config_mgr.get("gas_url")
        row = int(item.get("row") or item.get("id") or 0)
        default_addr = config_mgr.get("default_address", "")

        # 1. 換筆自動解鎖：若先前有鎖定中之其他物資，先向 GAS 發送釋放
        if current_locked_row and current_locked_row != row and gas_url:
            try:
                gas_client.unlock_item(gas_url, current_locked_row)
                print(f"[ApiBridge] 換筆刊登，已自動向後端釋放上一筆 (第 {current_locked_row} 列) 之鎖定")
            except Exception as e:
                print(f"[ApiBridge] 換筆釋放前一筆鎖定失敗: {e}")
            current_locked_row = None

        # 2. 向 GAS 搶鎖該列 (防他人併發搶登)
        if row > 0 and gas_url:
            lock_res = gas_client.lock_item(gas_url, row)
            if not lock_res.get("success"):
                err_msg = lock_res.get("error") or "此物資已被其他同仁鎖定或狀態已變更"
                return {"success": False, "error": err_msg}
            current_locked_row = row

        # 3. 確保視窗 B 處於「刊登資源」頁面
        target_goods_add = "https://17rcn.org/member/goods_add.php?SR_choose=1"
        if window_rcn:
            current_url = window_rcn.get_current_url() or ""
            if "goods_add.php" not in current_url:
                print(f"[ApiBridge] 視窗 B 目前不在刊登頁 ({current_url})，正在自動切換至 {target_goods_add}")
                window_rcn.load_url(target_goods_add)
                # 等待網頁載入完成 (最長輪詢等待 4.5 秒)
                for _ in range(15):
                    time.sleep(0.3)
                    curr = window_rcn.get_current_url() or ""
                    if "goods_add.php" in curr:
                        time.sleep(0.5)  # 額外留 0.5 秒給 DOM 與 KindEditor 完成渲染
                        break

        # 4. 預載並準備相片 Base64 (雙層快取 + 雙軌保險)
        photos = item.get("photos", [])
        if photos and gas_url:
            prepared_photos = gas_client.prepare_photos_base64(gas_url, photos)
            item["photos"] = prepared_photos

        # 5. 組裝並注入完整填表腳本
        js_script = build_goods_injection_script(item, default_addr)
        if window_rcn:
            try:
                window_rcn.evaluate_js(js_script)
                print(f"[ApiBridge] 成功向 17rcn 視窗注入物資: {item.get('title')}")
                return {"success": True, "message": "物資與相片已自動填入！請確認後輸入驗證碼送出"}
            except Exception as e:
                return {"success": False, "error": f"腳本注入失敗: {str(e)}"}
        else:
            return {"success": False, "error": "找不到 17rcn 瀏覽器視窗"}

    def unlock_goods(self, row):
        """解除物資鎖定"""
        global current_locked_row
        gas_url = config_mgr.get("gas_url")
        res = gas_client.unlock_item(gas_url, row)
        if current_locked_row == row:
            current_locked_row = None
        return res

    def reprocess_goods(self, row, manual_model=None):
        """重新辨識物資"""
        gas_url = config_mgr.get("gas_url")
        return gas_client.reprocess_row(gas_url, row, manual_model)

    def skip_goods(self, row):
        """略過物資"""
        gas_url = config_mgr.get("gas_url")
        return gas_client.mark_skipped(gas_url, row)

    def restore_goods(self, row):
        """復原已略過物資"""
        gas_url = config_mgr.get("gas_url")
        return gas_client.restore_item(gas_url, row)

    def delete_goods(self, row):
        """刪除物資與 Drive 相片"""
        gas_url = config_mgr.get("gas_url")
        return gas_client.delete_item(gas_url, row)

    def cleanup_storage(self, cleanup_type):
        """空間維護清理"""
        gas_url = config_mgr.get("gas_url")
        if cleanup_type == "published":
            return gas_client.cleanup_published(gas_url)
        elif cleanup_type == "skipped":
            return gas_client.cleanup_skipped(gas_url)
        return {"success": False, "error": "未知的清理類型"}

    def on_form_submitted(self, row):
        """17rcn 表單刊登成功回報"""
        global current_locked_row, window_assistant
        print(f"[ApiBridge] 接收到第 {row} 列刊登成功通知！正在回寫試算表...")
        gas_url = config_mgr.get("gas_url")
        if row and gas_url:
            gas_client.mark_published(gas_url, row)
            if current_locked_row == row:
                current_locked_row = None
        
        # 通知工作台更新卡片清單與顯示慶祝 Toast
        if window_assistant:
            try:
                window_assistant.evaluate_js(f"if (typeof handleItemPublishedSuccess === 'function') handleItemPublishedSuccess({row});")
            except Exception as e:
                print(f"[ApiBridge] 通知工作台更新失敗: {e}")
        return True


def calculate_smart_layout():
    """依據使用者桌面解析度與 DPI 縮放設定，智慧計算雙視窗的最佳並排座標與長寬"""
    try:
        screens = webview.screens
        primary = screens[0] if screens else None
    except Exception as e:
        print(f"[警告] 讀取螢幕資訊異常: {e}")
        primary = None

    # 取得螢幕邏輯解析度 (若無法取得則回退為 1920x1080)
    screen_w = primary.width if primary else 1920
    screen_h = primary.height if primary else 1080
    scale = getattr(primary, 'scale', 1.0) if primary else 1.0

    print("=" * 60)
    print(f"  [螢幕檢測] 桌面邏輯解析度: {screen_w} x {screen_h} (DPI 縮放: {scale}x)")
    
    margin_top = 8
    margin_gap = 8
    usable_h = max(540, screen_h - 70)

    # 寬度自適應分配：
    if screen_w <= 1366:
        win_a_w = 380
        win_b_w = max(760, screen_w - win_a_w - margin_gap * 2)
    else:
        win_a_w = 430
        win_b_w = min(1300, max(850, screen_w - win_a_w - margin_gap * 2))

    win_a_x = margin_gap
    win_a_y = margin_top

    win_b_x = win_a_w + margin_gap * 2
    win_b_y = margin_top

    layout_a = {"x": win_a_x, "y": win_a_y, "width": win_a_w, "height": usable_h}
    layout_b = {"x": win_b_x, "y": win_b_y, "width": win_b_w, "height": usable_h}

    print(f"  [視窗 A 工作台] 寬={win_a_w}px, 高={usable_h}px, 位置=({win_a_x}, {win_a_y})")
    print(f"  [視窗 B 公益網] 寬={win_b_w}px, 高={usable_h}px, 位置=({win_b_x}, {win_b_y})")
    print("-" * 60)
    print("  [離開程式方式說明]")
    print("    1. 直接關閉「扶輪公益網 AI 助手」視窗，系統將同步關閉所有視窗並安全退出。")
    print("    2. 或在此命令提示字元視窗中按下鍵盤 [Ctrl + C] 鍵即可中斷退出。")
    print("=" * 60)

    return layout_a, layout_b


def main():
    global window_assistant, window_rcn, config_mgr, gas_client
    
    # 計算路徑
    base_dir = os.path.dirname(os.path.abspath(__file__))
    ui_html_path = os.path.join(base_dir, "ui", "index.html")
    profile_dir = os.path.join(base_dir, "data", "profile")
    os.makedirs(profile_dir, exist_ok=True)

    # 初始化管理器與服務
    config_mgr = ConfigManager()
    gas_client = GasClient()
    bridge = ApiBridge()

    # 智慧螢幕解析度與排版計算
    layout_a, layout_b = calculate_smart_layout()

    # 1. 建立視窗 B：【扶輪公益網主視窗 (17rcn.org)】
    # 標準入口使用會員中心網址 (自動檢測登入狀態)
    rcn_url = "https://17rcn.org/member/"
    window_rcn = webview.create_window(
        title="扶輪公益網 - 官方刊登平台 (17rcn.org)",
        url=rcn_url,
        width=layout_b["width"],
        height=layout_b["height"],
        x=layout_b["x"],
        y=layout_b["y"],
        resizable=True,
        min_size=(740, 500),
        js_api=bridge
    )

    # 2. 建立視窗 A：【物資佇列助理工作台】
    window_assistant = webview.create_window(
        title="扶輪公益網 AI 助手 - 控制工作台",
        url=ui_html_path,
        width=layout_a["width"],
        height=layout_a["height"],
        x=layout_a["x"],
        y=layout_a["y"],
        resizable=True,
        min_size=(360, 520),
        js_api=bridge
    )

    # 3. 設置 Ctrl+C (SIGINT) 安全快速結束處理常式，防止 Windows .NET 彈出 unhandled exception
    def safe_sigint_handler(signum=None, frame=None):
        print("\n  [離開提示] 已接收 Ctrl+C 結束指令，正在安全退出...")
        try:
            os._exit(0)
        except Exception:
            sys.exit(0)

    try:
        signal.signal(signal.SIGINT, safe_sigint_handler)
    except Exception:
        pass

    # 4. 針對 Windows .NET WinForms 平台進行深層例外防禦：
    # 替換 pywebview 的內部 sigint 處理器，並將 BrowserView.instances 封裝為安全字典，
    # 避免視窗關閉時 del instances[uid] 因重複調用 child_xxx 引發 .NET ThreadException 對話框
    try:
        import webview.platforms.winforms as wf
        wf._sigint_handler = safe_sigint_handler

        class SafeInstancesDict(dict):
            def __delitem__(self, key):
                self.pop(key, None)

        if not isinstance(wf.BrowserView.instances, SafeInstancesDict):
            wf.BrowserView.instances = SafeInstancesDict(wf.BrowserView.instances)
    except Exception:
        pass

    # 5. 視窗聯動關閉：當使用者點擊視窗右上角關閉時，同步關閉另一視窗以完全結束程式
    _is_shutting_down = False

    def on_assistant_closed():
        nonlocal _is_shutting_down
        if _is_shutting_down:
            return
        _is_shutting_down = True
        try:
            if window_rcn:
                window_rcn.destroy()
        except Exception:
            pass

    def on_rcn_closed():
        nonlocal _is_shutting_down
        if _is_shutting_down:
            return
        _is_shutting_down = True
        try:
            if window_assistant:
                window_assistant.destroy()
        except Exception:
            pass

    window_assistant.events.closed += on_assistant_closed
    window_rcn.events.closed += on_rcn_closed

    # 啟動 pywebview
    # private_mode=False + storage_path 確保 Cookie 登入狀態永久保持於專屬資料夾
    webview.start(
        debug=False,
        private_mode=False,
        storage_path=profile_dir
    )

if __name__ == "__main__":
    main()
