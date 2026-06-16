# Online Exam Proctoring System

An online examination monitoring system consisting of a Chrome Extension for students and a Web Dashboard for instructors.

## Overview

The system provides a standalone monitoring layer for online examinations without requiring integration with existing learning management systems.

Students install a Chrome Extension that monitors exam behavior and reports violations to the server. Instructors can manage exam rooms and review monitoring reports through a web dashboard.

## Features

### Instructor Dashboard

* Create and manage exam rooms
* Generate unique room codes
* View student participation
* Monitor violation reports
* Review post-exam evidence and reports

### Student Extension

* Join exam rooms using room code
* Start and end monitoring sessions
* Fullscreen enforcement
* Activity tracking during exams

### Monitoring Functions

* Block copy, paste, cut, right-click
* Detect tab switching and window blur
* Detect fullscreen exit
* Detect browser DevTools opening
* AI-based webcam monitoring
* Capture evidence images for serious violations

### Offline Support

* Store logs locally when internet connection is lost
* Automatically synchronize logs after reconnection
* Preserve timestamps for offline events

### Blockchain Verification

* Generate SHA-256 hash of session logs
* Store hashes on Polygon Testnet
* Verify integrity of monitoring records

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
* Chrome APIs
* TensorFlow.js

### Blockchain

* Polygon Testnet
* SHA-256

## Project Structure

```text
backend/
frontend/
ProctorSystemExtension/
```

## Architecture

```text
Chrome Extension
        |
        | REST API
        v
Node.js + Express Server
        |
        v
MySQL Database

Instructor Dashboard
        |
        | REST API
        v
Node.js + Express Server

Blockchain Service
        |
        v
Polygon Testnet
```

## Main Modules

* Exam Room Management
* Student Session Management
* Violation Detection
* AI Monitoring
* Offline Synchronization
* Blockchain Verification
