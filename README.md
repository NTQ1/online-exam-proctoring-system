RÔ# Proctor System Extension - Popup Implementation

## 🎯 Các Tính Năng Đã Hoàn Thiện

### FR-07: Sinh viên mở popup extension, nhập mã code phòng thi
- ✅ Giao diện popup đẹp, chuyên nghiệp
- ✅ Form nhập mã phòng thi (Room Code)
- ✅ Validation đầu vào
- ✅ Responsive design cho các thiết bị khác nhau

### FR-08: Hệ thống xác thực mã code và kết nối với server
- ✅ Xác thực mã phòng thi với server
- ✅ Kết nối server qua HTTPS
- ✅ Quản lý auth token và session ID
- ✅ Fallback to test mode nếu server không khả dụng
- ✅ Timeout handling

### Thông Tin Sinh Viên
- ✅ Form nhập Họ và Tên
- ✅ Form nhập Mã Số Sinh Viên (MSV)
- ✅ Validation tất cả các trường
- ✅ Lưu dữ liệu vào local storage

## 📁 Cấu Trúc Files Đã Tạo

```
ProctorSystemExtention/
├── manifest.json                  # Cập nhật: action + background + content scripts
├── src/
│   ├── popup/
│   │   ├── popup.html            # Form nhập liệu
│   │   ├── popup.css             # Styling chuyên nghiệp
│   │   └── popup.js              # Logic xác thực
│   ├── background.js             # Service worker xử lý authentication
│   ├── content/
│   │   └── content.js            # Monitor violations
│   ├── core/
│   │   ├── config.js             # Configuration
│   │   ├── dispatcher.js          # Message dispatcher
│   │   ├── logger.js             # Logging
│   │   └── messaging.js          # Message handling
│   └── services/
│       └── api.js                # API communication
└── README.md                      # Documentation
```

## 🔄 Luồng Hoạt Động

### 1. User mở popup
- Hiển thị form nhập: Mã phòng thi, Họ tên, MSV
- Load dữ liệu đã lưu (nếu có)

### 2. User submit form
- Validate tất cả fields
- Gửi request đến server: `/api/auth/room-code`
- Server trả về: `token` + `sessionId`

### 3. Lưu authentication info
```javascript
{
  authToken: "...",
  sessionId: "...",
  serverUrl: "...",
  roomCode: "ROOM001",
  studentInfo: { name: "...", msv: "..." },
  startTime: Date.now()
}
```

### 4. Thông báo background script
- Background script nhận event `START_PROCTORING`
- Inject content script vào tất cả tabs
- Setup monitoring cho violations

### 5. Content script bắt đầu monitor
- Tab switch
- Keyboard shortcuts (Ctrl+C, F12, etc.)
- Right-click context menu
- DevTools attempts
- Window blur/focus
- Tab hidden

## 🔐 Security Features

1. **Token-based Authentication**: OAuth-style token management
2. **Session Management**: Unique session per proctoring instance
3. **Violation Detection**: Real-time monitoring and reporting
4. **Secure Storage**: Use Chrome storage API with sync
5. **HTTPS Communication**: All server communication encrypted
6. **Content Security Policy**: Extension follows CSP guidelines

## 🌐 Server API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/room-code` | Xác thực mã phòng thi |
| POST | `/api/violations/report` | Report violation |
| POST | `/api/sessions/heartbeat` | Gửi heartbeat |
| GET | `/api/sessions/:id` | Lấy session status |
| POST | `/api/sessions/end` | Kết thúc session |
| POST | `/api/violations/batch` | Batch report violations |

## 💾 Local Storage Schema

```javascript
{
  // Authentication
  authToken: string,
  sessionId: string,
  serverUrl: string,
  
  // Session Info
  proctorSession: {
    roomCode: string,
    studentName: string,
    studentId: string,
    sessionId: string,
    authToken: string,
    startTime: number,
    status: 'active' | 'paused' | 'stopped'
  },
  
  // Student Info (persisted)
  studentInfo: {
    name: string,
    msv: string
  }
}
```

## 🎨 UI/UX Features

- **Modern Design**: Gradient backgrounds, smooth animations
- **Error Handling**: Clear error messages for users
- **Loading States**: Visual feedback during authentication
- **Responsive**: Works on desktop, tablet, mobile
- **Accessibility**: Proper labels, focus management
- **Hint Text**: Helpful instructions for each field

## 🧪 Testing

### Chế độ Test (No Server)
Nếu server không khả dụng, extension sẽ chạy ở chế độ test:
- Cho phép authentication mà không cần server
- Generate fake tokens
- Vẫn theo dõi violations

### Cách Test Locally
```
1. chrome://extensions/
2. Enable "Developer mode"
3. Load unpacked: ProctorSystemExtention/
4. Click extension icon
5. Fill in form và submit
```

## 📝 Configuration

Chỉnh sửa `src/core/config.js` để thay đổi:
- Server URL (development/production)
- Timeout thresholds
- Enabled violations
- Monitoring settings

## 🔄 Messaging Flow

```
Popup.js 
  → sendToBackground('START_PROCTORING', data)
  
Background.js
  → register('START_PROCTORING', handler)
  → initializeProctoringFeatures()
  → inject content script
  
Content.js
  → setupMonitoring()
  → listen for violations
  → sendToBackground('REPORT_VIOLATION', data)
  
Background.js
  → register('REPORT_VIOLATION', handler)
  → sendToBackground(apiService.reportViolation())
```

## ⚙️ Configuration Options

### Violation Thresholds
```javascript
VIOLATION_CONFIG = {
  AUTO_SUBMIT_AFTER_VIOLATIONS: 3,  // Auto end after 3 violations
  WARNING_THRESHOLD: 2,              // Show warning after 2 violations
}
```

### Monitoring Settings
```javascript
MONITORING_CONFIG = {
  SYNC_INTERVAL: 30000,              // Sync violations every 30s
  HEARTBEAT_INTERVAL: 15000,         // Send heartbeat every 15s
}
```

## 🚀 Deployment

1. **Development**: `http://localhost:3000`
2. **Production**: `https://api.proctor-system.com`

Chỉnh sửa `ENV` variable trong `config.js` hoặc build process.

## 📚 References

- [Chrome Extensions Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/storage/)
- [Chrome Messaging](https://developer.chrome.com/docs/extensions/mv3/messaging/)
- [Content Scripts](https://developer.chrome.com/docs/extensions/mv3/content_scripts/)

## 🐛 Known Issues & TODOs

- [ ] Implement WebSocket for real-time updates
- [ ] Add screen capture functionality
- [ ] Implement face detection (optional)
- [ ] Add audio/video monitoring
- [ ] Implement local violation queue for offline support
- [ ] Add exam timer display in popup
- [ ] Implement screenshot capture on violations

## 👨‍💻 Development Notes

- All files use ES6 modules (type: "module" in manifest)
- Logger configured to info level by default
- Server fallback to test mode for development
- All async operations have proper error handling

---

**Last Updated**: May 11, 2026
**Version**: 1.0.0
