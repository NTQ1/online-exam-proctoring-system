# Mock Backend

Backend giả để test extension Proctor System khi chưa có backend chính.

## Chạy

```bash
node backend/mock-backend.mjs
```

Mặc định server chạy tại:

- `http://127.0.0.1:5001`

## Endpoint hỗ trợ


Nếu đang chạy mock backend, mở `http://127.0.0.1:5001/` để xem trạng thái service thay vì gặp `Not found`.

## Contract giả

### Auth

Request:

```json
{
  "roomCode": "ROOM001",
  "studentName": "Nguyen Van A",
  "studentId": "SV001"
}
```

Response:

```json
{
  "ok": true,
  "token": "token_...",
  "sessionId": "session_...",
  "serverUrl": "http://localhost:5001"
}
```

### Start session

Request gồm `sessionId`, `roomCode`, `studentName`, `studentId`, `tabs`, `timestamp`, `client`.

### End session

Request gồm `sessionId`, `result`, `timestamp`.

## Ghi chú

- Dữ liệu được lưu trong bộ nhớ RAM.
- Tắt server là mất toàn bộ session.
- Backend này chỉ để test luồng extension, không dùng cho production.
