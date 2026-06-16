# Online Exam Proctoring System

A web-based online examination monitoring system built with **Node.js**, **Express.js**, **React**, and **Chrome Extension (Manifest V3)**.

The system provides a standalone monitoring layer for online examinations, allowing instructors to manage exam sessions and review student activities while students are monitored through a Chrome Extension.

---

## Features

### Exam Room Management

* Create and manage exam rooms
* Generate unique room codes
* Manage exam sessions
* View student participation records

### Student Monitoring

* Join exam rooms using room code
* Start and end monitoring sessions
* Fullscreen enforcement during examinations
* Session activity tracking

### Violation Detection

* Block copy, paste, cut, and right-click actions
* Detect tab switching
* Detect window focus loss
* Detect fullscreen exit
* Detect browser DevTools usage
* Record suspicious activities

### AI Monitoring

* Face detection using TensorFlow.js
* Detect absence of face
* Detect multiple faces
* Detect abnormal head movement
* Capture evidence images for severe violations

### Offline Support

* Store logs locally when internet connection is unavailable
* Synchronize logs automatically after reconnection
* Preserve original event timestamps

### Blockchain Verification

* Generate SHA-256 hashes for monitoring logs
* Store verification hashes on Polygon Testnet
* Verify integrity of recorded evidence

---

## Technology Stack

### Frontend

* React
* Vite
* Tailwind CSS
* Axios

### Backend

* Node.js
* Express.js
* MySQL
* Sequelize ORM
* REST API

### Chrome Extension

* Manifest V3
* Chrome Storage API
* Chrome Runtime API
* TensorFlow.js

### Blockchain

* Polygon Testnet
* SHA-256

---

## System Architecture

```text
Chrome Extension
        |
        | REST API
        v
Node.js + Express Server
        |
        +------ MySQL Database
        |
        +------ Blockchain Service
                     |
                     v
              Polygon Testnet

React Dashboard
        |
        | REST API
        v
Node.js + Express Server
```

---

## Project Structure

```text
backend/
│
├── src/
│   ├── controllers/
│   ├── middlewares/
│   ├── models/
│   ├── routes/
│   ├── services/
│   └── config/

frontend/
│
├── src/
│   ├── components/
│   ├── pages/
│   ├── stores/
│   └── services/

ProctorSystemExtension/
│
├── src/
│   ├── background/
│   ├── content/
│   ├── popup/
│   ├── core/
│   ├── feature/
│   └── services/
```

---

## Installation

### Backend

```bash
cd backend
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Chrome Extension

1. Open Chrome
2. Navigate to `chrome://extensions`
3. Enable **Developer Mode**
4. Click **Load unpacked**
5. Select the `ProctorSystemExtension` folder

---

## Screenshots

### Dashboard

<img width="1920" height="920" alt="image" src="https://github.com/user-attachments/assets/5689be32-184f-4452-977e-1cbfd22b5147" />


### Exam Room Management

<img width="1918" height="926" alt="image" src="https://github.com/user-attachments/assets/e600143c-a034-43b6-b89b-cb5832714152" />


### Chrome Extension

<img width="1919" height="982" alt="image" src="https://github.com/user-attachments/assets/58ea20fc-e98e-4ecc-a6a0-83fef0e6e210" />

---

## Future Improvements

* Real-time monitoring dashboard
* Enhanced AI behavior analysis
* Multi-browser support
* Advanced reporting and analytics
* Production blockchain deployment

---

## Author

**Nguyen Thanh Quy**

Backend Developer Intern

Node.js | Express.js | MySQL | REST API
