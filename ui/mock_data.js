// mock_data.js - 扶輪公益網 AI 助手 介面原型模擬資料庫

const MockDB = {
  // 1. 待刊物資 (Active Queue)
  queueItems: [
    {
      id: "row_101",
      row: 101,
      title: "聲寶 SAMPO 20公升 機械式微波爐 (RE-N820TM)",
      category1Name: "3C 家電",
      category2Name: "廚房小家電",
      condition: "new",
      conditionText: "全新",
      quantity: 1,
      price: 1200,
      uploader: "王小明 (台北北區扶輪社)",
      address: "台北市大安區新生南路一段165巷8號",
      status: "待刊登",
      isLocked: false,
      lockOwner: null,
      lockTime: null,
      description: "全新未拆封，原廠紙箱與保證書皆在。\n旋鈕機械式控制，加熱均勻快速。\n適合公益關懷站、長照日照中心或小型辦公室使用。\n體積適中，需自備車輛自取。",
      photos: [
        {
          name: "microwave_1.jpg",
          url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'><rect width='300' height='300' fill='%23E2E8F0'/><text x='50%25' y='45%25' font-size='22' text-anchor='middle' fill='%23475569' font-weight='bold'>聲寶微波爐</text><text x='50%25' y='60%25' font-size='15' text-anchor='middle' fill='%2364748B'>【相片 1: 外觀正面】</text></svg>"
        },
        {
          name: "microwave_2.jpg",
          url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'><rect width='300' height='300' fill='%23CBD5E1'/><text x='50%25' y='45%25' font-size='22' text-anchor='middle' fill='%23334155' font-weight='bold'>產品規格標籤</text><text x='50%25' y='60%25' font-size='15' text-anchor='middle' fill='%2364748B'>【相片 2: 700W / 20L】</text></svg>"
        }
      ]
    },
    {
      id: "row_102",
      row: 102,
      title: "無印良品 MUJI 實木橡木可延伸餐桌 (附 4 張餐椅)",
      category1Name: "生活家具",
      category2Name: "客廳/餐廳家具",
      condition: "used",
      conditionText: "二手良品",
      quantity: 1,
      price: 3500,
      uploader: "李美華 志工",
      address: "新北市板橋區縣民大道二段7號",
      status: "刊登中",
      isLocked: true,
      lockOwner: "陳專責志工 (桌機版發布中)",
      lockTime: "10分鐘前",
      description: "無印良品實木經典款，結構極度扎實無鬆動。\n桌面有輕微正常使用細痕，已完整擦拭消毒。\n附贈同系列實木餐椅 4 張。\n因體積較大，需安排貨車或小發財車親自搬運取件。",
      photos: [
        {
          name: "table_1.jpg",
          url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'><rect width='300' height='300' fill='%23FEF3C7'/><text x='50%25' y='45%25' font-size='22' text-anchor='middle' fill='%2392400E' font-weight='bold'>MUJI 橡木餐桌</text><text x='50%25' y='60%25' font-size='15' text-anchor='middle' fill='%23B45309'>【相片 1: 整體展開圖】</text></svg>"
        },
        {
          name: "table_2.jpg",
          url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'><rect width='300' height='300' fill='%23FDE68A'/><text x='50%25' y='45%25' font-size='22' text-anchor='middle' fill='%2378350F' font-weight='bold'>餐椅與木紋細節</text><text x='50%25' y='60%25' font-size='15' text-anchor='middle' fill='%2392400E'>【相片 2: 四張餐椅】</text></svg>"
        }
      ]
    },
    {
      id: "row_103",
      row: 103,
      title: "BenQ 護眼 LED 雙臂防眩光閱讀檯燈 (WiT MindDuo)",
      category1Name: "生活居家",
      category2Name: "燈具照明",
      condition: "used",
      conditionText: "9成新",
      quantity: 2,
      price: 800,
      uploader: "林社友 (台北圓山社)",
      address: "台北市中山區南京東路三段28號",
      status: "待刊登",
      isLocked: false,
      lockOwner: null,
      lockTime: null,
      description: "功能 100% 正常，觸控式調光調色溫（白光/暖光）。\n附原廠變壓器與底座，非常適合學童讀書與書桌作業使用。\n共計 2 盞，優先提供給偏鄉弱勢學童課輔班。",
      photos: [
        {
          name: "lamp_1.jpg",
          url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'><rect width='300' height='300' fill='%23E0F2FE'/><text x='50%25' y='45%25' font-size='22' text-anchor='middle' fill='%230369A1' font-weight='bold'>BenQ 閱讀檯燈</text><text x='50%25' y='60%25' font-size='15' text-anchor='middle' fill='%230284C7'>【相片 1: 點亮效果】</text></svg>"
        }
      ]
    }
  ],

  // 2. 正在 AI 辨識中 (Processing Items)
  processingItems: [
    {
      id: "row_104",
      row: 104,
      title: "飛利浦 PHILIPS 氣炸鍋 (正在由 Gemini 分析中...)",
      category1Name: "辨識分析中...",
      category2Name: "待定",
      uploader: "張外勤志工 (手機隨拍上傳)",
      address: "台南市安平區永華三街210號",
      uploadTime: "30 秒前",
      status: "AI辨識中",
      photos: [
        {
          name: "airfryer_temp.jpg",
          url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'><rect width='300' height='300' fill='%23E0F2FE'/><text x='50%25' y='45%25' font-size='22' text-anchor='middle' fill='%230284C7' font-weight='bold'>氣炸鍋相片</text><text x='50%25' y='60%25' font-size='15' text-anchor='middle' fill='%230369A1'>【等待 AI 模型回傳】</text></svg>"
        }
      ]
    }
  ],

  // 3. 已略過項目 (Skipped Items)
  skippedItems: [
    {
      id: "row_105",
      row: 105,
      title: "鋁合金輕量折疊輪椅 (待確認煞車零件完整性)",
      category1Name: "醫療照護",
      category2Name: "行動輔具",
      uploader: "黃社友",
      skipReason: "志工標記：輪胎胎壓不足需先檢修充氣，待確認後再開放刊登",
      price: 0,
      quantity: 1,
      address: "台中市西屯區台灣大道三段99號",
      status: "略過",
      photos: [
        {
          name: "wheelchair.jpg",
          url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'><rect width='300' height='300' fill='%23F3F4F6'/><text x='50%25' y='45%25' font-size='22' text-anchor='middle' fill='%236B7280' font-weight='bold'>折疊輪椅</text><text x='50%25' y='60%25' font-size='15' text-anchor='middle' fill='%239CA3AF'>【已略過暫存】</text></svg>"
        }
      ]
    }
  ]
};
