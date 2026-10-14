# -*- coding: utf-8 -*-
"""
gas_client.py - Google Apps Script (GAS) 後端通訊用戶端
負責所有試算表 API 操作：讀取佇列、上傳物資、鎖定/解鎖、刊登回寫、重新辨識、空間清理與照片 Base64 預載
"""

import os
import json
import time
import base64
import hashlib
import requests

class GasClient:
    def __init__(self, cache_dir=None):
        if cache_dir is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            self.cache_dir = os.path.join(base_dir, "data", "img_cache")
        else:
            self.cache_dir = cache_dir
            
        os.makedirs(self.cache_dir, exist_ok=True)
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "RotaryGoodsAssistant-Desktop/2.0"
        })

    def _call_api_get(self, gas_url, action, params=None, timeout=25):
        """通用 GET 請求"""
        if not gas_url or not gas_url.strip():
            return {"success": False, "error": "尚未設定 Google Apps Script 網址"}

        url = gas_url.strip()
        query = {"action": action}
        if params:
            query.update(params)

        try:
            resp = self.session.get(url, params=query, timeout=timeout)
            resp.raise_for_status()
            data = resp.json()
            return data
        except requests.exceptions.Timeout:
            return {"success": False, "error": "連線逾時，請檢查網路或稍後再試"}
        except requests.exceptions.RequestException as e:
            return {"success": False, "error": f"網路請求失敗: {str(e)}"}
        except Exception as e:
            return {"success": False, "error": f"解析回應異常: {str(e)}"}

    def _call_api_post(self, gas_url, payload, timeout=60):
        """通用 POST 請求 (主要用於 uploadItem)"""
        if not gas_url or not gas_url.strip():
            return {"success": False, "error": "尚未設定 Google Apps Script 網址"}

        url = gas_url.strip()
        try:
            resp = self.session.post(url, json=payload, timeout=timeout)
            resp.raise_for_status()
            data = resp.json()
            return data
        except requests.exceptions.Timeout:
            return {"success": False, "error": "上傳等待逾時，請檢查網路"}
        except requests.exceptions.RequestException as e:
            return {"success": False, "error": f"上傳請求失敗: {str(e)}"}
        except Exception as e:
            return {"success": False, "error": f"解析回應異常: {str(e)}"}

    def get_queue(self, gas_url):
        """取得待刊佇列、AI 辨識中與已略過清單"""
        data = self._call_api_get(gas_url, "getItems", timeout=20)
        if not data.get("success"):
            return data

        raw_items = data.get("items", [])
        processing_items = data.get("processingItems", [])
        
        # 篩選待刊登或刊登中的項目 (防呆去除空白)
        active_items = []
        for item in raw_items:
            status = str(item.get("status", "")).replace(" ", "")
            if "待刊登" in status or "刊登中" in status:
                # 規範欄位格式
                item["isLocked"] = ("刊登中" in status)
                active_items.append(item)

        # 讀取已略過項目
        skipped_items = []
        try:
            skip_data = self._call_api_get(gas_url, "getSkippedItems", timeout=15)
            if skip_data.get("success"):
                skipped_items = skip_data.get("items", [])
        except Exception:
            pass

        return {
            "success": True,
            "items": active_items,
            "processingItems": processing_items,
            "skippedItems": skipped_items,
            "processingCount": data.get("processingCount", len(processing_items)),
            "failedCount": data.get("failedCount", 0)
        }

    def lock_item(self, gas_url, row):
        """鎖定物資（標記為刊登中）"""
        return self._call_api_get(gas_url, "lockItem", {"row": row}, timeout=15)

    def unlock_item(self, gas_url, row):
        """解除鎖定（恢復為待刊登）"""
        return self._call_api_get(gas_url, "unlockItem", {"row": row}, timeout=15)

    def mark_published(self, gas_url, row):
        """回寫試算表標記為已刊登"""
        return self._call_api_get(gas_url, "markPublished", {"row": row}, timeout=15)

    def mark_skipped(self, gas_url, row):
        """略過物資"""
        return self._call_api_get(gas_url, "markSkipped", {"row": row}, timeout=15)

    def restore_item(self, gas_url, row):
        """復原略過物資回待刊佇列"""
        return self._call_api_get(gas_url, "restoreItem", {"row": row}, timeout=15)

    def delete_item(self, gas_url, row):
        """刪除物資列並將關聯 Drive 相片移入垃圾桶"""
        return self._call_api_get(gas_url, "deleteItem", {"row": row}, timeout=20)

    def reprocess_row(self, gas_url, row, manual_model=None):
        """重新辨識物資"""
        params = {"row": row}
        if manual_model:
            params["manualModel"] = manual_model
        return self._call_api_get(gas_url, "reprocessRow", params, timeout=40)

    def cleanup_published(self, gas_url):
        """一鍵清理已刊登物資與圖檔"""
        return self._call_api_get(gas_url, "cleanupPublished", timeout=45)

    def cleanup_skipped(self, gas_url):
        """一鍵清理已略過廢照"""
        return self._call_api_get(gas_url, "cleanupSkipped", timeout=45)

    def upload_item(self, gas_url, photos, address, note, uploader=""):
        """
        上傳物資相片與資料至 GAS
        photos: [{"name": str, "base64": str, "mimeType": str}]
        """
        payload = {
            "action": "uploadItem",
            "photos": photos,
            "address": address,
            "note": note,
            "uploader": uploader
        }
        return self._call_api_post(gas_url, payload, timeout=60)

    def prepare_photos_base64(self, gas_url, photos):
        """
        為物資預載並準備 1~3 張照片之 Base64 資料 (含雙層快取與雙軌保險下載)
        回傳: [{"name": str, "mimeType": str, "base64": str}]
        """
        prepared = []
        for idx, p in enumerate(photos[:3]):
            file_id = p.get("fileId") or p.get("id")
            download_url = p.get("downloadUrl") or p.get("originalUrl") or p.get("url")
            photo_name = p.get("name") or f"goods_photo_{idx+1}.jpg"

            # 產生快取鍵名
            cache_key = file_id or download_url or f"photo_{idx}"
            cache_file = os.path.join(self.cache_dir, f"{hashlib.md5(cache_key.encode('utf-8')).hexdigest()}.json")

            # 1. 檢查本機磁碟快取
            if os.path.exists(cache_file):
                try:
                    with open(cache_file, "r", encoding="utf-8") as f:
                        cached_data = json.load(f)
                        if cached_data.get("base64"):
                            prepared.append(cached_data)
                            continue
                except Exception:
                    pass

            b64_data = None
            mime_type = "image/jpeg"

            # 2. 策略 1：優先透過 GAS 代理下載 (DriveApp 後端轉 Base64，避開 Google Drive 登入阻擋)
            if file_id and gas_url:
                try:
                    proxy_res = self._call_api_get(gas_url, "getImageBase64", {"fileId": file_id}, timeout=20)
                    if proxy_res.get("success") and proxy_res.get("base64"):
                        b64_data = proxy_res["base64"]
                        mime_type = proxy_res.get("mimeType", "image/jpeg")
                        photo_name = proxy_res.get("filename", photo_name)
                except Exception as e:
                    print(f"[GasClient] GAS 代理下載相片失敗 ({file_id}): {e}")

            # 3. 策略 2：若代理失敗，嘗試直連下載二進位檔
            if not b64_data and download_url and download_url.startswith("http"):
                try:
                    resp = self.session.get(download_url, timeout=15)
                    if resp.status_code == 200 and resp.content:
                        b64_data = base64.b64encode(resp.content).decode("utf-8")
                        mime_type = resp.headers.get("Content-Type", "image/jpeg")
                except Exception as e:
                    print(f"[GasClient] 直連下載相片失敗 ({download_url}): {e}")

            if b64_data:
                item_obj = {
                    "name": photo_name,
                    "mimeType": mime_type,
                    "base64": b64_data
                }
                # 寫入快取
                try:
                    with open(cache_file, "w", encoding="utf-8") as f:
                        json.dump(item_obj, f)
                except Exception:
                    pass
                prepared.append(item_obj)

        return prepared

    def prefetch_queue_photos(self, gas_url, items, max_items=2):
        """
        背景智慧預載：為佇列前 max_items 筆物資依序預載照片至磁碟快取
        採循序下載、小步快跑（每張圖間隔 0.3s），避免對 GAS / Drive 造成併發壓力
        """
        if not gas_url or not items:
            return 0

        prefetched_count = 0
        target_items = items[:max_items]

        for item in target_items:
            photos = item.get("photos", [])
            row = item.get("row") or item.get("id") or "?"
            title = item.get("title") or f"第 {row} 列"

            for idx, p in enumerate(photos[:3]):
                file_id = p.get("fileId") or p.get("id")
                download_url = p.get("downloadUrl") or p.get("originalUrl") or p.get("url")
                cache_key = file_id or download_url or f"photo_{idx}"
                cache_file = os.path.join(self.cache_dir, f"{hashlib.md5(cache_key.encode('utf-8')).hexdigest()}.json")

                # 若本機磁碟快取已存在且有效，直接跳過 (0 耗能)
                if os.path.exists(cache_file):
                    continue

                # 執行單張預載
                try:
                    res = self.prepare_photos_base64(gas_url, [p])
                    if res:
                        prefetched_count += 1
                        print(f"[GasClient] 成功背景預載 [{title}] 之相片 {idx+1}")
                except Exception as e:
                    print(f"[GasClient] 背景預載 [{title}] 相片 {idx+1} 略過: {e}")

                time.sleep(0.3)

        return prefetched_count
