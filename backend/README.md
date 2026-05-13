# Mock Backend

Backend giả để test extension Proctor System khi chưa có backend chính.

## Chạy

```bash
node backend/mock-backend.mjs
```

Mặc định server chạy tại:

- `http://127.0.0.1:3000`

## Endpoint hỗ trợ

- `GET /health`
- `POST /api/auth/room-code`
- `POST /api/sessions/start`
- `POST /api/sessions/end`
- `POST /api/sessions/heartbeat`
- `POST /api/violations/report`
- `POST /api/violations/batch`
- `GET /api/sessions/:sessionId`

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
  "serverUrl": "http://localhost:3000"
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
