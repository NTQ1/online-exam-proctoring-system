# Proctor System Extension

Phiên bản rút gọn của README cho dự án `ProctorSystemExtention` — một Chrome extension hỗ trợ giám sát thi trực tuyến (proctoring). Tài liệu này mô tả mục đích, cách cài đặt nhanh, hướng dẫn phát triển và cấu trúc chính của dự án.

## Giới thiệu

`ProctorSystemExtention` là một extension theo dõi hành vi trình duyệt trong kỳ thi trực tuyến, báo cáo vi phạm về server và quản lý phiên thi. Extension bao gồm popup để nhập thông tin thí sinh, background script để quản lý phiên, và content script để giám sát hành vi trên trang thi.

## Nội dung chính
- **Popup**: giao diện nhập mã phòng, tên, mã số sinh viên.
- **Background**: quản lý authentication, session, gửi/nhận message.
- **Content scripts**: theo dõi tab chuyển đổi, mất/được focus, devtools, menu chuột phải, phím tắt, v.v.
- **Services**: `src/services/api.js` tương tác với API server.

## Quick start — Cách chạy local (chỉ vài bước)

1. Mở `chrome://extensions/` trên Chrome/Chromium.
2. Bật `Developer mode`.
3. Click `Load unpacked` và chọn thư mục gốc `ProctorSystemExtention`.
4. Click icon extension, điền `Room Code`, `Tên`, `Mã số sinh viên` và submit.

## Cài đặt & phát triển

- Yêu cầu: Chrome/Chromium để test extension.
- Thay đổi cấu hình server và môi trường trong `src/core/config.js`.
- Để debug: mở DevTools cho popup hoặc trang chứa để kiểm tra logs từ `background.js`/`content.js`.

Gợi ý phát triển:

- Sử dụng ES modules; mã nguồn nằm trong `src/`.
- Các file chính: `src/popup/*`, `src/background.js`, `src/content.js`, `src/core/*`, `src/services/api.js`.

## Cấu trúc thư mục (tóm tắt)

```
ProctorSystemExtention/
├── manifest.json
├── README.md
├── src/
│   ├── popup/
│   ├── core/
│   ├── features/
│   ├── services/
│   ├── background.js
│   └── content.js
└── backend/   (mock server, tests)
```

## API (tóm tắt)

- `POST /api/auth/room-code` — xác thực mã phòng, trả về `authToken` và `sessionId`.
- `POST /api/violations/report` — gửi báo cáo vi phạm.
- `POST /api/sessions/heartbeat` — gửi heartbeat để giữ phiên hoạt động.

Chi tiết endpoint và payload được xử lý trong `src/services/api.js`.

## Cấu hình lưu trữ cục bộ (schema)

- `authToken`, `sessionId`, `serverUrl`
- `proctorSession` chứa `roomCode`, `studentName`, `studentId`, `startTime`, `status`
- `studentInfo` lưu `name` và `msv` để tự động điền lần sau

## Testing & chế độ phát triển không có server

- Extension có cơ chế fallback sang chế độ test nếu server không phản hồi (mock tokens, mock session).
- Test thủ công: tải unpacked extension rồi thao tác popup.

## TODOs & Gợi ý cải tiến

- Thêm WebSocket cho cập nhật real-time
- Thêm capture màn hình / hình ảnh (tùy chính sách quyền riêng tư)
- Tích hợp phát hiện khuôn mặt (tuỳ chọn)

## Ghi chú quan trọng

- Kiểm tra kỹ quyền trong `manifest.json` trước khi publish (ví dụ: `tabs`, `storage`, `activeTab`).
- Tuân thủ chính sách quyền riêng tư khi thu thập dữ liệu sinh viên.

---

**Last Updated**: May 20, 2026
**Version**: 1.1.0
