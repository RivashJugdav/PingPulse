
# PingService - Enterprise-Grade Web Monitoring Solution

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![Node.js Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)
![Security](https://img.shields.io/badge/Security-Enhanced-blue)

PingService is a robust, enterprise-grade web monitoring solution that helps businesses ensure their web services' reliability and performance. Built with security and scalability in mind, it provides real-time monitoring, detailed analytics, and instant notifications.

## 🚀 Features

- **Real-time Website Monitoring**
  - Configurable ping intervals
  - HTTP/HTTPS endpoint validation
  - Response time tracking
  - Status code monitoring

- **Advanced Security**
  - OAuth 2.0 authentication with Google
  - JWT-based session management
  - Rate limiting protection
  - HTTPS/TLS encryption
  - CSRF protection

- **Comprehensive Logging**
  - Detailed event logging
  - Error tracking
  - Performance metrics
  - Security audit logs

- **User Management**
  - Role-based access control
  - Google OAuth integration
  - Secure password management
  - User activity tracking

## 🛠️ Technical Stack

- **Backend**: Node.js with Express
- **Database**: MongoDB
- **Authentication**: JWT, Google OAuth 2.0
- **Security**: HTTPS/TLS, CSRF Protection, Rate Limiting
- **Monitoring**: Custom ping service implementation
- **Logging**: Winston logger with daily rotate file

## 🏗️ Architecture

The application follows a modular, microservices-ready architecture with:

- Clean separation of concerns
- MVC pattern implementation
- Middleware-based request processing
- Service-layer business logic
- Repository pattern for data access

## 🚦 Getting Started

### Prerequisites

- Node.js >= 14.0.0
- MongoDB
- OpenSSL (for local HTTPS development)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/ping-service.git
   cd ping-service
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. Generate SSL certificates (for development):
   ```bash
   node scripts/generate-long-cert.js
   ```

5. Start the server:
   ```bash
   npm start
   ```

### Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Run security tests
npm run test:security
```

## 📊 API Documentation

The API documentation is available at `/api-docs` when running the server with `ENABLE_SWAGGER=true`.

Key endpoints include:
- `GET /api/v1/ping`: Check service status
- `POST /api/v1/auth/login`: User authentication
- `POST /api/v1/services`: Add new service to monitor
- `GET /api/v1/services/stats`: Get monitoring statistics

## 🔒 Security Features

- HTTPS/TLS encryption
- JWT token authentication
- Rate limiting
- CSRF protection
- Input validation
- Security headers
- OAuth 2.0 implementation
- Regular secret rotation

## 🧪 Testing

The project includes:
- Unit tests
- Integration tests
- Security tests
- API endpoint tests

Run the test suite:
```bash
npm test
```

## 📈 Performance

- Response time < 100ms
- Handles 1000+ concurrent connections
- Efficient memory usage
- Optimized database queries

## 🚀 Deployment

The service is configured for easy deployment on platforms like:
- Render
- Heroku
- AWS
- Docker containers

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request
│  │  ├─ auth.js
│  │  ├─ dashboard.js
│  │  ├─ init.js
│  │  ├─ logs.js
│  │  ├─ modal.js
│  │  ├─ services.js
│  │  ├─ state.js
│  │  └─ utils.js
│  └─ styles.css
├─ README.md
├─ scripts
├─ server.js
└─ src
   ├─ app.js
   ├─ config
   │  └─ db.js
   ├─ controllers
   │  ├─ admin.js
   │  ├─ auth.js
   │  ├─ dashboard.js
   │  ├─ ping.js
   │  └─ subscription.js
   ├─ middleware
   │  ├─ auth.js
   │  └─ validator.js
   ├─ models
   │  ├─ PingService.js
   │  └─ User.js
   ├─ routes
   │  ├─ auth.js
   │  ├─ dashboard.js
   │  ├─ ping.js
   │  └─ subscription.js
   ├─ services
   │  ├─ pingScheduler.js
   │  └─ secretRotation.js
   └─ utils
      ├─ anthropic.js
      ├─ email.js
      ├─ jwt.js
      ├─ logger.js
      └─ validation.js

```