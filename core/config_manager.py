# -*- coding: utf-8 -*-
"""
config_manager.py - 扶輪公益網 AI 助手 設定檔管理器
負責 config.json 的載入、儲存與預設值維護
"""

import os
import json

DEFAULT_CONFIG = {
    "gas_url": "https://script.google.com/macros/s/AKfycbxmQqWQK44VN-OCoGKM5_0ekS_k-n1iDbXuU_e0L8KYVbppMWCR7iVA_KePH_pltrly/exec",
    "default_address": "台南市安平區永華三街333號6樓-3",
    "uploader_name": "",
    "preload_photos": True,
    "window_positions": {},
    "auto_refresh": True
}

class ConfigManager:
    def __init__(self, config_path=None):
        if config_path is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            self.config_path = os.path.join(base_dir, "config.json")
        else:
            self.config_path = config_path
            
        self.config = dict(DEFAULT_CONFIG)
        self.load()

    def load(self):
        """載入設定檔，若不存在則以預設值建立"""
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    # 合併預設值（防止缺少新欄位）
                    merged = dict(DEFAULT_CONFIG)
                    merged.update(data)
                    self.config = merged
                    return self.config
            except Exception as e:
                print(f"[ConfigManager] 讀取設定檔失敗，使用預設值: {e}")
                self.config = dict(DEFAULT_CONFIG)
                return self.config
        else:
            self.config = dict(DEFAULT_CONFIG)
            self.save()
            return self.config

    def save(self, new_config=None):
        """將設定儲存至 config.json"""
        if new_config is not None:
            self.config.update(new_config)
            
        try:
            with open(self.config_path, "w", encoding="utf-8") as f:
                json.dump(self.config, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            print(f"[ConfigManager] 儲存設定檔失敗: {e}")
            return False

    def get(self, key, default=None):
        return self.config.get(key, default)

    def set(self, key, value):
        self.config[key] = value
        self.save()
